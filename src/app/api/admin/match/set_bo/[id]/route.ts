import { adminRoute, requiredId } from "@/server/api";

import { setMatchBo } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  setMatchBo(requiredId(params.id), String(body.bo ?? "")),
);
