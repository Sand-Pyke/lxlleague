import { adminRoute, requiredId } from "@/server/api";

import { setFmvp } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  setFmvp(requiredId(params.id), requiredId(body.userId, "请选择选手")),
);
