import { adminRoute, requiredId } from "@/server/api";

import { pickTeams } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  pickTeams(requiredId(params.id), body.teamOneId, body.teamTwoId),
);
