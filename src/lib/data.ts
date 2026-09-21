/**
 * 数据层的公共类型。
 *
 * 选手的对局统计（胜场 / KDA / MVP / 积分）一律由 MatchGameRecord 现算得出，
 * 不在选手资料表里冗余存储，因此这里的字段是聚合结果而非数据库列。
 */
export type Player = {
  id: number;
  name: string;
  username: string;
  gameName: string;
  /** 主位置（历史字段名，等价于 mainPosition） */
  position: string;
  mainPosition: string;
  subPosition: string;
  rank: string;
  bio: string;
  avatar: string;
  kookName: string;
  background: string;
  wins: number;
  losses: number;
  games: number;
  winRate: number;
  kda: number;
  mvp: number;
  svp: number;
  points: number;
  teamChampion: number;
  runnerup: number;
  mvpRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  /** 最常用英雄 */
  hero: string;
  /**
   * 选手在「我的资料」里自选的常用英雄（最多 3 个，顺序即填写顺序）。
   * 选手中心与个人主页优先展示这一份；为空时回退到战绩统计出的 hero。
   */
  favoriteHeroes: string[];
  /** 最近 10 场胜负序列，如 "W L W W" */
  recent: string;
};

export type Match = {
  id: number;
  name: string;
  /** 排期时间（可选）：未设置时为 null，展示为「时间待定」。 */
  date: string | null;
  status: "CREATED" | "LIVE" | "FINISHED";
  bo: string;
  playerCount: number;
  teamCount: number;
  signed?: boolean;
  round: string;
  /** 直播链接（仅 LIVE 状态可设置） */
  liveUrl: string;
  /** 是否启用选手费用预算 */
  useFee: boolean;
  currentRound: number;
  teamOneId: number | null;
  teamTwoId: number | null;
};

/** 首页「最近赛果」：一场赛事最新一轮的对阵比分。 */
export type RecentResult = {
  id: number;
  name: string;
  status: "CREATED" | "LIVE" | "FINISHED";
  round_no: number;
  pairs: Array<{
    team1: string;
    team2: string;
    score: [number, number];
  }>;
};
