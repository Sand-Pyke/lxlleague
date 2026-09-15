import { NextResponse } from "next/server";
import { players } from "@/lib/data";

export function getProfile() {
  return NextResponse.json({ user: players[0] ?? null, records: [] });
}

export function listUsers() {
  return NextResponse.json({ user_list: players });
}
