import { adminRoute, badRequest, requiredId, unwrap } from "@/server/api";

import { moveSignup } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  if (body.direction !== "up" && body.direction !== "down") throw badRequest("参数不完整");
  return unwrap(await moveSignup(requiredId(body.signId), body.direction), "已调换位置");
});
