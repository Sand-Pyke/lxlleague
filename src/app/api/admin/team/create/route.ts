import { adminRoute, requiredId, unwrap } from "@/server/api";

import { createTeam } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) =>
  unwrap(await createTeam(requiredId(body.matchId), String(body.name ?? "")), "队伍创建成功"),
);
