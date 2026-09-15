import { NextResponse } from "next/server";
import { leaderboard } from "@/lib/data";

export function listPlayers() {
  const ranking = leaderboard();
  return NextResponse.json({ players: ranking, player_list: ranking });
}
