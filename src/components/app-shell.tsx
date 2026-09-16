"use client";

import {
  HomeOutlined,
  MoonOutlined,
  OrderedListOutlined,
  SunOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Layout, Menu, Space, Tag, Tooltip, Typography } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useThemeMode } from "./theme-provider";

const navigation = [
  { key: "/", label: <Link href="/">首页</Link>, icon: <HomeOutlined /> },
  { key: "/matches", label: <Link href="/matches">比赛</Link>, icon: <TrophyOutlined /> },
  { key: "/players", label: <Link href="/players">选手</Link>, icon: <TeamOutlined /> },
  { key: "/rankings", label: <Link href="/rankings">排行</Link>, icon: <OrderedListOutlined /> },
  { key: "/profile", label: <Link href="/profile">个人</Link>, icon: <UserOutlined /> },
];

export function LeagueShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, toggleTheme } = useThemeMode();
  const [user, setUser] = useState<{ login: boolean; username?: string; is_admin?: boolean }>({
    login: false,
  });

  useEffect(() => {
    fetch("/api/current_user")
      .then((response) => response.json())
      .then(setUser)
      .catch(() => undefined);
  }, []);

  const selectedKey =
    navigation.find((item) => item.key !== "/" && pathname.startsWith(item.key))?.key ?? "/";

  return (
    <Layout className="league-layout">
      <Layout.Header className="league-header">
        <div className="league-header__inner">
          <Link href="/" className="league-brand">
            LXL 峡谷冠军联赛
          </Link>
          <Menu
            className="league-menu"
            mode="horizontal"
            selectedKeys={[selectedKey]}
            items={navigation}
          />
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
            {user.login ? (
              <Space size={6}>
                <Avatar size="small" icon={<UserOutlined />} />
                <Typography.Text className="league-user">{user.username}</Typography.Text>
                {user.is_admin && (
                  <Link href="/admin">
                    <Tag color="purple">后台</Tag>
                  </Link>
                )}
              </Space>
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
