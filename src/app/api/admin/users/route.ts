import { adminRoute } from "@/server/api";

import { adminUserList } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute(() => adminUserList());
