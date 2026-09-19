/**
 * 战队数据：按赛区（LCK/LPL/LCS/LEC/PCS/OTHER）分组，队名与
 * public/assets/team/<赛区小写>/<队名>.png 一一对应。
 * 供后台「队伍编排」的战队选取与对阵图（bracket）的队徽展示共用。
 */

export type League = "LCK" | "LPL" | "LCS" | "LEC" | "PCS" | "OTHER";

export type TeamOption = {
  /** 队伍名（同时是 Team.name 与图片文件名）。 */
  name: string;
  league: League;
  logo: string;
};

const TEAMS: Record<League, string[]> = {
  LCK: ["DK", "DRX", "GENG", "HLE", "KT", "T1"],
  LPL: ["AL", "BLG", "EDG", "IG", "JDG", "LGD", "LNG", "NIP", "TES", "WBG", "WE"],
  LCS: ["100T", "C9", "FLY"],
  LEC: ["FNC", "G2", "RGE"],
  PCS: ["CFO"],
  OTHER: ["GAM"],
};

export const LEAGUE_ORDER: League[] = ["LCK", "LPL", "LCS", "LEC", "PCS", "OTHER"];

export const LEAGUE_LABEL: Record<League, string> = {
  LCK: "LCK",
  LPL: "LPL",
  LCS: "LCS",
  LEC: "LEC",
  PCS: "PCS",
  OTHER: "外卡赛区",
};

export const TEAMS_BY_LEAGUE: { league: League; teams: TeamOption[] }[] = LEAGUE_ORDER.map(
  (league) => ({
    league,
    teams: TEAMS[league].map((name) => ({
      name,
      league,
      logo: `/assets/team/${league.toLowerCase()}/${name}.png`,
    })),
  }),
);

const LOGO_BY_NAME = new Map<string, string>();
for (const { teams } of TEAMS_BY_LEAGUE) {
  for (const team of teams) LOGO_BY_NAME.set(team.name.toUpperCase(), team.logo);
}
// 旧数据里用「GEN」，图片文件名是「GENG」，这里做个别名对齐。
LOGO_BY_NAME.set("GEN", "/assets/team/lck/GENG.png");

/** 队名 → 队徽路径；未知队名返回空串（由调用方回退到文字占位）。 */
export function teamLogo(name: string | null | undefined): string {
  if (!name) return "";
  return LOGO_BY_NAME.get(name.trim().toUpperCase()) ?? "";
}
