import { adminRoute, requiredId } from "@/server/api";

import { banUser } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body, adminId }) =>
  banUser(requiredId(body.userId), Number(body.days), adminId),
);
