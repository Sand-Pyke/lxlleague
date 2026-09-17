import { adminRoute, requiredId } from "@/server/api";

import { cancelSignup } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) =>
  cancelSignup(requiredId(params.id)),
);
