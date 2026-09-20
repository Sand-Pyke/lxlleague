import { NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { confirmVideo } from "@/server/videos";

export const dynamic = "force-dynamic";

/** 直传成功后记录视频（仅管理员）。body: { title, description, objectKey, size, mimeType } */
export async function POST(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  return withApiErrors(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const video = await confirmVideo(
      body.title,
      body.description,
      body.objectKey,
      body.size,
      body.mimeType,
    );
    return NextResponse.json({ ok: true, video });
  });
}
