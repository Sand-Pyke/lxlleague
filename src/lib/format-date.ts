/**
 * match.date 是完整 ISO 字符串，直接渲染会显示成 `2026-09-16T13:39:26.657Z`。
 * 解析失败时原样返回，避免因为脏数据把页面搞崩。
 */
export function formatMatchDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
