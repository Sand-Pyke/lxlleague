import { adminRoute, requiredId } from "@/server/api";

import { setMatchImportTarget } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) =>
  setMatchImportTarget(requiredId(params.id)),
);
