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
import {
  indexToXY,
  indexToXYDynamic,
  indexToXYFlow,
  xyToIndex,
  xyToIndexFlow,
} from "./helpers/indexCalculations";
import { PanWithLongPress } from "./helpers/gestures/PanWithLongPress";

interface useGridLayoutProps {
  reverse?: boolean;
  children: ReactNode;
  itemWidth?: number; // Optional: used as default if items don't report their own size
  itemHeight?: number; // Optional: used as default if items don't report their own size
  gap: number;
  containerPadding: number;
  holdToDragMs: number;
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
  itemWidth = 100, // Default fallback
  itemHeight = 100, // Default fallback
  gap,
  containerPadding,
  holdToDragMs,
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
  const isPressingDeleteItem = useSharedValue(false); // Track if user is pressing an item in delete mode
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
        width: useSharedValue(itemWidth), // Start with default, will be updated when child measures
        height: useSharedValue(itemHeight), // Start with default, will be updated when child measures
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
    // CRITICAL: During drag, positions are updated directly in PanWithLongPress.onUpdate
    // Skip useDerivedValue position updates during drag to avoid conflicts
    if (activeKey.value && dragMode.value) {
      // Still read order to maintain reactivity, but don't update positions
      const _ = order.value.length;
      return;
    }

    // CRITICAL: Read order.value in a way that ensures reactivity
    // Read length and each element to ensure useDerivedValue detects changes
    const orderLength = order.value.length;

    // Read each element explicitly to ensure reactivity
    for (let i = 0; i < orderLength; i++) {
      const _ = order.value[i];
    }

    let displayIndexWithoutActive = 0;
    order.value.forEach((key, i) => {
      if (activeKey.value === key) return; // ⬅️ do not layout the active tile

      const p = positions[key];
      if (!p) return;

      // Calculate display index excluding the active item
      const displayIndex = reverse
        ? order.value.length - 1 - displayIndexWithoutActive
        : displayIndexWithoutActive;
      displayIndexWithoutActive++;

      let x: number, y: number;
      // Use flow layout when numColumns is not provided
      if (!numColumns) {
        const result = indexToXYFlow({
          index: displayIndex,
          order,
          positions,
          containerWidth: contentW,
          containerPadding,
          gap,
          defaultWidth: itemWidth,
          defaultHeight: itemHeight,
          activeKey,
        });
        x = result.x;
        y = result.y;
      } else {
        // Use grid layout when numColumns is specified
        const itemW = p.width.value || itemWidth;
        const itemH = p.height.value || itemHeight;
        const hasCustomDimensions =
          Math.abs(itemW - itemWidth) > 1 || Math.abs(itemH - itemHeight) > 1;

        // Check if ANY item in the grid has custom dimensions
        let anyItemHasCustomDimensions = hasCustomDimensions;
        if (!anyItemHasCustomDimensions && i === 0) {
          for (const otherKey of order.value) {
            if (otherKey === key) continue;
            const otherPos = positions[otherKey];
            if (!otherPos) continue;
            const otherW = otherPos.width.value || itemWidth;
            const otherH = otherPos.height.value || itemHeight;
            if (
              Math.abs(otherW - itemWidth) > 1 ||
              Math.abs(otherH - itemHeight) > 1
            ) {
              anyItemHasCustomDimensions = true;
              break;
            }
          }
        }

        if (anyItemHasCustomDimensions) {
          const result = indexToXYDynamic({
            index: displayIndex,
            order,
            positions,
            dynamicNumColumns,
            containerPadding,
            gap,
            defaultWidth: itemWidth,
            defaultHeight: itemHeight,
          });
          x = result.x;
          y = result.y;
        } else {
          const result = indexToXY({
            index: displayIndex,
            itemWidth,
            itemHeight,
            dynamicNumColumns,
            containerPadding,
            gap,
          });
          x = result.x;
          y = result.y;
        }
      }

      // Use spring for ALL updates (like the old working code)
      // This ensures smooth movement during drag as order changes
      const itemW = p.width.value || itemWidth;
      const itemH = p.height.value || itemHeight;
      const scale = Math.min(itemW, itemH) / 100; // 100px baseline

      const damping = 18 * scale;
      const stiffness = 240 * scale;
      const mass = Math.max(0.1, scale);

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
      const defaultW = itemWidth || 100;
      const possibleCols = Math.floor(
        (e.nativeEvent.layout.width - containerPadding * 2 + gap) /
          (defaultW + gap)
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
      contentW,
      numColumns,
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
      holdToDragMs,
      scrollSpeed,
      scrollThreshold,
      reverse,
      deleteComponentPosition,
      deleteItem,
      contentPaddingBottom,
    })
  );

  // Function to update item dimensions (called from ChildWrapper)
  const updateItemDimensions = (key: string, width: number, height: number) => {
    const pos = positions[key];
    if (pos) {
      pos.width.value = width;
      pos.height.value = height;
    }
  };

  return {
    itemsByKey,
    orderState,
    dragMode,
    anyItemInDeleteMode,
    isPressingDeleteItem,
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
    updateItemDimensions,
  };
}
