import { adminRoute, requiredId } from "@/server/api";

import { deleteUser } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, adminId }) =>
  deleteUser(requiredId(params.id), adminId),
);
