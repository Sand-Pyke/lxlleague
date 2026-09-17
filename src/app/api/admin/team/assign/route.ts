import { adminRoute, requiredId, unwrap } from "@/server/api";

import { assignSignup } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  // teamId 为 null 表示把选手撤回到「未分配」
  const teamId =
    body.teamId === undefined || body.teamId === null || body.teamId === ""
      ? null
      : requiredId(body.teamId);

  return unwrap(
    await assignSignup({
      signId: requiredId(body.signId),
      teamId,
      teamPosition:
        typeof body.teamPosition === "string" && body.teamPosition ? body.teamPosition : null,
    }),
    teamId === null ? "已移回未分配" : "分配成功",
  );
});
