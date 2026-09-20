import { serveVideo } from "@/server/uploads";

export const dynamic = "force-dynamic";

/** 视频播放：支持 Range 分段拉流，OSS / 本地磁盘两种存储都可用。 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return serveVideo(name, request.headers.get("range"));
}
