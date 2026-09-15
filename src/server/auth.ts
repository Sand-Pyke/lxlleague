import { NextRequest, NextResponse } from "next/server";

const cookieName = "lspl_user";

function usernameFrom(request: NextRequest) {
  return request.cookies.get(cookieName)?.value;
}

export function getCurrentUser(request: NextRequest) {
  const username = usernameFrom(request);
  return NextResponse.json({
    login: Boolean(username),
    username: username || "",
    is_admin: username === "admin",
  });
}

export async function signIn(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const username = typeof body.username === "string" && body.username ? body.username : "召唤师";
  const response = NextResponse.json({ ok: true, login: true, username });
  response.cookies.set(cookieName, username, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}

export function signOut() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(cookieName);
  return response;
}
