import { adminRoute } from "@/server/api";

import { importToken, rotateImportToken } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute(({ adminId }) => importToken(adminId));

/** 重置令牌。写成 POST 而不是 GET，避免被浏览器/爬虫预取时误触发。 */
export const POST = adminRoute(({ adminId }) => rotateImportToken(adminId));
