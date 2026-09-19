import { adminRoute, requiredId } from "@/server/api";

import { unbanUser } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body, adminId }) =>
  unbanUser(requiredId(body.userId), adminId),
);
