import { adminRoute } from "@/server/api";

import { signupList } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute(() => signupList());
