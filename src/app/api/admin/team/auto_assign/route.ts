import { adminRoute, requiredId, assertOk } from "@/server/api";

import { autoAssign } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const { assigned } = assertOk(await autoAssign(requiredId(body.matchId)));
  return { msg: `智能分配完成，共分配 ${assigned} 名选手（每轮费用最低队伍优先）`, assigned };
});
