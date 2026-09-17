import { adminRoute, requiredId } from "@/server/api";

import { resetUserPassword } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body, adminId }) =>
  resetUserPassword(requiredId(body.userId), String(body.password ?? ""), adminId),
);
