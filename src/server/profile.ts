import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlayers } from "@/lib/repository";
import { coreAdminLabel, getSessionUser, isCoreAdminUsername } from "@/server/auth";
import { ensureProfile } from "@/server/account";
import { listPlayerCards, profileOverview } from "@/server/records";

/**
 * 个人主页数据：?uid=X 公开查看任意选手，不带 uid 看自己（需登录）。
 * 口径与旧项目一致：统计按全部战绩聚合，排名与选手中心的积分榜同序。
 */
export async function getProfile(request: NextRequest) {
  const viewer = await getSessionUser(request);
  const raw = request.nextUrl.searchParams.get("uid");
  const uid = Number(raw);
  const targetId = raw && Number.isInteger(uid) && uid > 0 ? uid : viewer?.id;

  if (!targetId) return NextResponse.json({ msg: "请先登录" }, { status: 401 });

  const isSelf = viewer?.id === targetId;
  if (isSelf) await ensureProfile(targetId);

  const [overview, cards] = await Promise.all([
    profileOverview(targetId, isSelf),
    listPlayerCards(),
  ]);
  if (!overview) return NextResponse.json({ msg: "用户不存在" }, { status: 404 });

  const account = await prisma.user.findUnique({
    where: { id: targetId },
    select: { isAdmin: true, status: true, pendingRank: true, reviewNote: true },
  });
  const index = cards.findIndex((card) => card.id === targetId);
  // 核心管理员是系统账号而非选手，前端据此隐藏段位/位置/排名与数据面板。
  const isCoreAdmin = isCoreAdminUsername(overview.player.username);

  return NextResponse.json({
    isSelf,
    is_core_admin: isCoreAdmin,
    user: {
      ...overview.player,
      // 界面名称换成「超级vip管理员」；username（登录用的账户ID）保持真实值。
      name: isCoreAdmin ? coreAdminLabel : overview.player.name,
      is_admin: account?.isAdmin ?? false,
      status: account?.status ?? "",
      // 审核进度只对本人有意义，看别人的主页时不外泄。
      pending_rank: isSelf ? (account?.pendingRank ?? "") : "",
      review_note: isSelf ? (account?.reviewNote ?? "") : "",
    },
    stats: overview.stats,
    heroes: overview.heroes,
    ranking: index >= 0 ? index + 1 : 0,
    ranking_total: cards.length,
    match_history: overview.history,
    records: [],
  });
}

export async function listUsers() {
  return NextResponse.json({ user_list: await getPlayers() });
}
