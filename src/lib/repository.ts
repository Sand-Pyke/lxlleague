import type { Match as DbMatch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Match, Player } from "@/lib/data";
import { listPlayerCards, playerCardByUserId, toPlayer } from "@/server/records";

export function matchFrom(match: DbMatch, signed = false): Match {
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
    liveUrl: match.liveUrl,
    useFee: match.useFee,
    currentRound: match.currentRound,
    teamOneId: match.teamOneId,
    teamTwoId: match.teamTwoId,
  };
}

export async function getPlayers(): Promise<Player[]> {
  return listPlayerCards();
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

/** 参赛名单：以报名记录为准（含队伍与位置槽），统计取该选手的战绩聚合。 */
export async function getMatchPlayers(matchId: number) {
  const [signups, records] = await Promise.all([
    prisma.matchSignup.findMany({
      where: { matchId, user: { is: { isAdmin: false } } },
      orderBy: [{ positionOrder: "asc" }, { createdAt: "asc" }],
      include: {
        user: {
          include: {
            profile: {
              include: {
                user: { select: { username: true, kookName: true, backgroundImage: true } },
              },
            },
          },
        },
      },
    }),
    prisma.matchGameRecord.findMany({
      where: { matchId },
      orderBy: [{ playedAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const byUser = new Map<number, typeof records>();
  for (const record of records) {
    const bucket = byUser.get(record.userId) ?? [];
    bucket.push(record);
    byUser.set(record.userId, bucket);
  }

  return signups.flatMap((signup) => {
    const profile = signup.user.profile;
    if (!profile) return [];
    return [
      {
        ...toPlayer(profile, byUser.get(signup.userId) ?? []),
        signupId: signup.id,
        teamId: signup.teamId,
        teamPosition: signup.teamPosition,
        positionOrder: signup.positionOrder,
        canSubstitute: signup.canSubstitute,
      },
    ];
  });
}

export async function getProfileForUser(userId: number) {
  return playerCardByUserId(userId);
}

/** 报名时可覆盖的位置/补位选项，缺省沿用个人主页设置。 */
export type SignupOptions = {
  mainPosition?: string;
  subPosition?: string;
  canSubstitute?: boolean;
};

export async function signupForMatch(matchId: number, userId: number, options: SignupOptions = {}) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return { kind: "not_found" as const };
  if (match.status !== "CREATED") return { kind: "closed" as const };

  const [profile, user] = await Promise.all([
    prisma.playerProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);

  try {
    await prisma.$transaction([
      prisma.matchSignup.create({
        data: {
          matchId,
          userId,
          displayName: profile?.name || user?.username || "",
          mainPosition: options.mainPosition ?? profile?.mainPosition ?? "FILL",
          subPosition: options.subPosition ?? profile?.subPosition ?? "FILL",
          rankAtSignup: profile?.rank ?? "",
          canSubstitute: options.canSubstitute ?? false,
        },
      }),
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
