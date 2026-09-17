export const dynamic = "force-dynamic";

/**
 * 只导出 POST：GET 会被跨站顶级导航（外链、伪造链接）带着 SameSite=Lax 的 Cookie 打过来，
 * 等于任何第三方页面都能把已登录用户踢下线。POST 会先经过 middleware 的同源校验。
 */
export { signOut as POST } from "@/server/auth";
