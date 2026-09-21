import { adminRoute } from "@/server/api";

import { batchApproveUsers } from "@/server/admin";

export const dynamic = "force-dynamic";

// 批量通过待审核账号：body.userIds 为待通过的用户 ID 数组。
export const POST = adminRoute(({ body, adminId }) => batchApproveUsers(body.userIds, adminId));
