import { NextResponse } from "next/server";
import { getHomeData } from "@/lib/repository";

export async function getHomeBoard() {
  const { matches, players } = await getHomeData();
  return NextResponse.json({
    today: matches.filter((match) => match.status !== "FINISHED"),
    ranking: players.slice(0, 5),
    total_players: players.length,
    total_matches: matches.length,
  });
}
