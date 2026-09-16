import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { RANKS } from "@/lib/admin-options";

const cookieName = "lspl_user_id";

function userIdFrom(request: NextRequest) {
  const value = Number(request.cookies.get(cookieName)?.value);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** 服务端组件用：从 cookie 读取当前登录用户（等价 getSessionUser，无需 NextRequest）。 */
export async function getViewer() {
  const store = await cookies();
  const id = Number(store.get(cookieName)?.value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      status: true,
      profile: { select: { mainPosition: true, subPosition: true } },
    },
  });
}

export async function getSessionUser(request: NextRequest) {
  const id = userIdFrom(request);
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true, status: true },
  });
}

export async function getCurrentUser(request: NextRequest) {
  const user = await getSessionUser(request);
  return NextResponse.json({
    login: Boolean(user),
    username: user?.username || "",
    is_admin: user?.isAdmin || false,
  });
}

function invalidInput() {
  return NextResponse.json({ ok: false, error: "用户名或密码格式不正确" }, { status: 400 });
}

function sessionResponse(user: { id: number; username: string; isAdmin: boolean }) {
  const response = NextResponse.json({ ok: true, login: true, username: user.username });
  response.cookies.set(cookieName, String(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

async function requestBody(request: NextRequest) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

function credentialsFrom(body: Record<string, unknown>) {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  return { username, password };
}

/** 注册时的段位（与旧服务一致：中文段位词表，未定段用空串存库）。 */
function registerRank(body: Record<string, unknown>) {
  return typeof body.rank === "string" ? body.rank.trim() : "";
}

export async function signIn(request: NextRequest) {
  const { username, password } = credentialsFrom(await requestBody(request));
  if (!username || !password) return invalidInput();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 });
  }
  if (user.status === "PENDING") {
    return NextResponse.json({ ok: false, error: "账号正在审核中，请等待管理员通过。" }, { status: 403 });
  }
  if (user.status === "REJECTED") {
    return NextResponse.json({ ok: false, error: "账号审核未通过，请联系管理员。" }, { status: 403 });
  }
  return sessionResponse(user);
}

export async function register(request: NextRequest) {
  const body = await requestBody(request);
  const { username, password } = credentialsFrom(body);
  const rank = registerRank(body);
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,24}$/.test(username) || password.length < 6)
    return invalidInput();
  if (!RANKS.includes(rank)) {
    return NextResponse.json({ ok: false, error: "段位不合法" }, { status: 400 });
  }
  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        status: "PENDING",
        profile: { create: { name: username, gameName: username, rank: rank === "未定段" ? "" : rank } },
      },
    });
    return NextResponse.json({
      ok: true,
      pending: true,
      message: "注册成功，请等待管理员审核后再登录。",
      username: user.username,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: false, error: "用户名已被占用" }, { status: 409 });
    }
    throw error;
  }
}

export async function requireAdmin(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user || !user.isAdmin) {
    return { user: null, response: NextResponse.json({ error: "需要管理员权限" }, { status: 403 }) };
  }
  return { user, response: null };
}

export function signOut() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(cookieName);
  return response;
}
