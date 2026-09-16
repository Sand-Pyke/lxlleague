import { adminRoute } from "@/server/api";

import { adminUserList } from "@/server/admin";

export const dynamic = "force-dynamic";

// 当前登录的管理员自己不列进用户管理列表。
export const GET = adminRoute(({ adminId }) => adminUserList(adminId));
