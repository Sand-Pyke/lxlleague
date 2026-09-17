/**
 * 后台管理的前端可复用选项与文案。
 * 放在 lib 下（而非 server 下）是因为客户端组件也要用，不能依赖 Prisma。
 */

/** 段位白名单（后台校验与下拉共用）。 */
export const RANKS: readonly string[] = [
  "王者",
  "宗师",
  "大师",
  "钻石",
  "翡翠",
  "铂金",
  "黄金",
  "白银",
  "青铜",
  "黑铁",
  "未定段",
  "",
];

export const RANK_OPTIONS = RANKS.map((rank) => ({
  value: rank,
  label: rank || "未设置",
}));

/**
 * 注册表单可选段位：只列十个大段（「未定段」/空串不是可选项）。
 * 段位是**选填**的，注册时没选也没关系，之后可在个人中心提交修改申请。
 */
export const REGISTER_RANK_OPTIONS = RANK_OPTIONS.filter(
  (option) => option.value && option.value !== "未定段",
);

/** 用户申请修改段位时写进 User.reviewNote 的备注文案。 */
export const RANK_REVIEW_NOTE = "-修改段位";

/**
 * 归一化段位：库里统一用空串表示「未填写」，「未定段」折算成空串，
 * 白名单以外的值当作未填写。
 */
export function normalizeRank(value: unknown): string {
  const rank = typeof value === "string" ? value.trim() : "";
  if (!rank || rank === "未定段") return "";
  return RANKS.includes(rank) ? rank : "";
}

/**
 * 段位图标：资源在 public/assets/rank 下，按英文大段命名。
 * 键与上面的 RANKS 中文词表一一对应（王者 = 嘴强王者 / Challenge）。
 * 「未定段」与空串没有对应资源，按无图标处理。
 */
export const RANK_ICON: Record<string, string> = {
  王者: "/assets/rank/Challenge.png",
  宗师: "/assets/rank/Grandmaster.png",
  大师: "/assets/rank/Master.png",
  钻石: "/assets/rank/Diamond.png",
  翡翠: "/assets/rank/Emerald.png",
  铂金: "/assets/rank/Platinum.png",
  黄金: "/assets/rank/Gold.png",
  白银: "/assets/rank/Silver.png",
  青铜: "/assets/rank/Bronze.png",
  黑铁: "/assets/rank/Iron.png",
};

/** 段位图标地址；未设置、未定段或词表以外的段位返回空串。 */
export const rankIcon = (rank: string | null | undefined) => RANK_ICON[(rank ?? "").trim()] ?? "";

export const BO_OPTIONS = ["BO1", "BO3", "BO5"];

export const MATCH_STATUSES = ["CREATED", "LIVE", "FINISHED"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  CREATED: "待选人",
  LIVE: "进行中",
  FINISHED: "已结束",
};

export const MATCH_STATUS_COLOR: Record<MatchStatus, string> = {
  CREATED: "gold",
  LIVE: "green",
  FINISHED: "default",
};

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

export const REVIEW_STATUS_COLOR: Record<ReviewStatus, string> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
};

/** 队伍位置槽，与 roster.ts 的 POSITIONS 保持一致（客户端不能 import server 模块）。 */
export const POSITION_OPTIONS = ["TOP", "JUG", "MID", "ADC", "SUP"];

/** 预设战队代号：后台「点击代号建队」用（照抄旧 admin.html 的 TEAM_CODES）。 */
export const TEAM_CODES = ["BLG", "C9", "DK", "DRX", "EDG", "G2", "GEN", "HLE", "T1", "TES"];

export const POSITION_LABEL: Record<string, string> = {
  TOP: "上单",
  JUG: "打野",
  MID: "中单",
  ADC: "射手",
  SUP: "辅助",
};

/**
 * 位置槽只有 TOP/JUG/MID/ADC/SUP（与 roster.ts 的 POSITIONS 一致，旧项目 update_pos 同理）。
 * 数据库用 "FILL" 作默认值，语义是「未设置」，展示时与空串一样按未填写处理。
 */
export const isUnsetPosition = (position: string | null | undefined) =>
  !position || position === "FILL";

export const positionText = (position: string) =>
  isUnsetPosition(position) ? "未填写" : (POSITION_LABEL[position] ?? position);
