import { adminRoute, badRequest } from "@/server/api";

import { batchAddRecords } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > 10) throw badRequest("请填写1-10名玩家数据");
  // matchId 允许为 0，表示录入不挂靠赛事的自由对局
  const matchId = Number(body.matchId ?? 0) > 0 ? Number(body.matchId) : 0;
  const { ok, errors } = await batchAddRecords(matchId, rows);
  return {
    msg: errors.length ? `成功录入 ${ok} 条，${errors.length} 条失败` : `成功录入 ${ok} 条战绩`,
    ok,
    errors,
  };
});
