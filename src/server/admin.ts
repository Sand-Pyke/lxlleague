import {
  BO_OPTIONS as BO_LIST,
  MATCH_STATUSES,
  RANKS,
  REVIEW_STATUSES,
  normalizeRank,
  normalizeSubPosition,
  type ReviewStatus,
} from "@/lib/admin-options";
import { prisma } from "@/lib/prisma";
import { GAME_NAME_HINT, gameTagOf, isValidGameName } from "@/lib/game-name";
import { randomDefaultAvatar } from "@/lib/default-avatars";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { ApiError, badRequest, forbidden, notFound } from "@/server/api";
import { coreAdminUsername, isCoreAdminUsername } from "@/server/auth";
import { assertCanManageUser, isCoreAdminActor } from "@/server/permissions";
import {
  isBracketTeamCount,
  isPosition,
  matchBudget,
  pairTeams,
  rankFee,
  signRank,
  totalRoundsFor,
} from "@/server/roster";
import { listMatchRecords } from "@/server/records";

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** 管理员重置用户密码时统一设置的固定初始密码。 */
const RESET_PASSWORD = "lxl123456";

/** 把前端传来的可空排期时间（ISO 字符串）解析成 Date；未传/空串/非法一律返回 null。 */
function parseMatchDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
      date: parseMatchDate(body.date),
      playerCount: 0,
      teamCount: 0,
    },
  });
  return { msg: "比赛已创建", id: match.id };
}

export async function updateMatch(matchId: number, body: Record<string, unknown>) {
  const match = await requireMatch(matchId);
  const started = match.status !== "CREATED";
  const data: {
    name?: string;
    status?: (typeof MATCH_STATUSES)[number];
    round?: string;
    date?: Date | null;
  } = {};
  const name = asText(body.name);
  if (name && name !== match.name) {
    if (started) throw badRequest("比赛已开始，名称不可再修改");
    data.name = name.slice(0, 100);
  }
  if (MATCH_STATUSES.includes(body.status as (typeof MATCH_STATUSES)[number]))
    data.status = body.status as (typeof MATCH_STATUSES)[number];
  const round = asText(body.round);
  if (round) data.round = round.slice(0, 40);
  // 排期时间可设置、可清空：传空串或 null 即清除，仅在该字段出现时更新。
  if (body.date !== undefined) data.date = parseMatchDate(body.date);
  await prisma.match.update({ where: { id: matchId }, data });
  return { msg: "比赛信息已更新" };
}

export async function setMatchBo(matchId: number, bo: string) {
  const match = await requireMatch(matchId);
  if (match.status !== "CREATED") throw badRequest("赛事已开始，赛制不可再修改");
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

  const teams = await prisma.team.findMany({ where: { matchId }, orderBy: { id: "asc" } });
  // 淘汰赛按轮次自动结束：结束最后一轮时 endRound 会把状态置为 FINISHED，
  // 这里禁止手动结束，避免「还没点结束本轮就能结束赛事」的漏洞。
  if (isBracketTeamCount(teams.length)) {
    throw badRequest("淘汰赛请按轮次结束：录入战果后点击「结束本轮」即可自动结束比赛");
  }

  // 结束前必须录完本场所有战果：非淘汰赛制校验当前轮。
  const finalRound = isBracketTeamCount(teams.length) ? totalRoundsFor(teams.length) : 1;
  const roundNo = Math.max(match.currentRound || 1, finalRound);
  const frozen = await prisma.matchRound.findMany({
    where: { matchId, roundNo },
    orderBy: { id: "asc" },
  });
  const pairs: [number, number][] = frozen.length
    ? frozen.map((row) => [row.teamOneId, row.teamTwoId] as [number, number])
    : roundNo === 1
      ? pairTeams(match, teams).filter((pair): pair is [number, number] => pair[1] !== null)
      : [];
  if (!pairs.length) throw badRequest("该比赛还没有录入赛果，如果提前结束则不会再将该场比赛的结果发送到比赛记录");

  const scores = await prisma.matchScore.findMany({
    where: { matchId, roundNo },
    select: { teamOneId: true, teamTwoId: true },
  });
  const scored = (teamOneId: number, teamTwoId: number) =>
    scores.some(
      (score) =>
        (score.teamOneId === teamOneId && score.teamTwoId === teamTwoId) ||
        (score.teamOneId === teamTwoId && score.teamTwoId === teamOneId),
    );
  if (!pairs.every(([teamOneId, teamTwoId]) => scored(teamOneId, teamTwoId)))
    throw badRequest("该比赛还没有录入赛果，如果提前结束则不会再将该场比赛的结果发送到比赛记录");

  await prisma.match.update({ where: { id: matchId }, data: { status: "FINISHED" } });
  return { msg: "比赛已结束！" };
}

export async function finishPick(matchId: number) {
  const match = await requireMatch(matchId);
  if (match.status !== "CREATED") throw badRequest("只有待选人阶段的赛事才能开赛");
  await prisma.match.update({ where: { id: matchId }, data: { status: "LIVE" } });
  return { msg: "已结束选人，赛事开始！" };
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
  const [teams, signs, scores, frozenRounds] = await Promise.all([
    prisma.team.findMany({ where: { matchId }, orderBy: { id: "asc" } }),
    prisma.matchSignup.findMany({
      where: { matchId },
      orderBy: [{ positionOrder: "asc" }, { id: "asc" }],
      include: {
        user: {
          include: {
            profile: {
              select: {
                rank: true,
                avatar: true,
                mainPosition: true,
                subPosition: true,
                gameName: true,
              },
            },
          },
        },
      },
    }),
    prisma.matchScore.findMany({
      where: { matchId, roundNo: match.currentRound || 1 },
      select: { teamOneId: true, teamTwoId: true, scoreOne: true, scoreTwo: true },
    }),
    prisma.matchRound.findMany({
      where: { matchId, roundNo: match.currentRound || 1 },
      orderBy: { id: "asc" },
    }),
  ]);

  const useFee = Boolean(match.useFee);
  const usedByTeam = new Map<number, number>();
  for (const sign of signs) {
    if (!sign.teamId) continue;
    usedByTeam.set(sign.teamId, (usedByTeam.get(sign.teamId) ?? 0) + rankFee(signRank(sign)));
  }

  // 当前轮的所有对阵（可能同时有多组对战），以及每组是否已录入比分。
  // 第 1 轮之后优先读取已固化的 MatchRound（胜者晋级后的对阵），否则现场生成。
  const roundNo = match.currentRound || 1;
  const roundPairs: [number, number][] = frozenRounds.length
    ? frozenRounds.map((row) => [row.teamOneId, row.teamTwoId])
    : pairTeams(match, teams).filter((pair): pair is [number, number] => pair[1] !== null);
  const scoreOf = (teamOneId: number, teamTwoId: number) => {
    const direct = scores.find(
      (score) => score.teamOneId === teamOneId && score.teamTwoId === teamTwoId,
    );
    if (direct) return [direct.scoreOne, direct.scoreTwo] as const;
    const swapped = scores.find(
      (score) => score.teamOneId === teamTwoId && score.teamTwoId === teamOneId,
    );
    if (swapped) return [swapped.scoreTwo, swapped.scoreOne] as const;
    return null;
  };
  const round_pairs = roundPairs.map(([teamOneId, teamTwoId]) => {
    const score = scoreOf(teamOneId, teamTwoId);
    return {
      team_one: teamOneId,
      team_two: teamTwoId,
      score_one: score ? score[0] : 0,
      score_two: score ? score[1] : 0,
      has_score: Boolean(score),
    };
  });
  const has_score = round_pairs.length > 0 && round_pairs.every((pair) => pair.has_score);

  return {
    match: {
      id: match.id,
      name: match.name,
      status: match.status,
      use_fee: useFee,
      bo: match.bo || "BO1",
      total_rounds: isBracketTeamCount(teams.length) ? totalRoundsFor(teams.length) : 1,
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
      game_name: sign.user.profile?.gameName ?? "",
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
    current_round: roundNo,
    has_score,
    round_pairs,
    budget: useFee ? await matchBudget(matchId) : 0,
  };
}

/**
 * 管理员视角的用户列表（含审核状态与游戏资料）。
 * 核心管理员（admin 账号）是系统账号，永远不进入用户管理列表；
 * 当前登录的管理员自己也不列进去：自己的账号在这里既管不了、也没必要看。
 */
export async function adminUserList(viewerId?: number) {
  const users = await prisma.user.findMany({
    where: {
      username: { not: coreAdminUsername },
      ...(viewerId ? { id: { not: viewerId } } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      username: true,
      isAdmin: true,
      status: true,
      reviewNote: true,
      pendingRank: true,
      kookName: true,
      banUntil: true,
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
 * 管理员账号不能被置为非 APPROVED，避免把自己锁在门外；
 * 除核心管理员外，任何人都不能审核其他管理员账号。
 */
export async function setUserStatus(userId: number, status: unknown, actorId: number) {
  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) throw badRequest("审核参数无效");
  await assertCanManageUser(actorId, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, username: true, pendingRank: true },
  });
  if (!user) throw notFound("用户不存在");
  const next = status as ReviewStatus;
  if (isCoreAdminUsername(user.username))
    throw new ApiError(403, "不能修改超级vip管理员账号的审核状态");
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

/**
 * 批量通过审核：把一批待审核账号一次性置为 APPROVED。
 * 先整体校验（存在性、权限、状态、管理员边界），全部通过后再逐个落库，
 * 避免校验到一半就改数据造成「部分成功」的尴尬状态。
 */
export async function batchApproveUsers(userIds: unknown, actorId: number) {
  const ids = Array.isArray(userIds)
    ? Array.from(new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)))
    : [];
  if (!ids.length) throw badRequest("请先选择要审核的账号");
  if (ids.length > 100) throw badRequest("单次最多审核 100 个账号");

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, isAdmin: true, username: true, status: true, pendingRank: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  for (const id of ids) {
    const user = byId.get(id);
    if (!user) throw notFound(`用户 #${id} 不存在`);
    if (isCoreAdminUsername(user.username))
      throw new ApiError(403, "不能修改超级vip管理员账号的审核状态");
    if (user.isAdmin) throw new ApiError(409, `管理员账号 ${user.username} 不需要审核`);
    if (user.status !== "PENDING")
      throw badRequest(`账号 ${user.username} 不是待审核状态，无法批量通过`);
    await assertCanManageUser(actorId, id);
  }

  for (const id of ids) {
    const user = byId.get(id)!;
    if (user.pendingRank) await writeUserRank(id, user.username, user.pendingRank);
    await prisma.user.update({
      where: { id },
      // 与单个通过一致：审核结束后清掉待审段位与备注。
      data: { status: "APPROVED", pendingRank: "", reviewNote: "" },
    });
  }
  return { msg: `已批量通过 ${ids.length} 个账号`, count: ids.length };
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
export async function setUserRank(userId: number, rank: string, actorId: number) {
  if (!RANKS.includes(rank)) throw badRequest("段位不合法");
  await assertCanManageUser(actorId, userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");

  const stored = await writeUserRank(userId, user.username, rank);
  await prisma.user.update({
    where: { id: userId },
    data: { pendingRank: "", reviewNote: "" },
  });
  return { msg: `已将 ${user.username} 段位改为「${stored || "未设置"}」` };
}

export async function setUserGameName(userId: number, gameName: string, actorId: number) {
  await assertCanManageUser(actorId, userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");
  // 允许清空（留空表示还未填写），但填了就必须符合 名称#数字编号 的格式。
  const value = gameName.trim();
  if (value && !isValidGameName(value)) throw badRequest(`游戏ID格式不正确：${GAME_NAME_HINT}`);
  if (value) {
    // 名称可重复，但 # 后的数字编号全局唯一：先查重，再兜底数据库唯一索引的并发冲突。
    const tag = gameTagOf(value);
    const existing = await prisma.playerProfile.findFirst({
      where: { gameName: { endsWith: `#${tag}`, mode: "insensitive" }, userId: { not: userId } },
      select: { userId: true },
    });
    if (existing) throw badRequest("该数字编号已被其他选手使用");
  }
  try {
    await prisma.playerProfile.upsert({
      where: { userId },
      update: { gameName: value },
      create: { userId, name: user.username, gameName: value, avatar: randomDefaultAvatar() },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw badRequest("该数字编号已被其他选手使用");
    }
    throw error;
  }
  return { msg: `已设置 ${user.username} 的游戏ID：${value || "(空)"}` };
}

/**
 * 重置用户密码（仅核心管理员可用）：统一重置为固定密码 lxl123456，
 * 普通管理员一律无权限，且不能重置自己的密码。
 */
export async function resetUserPassword(userId: number, actorId: number) {
  if (!(await isCoreAdminActor(actorId))) throw forbidden("只有超级vip管理员才能重置密码");
  if (userId === actorId) throw badRequest("不能重置自己的密码");
  const target = await assertCanManageUser(actorId, userId);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(RESET_PASSWORD, 12) },
  });
  return { msg: `已将 ${target.username} 的密码重置为 ${RESET_PASSWORD}` };
}

/**
 * 调整管理员权限：只有核心管理员能操作，且不能改自己
 * （核心管理员一旦取消自己的权限就再也无法恢复，只能改数据库）。
 */
export async function setUserAdmin(userId: number, isAdmin: boolean, actorId: number) {
  if (!(await isCoreAdminActor(actorId))) throw forbidden("只有超级vip管理员可以调整管理员权限");
  if (userId === actorId) throw badRequest("不能修改自己的管理员权限");
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

/**
 * 处罚用户：限制其报名（banUntil 之前禁止报名）。
 * 普通管理员只能处罚普通用户；管理员账号只有核心管理员（admin）能处罚，
 * 核心管理员账号（admin）本身不可被处罚。
 */
export async function banUser(userId: number, days: number, actorId: number) {
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw badRequest("处罚天数需为 1-3650 之间的整数");
  const target = await assertCanManageUser(actorId, userId);
  if (isCoreAdminUsername(target.username)) throw forbidden("不能处罚超级vip管理员账号");
  // 已报名未结束赛事的用户不能处罚：先取消报名（或等赛事结束）再处罚。
  const activeSignups = await prisma.matchSignup.findMany({
    where: { userId, match: { status: { in: ["CREATED", "LIVE"] } } },
    select: { match: { select: { name: true } } },
  });
  if (activeSignups.length) {
    const names = activeSignups.map((sign) => sign.match.name);
    const shown =
      names.length > 3 ? `${names.slice(0, 3).join("、")} 等 ${names.length} 个赛事` : names.join("、");
    throw badRequest(`该用户已报名「${shown}」，暂时不能处罚`);
  }
  const banUntil = new Date(Date.now() + days * 86400000);
  await prisma.user.update({ where: { id: userId }, data: { banUntil } });
  return { msg: `已处罚 ${target.username}，${days} 天内禁止报名` };
}

/** 解除处罚：立即恢复报名资格。 */
export async function unbanUser(userId: number, actorId: number) {
  const target = await assertCanManageUser(actorId, userId);
  await prisma.user.update({ where: { id: userId }, data: { banUntil: null } });
  return { msg: `已解除 ${target.username} 的处罚` };
}

/**
 * 删除用户：先清报名并同步各赛事人数，再删账号（资料/战绩随外键级联删除）。
 * 管理员账号只有核心管理员能删。
 */
export async function deleteUser(userId: number, currentUserId: number) {
  // 删除用户是高风险操作：只有核心管理员（admin）能删，普通管理员一律拒绝。
  if (!(await isCoreAdminActor(currentUserId))) {
    throw forbidden("只有超级vip管理员才能删除用户");
  }
  if (userId === currentUserId) throw badRequest("不能删除当前登录的管理员账号");
  await assertCanManageUser(currentUserId, userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("用户不存在");
  if (isCoreAdminUsername(user.username)) throw new ApiError(403, "不能删除超级vip管理员账号");

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

/** 后台调整某条报名的位置（主/副位置），省去「取消报名再重新报名」。 */
export async function changeSignupPosition(
  signupId: number,
  mainPosition: unknown,
  subPosition: unknown,
) {
  const signup = await prisma.matchSignup.findUnique({
    where: { id: signupId },
    include: { match: { select: { status: true } } },
  });
  if (!signup) throw notFound("报名记录不存在");
  if (signup.match.status !== "CREATED") throw badRequest("赛事已开始，不能调整报名位置");
  assertSignupPayload(mainPosition, subPosition);
  const main = String(mainPosition);
  const sub = normalizeSubPosition(main, String(subPosition));
  await prisma.matchSignup.update({
    where: { id: signupId },
    data: { mainPosition: main, subPosition: sub },
  });
  return { msg: "报名位置已更新" };
}

/** 待选人赛事的全部报名记录（后台「报名记录」Tab）。 */
export async function signupList() {
  const signups = await prisma.matchSignup.findMany({
    where: { match: { status: "CREATED" } },
    orderBy: [{ matchId: "desc" }, { id: "asc" }],
    include: {
      user: { select: { id: true, username: true, profile: { select: { gameName: true } } } },
      match: { select: { id: true, name: true } },
    },
  });
  return {
    signup_list: signups.map((signup) => ({
      sign_id: signup.id,
      user_id: signup.userId,
      username: signup.user.username,
      game_name: signup.user.profile?.gameName ?? "",
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
