import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { coreAdminLabel, getViewer, isCoreAdminUsername } from "@/server/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "LXL 峡谷冠军联赛",
  description: "LXL 峡谷冠军联赛赛事平台",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // 顶栏登录态在服务端解析：首屏即为正确状态，且不会被各页面的路由切换重置。
  const viewer = await getViewer();

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AntdRegistry>
          <ThemeProvider>
            <AuthProvider
              viewer={
                viewer && {
                  id: viewer.id,
                  username: viewer.username,
                  displayName: isCoreAdminUsername(viewer.username)
                    ? coreAdminLabel
                    : viewer.username,
                  isAdmin: viewer.isAdmin,
                  isCoreAdmin: isCoreAdminUsername(viewer.username),
                  avatar: viewer.profile?.avatar ?? "",
                  background: viewer.backgroundImage,
                }
              }
            >
              {children}
            </AuthProvider>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
