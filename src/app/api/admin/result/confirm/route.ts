import { adminRoute, badRequest } from "@/server/api";
import { confirmMatchRecords } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const matchId = Number(body.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) throw badRequest("赛事参数无效");
  const result = await confirmMatchRecords(matchId);
  if (result.kind === "not_found") throw badRequest("赛事不存在");
  return { msg: "当前战绩已确认导入" };
});
