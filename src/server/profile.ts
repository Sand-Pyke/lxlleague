import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlayers } from "@/lib/repository";
import { getSessionUser } from "@/server/auth";
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

  const [overview, cards] = await Promise.all([profileOverview(targetId, isSelf), listPlayerCards()]);
  if (!overview) return NextResponse.json({ msg: "用户不存在" }, { status: 404 });

  const account = await prisma.user.findUnique({
    where: { id: targetId },
    select: { isAdmin: true, status: true },
  });
  const index = cards.findIndex((card) => card.id === targetId);

  return NextResponse.json({
    isSelf,
    user: {
      ...overview.player,
      is_admin: account?.isAdmin ?? false,
      status: account?.status ?? "",
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
