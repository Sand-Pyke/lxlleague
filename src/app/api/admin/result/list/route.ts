import { adminRoute, requiredId } from "@/server/api";

import { listMatchRecordsForAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute(async ({ query }) =>
  listMatchRecordsForAdmin(requiredId(query.get("matchId") ?? query.get("match_id"), "缺少赛事ID")),
);
