import { NextResponse } from "next/server";
import { leaderboard, matches, players } from "@/lib/data";

export function getHomeBoard() {
  return NextResponse.json({
    today: matches.filter((match) => match.status !== "FINISHED"),
    ranking: leaderboard().slice(0, 5),
    total_players: players.length,
  });
}
