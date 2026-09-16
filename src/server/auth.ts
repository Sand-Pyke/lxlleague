import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const cookieName = "lspl_user_id";

function userIdFrom(request: NextRequest) {
  const value = Number(request.cookies.get(cookieName)?.value);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function getSessionUser(request: NextRequest) {
  const id = userIdFrom(request);
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true },
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

async function credentialsFrom(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  return { username, password };
}

export async function signIn(request: NextRequest) {
  const { username, password } = await credentialsFrom(request);
  if (!username || !password) return invalidInput();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 });
  }
  return sessionResponse(user);
}

export async function register(request: NextRequest) {
  const { username, password } = await credentialsFrom(request);
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,24}$/.test(username) || password.length < 6)
    return invalidInput();
  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        profile: { create: { name: username, gameName: username } },
      },
    });
    return sessionResponse(user);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: false, error: "用户名已被占用" }, { status: 409 });
    }
    throw error;
  }
}

export function signOut() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(cookieName);
  return response;
}
