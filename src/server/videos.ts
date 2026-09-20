import { randomBytes } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { ApiError, badRequest, notFound } from "@/server/api";
import { deleteStoredObject, ossPostPolicy, putStoredObject } from "@/server/uploads";

/**
 * 视频内容模块（最小可用版）：仅管理员上传比赛集锦等官方内容，
 * 原始 mp4/webm 直接存 OSS（或本地磁盘回退），前端 `<video>` 直接播放。
 */

const MAX_VIDEO_MB = Number(process.env.MAX_VIDEO_MB ?? 200);
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;

const VIDEO_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const toDto = (video: {
  id: number;
  title: string;
  description: string | null;
  objectKey: string;
  size: number;
  createdAt: Date;
}) => ({
  id: video.id,
  title: video.title,
  description: video.description,
  size: video.size,
  created_at: video.createdAt.toISOString(),
  url: `/assets/videos/${video.objectKey.split("/").pop() ?? ""}`,
});

/** 真实文件头校验：mp4 看 ftyp 盒子，webm 看 EBML 魔数。 */
function isRealVideo(buffer: Buffer, ext: string) {
  const head = buffer.subarray(0, 16);
  if (ext === ".mp4") return head.subarray(4, 8).toString("latin1") === "ftyp";
  if (ext === ".webm") {
    return (
      head.length >= 4 &&
      head[0] === 0x1a &&
      head[1] === 0x45 &&
      head[2] === 0xdf &&
      head[3] === 0xa3
    );
  }
  return false;
}

export async function listVideos() {
  const videos = await prisma.video.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  return videos.map(toDto);
}

export async function addVideo(title: unknown, description: unknown, file: unknown) {
  const name = asText(title);
  if (!name) throw badRequest("标题不能为空");
  if (name.length > 100) throw badRequest("标题不能超过 100 个字");
  const desc = asText(description);
  if (desc.length > 500) throw badRequest("简介不能超过 500 个字");
  if (!(file instanceof File) || !file.name) throw badRequest("请选择视频文件");
  const ext = path.extname(file.name).toLowerCase();
  const mimeType = VIDEO_TYPES[ext];
  if (!mimeType) throw badRequest("仅支持 mp4/webm 视频");
  if (file.size > MAX_VIDEO_BYTES) {
    throw new ApiError(400, `视频不能超过 ${MAX_VIDEO_MB}MB`);
  }
  if (file.size === 0) throw badRequest("视频文件为空");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isRealVideo(buffer, ext)) throw badRequest("文件不是有效的 mp4/webm 视频");

  const objectName = `v${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;
  await putStoredObject("videos", objectName, buffer, mimeType);
  try {
    const video = await prisma.video.create({
      data: {
        title: name.slice(0, 100),
        description: desc || null,
        objectKey: `videos/${objectName}`,
        mimeType,
        size: file.size,
      },
    });
    return toDto(video);
  } catch (error) {
    // 数据库写入失败时回收刚上传的对象，避免留下孤儿文件。
    await deleteStoredObject("videos", objectName).catch(() => undefined);
    throw error;
  }
}

export async function deleteVideo(id: number) {
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) throw notFound("视频不存在");
  await prisma.video.delete({ where: { id } });
  const name = video.objectKey.split("/").pop() ?? "";
  if (name) await deleteStoredObject("videos", name).catch(() => undefined);
}

/** 签发视频直传凭证：前端拿它直接 POST 到 OSS；未配置 OSS 时返回 direct=false 由前端回退中转。 */
export async function createVideoUploadPolicy(filename: unknown) {
  const name = asText(filename);
  if (!name) throw badRequest("请选择视频文件");
  const ext = path.extname(name).toLowerCase();
  const mimeType = VIDEO_TYPES[ext];
  if (!mimeType) throw badRequest("仅支持 mp4/webm 视频");
  const objectName = `v${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;
  const policy = ossPostPolicy("videos", objectName, mimeType, MAX_VIDEO_BYTES);
  if (!policy) return { direct: false as const };
  return {
    direct: true as const,
    ...policy,
    objectKey: `videos/${objectName}`,
    mimeType,
  };
}

/** 直传成功后记录视频（校验标题/简介/大小，写入 Video）。 */
export async function confirmVideo(
  title: unknown,
  description: unknown,
  objectKey: unknown,
  size: unknown,
  mimeType: unknown,
) {
  const name = asText(title);
  if (!name) throw badRequest("标题不能为空");
  if (name.length > 100) throw badRequest("标题不能超过 100 个字");
  const desc = asText(description);
  if (desc.length > 500) throw badRequest("简介不能超过 500 个字");
  const key = asText(objectKey);
  const mime = asText(mimeType);
  if (!key || !mime) throw badRequest("上传信息不完整");
  const sizeNum = Number(size);
  if (!Number.isInteger(sizeNum) || sizeNum < 1 || sizeNum > MAX_VIDEO_BYTES) {
    throw badRequest(`视频大小无效（上限 ${MAX_VIDEO_MB}MB）`);
  }
  const video = await prisma.video.create({
    data: {
      title: name.slice(0, 100),
      description: desc || null,
      objectKey: key,
      mimeType: mime,
      size: sizeNum,
    },
  });
  return toDto(video);
}
