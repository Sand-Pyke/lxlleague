import { NextRequest, NextResponse } from "next/server";
import { getMatch, leaderboard, matches, players } from "@/lib/data";

const loggedIn = (request: NextRequest) => request.cookies.get("lspl_user")?.value;

const currentUser = (request: NextRequest) => {
  const username = loggedIn(request);
  return {
    login: Boolean(username),
    username: username || "",
    is_admin: username === "admin",
  };
};

const missingMatch = () => NextResponse.json({ error: "Match not found" }, { status: 404 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");

  if (path === "current_user") return NextResponse.json(currentUser(request));
  if (path === "match/list") {
    return NextResponse.json({
      match_list: matches.map((match) => ({
        ...match,
        player_count: match.playerCount,
        team_count: match.teamCount,
      })),
    });
  }
  if (path === "players") {
    const ranking = leaderboard();
    return NextResponse.json({ players: ranking, player_list: ranking });
  }
  if (path === "home/board" || path === "home/board_v2") {
    return NextResponse.json({
      today: matches.filter((match) => match.status !== "FINISHED"),
      ranking: leaderboard().slice(0, 5),
      total_players: players.length,
    });
  }
  if (path.startsWith("match/detail/")) {
    const match = getMatch(Number(path.split("/").at(-1)));
    return match ? NextResponse.json({ match, players }) : missingMatch();
  }
  if (path.startsWith("match/result/")) {
    const match = getMatch(Number(path.split("/").at(-1)));
    return match ? NextResponse.json({ match, games: [], players }) : missingMatch();
  }
  if (path.startsWith("match/lineup/")) {
    const match = getMatch(Number(path.split("/").at(-1)));
    return match
      ? NextResponse.json({ match, blue: players.slice(0, 5), red: players.slice(5, 10) })
      : missingMatch();
  }
  if (path === "user/profile") {
    return NextResponse.json({ user: players[0] ?? null, records: [] });
  }
  if (path === "user/list") return NextResponse.json({ user_list: players });

  return NextResponse.json({ error: "API endpoint not found" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");

  if (path === "login" || path === "register") {
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" && body.username ? body.username : "召唤师";
    const response = NextResponse.json({ ok: true, login: true, username });
    response.cookies.set("lspl_user", username, { httpOnly: true, sameSite: "lax", path: "/" });
    return response;
  }
  if (path === "logout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("lspl_user");
    return response;
  }
  if (path.startsWith("match/signup/") || path.startsWith("match/cancel/")) {
    const match = getMatch(Number(path.split("/").at(-1)));
    return match
      ? NextResponse.json({
          ok: true,
          message: path.startsWith("match/signup/") ? "报名成功" : "已取消报名",
        })
      : missingMatch();
  }

  return NextResponse.json({ ok: true });
}
