import { adminRoute, requiredId, unwrap } from "@/server/api";

import { deleteRecord } from "@/server/records";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) =>
  unwrap(await deleteRecord(requiredId(params.id)), "战绩已删除"),
);
