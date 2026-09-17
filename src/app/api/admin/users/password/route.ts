import { adminRoute, requiredId } from "@/server/api";

import { resetUserPassword } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ adminId, body }) =>
  resetUserPassword(adminId, requiredId(body.userId)),
);
