import { adminRoute, requiredId } from "@/server/api";

import { finishPick } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) => finishPick(requiredId(params.id)));
