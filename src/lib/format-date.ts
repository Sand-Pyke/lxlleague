/**
 * match.date 是完整 ISO 字符串，直接渲染会显示成 `2026-09-16T13:39:26.657Z`。
 * 排期时间为可选：空值或解析失败时返回「时间待定」，避免脏数据把页面搞崩。
 */
export function formatMatchDate(value: string | null | undefined) {
  if (!value) return "时间待定";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "时间待定";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
