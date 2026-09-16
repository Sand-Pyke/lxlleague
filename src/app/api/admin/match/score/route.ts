import { adminRoute, badRequest, requiredId } from "@/server/api";

import { setScore } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const roundNo = Number(body.roundNo ?? 1);
  const scoreOne = Number(body.scoreOne ?? 0);
  const scoreTwo = Number(body.scoreTwo ?? 0);
  if (![roundNo, scoreOne, scoreTwo].every((value) => Number.isInteger(value)))
    throw badRequest("比分必须是整数");
  if (roundNo < 1) throw badRequest("轮次必须从 1 开始");
  if (scoreOne < 0 || scoreTwo < 0) throw badRequest("比分不能为负数");

  await setScore({
    matchId: requiredId(body.matchId, "缺少赛事ID"),
    roundNo,
    teamOneId: requiredId(body.teamOneId, "参数不完整"),
    teamTwoId: requiredId(body.teamTwoId, "参数不完整"),
    scoreOne,
    scoreTwo,
  });
  return { msg: "战果已保存" };
});
