import { SharedValue } from "react-native-reanimated";

interface IndexToXYProps {
  index: number;
  itemHeight: number;
  itemWidth: number;
  dynamicNumColumns: SharedValue<number>;
  containerPadding: number;
  gap: number;
}

// New interface for dynamic dimensions
interface DynamicIndexToXYProps {
  index: number;
  order: SharedValue<string[]>;
  positions: Record<
    string,
    {
      x: SharedValue<number>;
      y: SharedValue<number>;
      width: SharedValue<number>;
      height: SharedValue<number>;
    }
  >;
  dynamicNumColumns: SharedValue<number>;
  containerPadding: number;
  gap: number;
  defaultWidth: number;
  defaultHeight: number;
}

export const indexToXY = ({
  index,
  itemHeight,
  itemWidth,
  dynamicNumColumns,
  containerPadding,
  gap,
}: IndexToXYProps) => {
  "worklet";
  const cols = dynamicNumColumns.value;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = containerPadding + col * (itemWidth + gap);
  const y = containerPadding + row * (itemHeight + gap);
  return { x, y };
};

// Flow layout interface - packs items left-to-right, top-to-bottom
interface FlowLayoutProps {
  index: number;
  order: SharedValue<string[]>;
  positions: Record<
    string,
    {
      x: SharedValue<number>;
      y: SharedValue<number>;
      width: SharedValue<number>;
      height: SharedValue<number>;
    }
  >;
  containerWidth: SharedValue<number>;
  containerPadding: number;
  gap: number;
  defaultWidth: number;
  defaultHeight: number;
  activeKey?: SharedValue<string | null>; // Optional: exclude active item from layout calculations
}

// Flow layout algorithm - packs items based on available width
export const indexToXYFlow = ({
  index,
  order,
  positions,
  containerWidth,
  containerPadding,
  gap,
  defaultWidth,
  defaultHeight,
  activeKey,
}: FlowLayoutProps) => {
  "worklet";

  if (containerWidth.value <= 0) {
    // Fallback if container width not measured yet
    return { x: containerPadding, y: containerPadding };
  }

  const availableWidth = containerWidth.value - containerPadding * 2;
  if (availableWidth <= 0) {
    return { x: containerPadding, y: containerPadding };
  }

  let currentX = containerPadding;
  let currentY = containerPadding;
  let maxHeightInRow = 0;

  // Calculate position by packing items left-to-right, top-to-bottom
  // Count non-active items up to the target index (index is display index, excluding active item)
  let nonActiveCount = 0;
  for (let i = 0; i < order.value.length && nonActiveCount < index; i++) {
    const key = order.value[i];

    // Skip active item if provided (for layout calculations during drag)
    if (activeKey && activeKey.value === key) continue;

    const pos = positions[key];
    if (!pos) continue;

    // Use actual measured width, or default if not measured yet
    const itemWidth = pos.width.value > 0 ? pos.width.value : defaultWidth;
    const itemHeight = pos.height.value > 0 ? pos.height.value : defaultHeight;

    // Check if item fits in current row (including gap after it)
    // Right edge of container: containerWidth.value
    // Right padding: containerPadding
    // So available right edge: containerWidth.value - containerPadding
    const itemRightEdgeWithGap = currentX + itemWidth + gap;
    const availableRightEdge = containerWidth.value - containerPadding;

    if (itemRightEdgeWithGap > availableRightEdge && nonActiveCount > 0) {
      // Item doesn't fit - move to next row
      currentY += maxHeightInRow + gap;
      currentX = containerPadding;
      maxHeightInRow = itemHeight; // Start tracking height for new row
    } else {
      // Item fits - track max height in current row
      maxHeightInRow = Math.max(maxHeightInRow, itemHeight);
    }

    // Position item at currentX, then move cursor for next item
    currentX += itemWidth + gap;
    nonActiveCount++;
  }

  // Position for current item
  // Find the item at the correct position in the order, excluding the active item
  // The index passed is the display index (excluding active item), so we need to find
  // the actual item at that position in the order array
  let currentKey: string | undefined;
  let actualIndex = 0;
  for (let i = 0; i < order.value.length; i++) {
    const key = order.value[i];
    // Skip active item when counting
    if (activeKey && activeKey.value === key) continue;
    if (actualIndex === index) {
      currentKey = key;
      break;
    }
    actualIndex++;
  }

  if (!currentKey) {
    // Fallback: use the index directly if we can't find the item
    currentKey = order.value[Math.min(index, order.value.length - 1)];
  }

  const currentPos = positions[currentKey];
  const itemWidth =
    currentPos?.width.value && currentPos.width.value > 0
      ? currentPos.width.value
      : defaultWidth;
  const itemHeight =
    currentPos?.height.value && currentPos.height.value > 0
      ? currentPos.height.value
      : defaultHeight;

  // Check if current item fits in current row (including gap after it)
  const itemRightEdgeWithGap = currentX + itemWidth + gap;
  const availableRightEdge = containerWidth.value - containerPadding;

  if (itemRightEdgeWithGap > availableRightEdge && index > 0) {
    // Item doesn't fit - move to next row
    currentY += maxHeightInRow + gap;
    currentX = containerPadding;
  }

  return { x: currentX, y: currentY };
};

// Legacy function for backward compatibility - now uses flow layout when appropriate
export const indexToXYDynamic = ({
  index,
  order,
  positions,
  dynamicNumColumns,
  containerPadding,
  gap,
  defaultWidth,
  defaultHeight,
}: DynamicIndexToXYProps) => {
  "worklet";
  // For now, fall back to grid layout if numColumns is specified
  // Flow layout should be used via indexToXYFlow
  const cols = dynamicNumColumns.value;
  const col = index % cols;
  const row = Math.floor(index / cols);

  // Calculate X position: sum widths of previous items in the same row
  let x = containerPadding;
  for (let i = 0; i < col; i++) {
    const prevIndex = row * cols + i;
    if (prevIndex < order.value.length) {
      const prevKey = order.value[prevIndex];
      const prevPos = positions[prevKey];
      if (prevPos) {
        x += prevPos.width.value + gap;
      } else {
        x += defaultWidth + gap;
      }
    } else {
      x += defaultWidth + gap;
    }
  }

  // Calculate Y position: sum heights of previous rows
  let y = containerPadding;
  for (let r = 0; r < row; r++) {
    // Find max height in this row
    let maxRowHeight = defaultHeight;
    for (let c = 0; c < cols; c++) {
      const itemIndex = r * cols + c;
      if (itemIndex < order.value.length) {
        const itemKey = order.value[itemIndex];
        const itemPos = positions[itemKey];
        if (itemPos) {
          maxRowHeight = Math.max(maxRowHeight, itemPos.height.value);
        }
      }
    }
    y += maxRowHeight + gap;
  }

  return { x, y };
};

interface XYToIndexProps {
  order: SharedValue<string[]>;
  x: number;
  y: number;
  itemHeight: number;
  itemWidth: number;
  dynamicNumColumns: SharedValue<number>;
  containerPadding: number;
  gap: number;
}

export const xyToIndex = ({
  order,
  x,
  y,
  itemHeight,
  itemWidth,
  dynamicNumColumns,
  gap,
  containerPadding,
}: XYToIndexProps) => {
  "worklet";
  const cols = dynamicNumColumns.value;

  // Work with CENTER coordinates relative to the content box
  const relX = x - containerPadding;
  const relY = y - containerPadding;

  const col = Math.floor(relX / (itemWidth + gap));
  const row = Math.floor(relY / (itemHeight + gap));

  const clampedCol = Math.max(0, Math.min(cols - 1, col));
  const maxRows = Math.max(1, Math.ceil(order.value.length / cols));
  const clampedRow = Math.max(0, Math.min(maxRows - 1, row));

  return clampedRow * cols + clampedCol;
};

// New function for dynamic dimensions - finds which item's bounding box contains the point
interface DynamicXYToIndexProps {
  order: SharedValue<string[]>;
  x: number;
  y: number;
  positions: Record<
    string,
    {
      x: SharedValue<number>;
      y: SharedValue<number>;
      width: SharedValue<number>;
      height: SharedValue<number>;
    }
  >;
  dynamicNumColumns: SharedValue<number>;
  containerPadding: number;
  gap: number;
  defaultWidth: number;
  defaultHeight: number;
  activeKey?: SharedValue<string | null>;
}

export const xyToIndexDynamic = ({
  order,
  x,
  y,
  positions,
  dynamicNumColumns,
  containerPadding,
  gap,
  defaultWidth,
  defaultHeight,
  activeKey,
}: DynamicXYToIndexProps) => {
  "worklet";
  // CRITICAL: Calculate target positions using indexToXYDynamic logic (where items SHOULD be)
  // instead of using current animated positions. This ensures we detect position changes
  // even while items are still animating.

  const cols = dynamicNumColumns.value;
  const itemsWithTargetPos: Array<{
    orderIndex: number;
    targetX: number;
    targetY: number;
    width: number;
    height: number;
  }> = [];
  let displayIndex = 0;

  for (let i = 0; i < order.value.length; i++) {
    const key = order.value[i];
    if (activeKey && activeKey.value === key) continue; // Skip dragged item

    const pos = positions[key];
    if (!pos) continue;

    const itemWidth = pos.width.value > 0 ? pos.width.value : defaultWidth;
    const itemHeight = pos.height.value > 0 ? pos.height.value : defaultHeight;

    // Calculate target position using grid layout with dynamic dimensions
    const col = displayIndex % cols;
    const row = Math.floor(displayIndex / cols);

    // Calculate X: sum widths of previous items in same row
    let targetX = containerPadding;
    for (let c = 0; c < col; c++) {
      const prevDisplayIndex = row * cols + c;
      if (prevDisplayIndex < displayIndex) {
        // Find the item at this display index
        let count = 0;
        for (let j = 0; j < order.value.length; j++) {
          const k = order.value[j];
          if (activeKey && activeKey.value === k) continue;
          if (count === prevDisplayIndex) {
            const prevPos = positions[k];
            if (prevPos) {
              targetX +=
                (prevPos.width.value > 0 ? prevPos.width.value : defaultWidth) +
                gap;
            } else {
              targetX += defaultWidth + gap;
            }
            break;
          }
          count++;
        }
      } else {
        targetX += defaultWidth + gap;
      }
    }

    // Calculate Y: sum heights of previous rows
    let targetY = containerPadding;
    for (let r = 0; r < row; r++) {
      let maxRowHeight = defaultHeight;
      for (let c = 0; c < cols; c++) {
        const itemDisplayIndex = r * cols + c;
        if (itemDisplayIndex < displayIndex) {
          let count = 0;
          for (let j = 0; j < order.value.length; j++) {
            const k = order.value[j];
            if (activeKey && activeKey.value === k) continue;
            if (count === itemDisplayIndex) {
              const itemPos = positions[k];
              if (itemPos) {
                maxRowHeight = Math.max(
                  maxRowHeight,
                  itemPos.height.value > 0
                    ? itemPos.height.value
                    : defaultHeight
                );
              }
              break;
            }
            count++;
          }
        }
      }
      targetY += maxRowHeight + gap;
    }

    itemsWithTargetPos.push({
      orderIndex: i,
      targetX,
      targetY,
      width: itemWidth,
      height: itemHeight,
    });

    displayIndex++;
  }

  // Find which target position's bounding box contains the point (x, y)
  // Check in reverse order to get topmost item if overlapping
  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let i = itemsWithTargetPos.length - 1; i >= 0; i--) {
    const item = itemsWithTargetPos[i];
    if (
      x >= item.targetX &&
      x <= item.targetX + item.width &&
      y >= item.targetY &&
      y <= item.targetY + item.height
    ) {
      const centerX = item.targetX + item.width / 2;
      const centerY = item.targetY + item.height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = item.orderIndex;
      }
    }
  }

  // If no item contains the point, find the nearest item
  if (bestIndex === -1) {
    for (let i = 0; i < itemsWithTargetPos.length; i++) {
      const item = itemsWithTargetPos[i];
      const centerX = item.targetX + item.width / 2;
      const centerY = item.targetY + item.height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = item.orderIndex;
      }
    }
  }

  return bestIndex >= 0 ? bestIndex : 0;
};

// Flow layout version - finds insertion point based on Y position and flow layout
export const xyToIndexFlow = ({
  order,
  x,
  y,
  positions,
  containerWidth,
  containerPadding,
  gap,
  defaultWidth,
  defaultHeight,
  activeKey,
}: {
  order: SharedValue<string[]>;
  x: number;
  y: number;
  positions: Record<
    string,
    {
      x: SharedValue<number>;
      y: SharedValue<number>;
      width: SharedValue<number>;
      height: SharedValue<number>;
    }
  >;
  containerWidth: SharedValue<number>;
  containerPadding: number;
  gap: number;
  defaultWidth: number;
  defaultHeight: number;
  activeKey?: SharedValue<string | null>;
}) => {
  "worklet";
  // CRITICAL: Calculate target positions using flow layout logic (where items SHOULD be)
  // instead of using current animated positions (pos.x.value, pos.y.value).
  // This ensures we detect position changes even while items are still animating.

  // Build list of non-active items with their target positions
  const itemsWithTargetPos: Array<{
    orderIndex: number;
    targetX: number;
    targetY: number;
    width: number;
    height: number;
  }> = [];
  let displayIndex = 0;
  let currentX = containerPadding;
  let currentY = containerPadding;
  let maxHeightInRow = 0;

  for (let i = 0; i < order.value.length; i++) {
    const key = order.value[i];
    if (activeKey && activeKey.value === key) continue; // Skip active item

    const pos = positions[key];
    if (!pos) continue;

    const itemWidth = pos.width.value > 0 ? pos.width.value : defaultWidth;
    const itemHeight = pos.height.value > 0 ? pos.height.value : defaultHeight;

    // Check if item fits in current row
    const itemRightEdgeWithGap = currentX + itemWidth + gap;
    const availableRightEdge = containerWidth.value - containerPadding;

    if (itemRightEdgeWithGap > availableRightEdge && displayIndex > 0) {
      // Item doesn't fit - move to next row
      currentY += maxHeightInRow + gap;
      currentX = containerPadding;
      maxHeightInRow = itemHeight;
    } else {
      // Item fits - track max height in current row
      maxHeightInRow = Math.max(maxHeightInRow, itemHeight);
    }

    // Store target position for this item
    itemsWithTargetPos.push({
      orderIndex: i,
      targetX: currentX,
      targetY: currentY,
      width: itemWidth,
      height: itemHeight,
    });

    // Move cursor for next item
    currentX += itemWidth + gap;
    displayIndex++;
  }

  // Find which target position's bounding box contains the point (x, y)
  // Check in reverse order to get topmost item if overlapping
  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let i = itemsWithTargetPos.length - 1; i >= 0; i--) {
    const item = itemsWithTargetPos[i];
    if (
      x >= item.targetX &&
      x <= item.targetX + item.width &&
      y >= item.targetY &&
      y <= item.targetY + item.height
    ) {
      const centerX = item.targetX + item.width / 2;
      const centerY = item.targetY + item.height / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = item.orderIndex;
      }
    }
  }

  // If point is within a target position, return that index
  if (bestIndex >= 0) {
    return bestIndex;
  }

  // Otherwise, find insertion point based on Y position in target layout
  // Sort by target Y, then X
  const sorted = [...itemsWithTargetPos].sort((a, b) => {
    if (Math.abs(a.targetY - b.targetY) > (a.height + b.height) / 2) {
      return a.targetY - b.targetY;
    }
    return a.targetX - b.targetX;
  });

  // Find where to insert based on Y position
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const itemBottom = item.targetY + item.height;

    if (y < itemBottom) {
      return item.orderIndex;
    }
  }

  // Insert at end
  return sorted.length > 0 ? sorted[sorted.length - 1].orderIndex + 1 : 0;
};

export const toIndex1ColFromLiveMidlines = (
  order: SharedValue<string[]>,
  positions: Record<
    string,
    { y: SharedValue<number>; height?: SharedValue<number> }
  >,
  activeKey: SharedValue<string | null>,
  itemHeight: number,
  centerY: number,
  reverse: boolean
) => {
  "worklet";
  const list = order.value.filter((k) => k !== activeKey.value);

  // Sort by actual on-screen Y (top → bottom)
  list.sort((a, b) => positions[a].y.value - positions[b].y.value);

  // Find visual slot v (0..list.length)
  let v = 0;
  for (; v < list.length; v++) {
    const pos = positions[list[v]];
    const height = pos.height?.value || itemHeight;
    const mid = pos.y.value + height / 2;
    if (centerY < mid) break;
  }

  // Map visual slot → array index AFTER removal (reverse aware)
  const afterRemovalLen = list.length;
  return reverse ? afterRemovalLen - v : v;
};
