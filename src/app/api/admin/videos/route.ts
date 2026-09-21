import { NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { addVideo } from "@/server/videos";

export const dynamic = "force-dynamic";

/** 视频上传：仅管理员。multipart 字段：file（必填）、title（必填）、description（可选）。 */
export async function POST(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  return withApiErrors(async () => {
    const form = await request.formData().catch(() => null);
    const video = await addVideo(form?.get("title"), form?.get("description"), form?.get("file"));
    return NextResponse.json({ ok: true, video });
  });
}
