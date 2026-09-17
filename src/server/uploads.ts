import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * 选手上传的图片（头像、自定义背景）。
 *
 * 这些文件不能直接写进 public/：`next start` 只在启动时扫描一次 public，运行期新增的
 * 文件在生产环境一律 404（开发环境会回退到实时读盘，所以本地看不出问题），表现为
 * 「上传成功但头像迟迟不更新，重启或重新部署后才生效」。
 * 因此改为写到 UPLOAD_DIR（默认 <cwd>/data/uploads），由 /assets/... 的读盘路由即时返回。
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

/** 上传文件落盘目录；容器里通过 UPLOAD_DIR 指向挂载出来的数据目录。 */
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

/** 读取一张上传图片：先找新的数据目录，再兜底 public/ 里的历史文件。 */
export async function readUploadedImage(kind: UploadKind, name: string) {
  if (!FILE_NAME.test(name)) return null;
  const contentType = IMAGE_TYPES[path.extname(name).toLowerCase()];
  if (!contentType) return null;
  for (const dir of [uploadDir(kind), legacyDir(kind)]) {
    const buffer = await readFile(path.join(dir, name)).catch(() => null);
    if (buffer) return { buffer, contentType };
  }
  return null;
}

/** 文件名带毫秒时间戳，每次上传都会变，可以放心长缓存。 */
export async function serveUploadedImage(kind: UploadKind, name: string) {
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
