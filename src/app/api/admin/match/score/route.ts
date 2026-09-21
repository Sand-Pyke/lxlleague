import { adminRoute, badRequest, requiredId } from "@/server/api";

import { boScoreHint, isValidBoScore } from "@/lib/admin-options";
import { prisma } from "@/lib/prisma";
import { setScore } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const matchId = requiredId(body.matchId, "缺少赛事ID");
  const roundNo = Number(body.roundNo ?? 1);
  const scoreOne = Number(body.scoreOne ?? 0);
  const scoreTwo = Number(body.scoreTwo ?? 0);
  if (![roundNo, scoreOne, scoreTwo].every((value) => Number.isInteger(value)))
    throw badRequest("比分必须是整数");
  if (roundNo < 1) throw badRequest("轮次必须从 1 开始");
  if (scoreOne < 0 || scoreTwo < 0) throw badRequest("比分不能为负数");

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw badRequest("赛事不存在");
  if (match.status === "CREATED") throw badRequest("待选人阶段不能录入战果");
  if (!isValidBoScore(match.bo, scoreOne, scoreTwo)) throw badRequest(boScoreHint(match.bo));

  const teamOneId = requiredId(body.teamOneId, "参数不完整");
  const teamTwoId = requiredId(body.teamTwoId, "参数不完整");
  const existing = await prisma.matchScore.findFirst({
    where: {
      matchId,
      roundNo,
      OR: [
        { teamOneId, teamTwoId },
        { teamOneId: teamTwoId, teamTwoId: teamOneId },
      ],
    },
  });
  if (existing) throw badRequest("该对战已录入战果，不能修改");

  await setScore({ matchId, roundNo, teamOneId, teamTwoId, scoreOne, scoreTwo });
  return { msg: "战果已保存" };
});
