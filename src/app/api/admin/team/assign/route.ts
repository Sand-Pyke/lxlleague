import { adminRoute, requiredId, unwrap } from "@/server/api";

import { assignSignup } from "@/server/roster";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => {
  // teamId 为 null 表示把选手撤回到「未分配」
  const teamId =
    body.teamId === undefined || body.teamId === null || body.teamId === ""
      ? null
      : requiredId(body.teamId);

  const overrideBudget =
    typeof body.overrideBudget === "number" && Number.isFinite(body.overrideBudget) && body.overrideBudget > 0
      ? body.overrideBudget
      : undefined;

  return unwrap(
    await assignSignup({
      signId: requiredId(body.signId),
      teamId,
      teamPosition:
        typeof body.teamPosition === "string" && body.teamPosition ? body.teamPosition : null,
      overrideBudget,
    }),
    teamId === null ? "已移回未分配" : "分配成功",
  );
});
