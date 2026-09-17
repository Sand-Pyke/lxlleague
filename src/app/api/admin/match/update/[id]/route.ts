import { adminRoute, requiredId } from "@/server/api";

import { updateMatch } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  updateMatch(requiredId(params.id), body),
);
