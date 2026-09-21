import { adminRoute, badRequest, requiredId, unwrap } from "@/server/api";

import { deleteRecord } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) => {
  const result = await deleteRecord(requiredId(params.id));
  if (result.kind === "confirmed") throw badRequest("当前赛事战绩已确认导入，不能删除");
  return unwrap(result, "战绩已删除");
});
