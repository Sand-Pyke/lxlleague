import { adminRoute, requiredId, unwrap } from "@/server/api";

import { deleteTeam } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) =>
  unwrap(await deleteTeam(requiredId(params.id)), "队伍已删除，队员已移回未分配"),
);
