import { Gesture } from "react-native-gesture-handler";
import {
  runOnJS,
  SharedValue,
  withSpring,
  withTiming,
  scrollTo,
  AnimatedRef,
  useSharedValue,
  useDerivedValue,
} from "react-native-reanimated";
import {
  indexToXY,
  toIndex1ColFromLiveMidlines,
  xyToIndex,
} from "../indexCalculations";

interface PanProps {
  order: SharedValue<string[]>;
  dynamicNumColumns: SharedValue<number>;
  activeKey: SharedValue<string | null>;
  offsetX: SharedValue<number>;
  offsetY: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  dragMode: SharedValue<boolean>;
  positions: any;
  itemsByKey: any;
  itemWidth: number;
  itemHeight: number;
  containerPadding: number;
  gap: number;
  setOrderState: React.Dispatch<React.SetStateAction<string[]>>;
  onDragEnd?: (ordered: ChildNode[]) => void;
  onOrderChange?: (keys: string[]) => void;

  // scrolling
  scrollSpeed: number;
  scrollThreshold: number;
  scrollViewRef: AnimatedRef<any>;
  scrollOffset: SharedValue<number>;
  viewportH: SharedValue<number>;
  longPressMs: number;
  contentH: SharedValue<number>;
  reverse?: boolean;
  deleteComponentPosition?: SharedValue<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>;
  deleteItem?: (key: string) => void;
  contentPaddingBottom?: number; // Padding bottom from style prop to allow dragging into padding area
}

export const PanWithLongPress = (props: PanProps & { longPressMs: number }) => {
  const {
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
    scrollSpeed,
    scrollThreshold,
    scrollViewRef,
    scrollOffset,
    viewportH,
    longPressMs,
    contentH,
    reverse = false,
    deleteComponentPosition,
    deleteItem,
    contentPaddingBottom = 0,
  } = props;

  const scrollDir = useSharedValue(0); // -1 = up, 1 = down, 0 = none
  const initialScrollOffset = useSharedValue(0);

  useDerivedValue(() => {
    if (!dragMode.value || !activeKey.value) return;

    if (viewportH.value <= 0 || contentH.value <= 0) return;

    const key = activeKey.value;
    const p = positions[key];
    if (!p) return;

    // 1. Clamp scroll offset
    const maxScroll = contentH.value - viewportH.value;
    const newScroll = Math.max(
      0,
      Math.min(scrollOffset.value + scrollDir.value * scrollSpeed, maxScroll)
    );

    scrollTo(scrollViewRef, 0, newScroll, false);
    const scrollDelta = newScroll - initialScrollOffset.value;
    scrollOffset.value = newScroll;

    // 2. Clamp item position
    // Allow dragging into padding area (paddingBottom from style prop)
    const minY = 0;
    // Add paddingBottom to maxY to allow dragging into the padding area
    const maxY = contentH.value - itemHeight + contentPaddingBottom;
    const proposedY = startY.value + offsetY.value + scrollDelta;
    p.y.value = Math.max(minY, Math.min(proposedY, maxY));

    // X stays normal
    p.x.value = startX.value + offsetX.value;

    // Keep loop alive
    requestAnimationFrame(() => {
      scrollDir.value = scrollDir.value;
    });
  });

  const getIndexOfKey = (key: string) => {
    "worklet";
    return order.value.findIndex((x) => x === key);
  };

  return Gesture.Pan()
    .minDistance(10)
    .activateAfterLongPress(longPressMs)
    .onStart(({ x, y }) => {
      initialScrollOffset.value = scrollOffset.value;
      dragMode.value = true;
      let bestKey: string | null = null;
      let bestDist = Number.MAX_VALUE;
      order.value.forEach((key) => {
        const p = positions[key];
        if (!p) return;
        const cx = p.x.value + itemWidth / 2;
        const cy = p.y.value + itemHeight / 2;
        const dx = cx - x;
        const dy = cy - y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < bestDist) {
          bestDist = dist2;
          bestKey = key;
        }
      });
      if (!bestKey) return;
      activeKey.value = bestKey;
      const p = positions[bestKey]!;
      p.active.value = withTiming(1, { duration: 120 });
      startX.value = p.x.value;
      startY.value = p.y.value;
      offsetX.value = 0;
      offsetY.value = 0;
    })
    .onUpdate(({ translationX, translationY }) => {
      if (!dragMode.value) return;
      const key = activeKey.value;
      if (!key) return;

      const p = positions[key]!;
      const scrollDelta = scrollOffset.value - initialScrollOffset.value;

      // Update active (top-left)
      offsetX.value = translationX;
      offsetY.value = translationY;
      p.x.value = startX.value + offsetX.value;
      p.y.value = startY.value + offsetY.value + scrollDelta;

      // Auto-scroll (unchanged)
      const pointerYInViewport = p.y.value - scrollOffset.value;
      if (pointerYInViewport > viewportH.value - scrollThreshold) {
        scrollDir.value = 1;
      } else if (pointerYInViewport < scrollThreshold) {
        scrollDir.value = -1;
      } else {
        scrollDir.value = 0;
      }

      // Compute target index from the active tile's **center**
      const centerY = p.y.value + itemHeight / 2;
      const fromIndex = getIndexOfKey(key);

      let toIndex: number;
      if (dynamicNumColumns.value === 1) {
        toIndex = toIndex1ColFromLiveMidlines(
          order,
          positions,
          activeKey,
          itemHeight,
          centerY,
          reverse // ← pass your prop
        );
      } else {
        // unchanged multi-column path
        const centerX = p.x.value + itemWidth / 2;
        toIndex = xyToIndex({
          order,
          x: centerX,
          y: centerY,
          itemWidth,
          itemHeight,
          dynamicNumColumns,
          containerPadding,
          gap,
        });
      }

      if (
        toIndex !== fromIndex &&
        toIndex >= 0 &&
        toIndex <= order.value.length - 1
      ) {
        const next = [...order.value];
        next.splice(fromIndex, 1);
        next.splice(toIndex, 0, key);
        order.value = next;
      }
    })
    .onEnd(() => {
      scrollDir.value = 0; // stop auto-scroll
      if (!dragMode.value) return;
      const key = activeKey.value;
      if (!key) {
        dragMode.value = false;
        return;
      }
      const p = positions[key]!;

      // Check if item was dropped into delete component
      if (deleteComponentPosition?.value && deleteItem) {
        const deletePos = deleteComponentPosition.value;
        const itemCenterX = p.x.value + itemWidth / 2;
        // Account for scroll offset when checking Y position
        const itemCenterY = p.y.value + itemHeight / 2;

        // Check if item center is within delete component bounds
        // Note: positions are relative to container, so no scroll offset needed
        if (
          itemCenterX >= deletePos.x &&
          itemCenterX <= deletePos.x + deletePos.width &&
          itemCenterY >= deletePos.y &&
          itemCenterY <= deletePos.y + deletePos.height
        ) {
          // Item was dropped into delete component - delete it
          runOnJS(deleteItem)(key);
          // Note: deleteItem will handle calling onDelete callback if provided
          p.active.value = withTiming(0, { duration: 120 });
          activeKey.value = null;
          dragMode.value = false;
          return;
        }
      }

      // Normal drop - return to grid position
      const idx = getIndexOfKey(key);
      const { x, y } = indexToXY({
        index: idx,
        itemWidth,
        itemHeight,
        dynamicNumColumns,
        containerPadding,
        gap,
      });
      const scale = Math.min(itemWidth, itemHeight) / 200; // 100px baseline

      const damping = 18 * scale;
      const stiffness = 240 * scale;
      const mass = Math.max(0.05, scale); // helps stability for tiny items

      p.x.value = withSpring(x, { damping, stiffness, mass });
      p.y.value = withSpring(y, { damping, stiffness, mass });

      p.active.value = withTiming(0, { duration: 120 });

      runOnJS(setOrderState)(order.value);
      if (onDragEnd) {
        runOnJS(onDragEnd)(order.value.map((key) => itemsByKey[key]));
      }
      if (onOrderChange) {
        runOnJS(onOrderChange)([...order.value]);
      }
      activeKey.value = null;
      dragMode.value = false;
    });
};
