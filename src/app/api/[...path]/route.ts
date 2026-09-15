import { NextRequest, NextResponse } from "next/server";
import { getMatch, leaderboard, matches, players } from "@/lib/data";

const loggedIn = (request: NextRequest) => request.cookies.get("lspl_user")?.value;
const user = (request: NextRequest) => ({ login: Boolean(loggedIn(request)), username: loggedIn(request) || "", is_admin: loggedIn(request) === "admin" });

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (path === "current_user") return NextResponse.json(user(request));
  if (path === "match/list") return NextResponse.json({ match_list: matches.map((m) => ({ ...m, player_count: m.playerCount, team_count: m.teamCount })) });
  if (path === "players") return NextResponse.json({ players: leaderboard(), player_list: leaderboard() });
  if (path === "home/board" || path === "home/board_v2") return NextResponse.json({ today: matches.filter((m) => m.date === "2026/9/16"), ranking: leaderboard().slice(0, 5), total_players: players.length });
  if (path.startsWith("match/detail/")) return NextResponse.json({ match: getMatch(Number(path.split("/").at(-1))), players });
  if (path.startsWith("match/result/")) { const match = getMatch(Number(path.split("/").at(-1))); return NextResponse.json({ match, games: [1, 2, 3], players }); }
  if (path.startsWith("match/lineup/")) { const match = getMatch(Number(path.split("/").at(-1))); return NextResponse.json({ match, blue: players.slice(0, 5), red: players.slice(5, 10) }); }
  if (path === "user/profile") return NextResponse.json({ user: players[0], records: matches.slice(0, 3) });
  if (path === "user/list") return NextResponse.json({ user_list: players });
  return NextResponse.json({ error: "API endpoint not found" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (path === "login" || path === "register") {
    const body = await request.json().catch(() => ({})); const username = typeof body.username === "string" && body.username ? body.username : "召唤师";
    const response = NextResponse.json({ ok: true, login: true, username }); response.cookies.set("lspl_user", username, { httpOnly: true, sameSite: "lax", path: "/" }); return response;
  }
  if (path === "logout") { const response = NextResponse.json({ ok: true }); response.cookies.delete("lspl_user"); return response; }
  if (path.startsWith("match/signup/")) return NextResponse.json({ ok: true, message: "报名成功" });
  if (path.startsWith("match/cancel/")) return NextResponse.json({ ok: true, message: "已取消报名" });
  return NextResponse.json({ ok: true });
}
