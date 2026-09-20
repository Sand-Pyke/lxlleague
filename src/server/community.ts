import { prisma } from "@/lib/prisma";
import { ApiError, badRequest, notFound } from "@/server/api";

const windowMs = 10 * 60 * 1000;
const ipLimit = 5;
const browserLimit = 3;
const ipRequests = new Map<string, number[]>();
const browserRequests = new Map<string, number[]>();

const MAX_POSTS = 50;
const MAX_COMMENTS_PER_POST = 100;

type CommentRow = {
  id: number;
  content: string;
  createdAt: Date;
};

const toDto = (comment: CommentRow) => ({
  id: comment.id,
  content: comment.content,
  created_at: comment.createdAt.toISOString(),
});

function parseContent(content: unknown) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw badRequest("内容不能为空");
  if (text.length > 500) throw badRequest("内容不能超过 500 个字");
  return text;
}

function checkRateLimit(store: Map<string, number[]>, key: string, limit: number) {
  const now = Date.now();
  const recent = (store.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  store.set(key, recent);
  return true;
}

export function assertCommunityPostAllowed(ip: string, browserId: string) {
  if (!browserId || browserId.length > 128) throw badRequest("浏览器标识无效");
  if (!checkRateLimit(ipRequests, ip, ipLimit)) {
    throw new ApiError(429, "当前网络发帖过于频繁，请 10 分钟后再试");
  }
  if (!checkRateLimit(browserRequests, browserId, browserLimit)) {
    throw new ApiError(429, "发帖过于频繁，请 10 分钟后再试");
  }
}

export async function listCommunityPosts() {
  const posts = await prisma.communityComment.findMany({
    where: { parentId: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_POSTS,
    include: {
      comments: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: MAX_COMMENTS_PER_POST,
      },
    },
  });
  return posts.map((post) => ({
    ...toDto(post),
    comments: post.comments.map(toDto),
  }));
}

export async function addCommunityPost(content: unknown) {
  const post = await prisma.communityComment.create({ data: { content: parseContent(content) } });
  return toDto(post);
}

export async function addCommunityComment(content: unknown, parentId: number | null) {
  if (parentId === null || !Number.isInteger(parentId) || parentId <= 0) {
    throw badRequest("请先选择要评论的帖子");
  }
  const parent = await prisma.communityComment.findUnique({ where: { id: parentId } });
  if (!parent || parent.parentId !== null) throw notFound("帖子不存在");
  const comment = await prisma.communityComment.create({
    data: { content: parseContent(content), parentId },
  });
  return toDto(comment);
}

export async function deleteCommunityComment(id: number) {
  const result = await prisma.communityComment.deleteMany({ where: { id } });
  if (!result.count) throw notFound("评论不存在");
}
