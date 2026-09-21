import { adminRoute, requiredId, unwrap } from "@/server/api";

import { updateRecord } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params, body }) =>
  unwrap(await updateRecord(requiredId(params.id), body), "战绩已更新"),
);
