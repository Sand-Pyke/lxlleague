import { adminRoute, requiredId } from "@/server/api";

import { setUserAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) =>
  setUserAdmin(requiredId(body.userId), Boolean(body.isAdmin)),
);
