"use client";

import {
  HomeOutlined,
  MessageOutlined,
  LogoutOutlined,
  MoonOutlined,
  OrderedListOutlined,
  SettingOutlined,
  SunOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Layout, Space, Tag, Tooltip, Typography } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { useViewer } from "./auth-provider";
import { useThemeMode } from "./theme-provider";

type NavItem = { key: string; text: string; icon: ReactNode };

const navigation: NavItem[] = [
  { key: "/", text: "首页", icon: <HomeOutlined /> },
  { key: "/matches", text: "比赛", icon: <TrophyOutlined /> },
  { key: "/players", text: "选手", icon: <TeamOutlined /> },
  { key: "/rankings", text: "排行", icon: <OrderedListOutlined /> },
  { key: "/videos", text: "视频", icon: <VideoCameraOutlined /> },
  { key: "/profile", text: "个人", icon: <UserOutlined /> },
  { key: "/community", text: "社区", icon: <MessageOutlined /> },
];

/** 管理后台入口：仅管理员可见，排在「个人」之后。 */
const adminNavigationItem: NavItem = {
  key: "/admin",
  text: "管理后台",
  icon: <SettingOutlined />,
};

export function LeagueShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, toggleTheme } = useThemeMode();
  // 登录态来自根布局的服务端注入，客户端不再请求 /api/current_user，
  // 因此路由切换重新挂载时不会先渲染「登录」再切换成用户名。
  const user = useViewer();

  // 自定义背景仅深色模式可用，且是**全站**生效（个人主页只是修改入口）。
  const customBackground = mode === "dark" ? (user?.background ?? "") : "";

  const menuItems = user?.isAdmin ? [...navigation, adminNavigationItem] : navigation;

  const selectedKey =
    menuItems.find((item) => item.key !== "/" && pathname.startsWith(item.key))?.key ?? "/";

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
    // 顶栏登录态由根布局在服务端注入，登出后必须刷新服务端组件才会同步。
    router.refresh();
  }

  return (
    <Layout
      className={customBackground ? "league-layout league-layout--custom-bg" : "league-layout"}
    >
      {/* 背景层铺满视口且固定；内容靠 .league-layout--custom-bg 的层级规则抬到它上方。 */}
      {customBackground ? (
        <div
          className="league-page-bg"
          style={{ "--user-bg-image": `url("${customBackground}")` } as CSSProperties}
          aria-hidden
        />
      ) : null}
      <Layout.Header className="league-header">
        <div className="league-header__inner">
          <Link href="/" className="league-brand">
            LXL 峡谷冠军联赛
          </Link>
          <nav className="league-menu" aria-label="主导航">
            {menuItems.map((item) => (
              <Link
                key={item.key}
                href={item.key}
                className={`league-nav-item${selectedKey === item.key ? " league-nav-item--selected" : ""}`}
                aria-current={selectedKey === item.key ? "page" : undefined}
              >
                {item.icon}
                <span className="league-nav-item__label">{item.text}</span>
              </Link>
            ))}
          </nav>
          <Space size={8} className="league-actions">
            <Tooltip title={mode === "dark" ? "切换浅色模式" : "切换深色模式"}>
              <Button
                aria-label="切换颜色主题"
                type="text"
                shape="circle"
                icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>
            {user ? (
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "logout",
                      label: "退出登录",
                      icon: <LogoutOutlined />,
                      danger: true,
                      onClick: () => void logout(),
                    },
                  ],
                }}
              >
                <button type="button" className="league-user-trigger" aria-label="账户菜单">
                  <Avatar size="small" src={user.avatar || undefined} icon={<UserOutlined />} />
                  <Typography.Text className="league-user">{user.displayName}</Typography.Text>
                </button>
              </Dropdown>
            ) : (
              <Button type="primary" icon={<UserOutlined />} href="/login">
                登录
              </Button>
            )}
          </Space>
        </div>
      </Layout.Header>
      <Layout.Content className="league-content">
        <div className="shell content">{children}</div>
      </Layout.Content>
    </Layout>
  );
}

export function Status({ status }: { status: string }) {
  const colors: Record<string, string> = {
    LIVE: "success",
    CREATED: "warning",
    FINISHED: "default",
  };
  const labels: Record<string, string> = {
    LIVE: "进行中",
    CREATED: "即将开始",
    FINISHED: "已结束",
  };
  return <Tag color={colors[status]}>{labels[status] ?? status}</Tag>;
}
