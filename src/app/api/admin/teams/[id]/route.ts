import { adminRoute, requiredId } from "@/server/api";

import { teamsBoard } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>(async ({ params }) => teamsBoard(requiredId(params.id)));
