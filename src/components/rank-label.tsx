import { rankIcon } from "@/lib/admin-options";

/**
 * 段位展示：图标 + 文字，全站统一用它，避免各处自己拼 img 造成尺寸不一致。
 *
 * - 各页面对空段位的文案不同（未设置 / 未定段 / -），用 fallback 指定。
 * - 没有图标资源（未定段、空串、词表外的段位）时只渲染文字，不留空洞。
 * - 图标尺寸可用 CSS 变量 --rank-icon-size 在各场景微调。
 */
export function RankLabel({
  rank,
  fallback = "未设置",
  className,
}: {
  rank?: string | null;
  fallback?: string;
  className?: string;
}) {
  const icon = rankIcon(rank);
  return (
    <span className={className ? `rank-label ${className}` : "rank-label"}>
      {icon ? <img className="rank-icon" src={icon} alt="" /> : null}
      {rank?.trim() || fallback}
    </span>
  );
}
