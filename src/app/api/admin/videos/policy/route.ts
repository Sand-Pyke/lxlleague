import { NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { createVideoUploadPolicy } from "@/server/videos";

export const dynamic = "force-dynamic";

/** 签发视频直传凭证（仅管理员）。body: { filename } */
export async function POST(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  return withApiErrors(async () => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ...(await createVideoUploadPolicy(body.filename)) });
  });
}
