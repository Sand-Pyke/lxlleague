import type { Match, MatchGameRecord, MatchScore, MatchSignup, Team } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * 队伍、轮次与比分的领域逻辑（迁移自原 Flask 服务的 _pair_teams / rank_fee /
 * match_budget / _score_map / _get_score / _team_score）。
 */

export const POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"] as const;
export type Position = (typeof POSITIONS)[number];

export function isPosition(value: unknown): value is Position {
  return typeof value === "string" && (POSITIONS as readonly string[]).includes(value);
}

// 段位费用：黑铁 1 ~ 王者 10（未定段/空 = 0）
const RANK_FEE: Record<string, number> = {
  黑铁: 1,
  青铜: 2,
  白银: 3,
  黄金: 4,
  铂金: 5,
  翡翠: 6,
  钻石: 7,
  大师: 8,
  宗师: 9,
  王者: 10,
  未定段: 0,
  "": 0,
};

export function rankFee(rank: string | null | undefined) {
  return RANK_FEE[rank ?? ""] ?? 0;
}

type SignWithRank = MatchSignup & { user?: { profile?: { rank: string } | null } | null };

/** 报名记录的有效段位：优先用户当前段位（改段位后实时生效），回退到报名快照。 */
export function signRank(sign: SignWithRank) {
  return sign.user?.profile?.rank || sign.rankAtSignup || "";
}

/** 每队动态预算 = ceil(选手池总费用 / 队伍数) + 1 宽松费（防止预算卡死凑不齐 5 人）。 */
export async function matchBudget(matchId: number) {
  const [signs, teamCount] = await Promise.all([
    prisma.matchSignup.findMany({
      where: { matchId },
      include: { user: { include: { profile: { select: { rank: true } } } } },
    }),
    prisma.team.count({ where: { matchId } }),
  ]);
  const total = signs.reduce((sum, sign) => sum + rankFee(signRank(sign)), 0);
  if (teamCount <= 0) return Math.max(total, 1);
  return Math.max(1, Math.ceil(total / teamCount) + 1);
}

export type TeamPair = [number, number | null];

/** 对阵配对：手动选的对战排第一，其余队伍继续两两配对（缺队补 null → 待定）。 */
export function pairTeams(match: Pick<Match, "teamOneId" | "teamTwoId">, teams: Team[]): TeamPair[] {
  const teamIds = new Set(teams.map((team) => team.id));
  const pairs: TeamPair[] = [];
  let used = new Set<number>();

  if (match.teamOneId && match.teamTwoId && teamIds.has(match.teamOneId) && teamIds.has(match.teamTwoId)) {
    pairs.push([match.teamOneId, match.teamTwoId]);
    used = new Set([match.teamOneId, match.teamTwoId]);
  }

  const rest = teams.filter((team) => !used.has(team.id)).map((team) => team.id);
  for (let index = 0; index < rest.length; index += 2) {
    pairs.push([rest[index], rest[index + 1] ?? null]);
  }

  if (!pairs.length && teams.length) {
    pairs.push([teams[0].id, teams[1]?.id ?? null]);
  }
  return pairs;
}

type ScoreMap = Map<string, [number, number]>;

type ScoreRow = Pick<MatchScore, "roundNo" | "teamOneId" | "teamTwoId" | "scoreOne" | "scoreTwo">;

const scoreKey = (roundNo: number, teamOneId: number, teamTwoId: number) =>
  `${roundNo}:${teamOneId}:${teamTwoId}`;

/** 手动战果查找表（优先于按战绩统计）。 */
export function scoreMap(scores: ScoreRow[]): ScoreMap {
  const map: ScoreMap = new Map();
  for (const score of scores) {
    map.set(scoreKey(score.roundNo, score.teamOneId, score.teamTwoId), [score.scoreOne, score.scoreTwo]);
  }
  return map;
}

type ScoreRecord = Pick<MatchGameRecord, "userId" | "gameNo" | "result">;

/** 对阵比分：按小局统计两队各自 win 数（小局内同队多名胜者算 1 分）。 */
export function teamScore(
  records: ScoreRecord[],
  userTeam: Map<number, number>,
  teamOneId: number,
  teamTwoId: number | null,
): [number, number] {
  const games = new Map<number, ScoreRecord[]>();
  for (const record of records) {
    const teamId = userTeam.get(record.userId);
    if (teamId !== teamOneId && teamId !== teamTwoId) continue;
    const bucket = games.get(record.gameNo) ?? [];
    bucket.push(record);
    games.set(record.gameNo, bucket);
  }

  let scoreOne = 0;
  let scoreTwo = 0;
  for (const [, gameRecords] of [...games].sort((a, b) => a[0] - b[0])) {
    const winsOne = gameRecords.filter((r) => r.result === "win" && userTeam.get(r.userId) === teamOneId).length;
    const winsTwo = gameRecords.filter((r) => r.result === "win" && userTeam.get(r.userId) === teamTwoId).length;
    if (winsOne > winsTwo) scoreOne += 1;
    else if (winsTwo > winsOne) scoreTwo += 1;
  }
  return [scoreOne, scoreTwo];
}

/** 取比分：手动设置的战果优先，否则按战绩统计。 */
export function resolveScore(
  map: ScoreMap,
  roundNo: number,
  teamOneId: number,
  teamTwoId: number | null,
  records: ScoreRecord[],
  userTeam: Map<number, number>,
): [number, number] {
  if (teamTwoId === null) return [0, 0];
  const direct = map.get(scoreKey(roundNo, teamOneId, teamTwoId));
  if (direct) return direct;
  const swapped = map.get(scoreKey(roundNo, teamTwoId, teamOneId));
  if (swapped) return [swapped[1], swapped[0]];
  return teamScore(records, userTeam, teamOneId, teamTwoId);
}

/** 单败淘汰允许的队伍数：2/4/8/16/32。 */
const VALID_TEAM_COUNTS = [2, 4, 8, 16, 32];

export function isBracketTeamCount(count: number) {
  return VALID_TEAM_COUNTS.includes(count);
}

/** 单败淘汰总轮数 = log2(队伍数)，最少 1 轮。 */
export function totalRoundsFor(teamCount: number) {
  return Math.max(1, Math.round(Math.log2(Math.max(teamCount, 2))));
}

/**
 * 结束本轮：校验本轮全部对阵都已录入系列比分且分出胜负，固化本轮对阵，
 * 并把各组胜者按顺序配对成下一轮；只剩一组（决赛）时判定冠军并结束赛事。
 */
export async function endRound(matchId: number) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { kind: "not_found" as const };
  if (match.status === "FINISHED") return { kind: "already_finished" as const };

  const teams = await prisma.team.findMany({ where: { matchId }, orderBy: { id: "asc" } });
  if (!isBracketTeamCount(teams.length)) return { kind: "bad_team_count" as const };

  const roundNo = match.currentRound || 1;
  if (roundNo > totalRoundsFor(teams.length)) return { kind: "already_finished" as const };

  // 当前轮对阵：优先用已固化的 MatchRound；第 1 轮未固化时按队伍顺序现场生成。
  const frozen = await prisma.matchRound.findMany({
    where: { matchId, roundNo },
    orderBy: { id: "asc" },
  });
  const pairs: [number, number][] = frozen.length
    ? frozen.map((row) => [row.teamOneId, row.teamTwoId] as [number, number])
    : (pairTeams(match, teams).filter((pair): pair is [number, number] => pair[1] !== null));
  if (!pairs.length) return { kind: "empty" as const };

  const map = scoreMap(
    await prisma.matchScore.findMany({
      where: { matchId, roundNo },
      select: { roundNo: true, teamOneId: true, teamTwoId: true, scoreOne: true, scoreTwo: true },
    }),
  );

  const winners: number[] = [];
  for (const [teamOneId, teamTwoId] of pairs) {
    const direct = map.get(scoreKey(roundNo, teamOneId, teamTwoId));
    const swapped = map.get(scoreKey(roundNo, teamTwoId, teamOneId));
    let scoreOne: number;
    let scoreTwo: number;
    if (direct) {
      scoreOne = direct[0];
      scoreTwo = direct[1];
    } else if (swapped) {
      scoreOne = swapped[1];
      scoreTwo = swapped[0];
    } else {
      return { kind: "no_score" as const };
    }
    if (scoreOne === scoreTwo) return { kind: "tie" as const };
    winners.push(scoreOne > scoreTwo ? teamOneId : teamTwoId);
  }

  const freezePairs = prisma.matchRound.deleteMany({ where: { matchId, roundNo } });
  const savePairs = prisma.matchRound.createMany({
    data: pairs.map(([teamOneId, teamTwoId]) => ({ matchId, roundNo, teamOneId, teamTwoId })),
  });

  if (pairs.length === 1) {
    // 决赛：冠军出炉，赛事结束。
    await prisma.$transaction([
      freezePairs,
      savePairs,
      prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED" } }),
    ]);
    return { kind: "ok" as const, roundNo, finished: true, championTeamId: winners[0] };
  }

  // 半决赛及之前：胜者按顺序两两配对成下一轮。
  const nextRound = roundNo + 1;
  const nextPairs = [];
  for (let index = 0; index < winners.length; index += 2) {
    nextPairs.push({ matchId, roundNo: nextRound, teamOneId: winners[index], teamTwoId: winners[index + 1] });
  }
  await prisma.$transaction([
    freezePairs,
    savePairs,
    prisma.matchRound.deleteMany({ where: { matchId, roundNo: nextRound } }),
    prisma.matchRound.createMany({ data: nextPairs }),
    prisma.match.update({ where: { id: matchId }, data: { currentRound: nextRound } }),
  ]);
  return { kind: "ok" as const, roundNo, finished: false, championTeamId: null };
}

/** 手动设置某轮对战战果（几比几）。 */
export async function setScore(input: {
  matchId: number;
  roundNo: number;
  teamOneId: number;
  teamTwoId: number;
  scoreOne: number;
  scoreTwo: number;
}) {
  const { matchId, roundNo, teamOneId, teamTwoId, scoreOne, scoreTwo } = input;
  const direct = await prisma.matchScore.findUnique({
    where: {
      matchId_roundNo_teamOneId_teamTwoId: { matchId, roundNo, teamOneId, teamTwoId },
    },
  });
  if (direct) {
    await prisma.matchScore.update({
      where: { id: direct.id },
      data: { scoreOne, scoreTwo },
    });
    return;
  }

  const swapped = await prisma.matchScore.findUnique({
    where: {
      matchId_roundNo_teamOneId_teamTwoId: { matchId, roundNo, teamOneId: teamTwoId, teamTwoId: teamOneId },
    },
  });
  if (swapped) {
    await prisma.matchScore.update({
      where: { id: swapped.id },
      data: { scoreOne: scoreTwo, scoreTwo: scoreOne },
    });
    return;
  }

  await prisma.matchScore.create({
    data: { matchId, roundNo, teamOneId, teamTwoId, scoreOne, scoreTwo },
  });
}

/** 队伍名映射 + 每队已用费用。 */
export async function teamUsage(matchId: number) {
  const [teams, signs] = await Promise.all([
    prisma.team.findMany({ where: { matchId }, orderBy: { id: "asc" } }),
    prisma.matchSignup.findMany({
      where: { matchId },
      include: { user: { include: { profile: { select: { rank: true } } } } },
    }),
  ]);
  const usedFee = new Map<number, number>();
  const memberCount = new Map<number, number>();
  for (const sign of signs) {
    if (!sign.teamId) continue;
    usedFee.set(sign.teamId, (usedFee.get(sign.teamId) ?? 0) + rankFee(signRank(sign)));
    memberCount.set(sign.teamId, (memberCount.get(sign.teamId) ?? 0) + 1);
  }
  return { teams, signs, usedFee, memberCount };
}

async function syncTeamCount(matchId: number) {
  const teamCount = await prisma.team.count({ where: { matchId } });
  await prisma.match.update({ where: { id: matchId }, data: { teamCount } });
}

export async function createTeam(matchId: number, name: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { kind: "match_not_found" as const };
  try {
    await prisma.team.create({ data: { matchId, name } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { kind: "duplicate" as const };
    throw error;
  }
  await syncTeamCount(matchId);
  return { kind: "ok" as const };
}

export async function deleteTeam(teamId: number) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return { kind: "not_found" as const };
  // 队员移回未分配（外键为 SetNull，这里显式清空位置槽以便前端立即反映）
  await prisma.$transaction([
    prisma.matchSignup.updateMany({
      where: { teamId },
      data: { teamId: null, teamPosition: "", positionOrder: 0 },
    }),
    prisma.team.delete({ where: { id: teamId } }),
  ]);
  await syncTeamCount(team.matchId);
  return { kind: "ok" as const };
}

/** 把报名记录分配到队伍/位置槽。目标位置已有人时自动互换位置。 */
export async function assignSignup(input: {
  signId: number;
  teamId: number | null;
  teamPosition: string | null;
}) {
  const { signId, teamId } = input;
  const sign = await prisma.matchSignup.findUnique({
    where: { id: signId },
    include: { user: { include: { profile: { select: { rank: true } } } } },
  });
  if (!sign) return { kind: "sign_not_found" as const };

  if (teamId === null) {
    await prisma.matchSignup.update({
      where: { id: signId },
      data: { teamId: null, teamPosition: "", positionOrder: 0 },
    });
    return { kind: "ok" as const };
  }

  const [team, match] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.match.findUnique({ where: { id: sign.matchId } }),
  ]);
  if (!team || team.matchId !== sign.matchId) return { kind: "team_mismatch" as const };
  if (!match) return { kind: "match_not_found" as const };

  if (input.teamPosition && !isPosition(input.teamPosition)) {
    return { kind: "invalid_position" as const };
  }

  if (match.useFee) {
    const budget = await matchBudget(sign.matchId);
    const teammates = await prisma.matchSignup.findMany({
      where: { teamId, id: { not: signId } },
      include: { user: { include: { profile: { select: { rank: true } } } } },
    });
    const used = teammates.reduce((sum, member) => sum + rankFee(signRank(member)), 0);
    const fee = rankFee(signRank(sign));
    if (used + fee > budget) {
      return { kind: "over_budget" as const, used, budget, fee };
    }
  }

  const teammateOrders = await prisma.matchSignup.findMany({
    where: { teamId },
    select: { positionOrder: true },
  });
  const maxOrder = teammateOrders.reduce((max, row) => Math.max(max, row.positionOrder), 0);

  await prisma.$transaction(async (tx) => {
    if (input.teamPosition) {
      const occupied = await tx.matchSignup.findFirst({
        where: { teamId, teamPosition: input.teamPosition, id: { not: signId } },
      });
      if (occupied) {
        const vacated = isPosition(sign.teamPosition) ? sign.teamPosition : null;
        await tx.matchSignup.update({
          where: { id: occupied.id },
          data: { teamPosition: vacated ?? "", positionOrder: vacated ? occupied.positionOrder : 0 },
        });
      }
    }
    await tx.matchSignup.update({
      where: { id: signId },
      data: { teamId, teamPosition: input.teamPosition ?? "", positionOrder: maxOrder + 1 },
    });
  });

  return { kind: "ok" as const };
}

/** 队内位置调换（up / down）。 */
export async function moveSignup(signId: number, direction: "up" | "down") {
  const sign = await prisma.matchSignup.findUnique({ where: { id: signId } });
  if (!sign || !sign.teamId) return { kind: "not_in_team" as const };

  const siblings = await prisma.matchSignup.findMany({
    where: { teamId: sign.teamId },
    orderBy: [{ positionOrder: "asc" }, { id: "asc" }],
  });
  const index = siblings.findIndex((row) => row.id === signId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) return { kind: "out_of_range" as const };

  const other = siblings[target];
  await prisma.$transaction([
    prisma.matchSignup.update({
      where: { id: sign.id },
      data: { positionOrder: other.positionOrder },
    }),
    prisma.matchSignup.update({
      where: { id: other.id },
      data: { positionOrder: sign.positionOrder },
    }),
  ]);
  return { kind: "ok" as const };
}

/** 智能自动分人：每轮费用最低的队伍优先选人，同费用随机；预算内优先挑费用最高选手。 */
export async function autoAssign(matchId: number) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { kind: "match_not_found" as const };

  const budget = await matchBudget(matchId);
  let assigned = 0;

  for (;;) {
    const { teams, signs, usedFee, memberCount } = await teamUsage(matchId);
    if (!teams.length) break;

    const pool = signs
      .filter((sign) => !sign.teamId)
      .map((sign) => ({ sign, fee: rankFee(signRank(sign)) }));
    if (!pool.length) break;

    const members = new Map<number, MatchSignup[]>();
    for (const sign of signs) {
      if (!sign.teamId) continue;
      const bucket = members.get(sign.teamId) ?? [];
      bucket.push(sign);
      members.set(sign.teamId, bucket);
    }

    const open = teams
      .map((team) => {
        const occupied = new Set(
          (members.get(team.id) ?? []).map((member) => member.teamPosition).filter(Boolean),
        );
        return {
          team,
          used: usedFee.get(team.id) ?? 0,
          count: memberCount.get(team.id) ?? 0,
          free: POSITIONS.filter((position) => !occupied.has(position)),
        };
      })
      .filter((entry) => entry.count < POSITIONS.length && entry.free.length);
    if (!open.length) break;

    const minUsed = Math.min(...open.map((entry) => entry.used));
    const candidates = open.filter((entry) => entry.used === minUsed);
    const picked = candidates[Math.floor(Math.random() * candidates.length)];

    const remain = budget - picked.used;
    const affordable = pool.filter((entry) => entry.fee <= remain);
    if (!affordable.length) break;
    affordable.sort((a, b) => b.fee - a.fee);

    const chosen = affordable[0].sign;
    const orders = (members.get(picked.team.id) ?? []).map((member) => member.positionOrder);
    const maxOrder = orders.length ? Math.max(...orders) : 0;
    await prisma.matchSignup.update({
      where: { id: chosen.id },
      data: {
        teamId: picked.team.id,
        teamPosition: picked.free[0],
        positionOrder: maxOrder + 1,
      },
    });
    assigned += 1;
  }

  return { kind: "ok" as const, assigned };
}
