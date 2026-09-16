import { NextResponse } from "next/server";
import { getPlayers } from "@/lib/repository";

export async function listPlayers() {
  const ranking = await getPlayers();
  return NextResponse.json({ players: ranking, player_list: ranking });
}
