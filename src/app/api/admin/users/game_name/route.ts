import { adminRoute, requiredId } from "@/server/api";

import { setUserGameName } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) =>
  setUserGameName(requiredId(body.userId), String(body.gameName ?? "")),
);
