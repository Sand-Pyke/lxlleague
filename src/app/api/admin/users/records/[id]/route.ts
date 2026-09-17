import { adminRoute, requiredId, assertOk, unwrap } from "@/server/api";

import { clearUserRecords, listUserRecords } from "@/server/records";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>(async ({ params }) =>
  assertOk(await listUserRecords(requiredId(params.id))),
);

export const DELETE = adminRoute<{ id: string }>(async ({ params, adminId }) =>
  unwrap(await clearUserRecords(requiredId(params.id), adminId), "该选手战绩已清空"),
);
