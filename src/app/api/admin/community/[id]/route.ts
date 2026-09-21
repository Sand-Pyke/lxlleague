import { adminRoute, requiredId } from "@/server/api";
import { deleteCommunityComment } from "@/server/community";

export const dynamic = "force-dynamic";

export const DELETE = adminRoute<{ id: string }>(async ({ params }) => {
  await deleteCommunityComment(requiredId(params.id));
  return { msg: "评论已删除" };
});
