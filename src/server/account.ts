import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBackgroundFile, BACKGROUND_PREFIX } from "@/lib/backgrounds";
import { getSessionUser } from "@/server/auth";

/**
 * 选手自助资料端点（对应旧项目 app.py 里的 /api/user/* 与 /api/avatar/upload）。
 * 校验规则与文案照抄旧实现，方便前端沿用旧交互。
 */

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const avatarDir = path.join(process.cwd(), "public", "assets", "avatars");
const backgroundDir = path.join(process.cwd(), "public", "assets", "user-bg");

/** 旧的 JSON 端点统一回 {msg}（成功 200，失败 4xx），前端直接展示 msg。 */
const message = (text: string, status = 200) => NextResponse.json({ msg: text }, { status });

async function currentUserId(request: NextRequest) {
  const user = await getSessionUser(request);
  return user ? user.id : null;
}

async function jsonBody(request: NextRequest) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * 早期账号（seed 出来的管理员等）可能没有资料行，注册流程才会建。
 * 自助编辑与个人主页都按「资料行必须存在」处理，缺失时按账号名补一条。
 */
export async function ensureProfile(userId: number) {
  const existing = await prisma.playerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user) return;
  await prisma.playerProfile
    .create({ data: { userId, name: user.username, gameName: user.username } })
    .catch(() => undefined);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** 真实文件头校验：防止把非图片改名成 .png 上传（与旧实现一致）。 */
function isRealImage(buffer: Buffer) {
  const head = buffer.subarray(0, 16);
  if (head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
  const ascii = (start: number, end: number) => head.subarray(start, end).toString("latin1");
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return true;
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

/** 读取上传的图片：校验扩展名、体积与真实文件头。 */
type Upload = { ok: true; buffer: Buffer; ext: string } | { ok: false; error: string };

async function readUpload(file: unknown): Promise<Upload> {
  if (!(file instanceof File) || !file.name) return { ok: false, error: "请选择图片文件" };
  const ext = path.extname(file.name).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) return { ok: false, error: "仅支持 jpg/png/gif/webp 图片" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "图片不能超过 5MB" };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isRealImage(buffer)) return { ok: false, error: "文件不是有效图片" };
  return { ok: true, buffer, ext };
}

/** 同一个人的旧图片只留一张：删掉同前缀的历史文件。 */
async function removeOldFiles(dir: string, prefix: string, keep: string) {
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name.startsWith(prefix) && name !== keep)
      .map((name) => unlink(path.join(dir, name)).catch(() => undefined)),
  );
}

/** 游戏ID（召唤师名，战绩导入时按它匹配账号）。 */
export async function updateGameName(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const body = await jsonBody(request);
  const gameName = text(body.game_name).trim().slice(0, 80);
  await ensureProfile(userId);
  await prisma.playerProfile.update({ where: { userId }, data: { gameName } });
  return message("游戏ID已保存");
}

/** 修改自己的密码。 */
export async function changePassword(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const body = await jsonBody(request);
  const oldPassword = text(body.old_pwd);
  const newPassword = text(body.new_pwd);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(oldPassword, user.passwordHash))) {
    return message("原密码错误", 400);
  }
  if (!newPassword) return message("新密码不能为空", 400);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });
  return message("密码修改成功");
}

/** 主/副位置保存（无副位置存「无」，与旧数据一致）。 */
export async function updatePosition(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const body = await jsonBody(request);
  const mainPosition = text(body.main_pos).trim();
  const subPosition = text(body.sub_pos).trim();
  const valid = ["TOP", "JUG", "MID", "ADC", "SUP", "无", ""];
  if (!valid.includes(mainPosition) || !valid.includes(subPosition)) {
    return message("位置不合法", 400);
  }
  await ensureProfile(userId);
  await prisma.playerProfile.update({
    where: { userId },
    data: { mainPosition, subPosition },
  });
  return message("位置已更新");
}

/** 个人简介保存（最多 300 字）。 */
export async function updateBio(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const bio = text((await jsonBody(request)).bio).trim();
  if (bio.length > 300) return message("简介不能超过300字", 400);
  await ensureProfile(userId);
  await prisma.playerProfile.update({ where: { userId }, data: { bio } });
  return message("简介已更新");
}

/** KOOK 昵称保存（中文/字母/数字/下划线，最长 20 个字符）。 */
export async function updateKookName(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const kookName = text((await jsonBody(request)).kook_name).trim();
  if (!kookName) return message("KOOK昵称不能为空", 400);
  if (!/^[\w\u4e00-\u9fa5 ]{1,20}$/.test(kookName)) {
    return message("KOOK昵称仅限中文/字母/数字/下划线，最长20个字符", 400);
  }
  await prisma.user.update({ where: { id: userId }, data: { kookName } });
  return message("KOOK昵称设置成功");
}

/** 修改账户ID（登录名）。昵称与登录名同步的前提是它还没被单独改过。 */
export async function changeUsername(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const username = text((await jsonBody(request)).username).trim();
  if (!/^[\w\u4e00-\u9fa5]{2,16}$/.test(username)) {
    return message("账户ID仅限中文/字母/数字/下划线，2-16个字符", 400);
  }
  const [taken, user] = await Promise.all([
    prisma.user.findFirst({ where: { username, NOT: { id: userId } }, select: { id: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, profile: { select: { name: true } } },
    }),
  ]);
  if (taken) return message("该账户ID已被使用", 400);
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { username } }),
      ...(user && user.profile?.name === user.username
        ? [prisma.playerProfile.update({ where: { userId }, data: { name: username } })]
        : []),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return message("该账户ID已被使用", 400);
    throw error;
  }
  return message("账户ID修改成功，下次请用新账户ID登录");
}

/** 头像上传：文件名带时间戳，URL 变化让浏览器自然换新缓存。 */
export async function uploadAvatar(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const form = await request.formData().catch(() => null);
  const upload = await readUpload(form?.get("avatar"));
  if (!upload.ok) return message(upload.error, 400);
  await mkdir(avatarDir, { recursive: true });
  const name = `u${userId}_${Math.floor(Date.now() / 1000)}${upload.ext}`;
  await writeFile(path.join(avatarDir, name), upload.buffer);
  await removeOldFiles(avatarDir, `u${userId}_`, name);
  const avatar = `/assets/avatars/${name}`;
  await ensureProfile(userId);
  await prisma.playerProfile.update({ where: { userId }, data: { avatar } });
  return NextResponse.json({ msg: "头像已更新", avatar });
}

/** 选择白名单背景（兼容传文件名或完整路径）。 */
export async function selectBackground(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const raw = text((await jsonBody(request)).bg).trim();
  const file = raw.split("/").pop() ?? "";
  if (!isBackgroundFile(file)) return message("背景图不合法", 400);
  const backgroundImage = BACKGROUND_PREFIX + file;
  await prisma.user.update({ where: { id: userId }, data: { backgroundImage } });
  return NextResponse.json({ msg: "背景已更新", background: backgroundImage });
}

/** 自定义背景上传：一个用户只保留一张，仅本人主页使用。 */
export async function uploadBackground(request: NextRequest) {
  const userId = await currentUserId(request);
  if (!userId) return message("请先登录", 401);
  const form = await request.formData().catch(() => null);
  const upload = await readUpload(form?.get("bg"));
  if (!upload.ok) return message(upload.error, 400);
  await mkdir(backgroundDir, { recursive: true });
  const name = `u${userId}${upload.ext}`;
  await removeOldFiles(backgroundDir, `u${userId}.`, name);
  await writeFile(path.join(backgroundDir, name), upload.buffer);
  const backgroundImage = `/assets/user-bg/${name}`;
  await prisma.user.update({ where: { id: userId }, data: { backgroundImage } });
  return NextResponse.json({ msg: "背景已更新", background: backgroundImage });
}
