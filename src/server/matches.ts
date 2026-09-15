import { NextResponse } from "next/server";
import { getMatch, matches, players } from "@/lib/data";

const notFound = () => NextResponse.json({ error: "Match not found" }, { status: 404 });

export function listMatches() {
  return NextResponse.json({
    match_list: matches.map((match) => ({
      ...match,
      player_count: match.playerCount,
      team_count: match.teamCount,
    })),
  });
}

export function getMatchDetail(id: string) {
  const match = getMatch(Number(id));
  return match ? NextResponse.json({ match, players }) : notFound();
}

export function getMatchResult(id: string) {
  const match = getMatch(Number(id));
  return match ? NextResponse.json({ match, games: [], players }) : notFound();
}

export function getMatchLineup(id: string) {
  const match = getMatch(Number(id));
  return match
    ? NextResponse.json({ match, blue: players.slice(0, 5), red: players.slice(5, 10) })
    : notFound();
}

export function updateSignup(id: string, action: "signup" | "cancel") {
  const match = getMatch(Number(id));
  if (!match) return notFound();
  return NextResponse.json({ ok: true, message: action === "signup" ? "报名成功" : "已取消报名" });
}
