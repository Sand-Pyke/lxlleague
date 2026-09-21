import { adminRoute, requiredId, assertOk } from "@/server/api";

import { endRound } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) => {
  const outcome = assertOk(await endRound(requiredId(params.id)));
  if (outcome.finished) {
    return { msg: `决赛结束，第${outcome.roundNo}轮战果已固化，赛事圆满收官！`, roundNo: outcome.roundNo, finished: true };
  }
  return {
    msg: `第${outcome.roundNo}轮已结束，胜者已晋级第${outcome.roundNo + 1}轮`,
    roundNo: outcome.roundNo,
    finished: false,
  };
});
