import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import OSS from "ali-oss";

/**
 * 选手上传的图片（头像、自定义背景）。
 *
 * 存储策略：配置了 OSS 环境变量时直接写入阿里云 OSS，应用不再依赖本地磁盘；
 * 未配置时回退到 UPLOAD_DIR（默认 <cwd>/data/uploads）本地落盘，开发环境零配置可用。
 *
 * 读取链路（/assets/avatars/*、/assets/user-bg/*）对两种存储都兼容：
 * 1. 配置了 OSS_PUBLIC_BASE_URL（Bucket 开通公网读）时 307 直跳 OSS，省应用带宽；
 * 2. 否则应用从 OSS 取对象读回字节流（私读 Bucket 也能用）；
 * 3. 文件不在 OSS 时继续兜底本地数据目录与 public/ 里的历史文件。
 * 因此数据库里现有的 /assets/... 路径完全不用迁移。
 */

export type UploadKind = "avatars" | "user-bg";

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const IMAGE_EXTS: readonly string[] = Object.keys(IMAGE_TYPES);

export function imageContentType(nameOrExt: string) {
  return IMAGE_TYPES[path.extname(nameOrExt).toLowerCase()];
}

/** 上传文件本地落盘目录；容器里通过 UPLOAD_DIR 指向挂载出来的数据目录。 */
export function uploadDir(kind: UploadKind) {
  const root = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "data", "uploads");
  return path.join(root, kind);
}

/** 历史上传文件曾经落在 public/ 下，这里只做只读兜底。 */
function legacyDir(kind: UploadKind) {
  return path.join(process.cwd(), "public", "assets", kind);
}

/** 只接受 `u<用户ID>_<时间戳>.<后缀>` 与旧命名 `u<用户ID>.<后缀>`，杜绝目录穿越与任意文件读取。 */
const FILE_NAME = /^u\d+(_\d+)?\.(jpg|jpeg|png|gif|webp)$/;

/* ------------------------------- OSS 存储 ------------------------------- */

const OSS_REQUIRED_KEYS = [
  "OSS_REGION",
  "OSS_BUCKET",
  "OSS_ACCESS_KEY_ID",
  "OSS_ACCESS_KEY_SECRET",
] as const;

export function ossEnabled() {
  return OSS_REQUIRED_KEYS.every((key) => process.env[key]);
}

let oss: OSS | null = null;

/** 惰性创建 OSS 客户端；未配置时返回 null（回退本地磁盘）。 */
export function ossClient() {
  if (!ossEnabled()) return null;
  if (!oss) {
    oss = new OSS({
      region: process.env.OSS_REGION!,
      bucket: process.env.OSS_BUCKET!,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
      secure: true,
    });
  }
  return oss;
}

/** OSS 对象 Key：可选 OSS_PREFIX 前缀 + `<kind>/<文件名>`。 */
function ossKey(kind: UploadKind, name: string) {
  const prefix = process.env.OSS_PREFIX?.replace(/^\/+|\/+$/g, "") ?? "";
  return prefix ? `${prefix}/${kind}/${name}` : `${kind}/${name}`;
}

/** 写入一张上传图片：配置了 OSS 就直传，否则落本地磁盘。 */
export async function putUploadedImage(
  kind: UploadKind,
  name: string,
  buffer: Buffer,
  contentType: string,
) {
  const client = ossClient();
  if (client) {
    await client.put(ossKey(kind, name), buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    return;
  }
  const dir = uploadDir(kind);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);
}

/** OSS 上是否已存在该文件（用于公网直跳前的存在性检查）。 */
async function ossHasObject(key: string) {
  const client = ossClient();
  if (!client) return false;
  return Boolean(await client.head(key).catch(() => null));
}

/** 同一个人的旧图片只留一张：删除 OSS 或本地目录里属于该用户的历史文件。 */
export async function removeOldUploads(
  kind: UploadKind,
  keep: string,
  isOwn: (name: string) => boolean,
) {
  const client = ossClient();
  if (client) {
    const names: string[] = [];
    let marker: string | undefined;
    do {
      const result = await client.list(
        { prefix: ossKey(kind, ""), marker, "max-keys": 1000 },
        {},
      );
      for (const object of result.objects ?? []) {
        const name = object.name.split("/").pop() ?? "";
        if (name !== keep && FILE_NAME.test(name) && isOwn(name)) names.push(name);
      }
      marker = result.nextMarker || undefined;
    } while (marker);
    await Promise.all(
      names.map((name) => client.delete(ossKey(kind, name)).catch(() => undefined)),
    );
    return;
  }
  const dir = uploadDir(kind);
  const names = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name !== keep && isOwn(name))
      .map((name) => unlink(path.join(dir, name)).catch(() => undefined)),
  );
}

/** 读取一张上传图片：OSS 优先，再兜底本地数据目录与 public/ 里的历史文件。 */
export async function readUploadedImage(kind: UploadKind, name: string) {
  if (!FILE_NAME.test(name)) return null;
  const contentType = imageContentType(name);
  if (!contentType) return null;
  const client = ossClient();
  if (client) {
    const result = await client.get(ossKey(kind, name)).catch(() => null);
    if (result?.content) {
      return { buffer: Buffer.from(result.content), contentType };
    }
  }
  for (const dir of [uploadDir(kind), legacyDir(kind)]) {
    const buffer = await readFile(path.join(dir, name)).catch(() => null);
    if (buffer) return { buffer, contentType };
  }
  return null;
}

/** 文件名带毫秒时间戳，每次上传都会变，可以放心长缓存。 */
export async function serveUploadedImage(kind: UploadKind, name: string) {
  // Bucket 开通公网读并配置了 OSS_PUBLIC_BASE_URL 时直接 307 到 OSS，
  // 图片流量不经过应用；对象不存在（比如历史本地文件）时继续走下面的读回兜底。
  const publicBase = process.env.OSS_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (publicBase && (await ossHasObject(ossKey(kind, name)))) {
    return NextResponse.redirect(`${publicBase}/${kind}/${name}`, 307);
  }
  const file = await readUploadedImage(kind, name);
  if (!file) return new NextResponse("Not Found", { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.buffer.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
