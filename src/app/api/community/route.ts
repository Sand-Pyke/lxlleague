import { NextRequest, NextResponse } from "next/server";
import { unauthorized, withApiErrors } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import {
  addCommunityComment,
  addCommunityPost,
  assertCommunityPostAllowed,
  listCommunityPosts,
} from "@/server/community";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withApiErrors(async () => {
    const user = await getSessionUser(request);
    return NextResponse.json({
      ok: true,
      posts: await listCommunityPosts(),
      can_delete: Boolean(user?.isAdmin),
    });
  });
}

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    const user = await getSessionUser(request);
    if (!user) throw unauthorized("请先登录后再发帖");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ip =
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const browserId = request.headers.get("x-community-browser-id")?.trim() ?? "";
    assertCommunityPostAllowed(ip, browserId);
    const rawParentId = body.parentId ?? null;
    const parentId = rawParentId === null ? null : Number(rawParentId);
    const item =
      parentId === null
        ? await addCommunityPost(body.content)
        : await addCommunityComment(body.content, parentId);
    return NextResponse.json({ ok: true, comment: item });
  });
}
