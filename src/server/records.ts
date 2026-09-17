import type { MatchGameRecord, PlayerProfile, User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseFavoriteHeroes } from "@/lib/favorite-heroes";
import { ApiError } from "@/server/api";
import { coreAdminUsername } from "@/server/auth";
import { assertCanManageUser } from "@/server/permissions";

/**
 * 对局战绩的写入与聚合（迁移自原 Flask 服务的 MatchResult 相关接口与
 * _all_players 统计逻辑）。
 *
 * 战绩是胜场 / KDA / MVP 的唯一数据源：选手页、排行页与个人主页的统计
 * 全部由这里现算，避免出现「赛果已录入但选手数据不更新」的情况。
 */

export type GameRecordInput = {
  userId: number;
  matchId: number | null;
  champion: string;
  result: "win" | "lose";
  kills: number;
  deaths: number;
  assists: number;
  isMvp: boolean;
  isSvp: boolean;
  teamRank: number;
  level: number;
  cs: number;
  gold: number;
  vision: number;
  items: string;
  gameNo: number;
  roundNo: number;
  playedAt: Date;
};

const asInt = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const asDate = (value: unknown) => {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

export function normalizeResult(value: unknown): "win" | "lose" {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["win", "胜利", "胜", "1", "true"].includes(text) ? "win" : "lose";
}

function normalizeItems(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.replace(/，/g, ",").split(",")
      : [];
  return raw
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(",")
    .slice(0, 200);
}

/** 单人录入（原 /api/result/add）：同一赛事同一小局只能录一条，并限制录入频率。 */
export async function addRecord(input: {
  targetUserId: number;
  matchId: number;
  champion: string;
  result: "win" | "lose";
  kills: number;
  deaths: number;
  assists: number;
  isMvp: boolean;
  isSvp: boolean;
  teamRank: number;
  playedAt: Date;
  gameNo: number;
  roundNo: number;
}) {
  // matchId <= 0 表示「自由对局」，不参与同赛事去重
  const matchId = input.matchId > 0 ? input.matchId : null;

  if (matchId) {
    const duplicate = await prisma.matchGameRecord.findFirst({
      where: {
        userId: input.targetUserId,
        matchId,
        gameNo: input.gameNo,
      },
    });
    if (duplicate) return { kind: "duplicate" as const };
  }

  const recent = await prisma.matchGameRecord.count({
    where: {
      userId: input.targetUserId,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });
  if (recent >= 5) return { kind: "rate_limited" as const };

  const { targetUserId, ...record } = input;
  await prisma.matchGameRecord.create({ data: { ...record, userId: targetUserId, matchId } });
  return { kind: "ok" as const };
}

/** 整局批量录入（原 /api/admin/result/batch）：一次录一局最多 10 人。 */
export async function batchAddRecords(matchId: number, rows: unknown[]) {
  const errors: string[] = [];
  let ok = 0;

  const match = matchId > 0 ? await prisma.match.findUnique({ where: { id: matchId } }) : null;

  for (const [index, raw] of rows.entries()) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const line = index + 1;

    const userId = asInt(row.user_id);
    const champion = String(row.champion ?? "").trim();
    const result = row.result === "win" || row.result === "lose" ? row.result : null;
    if (!userId || !champion || !result) {
      errors.push(`第${line}行：玩家/英雄/胜负不完整`);
      continue;
    }

    const gameNo = Math.max(1, asInt(row.game_no, 1));
    if (matchId > 0) {
      const duplicate = await prisma.matchGameRecord.findFirst({
        where: { userId, matchId, gameNo },
      });
      if (duplicate) {
        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        });
        errors.push(`第${line}行：${target?.username ?? userId} 第${gameNo}局已有记录`);
        continue;
      }
    }

    const roundNo = Math.max(1, asInt(row.round_no, match?.currentRound ?? 1));
    await prisma.matchGameRecord.create({
      data: {
        userId,
        matchId,
        champion: champion.slice(0, 50),
        result,
        kills: asInt(row.kills),
        deaths: asInt(row.deaths),
        assists: asInt(row.assists),
        isMvp: Boolean(row.is_mvp),
        isSvp: Boolean(row.is_svp),
        teamRank: asInt(row.team_rank),
        level: asInt(row.level),
        cs: asInt(row.cs),
        gold: asInt(row.gold),
        vision: asInt(row.vision),
        items: normalizeItems(row.items),
        gameNo,
        roundNo,
        playedAt: asDate(row.played_at),
      },
    });

    // 管理员录入的位置为权威数据，直接覆盖报名记录的位置槽
    if (matchId > 0) {
      const teamPosition = String(row.team_pos ?? "")
        .trim()
        .toUpperCase();
      if (["TOP", "JUG", "MID", "ADC", "SUP", "无"].includes(teamPosition)) {
        await prisma.matchSignup.updateMany({
          where: { matchId, userId },
          data: { teamPosition: teamPosition === "无" ? "" : teamPosition },
        });
      }
    }

    ok += 1;
  }

  return { ok, errors };
}

/** 自动导入（LCU agent）需要的行结构：玩家用 userId / puuid / gameName 任一方式指定。 */
export type ImportedRow = {
  userId: number;
  champion: string;
  result: "win" | "lose";
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  vision: number;
  level: number;
  items: string;
  isMvp: boolean;
  isSvp: boolean;
  teamRank: number;
};

/** 把 agent 传来的原始行规范化成入库结构；英雄/胜负不完整时返回 null。 */
export function normalizeImportedRow(raw: unknown): ImportedRow | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  const userId = asInt(row.user_id ?? row.userId);
  const champion = String(row.champion ?? "").trim();
  if (!userId || !champion) return null;
  return {
    userId,
    champion: champion.slice(0, 50),
    result: normalizeResult(row.result),
    kills: asInt(row.kills),
    deaths: asInt(row.deaths),
    assists: asInt(row.assists),
    cs: asInt(row.cs),
    gold: asInt(row.gold),
    vision: asInt(row.vision),
    level: asInt(row.level),
    items: normalizeItems(row.items),
    isMvp: Boolean(row.is_mvp ?? row.isMvp),
    isSvp: Boolean(row.is_svp ?? row.isSvp),
    teamRank: asInt(row.team_rank ?? row.teamRank),
    // 注意：MVP/SVP 与 teamRank 故意尊重 agent 的取值，但 agent 通常传 0/false，
    // 赛后由管理员在「战绩录入」的编辑弹窗里补 —— 那里本来就能改这三个字段。
  };
}

/**
 * 自动导入整局战绩（LCU agent 专用）。
 *
 * 与 batchAddRecords 的关键差别是**幂等**：agent 会重复抓到同一局，
 * 因此以 (sourceGameId, userId) 为键 upsert —— 这依赖迁移 202609160008 里
 * 那个唯一索引，索引是完整的，所以 Prisma 生成的 ON CONFLICT 才能命中。
 */
export async function upsertGameRecords(input: {
  sourceGameId: string;
  matchId: number;
  roundNo: number;
  gameNo: number;
  /** true = 调用方明确指定了 gameNo；false = 自动排到该赛事的下一个空位（agent 用）。 */
  gameNoExplicit: boolean;
  playedAt: Date;
  rows: ImportedRow[];
  puuidUpdates?: Array<{ userId: number; puuid: string }>;
}) {
  return prisma.$transaction(
    async (tx) => {
      let created = 0;
      let updated = 0;
      const userIds = input.rows.map((row) => row.userId);
      const existingRecords = await tx.matchGameRecord.findMany({
        where: { sourceGameId: input.sourceGameId, userId: { in: userIds } },
        select: { id: true, userId: true, matchId: true, roundNo: true, gameNo: true },
      });
      const existingByUser = new Map(existingRecords.map((record) => [record.userId, record]));
      for (const record of existingRecords) {
        if (record.matchId !== input.matchId || record.roundNo !== input.roundNo) {
          throw new ApiError(409, "同一来源对局已归属到其他赛事或轮次");
        }
      }

      const existingSlots = new Set(existingRecords.map((record) => record.gameNo));
      if (existingSlots.size > 1) {
        throw new ApiError(409, "同一来源对局存在不一致的局号");
      }

      let resolvedGameNo = existingRecords[0]?.gameNo ?? input.gameNo;
      if (!resolvedGameNo) {
        const last = await tx.matchGameRecord.findFirst({
          where: { matchId: input.matchId, roundNo: input.roundNo },
          orderBy: { gameNo: "desc" },
          select: { gameNo: true },
        });
        resolvedGameNo = (last?.gameNo ?? 0) + 1;
      }

      if (input.gameNoExplicit && existingRecords.length && resolvedGameNo !== input.gameNo) {
        throw new ApiError(409, "同一来源对局已使用不同局号导入");
      }

      for (const binding of input.puuidUpdates ?? []) {
        await tx.playerProfile.updateMany({
          where: { userId: binding.userId, puuid: null },
          data: { puuid: binding.puuid },
        });
      }

      for (const row of input.rows) {
        const data = {
          matchId: input.matchId > 0 ? input.matchId : null,
          champion: row.champion,
          result: row.result,
          kills: row.kills,
          deaths: row.deaths,
          assists: row.assists,
          isMvp: row.isMvp,
          isSvp: row.isSvp,
          teamRank: row.teamRank,
          level: row.level,
          cs: row.cs,
          gold: row.gold,
          vision: row.vision,
          items: row.items,
          playedAt: input.playedAt,
        };

        const existing = existingByUser.get(row.userId);
        if (existing) {
          // 重复上传只刷新数据，**不动 gameNo / roundNo**：那是首次导入定下的槽位，
          // 否则 agent 重扫时会把已经排好的第 N 局重新算成别的局数。
          await tx.matchGameRecord.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          await tx.matchGameRecord.create({
            data: {
              ...data,
              userId: row.userId,
              sourceGameId: input.sourceGameId,
              gameNo: resolvedGameNo,
              roundNo: input.roundNo,
            },
          });
          created += 1;
        }
      }

      return { created, updated, gameNo: resolvedGameNo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listMatchRecords(matchId: number) {
  const records = await prisma.matchGameRecord.findMany({
    where: { matchId },
    orderBy: [{ gameNo: "asc" }, { id: "asc" }],
    include: { user: { select: { username: true } } },
  });
  return records.map((record) => ({
    id: record.id,
    user_id: record.userId,
    username: record.user?.username ?? "已注销",
    champion: record.champion,
    result: record.result,
    team_rank: record.teamRank,
    level: record.level,
    kills: record.kills,
    deaths: record.deaths,
    assists: record.assists,
    cs: record.cs,
    gold: record.gold,
    vision: record.vision,
    items: record.items ? record.items.split(",").filter(Boolean) : [],
    is_mvp: record.isMvp,
    is_svp: record.isSvp,
    game_no: record.gameNo,
    round_no: record.roundNo,
    played_at: record.playedAt ? record.playedAt.toISOString().slice(0, 10) : "",
  }));
}

export async function updateRecord(recordId: number, body: Record<string, unknown>) {
  const record = await prisma.matchGameRecord.findUnique({ where: { id: recordId } });
  if (!record) return { kind: "not_found" as const };

  const data: Partial<MatchGameRecord> = {};
  if (body.user_id !== undefined) data.userId = asInt(body.user_id, record.userId);
  const champion = String(body.champion ?? "").trim();
  if (champion) data.champion = champion.slice(0, 50);
  if (body.result === "win" || body.result === "lose") data.result = body.result;
  if ([0, 1, 2].includes(asInt(body.team_rank, -1))) data.teamRank = asInt(body.team_rank);
  for (const key of ["level", "kills", "deaths", "assists", "cs", "gold", "vision"] as const) {
    if (body[key] !== undefined) data[key] = asInt(body[key]);
  }
  data.isMvp = Boolean(body.is_mvp);
  data.isSvp = Boolean(body.is_svp);
  if (body.items !== undefined) data.items = normalizeItems(body.items);

  await prisma.matchGameRecord.update({ where: { id: recordId }, data });
  return { kind: "ok" as const };
}

export async function deleteRecord(recordId: number) {
  const record = await prisma.matchGameRecord.findUnique({ where: { id: recordId } });
  if (!record) return { kind: "not_found" as const };
  await prisma.matchGameRecord.delete({ where: { id: recordId } });
  return { kind: "ok" as const };
}

export async function listUserRecords(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!user) return { kind: "not_found" as const };

  const records = await prisma.matchGameRecord.findMany({
    where: { userId },
    orderBy: [{ playedAt: "desc" }, { id: "desc" }],
  });
  const matchIds = records
    .map((record) => record.matchId)
    .filter((id): id is number => typeof id === "number");
  const matches = await prisma.match.findMany({
    where: { id: { in: [...new Set(matchIds)] } },
    select: { id: true, name: true },
  });
  const names = new Map(matches.map((match) => [match.id, match.name]));

  return {
    kind: "ok" as const,
    username: user.username,
    records: records.map((record) => ({
      id: record.id,
      match_id: record.matchId,
      match_name: record.matchId ? (names.get(record.matchId) ?? "自由对局") : "自由对局",
      game_no: record.gameNo,
      champion: record.champion,
      result: record.result,
      kills: record.kills,
      deaths: record.deaths,
      assists: record.assists,
      is_mvp: record.isMvp,
      played_at: record.playedAt ? record.playedAt.toISOString().slice(0, 10) : "",
    })),
  };
}

export async function clearUserRecords(userId: number, actorId: number) {
  // 管理员只能清普通选手的战绩，不能动其他管理员。
  await assertCanManageUser(actorId, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!user) return { kind: "not_found" as const };
  const { count } = await prisma.matchGameRecord.deleteMany({ where: { userId } });
  return { kind: "ok" as const, username: user.username, deleted: count };
}

/** 对局详情：按 比赛 + 小局 查该局所有选手。 */
export async function gameDetail(matchId: number, gameNo: number) {
  const rows = await prisma.matchGameRecord.findMany({
    where: { matchId, gameNo },
    include: {
      user: { select: { username: true, profile: { select: { avatar: true, rank: true } } } },
    },
  });
  if (!rows.length) return { kind: "empty" as const };

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  const players = rows
    .map((record) => ({
      username: record.user?.username ?? "",
      avatar: record.user?.profile?.avatar ?? "",
      rank: record.user?.profile?.rank ?? "",
      champion: record.champion,
      result: record.result,
      kills: record.kills,
      deaths: record.deaths,
      assists: record.assists,
      kda: record.deaths
        ? Number(((record.kills + record.assists) / record.deaths).toFixed(2))
        : record.kills + record.assists,
      is_mvp: record.isMvp,
      is_svp: record.isSvp,
      level: record.level,
      cs: record.cs,
      gold: record.gold,
      vision: record.vision,
    }))
    .sort((a, b) => {
      if (a.result !== b.result) return a.result === "win" ? -1 : 1;
      return Number(b.is_mvp || b.is_svp) - Number(a.is_mvp || a.is_svp);
    });

  return {
    kind: "ok" as const,
    matchName: match?.name ?? "自由对局",
    matchId,
    gameNo,
    players,
  };
}

type RankedRecord = Pick<
  MatchGameRecord,
  "champion" | "result" | "kills" | "deaths" | "assists" | "isMvp" | "isSvp" | "teamRank"
>;

export type PlayerStats = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  mvp: number;
  svp: number;
  teamChampion: number;
  runnerup: number;
  mvpRate: number;
  points: number;
  hero: string;
  recent: string;
};

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** 战绩聚合：与原服务 _all_players 的统计口径保持一致。 */
export function summarize(records: RankedRecord[]): PlayerStats {
  const games = records.length;
  const wins = records.filter((record) => record.result === "win").length;
  const losses = games - wins;
  const sumKills = records.reduce((sum, record) => sum + record.kills, 0);
  const sumDeaths = records.reduce((sum, record) => sum + record.deaths, 0);
  const sumAssists = records.reduce((sum, record) => sum + record.assists, 0);
  const mvp = records.filter((record) => record.isMvp).length;
  const svp = records.filter((record) => record.isSvp).length;
  const teamChampion = records.filter((record) => record.teamRank === 1).length;
  const runnerup = records.filter((record) => record.teamRank === 2).length;

  const championCount = new Map<string, number>();
  for (const record of records) {
    if (!record.champion) continue;
    championCount.set(record.champion, (championCount.get(record.champion) ?? 0) + 1);
  }
  const hero = [...championCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const points = Math.max(
    0,
    wins * 10 - losses * 5 + mvp * 8 + svp * 5 + teamChampion * 30 + runnerup * 15,
  );

  return {
    games,
    wins,
    losses,
    winRate: games ? round((wins * 100) / games) : 0,
    kda: sumDeaths ? round((sumKills + sumAssists) / sumDeaths, 2) : 0,
    avgKills: games ? round(sumKills / games, 1) : 0,
    avgDeaths: games ? round(sumDeaths / games, 1) : 0,
    avgAssists: games ? round(sumAssists / games, 1) : 0,
    mvp,
    svp,
    teamChampion,
    runnerup,
    mvpRate: games ? round((mvp * 100) / games) : 0,
    points,
    hero,
    recent: records
      .slice(0, 10)
      .map((record) => (record.result === "win" ? "W" : "L"))
      .join(" "),
  };
}

type ProfileWithUser = PlayerProfile & {
  user: Pick<User, "username" | "kookName" | "backgroundImage">;
};

export function toPlayer(profile: ProfileWithUser, records: RankedRecord[]) {
  // records 需按时间倒序传入，用于取「最近 10 场」序列。
  const stats = summarize(records);
  return {
    id: profile.userId,
    name: profile.name || profile.user.username,
    username: profile.user.username,
    gameName: profile.gameName,
    position: profile.mainPosition,
    mainPosition: profile.mainPosition,
    subPosition: profile.subPosition,
    rank: profile.rank,
    bio: profile.bio,
    avatar: profile.avatar,
    favoriteHeroes: parseFavoriteHeroes(profile.favoriteHeroes),
    kookName: profile.user.kookName,
    background: profile.user.backgroundImage,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    kda: stats.kda,
    mvp: stats.mvp,
    svp: stats.svp,
    games: stats.games,
    points: stats.points,
    teamChampion: stats.teamChampion,
    runnerup: stats.runnerup,
    mvpRate: stats.mvpRate,
    avgKills: stats.avgKills,
    avgDeaths: stats.avgDeaths,
    avgAssists: stats.avgAssists,
    hero: stats.hero,
    recent: stats.recent,
  };
}

export type PlayerCard = ReturnType<typeof toPlayer>;

/** 全部选手（含未参赛账号），按积分降序。只有核心管理员的系统账号不在其中。 */
export async function listPlayerCards() {
  const [profiles, records] = await Promise.all([
    prisma.playerProfile.findMany({
      where: { user: { is: { username: { not: coreAdminUsername } } } },
      include: {
        user: { select: { username: true, kookName: true, backgroundImage: true, status: true } },
      },
    }),
    prisma.matchGameRecord.findMany({ orderBy: [{ playedAt: "desc" }, { id: "desc" }] }),
  ]);

  const byUser = new Map<number, RankedRecord[]>();
  for (const record of records) {
    const bucket = byUser.get(record.userId) ?? [];
    bucket.push(record);
    byUser.set(record.userId, bucket);
  }

  return (
    profiles
      .map((profile) => toPlayer(profile, byUser.get(profile.userId) ?? []))
      // 榜单排序：积分优先，同积分比胜率，同胜率比 KDA；最后用 id 兜底保证顺序稳定。
      .sort((a, b) => b.points - a.points || b.winRate - a.winRate || b.kda - a.kda || a.id - b.id)
  );
}

export async function playerCardByUserId(userId: number) {
  const profile = await prisma.playerProfile.findFirst({
    where: { userId, user: { is: { username: { not: coreAdminUsername } } } },
    include: { user: { select: { username: true, kookName: true, backgroundImage: true } } },
  });
  if (!profile) return null;
  const records = await prisma.matchGameRecord.findMany({
    where: { userId },
    orderBy: [{ playedAt: "desc" }, { id: "desc" }],
  });
  return toPlayer(profile, records);
}

/**
 * 个人主页：统计 + 常用英雄 TOP3 + 全部对局历史（含参战率）。
 * includeCoreAdmin 只在本人查看自己的主页时为真：核心管理员的主页不对外展示，
 * 其他管理员的主页与普通选手一样公开。
 */
export async function profileOverview(userId: number, includeCoreAdmin = false) {
  const profile = await prisma.playerProfile.findFirst({
    where: {
      userId,
      user: { is: includeCoreAdmin ? {} : { username: { not: coreAdminUsername } } },
    },
    include: { user: { select: { username: true, kookName: true, backgroundImage: true } } },
  });
  if (!profile) return null;

  const records = await prisma.matchGameRecord.findMany({
    where: { userId },
    orderBy: [{ playedAt: "desc" }, { id: "desc" }],
  });
  const matchIds = records
    .map((record) => record.matchId)
    .filter((id): id is number => typeof id === "number");
  const matches = await prisma.match.findMany({
    where: { id: { in: [...new Set(matchIds)] } },
    select: { id: true, name: true },
  });
  const names = new Map(matches.map((match) => [match.id, match.name]));

  // 参战率 = (击杀+助攻) / 同场次同局同队的击杀总和，上限 100%（与赛果页口径一致）。
  const scopeKey = (row: {
    matchId: number | null;
    roundNo: number;
    gameNo: number;
    teamId: number | null;
  }) => `${row.matchId ?? 0}-${row.roundNo}-${row.gameNo}-${row.teamId ?? 0}`;
  const scopes = new Map<
    string,
    { matchId: number; roundNo: number; gameNo: number; teamId: number }
  >();
  for (const record of records) {
    if (record.matchId === null || record.teamId === null) continue;
    scopes.set(scopeKey(record), {
      matchId: record.matchId,
      roundNo: record.roundNo,
      gameNo: record.gameNo,
      teamId: record.teamId,
    });
  }
  const teamKills = new Map<string, number>();
  if (scopes.size) {
    const rows = await prisma.matchGameRecord.findMany({
      where: { OR: [...scopes.values()] },
      select: { matchId: true, roundNo: true, gameNo: true, teamId: true, kills: true },
    });
    for (const row of rows) {
      const key = scopeKey(row);
      teamKills.set(key, (teamKills.get(key) ?? 0) + row.kills);
    }
  }

  const heroes = new Map<
    string,
    { games: number; wins: number; kills: number; deaths: number; assists: number }
  >();
  for (const record of records) {
    if (!record.champion) continue;
    const entry = heroes.get(record.champion) ?? {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
    };
    entry.games += 1;
    entry.wins += record.result === "win" ? 1 : 0;
    entry.kills += record.kills;
    entry.deaths += record.deaths;
    entry.assists += record.assists;
    heroes.set(record.champion, entry);
  }

  const card = toPlayer(profile, records);

  return {
    player: card,
    stats: summarize(records),
    heroes: [...heroes.entries()]
      .sort((a, b) => b[1].games - a[1].games)
      .slice(0, 3)
      .map(([champion, entry]) => ({
        champion,
        games: entry.games,
        win_rate: entry.games ? round((entry.wins * 100) / entry.games) : 0,
        kda: entry.deaths ? round((entry.kills + entry.assists) / entry.deaths, 2) : 0,
      })),
    history: records.map((record) => ({
      id: record.id,
      match_id: record.matchId,
      match_name: record.matchId ? (names.get(record.matchId) ?? "自由对局") : "自由对局",
      champion: record.champion,
      result: record.result,
      kills: record.kills,
      deaths: record.deaths,
      assists: record.assists,
      kda: record.deaths
        ? round((record.kills + record.assists) / record.deaths, 2)
        : record.kills + record.assists,
      played_at: record.playedAt ? record.playedAt.toISOString() : null,
      game_no: record.gameNo,
      round_no: record.roundNo,
      level: record.level,
      cs: record.cs,
      vision: record.vision,
      gold: record.gold,
      items: record.items ? record.items.split(",").filter(Boolean) : [],
      is_mvp: record.isMvp,
      is_svp: record.isSvp,
      participation: (() => {
        const total = teamKills.get(scopeKey(record)) ?? 0;
        if (!total) return 0;
        return Math.min(100, round(((record.kills + record.assists) * 100) / total));
      })(),
    })),
  };
}

/** 首页「最近赛果」与冠军数统计。 */
export async function recentResults(limit = 8) {
  const records = await prisma.matchGameRecord.findMany({
    orderBy: [{ playedAt: "desc" }, { id: "desc" }],
    take: limit,
    include: { user: { select: { username: true, profile: { select: { avatar: true } } } } },
  });
  return records.map((record) => ({
    id: record.id,
    nickname: record.user?.username ?? "未知",
    avatar: record.user?.profile?.avatar ?? "",
    champion: record.champion,
    result: record.result,
    kills: record.kills,
    deaths: record.deaths,
    assists: record.assists,
    is_mvp: record.isMvp,
    is_svp: record.isSvp,
    team_rank: record.teamRank,
    played_at: record.playedAt ? record.playedAt.toISOString().slice(0, 10) : "",
  }));
}

export async function championCount() {
  const rows = await prisma.matchGameRecord.findMany({
    where: { teamRank: 1 },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}
