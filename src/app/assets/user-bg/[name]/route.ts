import { serveUploadedImage } from "@/server/uploads";

export const dynamic = "force-dynamic";

/** 自定义背景读取：public/ 里没有的（运行期上传的）文件由这里按需读盘返回。 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return serveUploadedImage("user-bg", name);
}
