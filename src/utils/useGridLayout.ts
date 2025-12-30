import { Children, isValidElement, ReactNode, useMemo, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  AnimatedRef,
  SharedValue,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { indexToXY } from "./helpers/indexCalculations";
import { PanWithLongPress } from "./helpers/gestures/PanWithLongPress";

interface useGridLayoutProps {
  reverse?: boolean;
  children: ReactNode;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  containerPadding: number;
  longPressMs: number;
  numColumns?: number;
  onDragEnd?: (ordered: ChildNode[]) => void;
  onOrderChange?: (keys: string[]) => void;
  onDelete?: (key: string) => void;
  scrollViewRef: AnimatedRef<any>;
  scrollSpeed: number;
  scrollThreshold: number;
  contentPaddingBottom?: number;
}

export function useGridLayout({
  reverse,
  children,
  itemWidth,
  itemHeight,
  gap,
  containerPadding,
  longPressMs,
  numColumns,
  onDragEnd,
  onOrderChange,
  onDelete,
  scrollViewRef,
  scrollSpeed,
  scrollThreshold,
  contentPaddingBottom = 0,
}: useGridLayoutProps) {
  const childArray = Children.toArray(children).filter(isValidElement);
  const keys = childArray.map((child) => {
    if (!("key" in child) || child.key == null) {
      throw new Error("All children must have a unique 'key' prop.");
    }
    return String(child.key);
  });

  const [orderState, setOrderState] = useState(keys);

  const itemsByKey = useMemo(() => {
    const map: Record<string, ReactNode> = {};
    childArray.forEach((child) => {
      map[String(child.key)] = child;
    });
    return map;
  }, [children]);

  const dynamicNumColumns: SharedValue<number> = useSharedValue(
    numColumns ? numColumns : 1
  );
  const order = useSharedValue<string[]>(orderState);
  const contentW = useSharedValue(0);
  const viewportH = useSharedValue(0); // **visible height of ScrollView**
  const activeKey = useSharedValue<string | null>(null);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragMode = useSharedValue(false);
  const anyItemInDeleteMode = useSharedValue(false); // Global delete mode state
  const contentH = useSharedValue(0);
  const scrollOffset = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollOffset.value = e.contentOffset.y;
    },
  });

  // initial positions (create shared values consistently by data length)
  const positionsArray = childArray.map((d, i) => {
    const { x, y } = indexToXY({
      index: i,
      itemWidth,
      itemHeight,
      dynamicNumColumns,
      containerPadding,
      gap,
    });
    return {
      key: d.key,
      pos: {
        x: useSharedValue(x),
        y: useSharedValue(y),
        active: useSharedValue(0),
      },
    };
  });

  const positions = useMemo(() => {
    const obj: Record<string, (typeof positionsArray)[number]["pos"]> = {};

    positionsArray.forEach(({ key, pos }) => {
      obj[key ?? `key-${Math.random().toString(36).slice(2)}`] = pos;
    });

    return obj;
  }, [positionsArray]);

  const deleteItem = (key: string) => {
    setOrderState((prev) => prev.filter((k) => k !== key));
    order.value = order.value.filter((k) => k !== key);
    onOrderChange?.([...order.value]);
    // Call onDelete callback if provided (for both delete button and drop-to-delete)
    if (onDelete) {
      onDelete(key);
    }
  };

  useDerivedValue(() => {
    order.value.forEach((key, i) => {
      if (activeKey.value === key) return; // ⬅️ do not layout the active tile

      const p = positions[key];
      if (!p) return;

      const displayIndex = reverse ? order.value.length - 1 - i : i;

      const { x, y } = indexToXY({
        index: displayIndex,
        itemWidth,
        itemHeight,
        dynamicNumColumns,
        containerPadding,
        gap,
      });

      const scale = Math.min(itemWidth, itemHeight) / 100; // 100px baseline

      const damping = 18 * scale;
      const stiffness = 240 * scale;
      const mass = Math.max(0.1, scale); // helps stability for tiny items

      p.x.value = withSpring(x, { damping, stiffness, mass });
      p.y.value = withSpring(y, { damping, stiffness, mass });
    });
  });

  // Layout of the ScrollView (viewport) — height we compare against for edge-scrolling
  const onLayoutScrollView = (e: LayoutChangeEvent) => {
    viewportH.value = e.nativeEvent.layout.height;
  };

  // Layout of the content view — width used to compute columns
  const onLayoutContent = (e: LayoutChangeEvent) => {
    contentW.value = e.nativeEvent.layout.width;
    contentH.value = e.nativeEvent.layout.height;

    if (numColumns) {
      dynamicNumColumns.value = numColumns;
    } else {
      const possibleCols = Math.floor(
        (e.nativeEvent.layout.width - containerPadding * 2 + gap) /
          (itemWidth + gap)
      );
      dynamicNumColumns.value = Math.max(1, possibleCols);
    }
  };

  const deleteComponentPosition = useSharedValue<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const composed = Gesture.Simultaneous(
    PanWithLongPress({
      contentH,
      order,
      dynamicNumColumns,
      activeKey,
      offsetX,
      offsetY,
      startX,
      startY,
      dragMode,
      positions,
      itemsByKey,
      itemWidth,
      itemHeight,
      containerPadding,
      gap,
      setOrderState,
      onDragEnd,
      onOrderChange,
      scrollViewRef,
      scrollOffset,
      viewportH,
      longPressMs,
      scrollSpeed,
      scrollThreshold,
      reverse,
      deleteComponentPosition,
      deleteItem,
      contentPaddingBottom,
    })
  );

  return {
    itemsByKey,
    orderState,
    dragMode,
    anyItemInDeleteMode,
    composed,
    dynamicNumColumns,
    onLayoutContent,
    onLayoutScrollView,
    positions,
    onScroll,
    childArray,
    order,
    deleteItem,
    deleteComponentPosition,
  };
}
