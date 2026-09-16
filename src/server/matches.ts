import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getViewer } from "@/server/auth";
import {
  cancelSignupForMatch,
  getMatchById,
  getMatchPlayers,
  getMatches,
  matchFrom,
  signupForMatch,
  type SignupOptions,
} from "@/lib/repository";
import { POSITIONS, isPosition, pairTeams, resolveScore, scoreMap, type Position } from "@/server/roster";

const notFound = () => NextResponse.json({ error: "赛事不存在" }, { status: 404 });

/** 查找结果：区分「赛事不存在」与「该轮次暂无对战数据」，供页面与路由共用。 */
type Lookup<T> = { kind: "ok"; data: T } | { kind: "missing"; reason: "match" | "round" };

const lookupError = (reason: "match" | "round") =>
  NextResponse.json({ error: reason === "match" ? "赛事不存在" : "该轮次暂无对战数据" }, { status: 404 });

function validId(id: string | number) {
  const matchId = Number(id);
  return Number.isInteger(matchId) && matchId > 0 ? matchId : null;
}

async function loadMatchBundle(matchId: number) {
  const [match, teams, signs, rounds, scores, records] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.team.findMany({ where: { matchId }, orderBy: { id: "asc" } }),
    prisma.matchSignup.findMany({ where: { matchId } }),
    prisma.matchRound.findMany({ where: { matchId }, orderBy: [{ roundNo: "asc" }, { id: "asc" }] }),
    prisma.matchScore.findMany({ where: { matchId } }),
    prisma.matchGameRecord.findMany({ where: { matchId } }),
  ]);
  return { match, teams, signs, rounds, scores, records };
}

export async function listMatches(request: NextRequest) {
  const user = await getSessionUser(request);
  const matches = await getMatches(user?.id);
  return NextResponse.json({
    match_list: matches.map((match) => ({
      ...match,
      player_count: match.playerCount,
      team_count: match.teamCount,
      live_url: match.liveUrl,
    })),
  });
}

/** 赛事详情：阵容 + 队伍 + 手动选定的对阵 + 夺冠热门。 */
export async function getMatchDetail(request: NextRequest, id: string | number) {
  const matchId = validId(id);
  if (!matchId) return notFound();
  const user = await getSessionUser(request);
  const { match, teams, signs } = await loadMatchBundle(matchId);
  if (!match) return notFound();

  const players = await getMatchPlayers(matchId);

  const hotRows = await prisma.matchSignup.groupBy({
    by: ["teamId"],
    where: { teamId: { not: null } },
    _count: { _all: true },
  });
  const hotTeamIds = hotRows.map((row) => row.teamId).filter((id): id is number => id !== null);
  const hotTeams = await prisma.team.findMany({
    where: { id: { in: hotTeamIds } },
    select: { id: true, name: true },
  });
  const hotNames = new Map(hotTeams.map((team) => [team.id, team.name]));
  const counts = hotRows
    .map((row) => ({ name: hotNames.get(row.teamId as number) ?? "未命名", players: row._count._all }))
    .sort((a, b) => b.players - a.players)
    .slice(0, 4);
  const hotTotal = counts.reduce((sum, entry) => sum + entry.players, 0) || 1;

  const tmMap = new Map(teams.map((team) => [team.id, team.name]));
  const vs =
    match.teamOneId && tmMap.has(match.teamOneId) && match.teamTwoId && tmMap.has(match.teamTwoId)
      ? [tmMap.get(match.teamOneId), tmMap.get(match.teamTwoId)]
      : [];

  return NextResponse.json({
    match: {
      id: match.id,
      name: match.name,
      date: match.date.toISOString(),
      status: match.status,
      player_count: match.playerCount,
      team_count: match.teamCount,
      live_url: match.liveUrl,
      bo: match.bo,
      round: match.round,
      use_fee: match.useFee,
      current_round: match.currentRound,
      blue_team: match.blueTeam,
      red_team: match.redTeam,
      blue_score: match.blueScore,
      red_score: match.redScore,
    },
    players: players.map((player) => ({
      id: player.signupId,
      user_id: player.id,
      username: player.name,
      account: player.username,
      main_pos: player.mainPosition,
      sub_pos: player.subPosition,
      rank: player.rank,
      avatar: player.avatar,
      can_substitute: player.canSubstitute,
      team_id: player.teamId,
      team_pos: player.teamPosition,
    })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      player_count: signs.filter((sign) => sign.teamId === team.id).length,
    })),
    vs,
    hot_teams: counts.map((entry) => ({
      name: entry.name,
      players: entry.players,
      pct: Math.max(Math.round((entry.players * 100) / hotTotal), 1),
    })),
    is_signed: user ? signs.some((sign) => sign.userId === user.id) : false,
  });
}

function lineupRows(
  signs: { userId: number; displayName: string; teamId: number | null; teamPosition: string }[],
  ranks: Map<number, { rank: string; avatar: string; name: string }>,
  teamId: number | null,
) {
  const members = teamId ? signs.filter((sign) => sign.teamId === teamId) : [];
  return POSITIONS.map((position: Position) => {
    const sign = members.find((member) => member.teamPosition === position);
    if (!sign) return { pos: position, name: "", rank: "", avatar: "" };
    const profile = ranks.get(sign.userId);
    return {
      pos: position,
      name: sign.displayName || profile?.name || "",
      rank: profile?.rank ?? "",
      avatar: profile?.avatar ?? "",
    };
  });
}

/** 对位页数据：?round=N 查看指定固化轮次，缺省显示当前轮。 */
export async function getMatchLineupData(id: string | number, roundParam?: string | null) {
  const matchId = validId(id);
  if (!matchId) return { kind: "missing" as const, reason: "match" as const };
  const { match, teams, signs, rounds, scores, records } = await loadMatchBundle(matchId);
  if (!match) return { kind: "missing" as const, reason: "match" as const };

  const requested = roundParam ? Number(roundParam) : null;
  const currentRound = match.currentRound || 1;
  const viewRound = requested ?? currentRound;

  let pairs;
  if (requested !== null) {
    const fixed = rounds.filter((row) => row.roundNo === requested);
    if (fixed.length) {
      pairs = fixed.map((row) => [row.teamOneId, row.teamTwoId] as [number, number]);
    } else {
      if (requested !== currentRound) return { kind: "missing" as const, reason: "round" as const };
      pairs = pairTeams(match, teams.filter((team) => team.id)) as [number, number][];
    }
  } else {
    const fixed = rounds.filter((row) => row.roundNo === currentRound);
    pairs =
      fixed.length > 0
        ? fixed.map((row) => [row.teamOneId, row.teamTwoId] as [number, number])
        : (pairTeams(match, teams.filter((team) => team.id)) as [number, number][]);
  }

  const profiles = await prisma.playerProfile.findMany({
    where: { userId: { in: signs.map((sign) => sign.userId) } },
    select: { userId: true, rank: true, avatar: true, name: true },
  });
  const rankMap = new Map(profiles.map((profile) => [profile.userId, profile]));

  const tmMap = new Map(teams.map((team) => [team.id, team.name]));
  const userTeam = new Map<number, number>();
  for (const sign of signs) if (sign.teamId) userTeam.set(sign.userId, sign.teamId);

  const map = scoreMap(scores);
  const roundRecords = records.filter((record) => (record.roundNo || 1) === viewRound);

  return {
    kind: "ok" as const,
    data: {
      match: {
        id: match.id,
        name: match.name,
        status: match.status,
        bo: match.bo || "BO1",
        current_round: currentRound,
        view_round: viewRound,
      },
      pairs: pairs.map(([teamOneId, teamTwoId]) => ({
        team1: {
          id: teamOneId,
          name: teamOneId ? (tmMap.get(teamOneId) ?? "待定") : "待定",
          rows: lineupRows(signs, rankMap, teamOneId ?? null),
        },
        team2: {
          id: teamTwoId ?? null,
          name: teamTwoId ? (tmMap.get(teamTwoId) ?? "待定") : "待定",
          rows: lineupRows(signs, rankMap, teamTwoId ?? null),
        },
        score: resolveScore(map, viewRound, teamOneId, teamTwoId ?? null, roundRecords, userTeam),
      })),
      rounds: [...new Set(rounds.map((row) => row.roundNo))].sort((a, b) => a - b),
    },
  };
}

/** 对位页路由：?round=N 查看指定固化轮次，缺省显示当前轮。 */
export async function getMatchLineup(id: string | number, roundParam?: string | null) {
  const outcome = await getMatchLineupData(id, roundParam);
  if (outcome.kind !== "ok") return lookupError(outcome.reason);
  return NextResponse.json(outcome.data);
}

/** 赛程轮次数据：固化轮次 + 当前未固化轮次，附每场比分。 */
export async function getMatchRoundsData(id: string | number) {
  const matchId = validId(id);
  if (!matchId) return { kind: "missing" as const, reason: "match" as const };
  const { match, teams, signs, rounds, scores, records } = await loadMatchBundle(matchId);
  if (!match) return { kind: "missing" as const, reason: "match" as const };

  const byRound = new Map<number, [number, number | null][]>();
  for (const row of rounds) {
    const bucket = byRound.get(row.roundNo) ?? [];
    bucket.push([row.teamOneId, row.teamTwoId]);
    byRound.set(row.roundNo, bucket);
  }
  const currentRound = match.currentRound || 1;
  if (!byRound.has(currentRound)) {
    const pending = (pairTeams(match, teams.filter((team) => team.id)) as [number, number | null][]).filter(
      (pair) => pair[1],
    );
    if (pending.length) byRound.set(currentRound, pending);
  }

  const tmMap = new Map(teams.map((team) => [team.id, team.name]));
  const userTeam = new Map<number, number>();
  for (const sign of signs) if (sign.teamId) userTeam.set(sign.userId, sign.teamId);
  const map = scoreMap(scores);

  const out = [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((roundNo) => {
      const roundRecords = records.filter((record) => (record.roundNo || 1) === roundNo);
      const pairs = (byRound.get(roundNo) ?? [])
        .filter((pair) => pair[1])
        .map(([teamOneId, teamTwoId]) => ({
          team1: tmMap.get(teamOneId) ?? "待定",
          team2: tmMap.get(teamTwoId as number) ?? "待定",
          t1: teamOneId,
          t2: teamTwoId,
          score: resolveScore(map, roundNo, teamOneId, teamTwoId, roundRecords, userTeam),
        }));
      return { round_no: roundNo, pairs };
    });

  return {
    kind: "ok" as const,
    data: { rounds: out, current_round: currentRound },
  };
}

/** 赛程轮次路由。 */
export async function getMatchRounds(id: string | number) {
  const outcome = await getMatchRoundsData(id);
  if (outcome.kind !== "ok") return lookupError(outcome.reason);
  return NextResponse.json(outcome.data);
}

/** 赛果页数据：按小局归集战绩。 */
export async function getMatchResultData(id: string | number) {
  const matchId = validId(id);
  if (!matchId) return { kind: "missing" as const, reason: "match" as const };
  const match = await getMatchById(matchId);
  if (!match) return { kind: "missing" as const, reason: "match" as const };

  const [records, players, teams] = await Promise.all([
    prisma.matchGameRecord.findMany({
      where: { matchId },
      orderBy: [{ gameNo: "asc" }, { id: "asc" }],
      include: { user: { select: { username: true, profile: { select: { avatar: true, rank: true } } } } },
    }),
    getMatchPlayers(matchId),
    prisma.team.findMany({ where: { matchId }, select: { id: true, name: true } }),
  ]);

  const slotMap = new Map(players.map((player) => [player.id, player]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  const games = new Map<number, typeof records>();
  for (const record of records) {
    const bucket = games.get(record.gameNo) ?? [];
    bucket.push(record);
    games.set(record.gameNo, bucket);
  }

  return {
    kind: "ok" as const,
    data: {
      match,
      players,
      games: [...games.entries()].map(([gameNo, rows]) => ({
        game_no: gameNo,
        round_no: rows[0].roundNo,
        rows: rows.map((record) => {
          const slot = slotMap.get(record.userId);
          const teamId = record.teamId ?? slot?.teamId ?? null;
          return {
            id: record.id,
            user_id: record.userId,
            username: record.user?.username ?? "",
            display_name: slot?.name ?? record.user?.username ?? "",
            avatar: record.user?.profile?.avatar ?? "",
            rank: record.user?.profile?.rank ?? "",
            champion: record.champion,
            result: record.result,
            kills: record.kills,
            deaths: record.deaths,
            assists: record.assists,
            is_mvp: record.isMvp,
            is_svp: record.isSvp,
            team_rank: record.teamRank,
            team_pos: slot?.teamPosition || "无",
            team_name: teamId ? (teamNames.get(teamId) ?? "") : "",
            level: record.level,
            cs: record.cs,
            gold: record.gold,
            vision: record.vision,
            items: record.items ? record.items.split(",").filter(Boolean) : [],
          };
        }),
      })),
    },
  };
}

/** 赛果页路由。 */
export async function getMatchResult(id: string | number) {
  const outcome = await getMatchResultData(id);
  if (outcome.kind !== "ok") return lookupError(outcome.reason);
  return NextResponse.json(outcome.data);
}

/** 报名选项（沿用旧报名弹窗契约：main_pos / sub_pos / can_substitute）。 */
async function signupOptionsFrom(request: NextRequest): Promise<SignupOptions | NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "请求必须是JSON格式" }, { status: 400 });

  const main = body.main_pos ?? body.mainPosition;
  const sub = body.sub_pos ?? body.subPosition ?? "无";
  if (!isPosition(main)) return NextResponse.json({ error: "主位置不合法" }, { status: 400 });
  if (sub !== "无" && !isPosition(sub))
    return NextResponse.json({ error: "副位置不合法" }, { status: 400 });
  return {
    mainPosition: main,
    subPosition: sub,
    canSubstitute: Boolean(body.can_substitute ?? body.canSubstitute),
  };
}

export async function updateSignup(request: NextRequest, id: string, action: "signup" | "cancel") {
  const matchId = validId(id);
  if (!matchId) return notFound();
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let result;
  if (action === "signup") {
    const options = await signupOptionsFrom(request);
    if (options instanceof NextResponse) return options;
    result = await signupForMatch(matchId, user.id, options);
  } else {
    result = await cancelSignupForMatch(matchId, user.id);
  }

  if (result.kind === "not_found") return notFound();
  if (result.kind === "closed")
    return NextResponse.json({ error: "比赛已开始或已结束，报名已截止" }, { status: 409 });
  if (result.kind === "exists") return NextResponse.json({ error: "已报名该赛事" }, { status: 409 });
  return NextResponse.json({ ok: true, message: action === "signup" ? "报名成功" : "已取消报名" });
}

/** 页面数据：赛事 + 名单 + 赛程 + 当前登录者的报名状态。 */
export async function getMatchPageData(id: number) {
  const [match, players, rounds, viewer] = await Promise.all([
    getMatchById(id),
    getMatchPlayers(id),
    getMatchRoundsData(id),
    getViewer(),
  ]);
  const signup = viewer ? players.find((player) => player.id === viewer.id) : undefined;
  return {
    match,
    players,
    rounds: rounds.kind === "ok" ? rounds.data.rounds : [],
    viewer: viewer
      ? {
          id: viewer.id,
          username: viewer.username,
          mainPosition: viewer.profile?.mainPosition ?? "",
          subPosition: viewer.profile?.subPosition ?? "",
        }
      : null,
    signed: signup
      ? {
          mainPosition: signup.mainPosition,
          subPosition: signup.subPosition,
          canSubstitute: signup.canSubstitute,
        }
      : null,
  };
}

export { matchFrom };
