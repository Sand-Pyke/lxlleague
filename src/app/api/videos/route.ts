import { NextResponse } from "next/server";
import { withApiErrors } from "@/server/api";
import { listVideos } from "@/server/videos";

export const dynamic = "force-dynamic";

/** 视频列表：所有访客可见。 */
export async function GET() {
  return withApiErrors(async () => NextResponse.json({ ok: true, videos: await listVideos() }));
}
