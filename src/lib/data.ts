/**
 * 数据层的公共类型。
 *
 * 初始状态不包含任何演示或 Mock 记录；接入持久化数据库后，由仓储层填充这些数据。
 */
export type Player = {
  id: number;
  name: string;
  gameName: string;
  position: string;
  rank: string;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  mvp: number;
  bio: string;
  avatar: string;
};

export type Match = {
  id: number;
  name: string;
  date: string;
  status: "CREATED" | "LIVE" | "FINISHED";
  bo: string;
  playerCount: number;
  teamCount: number;
  signed?: boolean;
  teams: [string, string];
  score: [number, number];
  round: string;
};

export const players: Player[] = [];
export const matches: Match[] = [];

export function getMatch(id: number): Match | undefined {
  return matches.find((match) => match.id === id);
}

export function leaderboard(): Player[] {
  return [...players].sort((a, b) => b.winRate - a.winRate || b.kda - a.kda);
}
