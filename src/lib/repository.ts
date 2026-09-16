import type { Match as DbMatch, PlayerProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Match, Player } from "@/lib/data";

function playerFrom(profile: PlayerProfile): Player {
  const totalGames = profile.wins + profile.losses;
  return {
    id: profile.id,
    name: profile.name,
    gameName: profile.gameName,
    position: profile.position,
    rank: profile.rank,
    wins: profile.wins,
    losses: profile.losses,
    winRate: totalGames ? Number(((profile.wins / totalGames) * 100).toFixed(1)) : 0,
    kda: profile.kda,
    mvp: profile.mvp,
    bio: profile.bio,
    avatar: profile.avatar,
  };
}

function matchFrom(match: DbMatch, signed = false): Match {
  return {
    id: match.id,
    name: match.name,
    date: match.date.toISOString(),
    status: match.status,
    bo: match.bo,
    playerCount: match.playerCount,
    teamCount: match.teamCount,
    signed,
    teams: [match.blueTeam, match.redTeam],
    score: [match.blueScore, match.redScore],
    round: match.round,
  };
}

export async function getPlayers() {
  const profiles = await prisma.playerProfile.findMany({
    orderBy: [{ wins: "desc" }, { kda: "desc" }],
  });
  return profiles.map(playerFrom);
}

export async function getMatches(userId?: number) {
  const [matches, signups] = await Promise.all([
    prisma.match.findMany({ orderBy: { date: "asc" } }),
    userId ? prisma.matchSignup.findMany({ where: { userId }, select: { matchId: true } }) : [],
  ]);
  const signedMatchIds = new Set(signups.map((signup) => signup.matchId));
  return matches.map((match) => matchFrom(match, signedMatchIds.has(match.id)));
}

export async function getMatchById(id: number) {
  if (!Number.isInteger(id) || id < 1) return null;
  const match = await prisma.match.findUnique({ where: { id } });
  return match ? matchFrom(match) : null;
}

export async function getMatchPlayers(matchId: number) {
  const signups = await prisma.matchSignup.findMany({
    where: { matchId },
    orderBy: { createdAt: "asc" },
    include: { user: { include: { profile: true } } },
  });
  return signups.flatMap((signup) =>
    signup.user.profile ? [playerFrom(signup.user.profile)] : [],
  );
}

export async function getHomeData() {
  const [matches, players] = await Promise.all([getMatches(), getPlayers()]);
  return { matches, players };
}

export async function getProfileForUser(userId: number) {
  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  return profile ? playerFrom(profile) : null;
}

export async function signupForMatch(matchId: number, userId: number) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { kind: "not_found" as const };
  if (match.status === "FINISHED") return { kind: "closed" as const };

  try {
    await prisma.$transaction([
      prisma.matchSignup.create({ data: { matchId, userId } }),
      prisma.match.update({ where: { id: matchId }, data: { playerCount: { increment: 1 } } }),
    ]);
    return { kind: "ok" as const };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { kind: "exists" as const };
    throw error;
  }
}

export async function cancelSignupForMatch(matchId: number, userId: number) {
  const signup = await prisma.matchSignup.findUnique({
    where: { userId_matchId: { userId, matchId } },
  });
  if (!signup) return { kind: "not_found" as const };
  await prisma.$transaction([
    prisma.matchSignup.delete({ where: { id: signup.id } }),
    prisma.match.update({ where: { id: matchId }, data: { playerCount: { decrement: 1 } } }),
  ]);
  return { kind: "ok" as const };
}
