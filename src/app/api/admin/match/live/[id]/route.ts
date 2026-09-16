import { adminRoute, requiredId } from "@/server/api";

import { setMatchLive } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  setMatchLive(requiredId(params.id), String(body.liveUrl ?? "")),
);
