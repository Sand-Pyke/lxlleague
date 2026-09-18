import { adminRoute, badRequest } from "@/server/api";

import { deleteRecords } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) throw badRequest("请选择要删除的战绩");
  const { deleted } = await deleteRecords(ids);
  return { msg: `已删除 ${deleted} 条战绩`, deleted };
});
