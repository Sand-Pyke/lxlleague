import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FEE = {
  黑铁: 1, 青铜: 2, 白银: 3, 黄金: 4, 铂金: 5,
  翡翠: 6, 钻石: 7, 大师: 8, 宗师: 9, 王者: 10, 未定段: 0, "": 0,
};

const feeOf = (sign) => FEE[sign.user?.profile?.rank ?? sign.rankAtSignup ?? ""] ?? 0;

const matchNames = ["季后赛淘汰赛", "9/19 常规赛", "S16 全球总决赛"];

for (const name of matchNames) {
  await inspect(name);
  console.log("");
}

async function inspect(name) {
  const match = await prisma.match.findFirst({ where: { name } });
  if (!match) {
    console.log(`match not found: ${name}`);
    return;
  }

  const teams = await prisma.team.findMany({ where: { matchId: match.id }, orderBy: { id: "asc" } });
  const signs = await prisma.matchSignup.findMany({
    where: { matchId: match.id },
    include: { user: { include: { profile: { select: { rank: true } } } } },
  });

  const total = signs.reduce((sum, sign) => sum + feeOf(sign), 0);
  const budget = Math.ceil(total / teams.length) + 1;

  console.log(`赛事: ${match.name}（BO 不在此处，${match.bo}）`);
  console.log(`队伍数: ${teams.length}  报名数: ${signs.length}`);
  console.log(`总费用: ${total}  预算 = ceil(${total}/${teams.length}) + 1 = ${budget}`);

  for (const team of teams) {
    const members = signs.filter((sign) => sign.teamId === team.id);
    const fee = members.reduce((sum, sign) => sum + feeOf(sign), 0);
    console.log(
      `  ${team.name}: ${members.length} 人, 费用 ${fee} ${fee > budget ? "← 超预算" : ""}`,
    );
  }
}

await prisma.$disconnect();
