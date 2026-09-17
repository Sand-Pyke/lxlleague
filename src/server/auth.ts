import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { normalizeRank } from "@/lib/admin-options";
import { prisma } from "@/lib/prisma";

const cookieName = "lxl_user_id";
const captchaCookieName = "lxl_captcha";
const captchaLifetimeSeconds = 5 * 60;
const captchaSecret =
  process.env.CAPTCHA_SECRET || process.env.ADMIN_PASSWORD || "lxl-development-captcha-secret";

function captchaSignature(payload: string) {
  return createHmac("sha256", captchaSecret).update(payload).digest("base64url");
}

/**
 * 本次请求是否经由 HTTPS 到达。
 *
 * 不能只看 NODE_ENV：生产环境如果直接以 HTTP 暴露（例如 http://<host>:3000，尚未接 TLS 反代），
 * 带上 Secure 的 Cookie 会被浏览器直接丢弃，表现为「登录提示成功但仍然是未登录状态」。
 * 反向代理透传 x-forwarded-proto 时以它为准，否则回退到本次请求自身的协议。
 */
function isSecureRequest(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return request.nextUrl.protocol === "https:";
}

function captchaResponseError() {
  return NextResponse.json(
    { ok: false, code: "CAPTCHA_INVALID", error: "验证码错误或已过期，请重新获取" },
    { status: 400 },
  );
}

function isValidCaptcha(request: NextRequest, value: unknown) {
  if (typeof value !== "string") return false;
  const token = request.cookies.get(captchaCookieName)?.value;
  if (!token) return false;

  const [answer, expiresAt, nonce, signature] = token.split(".");
  const expires = Number(expiresAt);
  if (!answer || !nonce || !signature || !Number.isSafeInteger(expires) || expires < Date.now()) {
    return false;
  }

  const payload = `${answer}.${expiresAt}.${nonce}`;
  const expected = Buffer.from(captchaSignature(payload));
  const received = Buffer.from(signature);
  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received) &&
    value.trim() === answer
  );
}

/** Creates a short-lived, signed arithmetic challenge for registration. */
export function createCaptcha(request: NextRequest) {
  const left = randomInt(2, 10);
  const right = randomInt(1, 10);
  const expiresAt = Date.now() + captchaLifetimeSeconds * 1000;
  const payload = `${left + right}.${expiresAt}.${randomBytes(12).toString("base64url")}`;
  const response = NextResponse.json({ question: `${left} + ${right} = ?` });
  response.cookies.set(captchaCookieName, `${payload}.${captchaSignature(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/api/register",
    maxAge: captchaLifetimeSeconds,
  });
  return response;
}

function userIdFrom(request: NextRequest) {
  const value = Number(request.cookies.get(cookieName)?.value);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Reads the current signed-in user for server components. */
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
      // 自定义背景现在是全站生效的，因此顶栏外壳也需要拿到它。
      backgroundImage: true,
      profile: { select: { mainPosition: true, subPosition: true, avatar: true } },
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

function sessionResponse(
  user: { id: number; username: string; isAdmin: boolean },
  request: NextRequest,
) {
  const response = NextResponse.json({ ok: true, login: true, username: user.username });
  response.cookies.set(cookieName, String(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
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

export async function signIn(request: NextRequest) {
  const { username, password } = credentialsFrom(await requestBody(request));
  if (!username || !password) return invalidInput();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 });
  }
  if (user.status === "PENDING") {
    return NextResponse.json(
      { ok: false, error: "账号正在审核中，请等待管理员通过。" },
      { status: 403 },
    );
  }
  if (user.status === "REJECTED") {
    return NextResponse.json(
      { ok: false, error: "账号审核未通过，请联系管理员。" },
      { status: 403 },
    );
  }
  return sessionResponse(user, request);
}

export async function register(request: NextRequest) {
  const body = await requestBody(request);
  const { username, password } = credentialsFrom(body);
  if (!isValidCaptcha(request, body.captchaAnswer)) return captchaResponseError();
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,24}$/.test(username) || password.length < 6)
    return invalidInput();
  // 段位为选填项：未选、选「未定段」或值不在白名单里都按未填写存空串。
  const rank = normalizeRank(body.rank);
  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        status: "PENDING",
        profile: { create: { name: username, gameName: username, rank } },
      },
    });
    const response = NextResponse.json({
      ok: true,
      pending: true,
      message: "注册成功，请等待管理员审核后再登录。",
      username: user.username,
    });
    response.cookies.delete({ name: captchaCookieName, path: "/api/register" });
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: false, error: "用户名已被占用" }, { status: 409 });
    }
    throw error;
  }
}

/**
 * 核心管理员账号名（与 prisma/seed.mjs 使用同一个环境变量）。
 * 该账号是运维用的系统账号、并非参赛选手：个人主页不展示段位/位置/排名与各项数据面板。
 * 其他被授予 isAdmin 的普通选手仍按普通用户展示。
 */
const coreAdminUsername = process.env.ADMIN_USERNAME || "admin";

export const isCoreAdminUsername = (username: string | null | undefined) =>
  Boolean(username) && username === coreAdminUsername;

/**
 * 核心管理员在界面上的展示名。
 * 账号本身仍是 `admin`（用于登录与权限判定），只在展示身份的地方换成这个称呼；
 * 「我的资料设置」里的账户ID 仍显示真实账号，避免与实际登录名混淆。
 */
export const coreAdminLabel = "超级vip管理员";

export async function requireAdmin(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user || !user.isAdmin) {
    return {
      user: null,
      response: NextResponse.json({ error: "需要管理员权限" }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export function signOut() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(cookieName);
  return response;
}
