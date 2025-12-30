import { SharedValue } from "react-native-reanimated";

interface IndexToXYProps {
  index: number;
  itemHeight: number;
  itemWidth: number;
  dynamicNumColumns: SharedValue<number>;
  containerPadding: number;
  gap: number;
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

export const toIndex1ColFromLiveMidlines = (
  order: SharedValue<string[]>,
  positions: Record<string, { y: SharedValue<number> }>,
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
    const mid = positions[list[v]].y.value + itemHeight / 2;
    if (centerY < mid) break;
  }

  // Map visual slot → array index AFTER removal (reverse aware)
  const afterRemovalLen = list.length;
  return reverse ? afterRemovalLen - v : v;
};
