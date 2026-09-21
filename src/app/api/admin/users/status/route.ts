import { adminRoute, requiredId } from "@/server/api";

import { setUserStatus } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body, adminId }) =>
  setUserStatus(requiredId(body.userId), body.status, adminId),
);
