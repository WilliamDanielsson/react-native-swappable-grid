export default function computeMinHeight(
  count: number,
  numColumns: number,
  tileH: number,
  pad: number
) {
  const rows = Math.max(1, Math.ceil(count / numColumns));
  return pad * 2 + rows * tileH;
}
