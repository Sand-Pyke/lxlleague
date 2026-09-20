import { adminRoute, badRequest, requiredId, unwrap } from "@/server/api";

import { reorderTeams } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  const teamIds = Array.isArray(body.teamIds)
    ? body.teamIds.map((id: unknown) => requiredId(id))
    : [];
  if (!teamIds.length) throw badRequest("缺少队伍顺序");
  return unwrap(await reorderTeams(requiredId(body.matchId), teamIds), "队伍顺位已更新");
});
