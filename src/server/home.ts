import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { championCount, listPlayerCards, recentResults, type PlayerCard } from "@/server/records";
import { pairTeams, rankFee, signRank } from "@/server/roster";

/** 旧版字段名，保持 /api/home/board* 契约与老前端消费方一致。 */
function legacyPlayer(player: PlayerCard) {
  return {
    uid: player.id,
    nickname: player.name || player.username,
    avatar: player.avatar,
    yy_name: player.kookName,
    pos: player.position,
    rank: player.rank,
    games: player.games,
    wins: player.wins,
    losses: player.losses,
    win_rate: player.winRate,
    kda: player.kda,
    avg_kills: player.avgKills,
    avg_deaths: player.avgDeaths,
    points: player.points,
    mvp: player.mvp,
    svp: player.svp,
    champion: player.hero,
    team_champion: player.teamChampion,
    runnerup: player.runnerup,
    mvp_rate: player.mvpRate,
    recent: player.recent,
  };
}

/** 首页侧栏：积分前 5、MVP 前 5、最近 8 条战绩与总数（对应旧 /api/home/board）。 */
export async function getHomeBoard() {
  const [players, recent, champions, totalPlayer] = await Promise.all([
    listPlayerCards(),
    recentResults(8),
    championCount(),
    prisma.user.count(),
  ]);
  return NextResponse.json({
    rank_top: players.slice(0, 5).map(legacyPlayer),
    mvp_top: [...players]
      .sort((a, b) => b.mvp - a.mvp || b.points - a.points)
      .slice(0, 5)
      .map(legacyPlayer),
    recent_results: recent,
    total_player: totalPlayer,
    total_champion: champions,
  });
}

/** 首页四面板：今日赛事、积分前 8、最近赛果、MVP 前 4（对应旧 /api/home/board_v2）。 */
export async function getHomeBoardV2() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const lives = await prisma.match.findMany({
    where: { status: { in: ["CREATED", "LIVE"] }, createdAt: { gte: todayStart } },
    orderBy: { id: "desc" },
    take: 6,
  });

  const liveMatches = await Promise.all(
    lives.map(async (match) => {
      const [teams, signs] = await Promise.all([
        prisma.team.findMany({ where: { matchId: match.id }, orderBy: { id: "asc" } }),
        prisma.matchSignup.findMany({
          where: { matchId: match.id },
          include: { user: { include: { profile: { select: { rank: true } } } } },
        }),
      ]);
      const names = new Map(teams.map((team) => [team.id, team.name]));
      const manual =
        match.teamOneId !== null &&
        match.teamTwoId !== null &&
        names.has(match.teamOneId) &&
        names.has(match.teamTwoId);
      const rounds = pairTeams(match, teams)
        .filter((pair) => pair[1])
        .map(([one, two]) => ({
          team1: names.get(one) ?? "待定",
          team2: names.get(two as number) ?? "待定",
        }));
      const feeByTeam = new Map<number, number>();
      for (const sign of signs) {
        if (!sign.teamId) continue;
        feeByTeam.set(sign.teamId, (feeByTeam.get(sign.teamId) ?? 0) + rankFee(signRank(sign)));
      }
      return {
        id: match.id,
        name: match.name,
        team_count: match.teamCount,
        player_count: match.playerCount,
        bo: match.bo || "BO1",
        vs: manual
          ? [names.get(match.teamOneId as number), names.get(match.teamTwoId as number)]
          : [],
        status: match.status,
        live_url: match.liveUrl ?? "",
        rounds,
        teams_fee: teams.map((team) => ({ name: team.name, fee: feeByTeam.get(team.id) ?? 0 })),
      };
    }),
  );

  const finished = await prisma.match.findMany({
    where: { status: "FINISHED" },
    orderBy: { id: "desc" },
    take: 4,
  });

  const recent = [];
  for (const match of finished) {
    const [records, teams, signs, lastRound] = await Promise.all([
      prisma.matchGameRecord.findMany({
        where: { matchId: match.id },
        include: { user: { select: { username: true } } },
      }),
      prisma.team.findMany({ where: { matchId: match.id } }),
      prisma.matchSignup.findMany({ where: { matchId: match.id } }),
      prisma.matchRound.findFirst({ where: { matchId: match.id }, orderBy: { roundNo: "desc" } }),
    ]);
    if (!records.length) continue;

    const names = new Map(teams.map((team) => [team.id, team.name]));
    const userTeam = new Map<number, string>();
    for (const sign of signs) {
      const name = sign.teamId ? names.get(sign.teamId) : undefined;
      if (name && !userTeam.has(sign.userId)) userTeam.set(sign.userId, name);
    }

    // 最高轮次即决赛轮：一局内同队 win 人数 >= 3 记该队胜一局
    const maxRound = Math.max(...records.map((record) => record.roundNo || 1));
    const finalRecords = records.filter((record) => (record.roundNo || 1) === maxRound);
    const games = new Map<number, typeof finalRecords>();
    for (const record of finalRecords) {
      const bucket = games.get(record.gameNo || 1) ?? [];
      bucket.push(record);
      games.set(record.gameNo || 1, bucket);
    }
    const teamWins = new Map<string, number>();
    for (const rows of games.values()) {
      const winsByTeam = new Map<string, number>();
      for (const row of rows) {
        const team = userTeam.get(row.userId);
        if (row.result === "win" && team) winsByTeam.set(team, (winsByTeam.get(team) ?? 0) + 1);
      }
      for (const [team, count] of winsByTeam) {
        if (count >= 3) teamWins.set(team, (teamWins.get(team) ?? 0) + 1);
      }
    }

    const ranking = [...teamWins.entries()].sort((a, b) => b[1] - a[1]);
    const finalPair = lastRound
      ? [names.get(lastRound.teamOneId), names.get(lastRound.teamTwoId)].filter(
          (name): name is string => Boolean(name),
        )
      : [];
    let champion = "";
    let runnerup = "";
    if (ranking.length) {
      champion = ranking[0][0];
      const others = finalPair.filter((name) => name !== champion);
      if (others.length) runnerup = others[0];
      else if (ranking.length >= 2) runnerup = ranking[1][0];
    }

    recent.push({
      id: match.id,
      name: match.name,
      score: [ranking[0]?.[1] ?? 0, runnerup ? (teamWins.get(runnerup) ?? 0) : 0],
      champion,
      runnerup,
      fmvp: finalRecords.find((record) => record.isMvp)?.user?.username ?? "",
    });
  }

  const players = await listPlayerCards();
  return NextResponse.json({
    live_matches: liveMatches,
    rank_top: players.slice(0, 8).map(legacyPlayer),
    recent,
    mvp_top: [...players].sort((a, b) => b.mvp - a.mvp).slice(0, 4).map(legacyPlayer),
    total_match: await prisma.match.count(),
    total_player: players.length,
    total_champion: players.filter((player) => player.teamChampion > 0).length,
  });
}
