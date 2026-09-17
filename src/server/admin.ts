import {
  BO_OPTIONS as BO_LIST,
  MATCH_STATUSES,
  RANKS,
  REVIEW_STATUSES,
  normalizeRank,
  type ReviewStatus,
} from "@/lib/admin-options";
import { prisma } from "@/lib/prisma";
import { GAME_NAME_HINT, isValidGameName } from "@/lib/game-name";
import { passwordFormatError } from "@/lib/credentials";
import { randomDefaultAvatar } from "@/lib/default-avatars";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { ApiError, badRequest, notFound } from "@/server/api";
import { isPosition, matchBudget, rankFee, signRank } from "@/server/roster";
import { listMatchRecords } from "@/server/records";

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function normalizeOptionalId(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === 0) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireMatch(matchId: number) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw notFound("赛事不存在");
  return match;
}

export async function createMatch(body: Record<string, unknown>) {
  const name = asText(body.name);
  if (!name) throw badRequest("比赛名称不能为空");

  const status = MATCH_STATUSES.includes(body.status as (typeof MATCH_STATUSES)[number])
    ? (body.status as (typeof MATCH_STATUSES)[number])
    : "CREATED";
  const bo = BO_LIST.includes(asText(body.bo)) ? asText(body.bo) : "BO1";
  const round = asText(body.round) || "常规赛";

  const match = await prisma.match.create({
    data: {
      name: name.slice(0, 100),
      status,
      bo,
      round: round.slice(0, 40),
      useFee: body.use_fee === undefined ? true : Boolean(body.use_fee),
      date: new Date(),
      playerCount: 0,
      teamCount: 0,
    },
  });
  return { msg: "比赛已创建", id: match.id };
}

export async function updateMatch(matchId: number, body: Record<string, unknown>) {
  await requireMatch(matchId);
  const data: { name?: string; status?: (typeof MATCH_STATUSES)[number]; round?: string } = {};
  const name = asText(body.name);
  if (name) data.name = name.slice(0, 100);
  if (MATCH_STATUSES.includes(body.status as (typeof MATCH_STATUSES)[number]))
    data.status = body.status as (typeof MATCH_STATUSES)[number];
  const round = asText(body.round);
  if (round) data.round = round.slice(0, 40);
  await prisma.match.update({ where: { id: matchId }, data });
  return { msg: "比赛信息已更新" };
}

export async function setMatchBo(matchId: number, bo: string) {
  await requireMatch(matchId);
  if (!BO_LIST.includes(bo)) throw badRequest("赛制无效");
  await prisma.match.update({ where: { id: matchId }, data: { bo } });
  return { msg: `赛制已改为 ${bo}` };
}

export async function setMatchFee(matchId: number, useFee: boolean) {
  await requireMatch(matchId);
  const match = await prisma.match.update({ where: { id: matchId }, data: { useFee } });
  return { msg: "已更新选费设置", use_fee: match.useFee };
}

export async function setMatchLive(matchId: number, liveUrl: string) {
  await requireMatch(matchId);
  const url = liveUrl.trim();
  if (url && !url.startsWith("http://") && !url.startsWith("https://"))
    throw badRequest("链接必须以 http:// 或 https:// 开头");
  if (url.length > 300) throw badRequest("链接过长");
  await prisma.match.update({ where: { id: matchId }, data: { liveUrl: url } });
  return { msg: "直播链接已保存" };
}

export async function finishMatch(matchId: number) {
  const match = await requireMatch(matchId);
  if (match.status !== "LIVE") throw badRequest("只有进行中的赛事才能结束");
  await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED" } });
  return { msg: "比赛已结束！" };
}

export async function finishPick(matchId: number) {
  await requireMatch(matchId);
  await prisma.match.update({ where: { id: matchId }, data: { status: "LIVE" } });
  return { msg: "已结束选人，赛事开始！" };
}

export async function pickTeams(matchId: number, teamOneId: unknown, teamTwoId: unknown) {
  await requireMatch(matchId);
  const t1 = normalizeOptionalId(teamOneId);
  const t2 = normalizeOptionalId(teamTwoId);
  if (t1 !== null && t1 === t2) throw badRequest("两支队伍不能相同");
  for (const id of [t1, t2]) {
    if (id === null) continue;
    const team = await prisma.team.findUnique({ where: { id } });
    if (!team || team.matchId !== matchId) throw badRequest("队伍不属于该赛事");
  }
  await prisma.match.update({ where: { id: matchId }, data: { teamOneId: t1, teamTwoId: t2 } });
  return { msg: "对战队伍已保存" };
}

/** 删除赛事并级联清理报名 / 队伍 / 战绩 / 轮次 / 战果。 */
export async function deleteMatch(matchId: number) {
  await requireMatch(matchId);
  await prisma.$transaction([
    prisma.matchGameRecord.deleteMany({ where: { matchId } }),
    prisma.matchScore.deleteMany({ where: { matchId } }),
    prisma.matchRound.deleteMany({ where: { matchId } }),
    prisma.matchSignup.deleteMany({ where: { matchId } }),
    prisma.team.deleteMany({ where: { matchId } }),
    prisma.match.delete({ where: { id: matchId } }),
  ]);
  return { msg: "比赛已删除" };
}

/** 后台分队看板：队伍 + 每队已用费用 + 报名列表（含段位费用）。 */
export async function teamsBoard(matchId: number) {
  const match = await requireMatch(matchId);
  const [teams, signs] = await Promise.all([
    prisma.team.findMany({ where: { matchId }, orderBy: { id: "asc" } }),
    prisma.matchSignup.findMany({
      where: { matchId },
      orderBy: [{ positionOrder: "asc" }, { id: "asc" }],
      include: {
        user: {
          include: {
            profile: {
              select: { rank: true, avatar: true, mainPosition: true, subPosition: true },
            },
          },
        },
      },
    }),
  ]);

  const useFee = Boolean(match.useFee);
  const usedByTeam = new Map<number, number>();
  for (const sign of signs) {
    if (!sign.teamId) continue;
    usedByTeam.set(sign.teamId, (usedByTeam.get(sign.teamId) ?? 0) + rankFee(signRank(sign)));
  }

  return {
    match: {
      id: match.id,
      name: match.name,
      status: match.status,
      team1_id: match.teamOneId,
      team2_id: match.teamTwoId,
      use_fee: useFee,
      bo: match.bo || "BO1",
    },
    teams: teams.map((team) => ({
      id: team.id,
      match_id: team.matchId,
      name: team.name,
      player_count: signs.filter((sign) => sign.teamId === team.id).length,
      used_fee: usedByTeam.get(team.id) ?? 0,
    })),
    signs: signs.map((sign) => ({
      id: sign.id,
      user_id: sign.userId,
      username: sign.user.username,
      yy_name: sign.displayName,
      avatar: sign.user.profile?.avatar ?? "",
      rank: signRank(sign),
      main_pos: sign.mainPosition,
      sub_pos: sign.subPosition,
      can_substitute: sign.canSubstitute,
      team_id: sign.teamId,
      team_pos: sign.teamPosition,
      pos_order: sign.positionOrder,
      fee: rankFee(signRank(sign)),
    })),
    current_round: match.currentRound || 1,
    budget: useFee ? await matchBudget(matchId) : 0,
  };
}

/**
 * 管理员视角的用户列表（含审核状态与游戏资料）。
 * 当前登录的管理员自己不列进去：自己的账号在这里既管不了、也没必要看。
 */
export async function adminUserList(viewerId?: number) {
  const users = await prisma.user.findMany({
    where: viewerId ? { id: { not: viewerId } } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      username: true,
      isAdmin: true,
      status: true,
      reviewNote: true,
      pendingRank: true,
      kookName: true,
      createdAt: true,
      profile: {
        select: {
          gameName: true,
          rank: true,
          mainPosition: true,
          subPosition: true,
          avatar: true,
        },
      },
    },
  });
  return { users };
}

/**
 * 审核用户。段位是注册时提交、审核通过后锁定的资料：
 * 用户申请修改段位后会在 pendingRank 里挂一笔待审的新值，
 * 只有「通过」才真正写进资料；拒绝或打回则保留原段位。
 * 管理员账号不能被置为非 APPROVED，避免把自己锁在门外。
 */
export async function setUserStatus(userId: number, status: unknown) {
  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) throw badRequest("审核参数无效");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, username: true, pendingRank: true },
  });
  if (!user) throw notFound("用户不存在");
  const next = status as ReviewStatus;
  if (user.isAdmin && next !== "APPROVED")
    throw new ApiError(409, "管理员账号不能被拒绝或设为待审核");

  if (next === "APPROVED" && user.pendingRank) {
    await writeUserRank(userId, user.username, user.pendingRank);
  }
  await prisma.user.update({
    where: { id: userId },
    // 审核结束后清掉待审段位与备注，避免同一次申请被重复应用。
    data: { status: next, pendingRank: "", reviewNote: "" },
  });
  return { msg: "审核状态已更新", status: next };
}

/** 把段位落到资料上并同步历史报名快照；「未定段」统一折算成空串。 */
async function writeUserRank(userId: number, username: string, rank: string) {
  const stored = normalizeRank(rank);
  await prisma.$transaction([
    prisma.playerProfile.upsert({
      where: { userId },
      update: { rank: stored },
      create: { userId, name: username, gameName: "", rank: stored, avatar: randomDefaultAvatar() },
    }),
    prisma.matchSignup.updateMany({ where: { userId }, data: { rankAtSignup: stored } }),
  ]);
  return stored;
}

/** 管理员直接改段位：同时清掉待审的段位申请，避免旧申请被重复应用。 */
export async function setUserRank(userId: number, rank: string) {
  if (!RANKS.includes(rank)) throw badRequest("段位不合法");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");

  const stored = await writeUserRank(userId, user.username, rank);
  await prisma.user.update({
    where: { id: userId },
    data: { pendingRank: "", reviewNote: "" },
  });
  return { msg: `已将 ${user.username} 段位改为「${stored || "未设置"}」` };
}

export async function setUserGameName(userId: number, gameName: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");
  // 允许清空（留空表示还未填写），但填了就必须符合 名称#数字编号 的格式。
  const value = gameName.trim();
  if (value && !isValidGameName(value)) throw badRequest(`游戏ID格式不正确：${GAME_NAME_HINT}`);
  await prisma.playerProfile.upsert({
    where: { userId },
    update: { gameName: value },
    create: { userId, name: user.username, gameName: value, avatar: randomDefaultAvatar() },
  });
  return { msg: `已设置 ${user.username} 的游戏ID：${value || "(空)"}` };
}

/** 管理员重置密码（原 /api/admin/reset_pwd）。 */
export async function resetUserPassword(userId: number, password: string) {
  const passwordError = passwordFormatError(typeof password === "string" ? password : "");
  if (passwordError) throw badRequest(passwordError);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user) throw badRequest("用户不存在");
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  return { msg: `用户 ${user.username} 密码重置成功` };
}

export async function setUserAdmin(userId: number, isAdmin: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");
  await prisma.user.update({ where: { id: userId }, data: { isAdmin } });
  return { msg: `已将 ${user.username} ${isAdmin ? "设为管理员" : "取消管理员"}` };
}

/** 读取当前管理员自己的导入令牌（LCU agent 用）。 */
export async function importToken(adminId: number) {
  const user = await prisma.user.findUnique({
    where: { id: adminId },
    select: { importToken: true },
  });
  if (!user) throw notFound("用户不存在");
  return { token: user.importToken };
}

/** 重新生成导入令牌：旧令牌立即失效。 */
export async function rotateImportToken(adminId: number) {
  const user = await prisma.user.findUnique({
    where: { id: adminId },
    select: { username: true },
  });
  if (!user) throw notFound("用户不存在");
  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: adminId }, data: { importToken: token } });
  return { token, msg: `导入令牌已重置，旧令牌立即失效` };
}

/** 删除用户：先清报名并同步各赛事人数，再删账号（资料/战绩随外键级联删除）。 */
export async function deleteUser(userId: number, currentUserId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");
  if (userId === currentUserId) throw badRequest("不能删除当前登录的管理员账号");

  const signups = await prisma.matchSignup.findMany({ where: { userId } });
  await prisma.$transaction(async (tx) => {
    for (const signup of signups) {
      await tx.match.update({
        where: { id: signup.matchId },
        data: { playerCount: { decrement: 1 } },
      });
    }
    await tx.matchSignup.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });
  return { msg: "用户删除成功" };
}

export async function cancelSignup(signupId: number) {
  const signup = await prisma.matchSignup.findUnique({ where: { id: signupId } });
  if (!signup) throw notFound("报名记录不存在");
  await prisma.$transaction([
    prisma.matchSignup.delete({ where: { id: signupId } }),
    prisma.match.update({ where: { id: signup.matchId }, data: { playerCount: { decrement: 1 } } }),
  ]);
  return { msg: "已取消该选手报名" };
}

/** 待选人赛事的全部报名记录（后台「报名记录」Tab）。 */
export async function signupList() {
  const signups = await prisma.matchSignup.findMany({
    where: { match: { status: "CREATED" } },
    orderBy: [{ matchId: "desc" }, { id: "asc" }],
    include: {
      user: { select: { id: true, username: true } },
      match: { select: { id: true, name: true } },
    },
  });
  return {
    signup_list: signups.map((signup) => ({
      sign_id: signup.id,
      user_id: signup.userId,
      username: signup.user.username,
      match_id: signup.matchId,
      match_name: signup.match.name,
      yy_name: signup.displayName,
      main_pos: signup.mainPosition,
      sub_pos: signup.subPosition,
      can_substitute: signup.canSubstitute,
    })),
  };
}

export async function listMatchRecordsForAdmin(matchId: number) {
  return { records: await listMatchRecords(matchId), match_id: matchId };
}

/** 报名时的字段校验（原 /api/match/signup 规则）。 */
export function assertSignupPayload(mainPosition: unknown, subPosition: unknown) {
  if (!isPosition(mainPosition)) throw new ApiError(400, "主位置不合法");
  if (!isPosition(subPosition) && subPosition !== "无") throw new ApiError(400, "副位置不合法");
}
