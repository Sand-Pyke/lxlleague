import { adminRoute, requiredId } from "@/server/api";

import { setMatchFee } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  setMatchFee(requiredId(params.id), Boolean(body.useFee)),
);
