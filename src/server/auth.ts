import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { normalizeRank } from "@/lib/admin-options";
import { passwordFormatError, usernameCharsetError, usernameFormatError } from "@/lib/credentials";
import { randomDefaultAvatar } from "@/lib/default-avatars";
import { prisma } from "@/lib/prisma";

const cookieName = "lxl_user_id";
const captchaCookieName = "lxl_captcha";
const captchaLifetimeSeconds = 5 * 60;
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

/**
 * 验证码与登录态共用的签名密钥。
 *
 * 用环境变量提供：密钥一旦用固定字符串兜底，任何知道这套算法的人都能自己算出合法的
 * 登录 Cookie（伪造 lxl_user_id 直接变成管理员）。因此生产环境缺少配置时直接抛错，
 * 而不是悄悄降级成弱密钥。
 */
function resolveAuthSecret() {
  const secret =
    process.env.SESSION_SECRET || process.env.CAPTCHA_SECRET || process.env.ADMIN_PASSWORD;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("缺少 SESSION_SECRET / CAPTCHA_SECRET / ADMIN_PASSWORD，无法签发登录态");
  }
  return "lxl-development-secret";
}

const authSecret = resolveAuthSecret();

function signature(payload: string) {
  return createHmac("sha256", authSecret).update(payload).digest("base64url");
}

function signatureMatches(payload: string, received: string | undefined) {
  if (!received) return false;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * 登录态 Cookie 的取值：`<用户ID>.<过期时间戳>.<HMAC>`。
 *
 * 历史上这里只存了裸的用户ID，等于把「我是谁」交给客户端随便填：
 * 手工把 Cookie 改成 1 就能以管理员身份访问后台（越权）。现在加上签名与过期时间，
 * 服务端只认签名对得上的值；旧格式的 Cookie 因签名校验失败自动作废，用户重新登录即可。
 */
function createSessionToken(userId: number) {
  const payload = `${userId}.${Date.now() + sessionLifetimeSeconds * 1000}`;
  return `${payload}.${signature(payload)}`;
}

function userIdFromToken(token: string | undefined) {
  const parts = token?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [rawId, rawExpires, received] = parts;
  const id = Number(rawId);
  const expires = Number(rawExpires);
  if (!Number.isInteger(id) || id <= 0 || !Number.isSafeInteger(expires)) return null;
  if (expires < Date.now()) return null;
  if (!signatureMatches(`${rawId}.${rawExpires}`, received)) return null;
  return id;
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

  const [answer, expiresAt, nonce, received] = token.split(".");
  const expires = Number(expiresAt);
  if (!answer || !nonce || !received || !Number.isSafeInteger(expires) || expires < Date.now()) {
    return false;
  }

  return signatureMatches(`${answer}.${expiresAt}.${nonce}`, received) && value.trim() === answer;
}

/** Creates a short-lived, signed arithmetic challenge for registration. */
export function createCaptcha(request: NextRequest) {
  const left = randomInt(2, 10);
  const right = randomInt(1, 10);
  const expiresAt = Date.now() + captchaLifetimeSeconds * 1000;
  const payload = `${left + right}.${expiresAt}.${randomBytes(12).toString("base64url")}`;
  const response = NextResponse.json({ question: `${left} + ${right} = ?` });
  response.cookies.set(captchaCookieName, `${payload}.${signature(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(request),
    path: "/api/register",
    maxAge: captchaLifetimeSeconds,
  });
  return response;
}

function userIdFrom(request: NextRequest) {
  return userIdFromToken(request.cookies.get(cookieName)?.value);
}

/**
 * 只有审核通过的账号才算「已登录」。
 * 被管理员改回待审核 / 拒绝的账号，即使手里还留着旧 Cookie 也不能继续用接口，
 * 否则封禁只在登录那一刻有效、手上有 Cookie 的人仍能报名和改资料。
 */
const isActiveAccount = (status: string) => status === "APPROVED";

/** Reads the current signed-in user for server components. */
export async function getViewer() {
  const store = await cookies();
  const id = userIdFromToken(store.get(cookieName)?.value);
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      status: true,
      // 自定义背景现在是全站生效的，因此顶栏外壳也需要拿到它。
      backgroundImage: true,
      // 报名赛事前需要校验资料是否完善，顶栏外壳一并带出来供赛事页使用。
      kookName: true,
      profile: {
        select: {
          mainPosition: true,
          subPosition: true,
          avatar: true,
          gameName: true,
          rank: true,
        },
      },
    },
  });
  return user && isActiveAccount(user.status) ? user : null;
}

export async function getSessionUser(request: NextRequest) {
  const id = userIdFrom(request);
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true, status: true },
  });
  return user && isActiveAccount(user.status) ? user : null;
}

export async function getCurrentUser(request: NextRequest) {
  const user = await getSessionUser(request);
  return NextResponse.json({
    login: Boolean(user),
    username: user?.username || "",
    is_admin: user?.isAdmin || false,
  });
}

function invalidInput(message = "用户名或密码格式不正确") {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

/**
 * 登录失败节流：同一个「出口 IP + 账户ID」连续失败 8 次后锁 10 分钟。
 * 只锁这一对组合、且只累计失败次数，因此同一网咖共用出口 IP 的选手不会互相牵连。
 * 进程内计数足够覆盖单实例部署；重启即清空，不会把正常选手永久挡在门外。
 */
const loginFailureLimit = 8;
const loginFailureWindow = 10 * 60 * 1000;
const loginBlockTime = 10 * 60 * 1000;
const loginFailures = new Map<string, { count: number; firstAt: number; blockedUntil: number }>();

function loginKey(request: NextRequest, username: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${ip}|${username.toLowerCase()}`;
}

function isLoginBlocked(key: string) {
  const record = loginFailures.get(key);
  if (!record) return false;
  if (record.blockedUntil > Date.now()) return true;
  if (Date.now() - record.firstAt > loginFailureWindow) loginFailures.delete(key);
  return false;
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const record = loginFailures.get(key);
  if (!record || now - record.firstAt > loginFailureWindow) {
    loginFailures.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
  } else {
    record.count += 1;
    if (record.count >= loginFailureLimit) record.blockedUntil = now + loginBlockTime;
  }
  // 记录本身很小，但也不该无限增长：超量时顺手清掉已经过期的条目。
  if (loginFailures.size > 5000) {
    for (const [existing, value] of loginFailures) {
      if (value.blockedUntil < now && now - value.firstAt > loginFailureWindow) {
        loginFailures.delete(existing);
      }
    }
  }
}

/** 账号不存在时也走一次 bcrypt，避免用响应时间区分「账号是否存在」。 */
let decoyHash: Promise<string> | null = null;
const timingDecoyHash = () => (decoyHash ??= bcrypt.hash(randomBytes(24).toString("hex"), 12));

function sessionResponse(
  user: { id: number; username: string; isAdmin: boolean },
  request: NextRequest,
) {
  const response = NextResponse.json({ ok: true, login: true, username: user.username });
  response.cookies.set(cookieName, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: sessionLifetimeSeconds,
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
  // 登录名不接受中文：中文、空格、全角符号等非 ASCII 字符直接判为格式错误。
  const charsetError = usernameCharsetError(username);
  if (charsetError) return invalidInput(charsetError);

  const key = loginKey(request, username);
  if (isLoginBlocked(key)) {
    return NextResponse.json(
      { ok: false, error: "登录失败次数过多，请 10 分钟后再试" },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? (await timingDecoyHash()),
  );
  if (!user || !passwordMatches) {
    recordLoginFailure(key);
    return NextResponse.json({ ok: false, error: "用户名或密码错误" }, { status: 401 });
  }
  loginFailures.delete(key);
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
  // 账户ID 与密码都只接受 ASCII：中文、全角字符、空格一律拒绝（校验规则集中在 lib/credentials）。
  const usernameError = usernameFormatError(username);
  if (usernameError) return invalidInput(usernameError);
  const passwordError = passwordFormatError(password);
  if (passwordError) return invalidInput(passwordError);
  // 段位为选填项：未选、选「未定段」或值不在白名单里都按未填写存空串。
  const rank = normalizeRank(body.rank);
  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        status: "PENDING",
        // 游戏ID不再复用账号名：必须由选手按游戏内昵称自己填写（格式 名称#数字编号）。
        // 头像先随机发一个默认表情头像，选手可以在「我的资料」里更换或上传自己的图。
        profile: {
          create: { name: username, gameName: "", rank, avatar: randomDefaultAvatar() },
        },
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
 * 该账号是运维用的系统账号、并非参赛选手：个人主页不展示段位/位置/排名与各项数据面板，
 * 也不进入选手榜、参赛名单等比赛相关统计。
 * 其他被授予 isAdmin 的普通选手仍是普通选手，因此各处过滤用它而不是 isAdmin。
 */
export const coreAdminUsername = process.env.ADMIN_USERNAME || "admin";

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
