import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/server/api";
import { isCoreAdminUsername } from "@/server/auth";

/**
 * 管理员账号之间的操作边界。
 *
 * 规则：管理员只能管理「普通用户」。除核心管理员（`ADMIN_USERNAME`）外，
 * 任何管理员都**不能**审核、删除或改动其他管理员账号，避免管理员互相打压。
 * 管理员权限（设为 / 取消管理员）只有核心管理员可以调整。
 *
 * 放在独立模块而不是 `server/admin.ts` 里，是为了让 `server/records.ts` 这类
 * 只需要边界校验的模块也能引用，避免 `api.ts` ⇄ `auth.ts` 的循环依赖。
 */

/** 当前操作者是否为核心管理员（按账号名判定，与 seed 使用的环境变量一致）。 */
export async function isCoreAdminActor(actorId: number) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { username: true },
  });
  return isCoreAdminUsername(actor?.username);
}

/**
 * 断言操作者有权管理目标账号：目标是管理员且操作者不是核心管理员时直接 403。
 * 目标不存在时抛 404；合法时返回目标账号的基本信息，调用方无需重复查询。
 */
export async function assertCanManageUser(actorId: number, userId: number) {
  const [actor, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { username: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, isAdmin: true },
    }),
  ]);
  if (!actor) throw forbidden("请先登录");
  if (!target) throw notFound("用户不存在");
  if (target.isAdmin && !isCoreAdminUsername(actor.username)) {
    throw forbidden("不能操作其他管理员账号");
  }
  return target;
}
