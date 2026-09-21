import { adminRoute, requiredId } from "@/server/api";

import { finishMatch } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async ({ params }) => finishMatch(requiredId(params.id)));
