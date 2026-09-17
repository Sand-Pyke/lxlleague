import { adminRoute, requiredId } from "@/server/api";

import { setUserRank } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body, adminId }) =>
  setUserRank(requiredId(body.userId), String(body.rank ?? ""), adminId),
);
