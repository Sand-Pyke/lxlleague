import { adminRoute } from "@/server/api";

import { createMatch } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ body }) => createMatch(body));
