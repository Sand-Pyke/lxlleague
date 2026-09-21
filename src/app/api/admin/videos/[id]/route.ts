import { adminRoute, requiredId } from "@/server/api";
import { deleteVideo } from "@/server/videos";

export const dynamic = "force-dynamic";

export const DELETE = adminRoute<{ id: string }>(async ({ params }) => {
  await deleteVideo(requiredId(params.id));
  return { msg: "视频已删除" };
});
