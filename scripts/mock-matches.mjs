import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Mock 三场赛事 + 40 名选手：
 *  - 季后赛淘汰赛（BO3）：8 队 / 40 人
 *  - 9/19 常规赛（BO3）：4 队 / 20 人
 *  - S16 全球总决赛（BO5）：8 队 / 40 人
 *
 * 现在库里没有用户，这里按注册流程的落库形态建号（哈希密码 + 完整资料 + 审核通过），
 * 再建赛事、队伍，并把选手按 5 人一队分好位置。
 * 幂等：再次运行会先清掉同名的 mock 赛事与 mock* 账户。
 */
const prisma = new PrismaClient();

const POSITIONS = ["TOP", "JUG", "MID", "ADC", "SUP"];
const RANKS = ["黑铁", "青铜", "白银", "黄金", "铂金", "翡翠", "钻石", "大师", "宗师", "王者"];
const TEAM_CODES = ["BLG", "C9", "DK", "DRX", "EDG", "G2", "GENG", "HLE"];
const PASSWORD = "mock1234";
const TOTAL_USERS = 40;

const MATCHES = [
  { name: "季后赛淘汰赛", bo: "BO3", round: "季后赛", teams: 8, players: 40, daysAhead: 2, hour: 19 },
  { name: "9/19 常规赛", bo: "BO3", round: "常规赛", teams: 4, players: 20, daysAhead: 0, hour: 20 },
  { name: "S16 全球总决赛", bo: "BO5", round: "全球总决赛", teams: 8, players: 40, daysAhead: 3, hour: 18 },
];

const pad = (n, width = 2) => String(n).padStart(width, "0");

function schedule(daysAhead, hour) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function cleanup() {
  await prisma.match.deleteMany({ where: { name: { in: MATCHES.map((m) => m.name) } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: "mock" } } });
}

async function main() {
  await cleanup();

  // 1. 走注册流程：建 40 个账户（密码哈希 + 资料 + 已审核）
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const userIds = [];
  for (let i = 1; i <= TOTAL_USERS; i++) {
    const idx = pad(i);
    const user = await prisma.user.create({
      data: {
        username: `mock${idx}`,
        passwordHash,
        status: "APPROVED",
        kookName: `KOOK${idx}`,
        profile: {
          create: {
            name: `选手${idx}`,
            gameName: `选手${idx}#${10000 + i}`,
            mainPosition: POSITIONS[(i - 1) % POSITIONS.length],
            subPosition: POSITIONS[i % POSITIONS.length],
            rank: RANKS[(i - 1) % RANKS.length],
            bio: `Mock 选手 ${idx}`,
            avatar: `/assets/avatars/default/emoji-${pad(((i - 1) % 24) + 1)}.svg`,
          },
        },
      },
    });
    userIds.push(user.id);
  }
  console.log(`已注册 ${TOTAL_USERS} 名 mock 选手（mock01 ~ mock40，密码 ${PASSWORD}）`);

  // 2. 建赛事、队伍，并把选手按 5 人一队分好位置
  for (const spec of MATCHES) {
    const match = await prisma.match.create({
      data: {
        name: spec.name,
        bo: spec.bo,
        round: spec.round,
        status: "CREATED",
        useFee: true,
        currentRound: 1,
        date: schedule(spec.daysAhead, spec.hour),
        playerCount: spec.players,
        teamCount: spec.teams,
      },
    });

    const teamIds = [];
    for (let t = 0; t < spec.teams; t++) {
      const team = await prisma.team.create({
        data: { matchId: match.id, name: TEAM_CODES[t] },
      });
      teamIds.push(team.id);
    }

    // 按费用均衡分队（LPT 贪心）：费用从高到低，依次塞给当前费用最低、且未满 5 人的队伍，
    // 避免像之前那样「奇数队全是低费、偶数队全是高费」导致一半队伍超预算。
    const feeOf = (p) => (p % RANKS.length) + 1;
    const ordered = Array.from({ length: spec.players }, (_, p) => p).sort(
      (a, b) => feeOf(b) - feeOf(a),
    );
    const teamFee = new Array(spec.teams).fill(0);
    const teamMembers = Array.from({ length: spec.teams }, () => []);
    for (const p of ordered) {
      const target = teamMembers.reduce((best, members, t) => {
        if (members.length >= 5) return best;
        if (best === -1 || teamFee[t] < teamFee[best]) return t;
        return best;
      }, -1);
      teamFee[target] += feeOf(p);
      teamMembers[target].push(p);
    }

    for (let t = 0; t < spec.teams; t++) {
      for (let slot = 0; slot < teamMembers[t].length; slot++) {
        const p = teamMembers[t][slot];
        const position = POSITIONS[slot];
        await prisma.matchSignup.create({
          data: {
            userId: userIds[p],
            matchId: match.id,
            displayName: `选手${pad(p + 1)}`,
            mainPosition: position,
            subPosition: "FILL",
            rankAtSignup: RANKS[p % RANKS.length],
            canSubstitute: false,
            teamId: teamIds[t],
            teamPosition: position,
            positionOrder: slot,
          },
        });
      }
    }

    console.log(
      `赛事「${spec.name}」：${spec.teams} 队 / ${spec.players} 人，时间 ${match.date.toLocaleString("zh-CN")}`,
    );
  }

  console.log("Mock 数据全部就绪。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
