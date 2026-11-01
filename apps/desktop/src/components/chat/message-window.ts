export function messageWindow(
  count: number,
  scrollTop: number,
  viewport: number,
  heights: readonly number[],
  fallback = 128,
  overscan = 480,
) {
  if (count <= 0) return { start: 0, end: 0, top: 0, bottom: 0 };
  const prefix = [0];
  for (let index = 0; index < count; index += 1)
    prefix.push((prefix[index] ?? 0) + (heights[index] ?? fallback));
  const total = prefix[count] ?? 0;
  const view = Math.max(viewport, 1);
  const from = Math.max(0, scrollTop - overscan);
  const to = scrollTop + view + overscan;
  let start = 0;
  while (start < count && (prefix[start + 1] ?? 0) <= from) start += 1;
  let end = start;
  while (end < count && (prefix[end] ?? 0) < to) end += 1;
  return {
    start,
    end,
    top: prefix[start] ?? 0,
    bottom: Math.max(0, total - (prefix[end] ?? 0)),
  };
}
export function tailWindow(
  count: number,
  viewport: number,
  heights: readonly number[],
  fallback = 128,
) {
  const prefix = [0];
  for (let index = 0; index < count; index += 1)
    prefix.push((prefix[index] ?? 0) + (heights[index] ?? fallback));
  const total = prefix[count] ?? 0;
  return messageWindow(
    count,
    Math.max(0, total - Math.max(viewport, 1)),
    viewport,
    heights,
    fallback,
  );
}
