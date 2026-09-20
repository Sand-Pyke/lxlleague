import { createReadStream } from "node:fs";
import { createHmac } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
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

export type UploadKind = "avatars" | "user-bg" | "videos";

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

/**
 * OSS Post Policy 直传：签发一次性上传凭证（前端拿它直接 POST 到 OSS，不经过应用服务器）。
 * policy 锁定具体对象 Key、大小范围、Content-Type 与有效期，避免被滥用。
 */
export function ossPostPolicy(
  kind: UploadKind,
  name: string,
  contentType: string,
  maxBytes: number,
  expiresInMs = 10 * 60 * 1000,
) {
  if (!ossEnabled()) return null;
  const host = `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com`;
  const key = ossKey(kind, name);
  const expiration = new Date(Date.now() + expiresInMs).toISOString();
  const policy = {
    expiration,
    conditions: [
      { bucket: process.env.OSS_BUCKET },
      ["eq", "$key", key],
      ["content-length-range", 1, maxBytes],
      ["eq", "$Content-Type", contentType],
    ],
  };
  const policyBase64 = Buffer.from(JSON.stringify(policy)).toString("base64");
  const signature = createHmac("sha1", process.env.OSS_ACCESS_KEY_SECRET!)
    .update(policyBase64)
    .digest("base64");
  return {
    host,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
    policy: policyBase64,
    signature,
    key,
  };
}

/** 写入一个存储对象（图片/视频通用）：配置了 OSS 就直传，否则落本地磁盘。 */
export async function putStoredObject(
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

/** 图片上传入口（语义别名，保持调用方可读性）。 */
export const putUploadedImage = putStoredObject;

/** 删除一个存储对象：OSS 或本地磁盘，失败静默（清理场景不阻塞主流程）。 */
export async function deleteStoredObject(kind: UploadKind, name: string) {
  const client = ossClient();
  if (client) {
    await client.delete(ossKey(kind, name)).catch(() => undefined);
    return;
  }
  await unlink(path.join(uploadDir(kind), name)).catch(() => undefined);
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

/* ------------------------------- 视频读取 ------------------------------- */

/** 视频文件名：`v<时间戳>_<随机串>.(mp4|webm)`，与图片规则一样杜绝目录穿越。 */
const VIDEO_NAME = /^v\d+_[a-f0-9]+\.(mp4|webm)$/;

function videoContentType(name: string) {
  return name.endsWith(".webm") ? "video/webm" : "video/mp4";
}

type VideoSource = {
  total: number;
  /** 读取 [start, end] 字节区间的 Web 流（OSS 分支为异步）。 */
  readRange: (
    start: number,
    end: number,
  ) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
};

async function resolveVideoSource(name: string): Promise<VideoSource | null> {
  const client = ossClient();
  if (client) {
    const head = await client.head(ossKey("videos", name)).catch(() => null);
    const total = Number(head?.res.headers["content-length"] ?? 0);
    if (total > 0) {
      return {
        total,
        readRange: async (start, end) => {
          const result = await client.get(ossKey("videos", name), {
            headers: { Range: `bytes=${start}-${end}` },
          });
          return new Blob([Buffer.from(result.content)]).stream();
        },
      };
    }
  }
  const filePath = path.join(uploadDir("videos"), name);
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) return null;
  return {
    total: info.size,
    readRange: (start, end) =>
      Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>,
  };
}

function rangeNotSatisfiable(total: number) {
  return new NextResponse("Range Not Satisfiable", {
    status: 416,
    headers: { "Content-Range": `bytes */${total}` },
  });
}

/** 解析 `Range: bytes=start-end`（仅支持单段），返回 [start, end]，非法时抛 416。 */
function parseRange(rangeHeader: string, total: number): [number, number] | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) throw rangeNotSatisfiable(total);
  const [, startText, endText] = match;
  if (startText === "" && endText === "") throw rangeNotSatisfiable(total);
  if (startText === "") {
    // 后缀范围：取最后 N 字节。
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw rangeNotSatisfiable(total);
    const start = Math.max(total - suffix, 0);
    return [start, total - 1];
  }
  const start = Number(startText);
  const end = endText === "" ? total - 1 : Math.min(Number(endText), total - 1);
  if (!Number.isSafeInteger(start) || start >= total || end < start) {
    throw rangeNotSatisfiable(total);
  }
  return [start, end];
}

/** 视频播放：支持 Range 分段拉流（HTML5 video 拖动进度条依赖它），配了公网地址时 307 直跳。 */
export async function serveVideo(name: string, rangeHeader: string | null) {
  if (!VIDEO_NAME.test(name)) return new NextResponse("Not Found", { status: 404 });
  const publicBase = process.env.OSS_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (publicBase && (await ossHasObject(ossKey("videos", name)))) {
    return NextResponse.redirect(`${publicBase}/videos/${name}`, 307);
  }
  const source = await resolveVideoSource(name);
  if (!source) return new NextResponse("Not Found", { status: 404 });

  const contentType = videoContentType(name);
  const common = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  let range: [number, number];
  try {
    const parsed = parseRange(rangeHeader ?? "", source.total);
    range = parsed ?? [0, source.total - 1];
  } catch (error) {
    return error as NextResponse;
  }

  const [start, end] = range;
  return new NextResponse(await source.readRange(start, end), {
    status: rangeHeader ? 206 : 200,
    headers: {
      ...common,
      "Content-Length": String(end - start + 1),
      ...(rangeHeader ? { "Content-Range": `bytes ${start}-${end}/${source.total}` } : {}),
    },
  });
}
