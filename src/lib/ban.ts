import { formatMatchDate } from "@/lib/format-date";

/**
 * 报名被处罚时的统一提示文案（前端报名入口与服务端报名接口共用）。
 * 返回 null 表示当前未处于处罚期，可以正常报名。
 */
export function banNotice(banUntil: Date | string | null | undefined): string | null {
  if (!banUntil) return null;
  const until = banUntil instanceof Date ? banUntil : new Date(banUntil);
  if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return null;
  return `您因不友善行为被处罚，暂时不能报名，截止处罚时间 ${formatMatchDate(until.toISOString())}`;
}
