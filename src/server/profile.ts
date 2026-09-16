import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { getPlayers, getProfileForUser } from "@/lib/repository";

export async function getProfile(request: NextRequest) {
  const currentUser = await getSessionUser(request);
  if (!currentUser) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const user = await getProfileForUser(currentUser.id);
  return NextResponse.json({ user, records: [] });
}

export async function listUsers() {
  return NextResponse.json({ user_list: await getPlayers() });
}
