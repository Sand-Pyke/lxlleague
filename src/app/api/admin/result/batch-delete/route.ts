import { adminRoute, badRequest } from "@/server/api";

import { deleteRecords } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) throw badRequest("请选择要删除的战绩");
  const result = await deleteRecords(ids);
  if (result.kind === "confirmed") throw badRequest("当前赛事战绩已确认导入，不能删除");
  const { deleted } = result;
  return { msg: `已删除 ${deleted} 条战绩`, deleted };
});
