import { adminRoute, requiredId, assertOk } from "@/server/api";

import { endRound } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) => {
  const { roundNo } = assertOk(await endRound(requiredId(params.id)));
  return { msg: `第${roundNo}轮已结束，赛程已更新，可开始第${roundNo + 1}轮`, roundNo };
});
