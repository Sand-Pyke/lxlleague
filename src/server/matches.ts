import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import {
  cancelSignupForMatch,
  getMatchById,
  getMatchPlayers,
  getMatches,
  getPlayers,
  signupForMatch,
} from "@/lib/repository";

const notFound = () => NextResponse.json({ error: "Match not found" }, { status: 404 });

function validId(id: string) {
  const matchId = Number(id);
  return Number.isInteger(matchId) && matchId > 0 ? matchId : null;
}

export async function listMatches(request: NextRequest) {
  const user = await getSessionUser(request);
  const matches = await getMatches(user?.id);
  return NextResponse.json({
    match_list: matches.map((match) => ({
      ...match,
      player_count: match.playerCount,
      team_count: match.teamCount,
    })),
  });
}

export async function getMatchDetail(id: string) {
  const matchId = validId(id);
  if (!matchId) return notFound();
  const match = await getMatchById(matchId);
  if (!match) return notFound();
  return NextResponse.json({ match, players: await getMatchPlayers(matchId) });
}

export async function getMatchResult(id: string) {
  const matchId = validId(id);
  if (!matchId) return notFound();
  const match = await getMatchById(matchId);
  if (!match) return notFound();
  return NextResponse.json({ match, games: [], players: await getMatchPlayers(matchId) });
}

export async function getMatchLineup(id: string) {
  const matchId = validId(id);
  if (!matchId) return notFound();
  const match = await getMatchById(matchId);
  if (!match) return notFound();
  const players = await getMatchPlayers(matchId);
  return NextResponse.json({ match, blue: players.slice(0, 5), red: players.slice(5, 10) });
}

export async function updateSignup(request: NextRequest, id: string, action: "signup" | "cancel") {
  const matchId = validId(id);
  if (!matchId) return notFound();
  const user = await getSessionUser(request);
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const result =
    action === "signup"
      ? await signupForMatch(matchId, user.id)
      : await cancelSignupForMatch(matchId, user.id);
  if (result.kind === "not_found") return notFound();
  if (result.kind === "closed") return NextResponse.json({ error: "赛事已结束" }, { status: 409 });
  if (result.kind === "exists")
    return NextResponse.json({ error: "已报名该赛事" }, { status: 409 });
  return NextResponse.json({ ok: true, message: action === "signup" ? "报名成功" : "已取消报名" });
}

export async function getMatchPageData(id: number) {
  const [match, players] = await Promise.all([getMatchById(id), getMatchPlayers(id)]);
  return { match, players };
}

export { getPlayers };
