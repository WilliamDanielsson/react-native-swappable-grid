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
  indexToXYDynamic,
  indexToXYFlow,
  toIndex1ColFromLiveMidlines,
  xyToIndex,
  xyToIndexDynamic,
  xyToIndexFlow,
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
  itemWidth: number; // Default/fallback width
  itemHeight: number; // Default/fallback height
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
  holdToDragMs: number;
  contentH: SharedValue<number>;
  contentW: SharedValue<number>; // Container width for flow layout
  numColumns?: number; // Optional: if provided, use grid layout instead of flow
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

export const PanWithLongPress = (
  props: PanProps & { holdToDragMs: number }
) => {
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
    holdToDragMs,
    contentH,
    contentW,
    numColumns,
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
    // Account for contentPaddingBottom in max scroll calculation
    // The ScrollView's contentContainerStyle paddingBottom adds to scrollable content
    const maxScroll = Math.max(
      0,
      contentH.value + contentPaddingBottom - viewportH.value
    );
    const newScroll = Math.max(
      0,
      Math.min(scrollOffset.value + scrollDir.value * scrollSpeed, maxScroll)
    );

    scrollTo(scrollViewRef, 0, newScroll, false);
    const scrollDelta = newScroll - initialScrollOffset.value;
    scrollOffset.value = newScroll;

    // 2. Clamp item position to stay within visible viewport and content bounds
    // This runs every frame for auto-scroll adjustments
    // Use the same clamping logic as onUpdate for consistency
    const actualItemHeight = p.height?.value || itemHeight;
    const minY = scrollOffset.value;
    const visibleMaxY = scrollOffset.value + viewportH.value - actualItemHeight;
    // Items are positioned starting at containerPadding, so the last item's bottom
    // should be at contentH - containerPadding. But we also need to account for
    // the ScrollView's contentContainerStyle paddingBottom which extends beyond contentH.
    // Allow items to extend slightly into the padding area for better UX.
    const paddingAllowance = Math.min(
      contentPaddingBottom,
      actualItemHeight * 0.75
    );
    const contentMaxY =
      contentH.value - containerPadding - actualItemHeight + paddingAllowance;
    const maxY = Math.min(visibleMaxY, contentMaxY);

    // Calculate position accounting for scroll delta (for auto-scroll)
    const proposedY = startY.value + offsetY.value + scrollDelta;
    // Clamp the position
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
    .activateAfterLongPress(holdToDragMs)
    .onStart(({ x, y }) => {
      initialScrollOffset.value = scrollOffset.value;
      dragMode.value = true;
      let bestKey: string | null = null;
      let bestDist = Number.MAX_VALUE;
      order.value.forEach((key) => {
        const p = positions[key];
        if (!p) return;
        const actualItemWidth = p.width?.value || itemWidth;
        const actualItemHeight = p.height?.value || itemHeight;
        const cx = p.x.value + actualItemWidth / 2;
        const cy = p.y.value + actualItemHeight / 2;
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

      // Calculate proposed position
      const proposedX = startX.value + offsetX.value;
      const proposedY = startY.value + offsetY.value + scrollDelta;

      // Get actual item dimensions
      const actualItemWidth = p.width?.value || itemWidth;
      const actualItemHeight = p.height?.value || itemHeight;

      // Clamp Y position immediately to prevent visual glitch
      const minY = scrollOffset.value;
      const visibleMaxY =
        scrollOffset.value + viewportH.value - actualItemHeight;
      // Items are positioned starting at containerPadding, so the last item's bottom
      // should be at contentH - containerPadding. But we also need to account for
      // the ScrollView's contentContainerStyle paddingBottom which extends beyond contentH.
      // Allow items to extend slightly into the padding area for better UX.
      const paddingAllowance = Math.min(
        contentPaddingBottom,
        actualItemHeight * 0.75
      );
      const contentMaxY =
        contentH.value - containerPadding - actualItemHeight + paddingAllowance;
      const maxY = Math.min(visibleMaxY, contentMaxY);
      const clampedY = Math.max(minY, Math.min(proposedY, maxY));

      p.x.value = proposedX;
      p.y.value = clampedY;

      // Auto-scroll: Use item's center (or bottom edge if very large) to detect proximity to edges
      // This ensures scrolling works even for very large items
      const itemTopInViewport = p.y.value - scrollOffset.value;
      const itemBottomInViewport = itemTopInViewport + actualItemHeight;
      const itemCenterInViewport = itemTopInViewport + actualItemHeight / 2;

      // For large items, check if any part is near the edge
      // For small items, use center for more intuitive behavior
      const nearBottom =
        actualItemHeight > viewportH.value * 0.5
          ? itemBottomInViewport > viewportH.value - scrollThreshold
          : itemCenterInViewport > viewportH.value - scrollThreshold;
      const nearTop =
        actualItemHeight > viewportH.value * 0.5
          ? itemTopInViewport < scrollThreshold
          : itemCenterInViewport < scrollThreshold;

      if (nearBottom) {
        scrollDir.value = 1;
      } else if (nearTop) {
        scrollDir.value = -1;
      } else {
        scrollDir.value = 0;
      }

      // Compute target index from the active tile's **center**
      const centerY = p.y.value + actualItemHeight / 2;
      const centerX = p.x.value + actualItemWidth / 2;
      const fromIndex = getIndexOfKey(key);

      let toIndex: number;
      if (dynamicNumColumns.value === 1) {
        toIndex = toIndex1ColFromLiveMidlines(
          order,
          positions,
          activeKey,
          actualItemHeight,
          centerY,
          reverse // ← pass your prop
        );
      } else {
        // For multi-column, use flow layout when numColumns is not provided
        // Otherwise use grid layout
        if (!numColumns) {
          // Use flow layout - works with both uniform and variable-sized items
          toIndex = xyToIndexFlow({
            order,
            x: centerX,
            y: centerY,
            positions,
            containerWidth: contentW,
            containerPadding,
            gap,
            defaultWidth: itemWidth,
            defaultHeight: itemHeight,
            activeKey,
          });
        } else {
          // Use grid layout when numColumns is specified
          const hasCustomDimensions = order.value.some((k) => {
            const pos = positions[k];
            if (!pos || k === key) return false;
            return (
              Math.abs((pos.width?.value || itemWidth) - itemWidth) > 1 ||
              Math.abs((pos.height?.value || itemHeight) - itemHeight) > 1
            );
          });

          if (hasCustomDimensions) {
            // Use dynamic grid positioning when numColumns is specified
            toIndex = xyToIndexDynamic({
              order,
              x: centerX,
              y: centerY,
              positions,
              dynamicNumColumns,
              containerPadding,
              gap,
              defaultWidth: itemWidth,
              defaultHeight: itemHeight,
              activeKey,
            });
          } else {
            // Use uniform grid for better reliability
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
        }
      }

      // Clamp toIndex to valid range
      const clampedToIndex = Math.max(
        0,
        Math.min(toIndex, order.value.length - 1)
      );

      const currentOrder = order.value;
      const currentIndexInOrder = currentOrder.indexOf(key);

      // Update order when target position changes
      if (
        currentIndexInOrder !== clampedToIndex &&
        clampedToIndex >= 0 &&
        clampedToIndex <= order.value.length - 1
      ) {
        // Index changed - update order
        const next = [...currentOrder];
        next.splice(currentIndexInOrder, 1); // Remove dragged item
        // Insert at clampedToIndex: this puts dragged item at the position of the item we're over
        next.splice(clampedToIndex, 0, key);
        order.value = next;

        // Call onOrderChange callback immediately
        if (onOrderChange) {
          runOnJS(onOrderChange)([...next]);
        }

        // CRITICAL: Immediately update positions for non-dragged items
        // This ensures items move in real-time during drag, not waiting for useDerivedValue
        let displayIndexWithoutActive = 0;
        for (let i = 0; i < next.length; i++) {
          const itemKey = next[i];
          if (itemKey === key) continue; // Skip dragged item

          const p = positions[itemKey];
          if (!p) continue;

          // Store current position for comparison
          const oldX = p.x.value;
          const oldY = p.y.value;

          // Calculate display index excluding the active item
          const displayIndex = reverse
            ? next.length - 1 - displayIndexWithoutActive
            : displayIndexWithoutActive;
          displayIndexWithoutActive++;

          // Calculate target position based on layout type
          // Use a temporary SharedValue wrapper for the new order
          const tempOrder = { value: next } as SharedValue<string[]>;
          let x: number, y: number;
          if (!numColumns) {
            // Flow layout
            const result = indexToXYFlow({
              index: displayIndex,
              order: tempOrder,
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
            // Grid layout
            const hasCustomDimensions = next.some((k) => {
              const pos = positions[k];
              if (!pos || k === key) return false;
              return (
                Math.abs((pos.width?.value || itemWidth) - itemWidth) > 1 ||
                Math.abs((pos.height?.value || itemHeight) - itemHeight) > 1
              );
            });

            if (hasCustomDimensions) {
              const result = indexToXYDynamic({
                index: displayIndex,
                order: tempOrder,
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

          // Only update if position actually changed (avoid unnecessary updates)
          if (Math.abs(oldX - x) > 0.1 || Math.abs(oldY - y) > 0.1) {
            // Update position - use direct assignment during drag for immediate updates
            p.x.value = x;
            p.y.value = y;

            // Debug: log first few updates to see what's happening
            if (i < 2) {
              runOnJS((key, oldXVal, oldYVal, newX, newY) => {
                console.log(
                  `[Position Update] ${key}: (${oldXVal.toFixed(1)}, ${oldYVal.toFixed(1)}) -> (${newX.toFixed(1)}, ${newY.toFixed(1)})`
                );
              })(itemKey, oldX, oldY, x, y);
            }
          }
        }
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

        // Get actual item dimensions
        const actualItemWidth = p.width?.value || itemWidth;
        const actualItemHeight = p.height?.value || itemHeight;

        // Add tolerance/padding to make it easier to hit (20% of item size)
        const tolerance = Math.min(actualItemWidth, actualItemHeight) * 0.2;
        const expandedDeleteX = deletePos.x - tolerance;
        const expandedDeleteY = deletePos.y - tolerance;
        const expandedDeleteWidth = deletePos.width + tolerance * 2;
        const expandedDeleteHeight = deletePos.height + tolerance * 2;

        // Check if item bounding box overlaps with expanded delete component bounds
        // This is more forgiving than checking just the center point
        const itemLeft = p.x.value;
        const itemRight = p.x.value + actualItemWidth;
        const itemTop = p.y.value;
        const itemBottom = p.y.value + actualItemHeight;

        // Bounding box intersection check
        const overlaps =
          itemLeft < expandedDeleteX + expandedDeleteWidth &&
          itemRight > expandedDeleteX &&
          itemTop < expandedDeleteY + expandedDeleteHeight &&
          itemBottom > expandedDeleteY;

        if (overlaps) {
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

      let x: number, y: number;
      // Use flow layout when numColumns is not provided
      if (!numColumns) {
        // Use flow layout - works with both uniform and variable-sized items
        const result = indexToXYFlow({
          index: idx,
          order,
          positions,
          containerWidth: contentW,
          containerPadding,
          gap,
          defaultWidth: itemWidth,
          defaultHeight: itemHeight,
        });
        x = result.x;
        y = result.y;
      } else {
        // Use grid layout when numColumns is specified
        const hasCustomDimensions = order.value.some((k) => {
          const pos = positions[k];
          if (!pos) return false;
          return (
            Math.abs((pos.width?.value || itemWidth) - itemWidth) > 1 ||
            Math.abs((pos.height?.value || itemHeight) - itemHeight) > 1
          );
        });

        if (hasCustomDimensions) {
          // Use dynamic grid positioning when numColumns is specified
          const result = indexToXYDynamic({
            index: idx,
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
          // Use uniform grid
          const result = indexToXY({
            index: idx,
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
      const actualItemWidth = p.width?.value || itemWidth;
      const actualItemHeight = p.height?.value || itemHeight;
      const scale = Math.min(actualItemWidth, actualItemHeight) / 200; // 100px baseline

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
