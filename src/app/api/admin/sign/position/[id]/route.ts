import { adminRoute, requiredId } from "@/server/api";

import { changeSignupPosition } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  changeSignupPosition(requiredId(params.id), body.main_pos, body.sub_pos),
);
