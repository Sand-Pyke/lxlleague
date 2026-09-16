"use client";

import { LoginOutlined, LogoutOutlined, UserAddOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Button, Card, Empty, Space, Spin, Typography } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LeagueShell } from "@/components/app-shell";
import type { Player } from "@/lib/data";

type CurrentUser = { login: boolean; username?: string };

export default function ProfilePage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    fetch("/api/current_user")
      .then((response) => response.json())
      .then(async (currentUser) => {
        setUser(currentUser);
        if (!currentUser.login) return;
        const response = await fetch("/api/user/profile");
        if (response.ok) setPlayer((await response.json()).user ?? null);
      })
      .catch(() => setUser({ login: false }));
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    setUser({ login: false });
  }

  return (
    <LeagueShell>
      <section className="page-title">
        <Typography.Text type="secondary">SUMMONER PROFILE</Typography.Text>
        <Typography.Title>个人主页</Typography.Title>
        <Typography.Paragraph>管理个人资料、查看比赛记录并追踪你的赛场表现。</Typography.Paragraph>
      </section>
      {!user ? (
        <div className="loading-state">
          <Spin size="large" />
        </div>
      ) : player ? (
        <Card className="antd-panel">
          <Space direction="vertical" size="large">
            <Avatar size={88} src={player.avatar} icon={<UserOutlined />} />
            <Typography.Title level={3}>{player.name}</Typography.Title>
            <Typography.Text type="secondary">
              {player.gameName} · {player.rank}
            </Typography.Text>
            <Typography.Paragraph>{player.bio}</Typography.Paragraph>
          </Space>
        </Card>
      ) : user.login ? (
        <Card className="profile-empty-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="你的召唤师资料尚未创建">
            <Space direction="vertical">
              <Avatar size={64} icon={<UserOutlined />} />
              <Typography.Title level={4}>{user.username}</Typography.Title>
              <Typography.Text type="secondary">
                账号已登录，资料与赛事记录将在首次报名后显示。
              </Typography.Text>
              <Button danger icon={<LogoutOutlined />} onClick={logout}>
                退出登录
              </Button>
            </Space>
          </Empty>
        </Card>
      ) : (
        <Card className="profile-empty-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录后即可创建个人资料">
            <Space>
              <Link href="/login">
                <Button type="primary" icon={<LoginOutlined />}>
                  登录
                </Button>
              </Link>
              <Link href="/register">
                <Button icon={<UserAddOutlined />}>注册账号</Button>
              </Link>
            </Space>
          </Empty>
        </Card>
      )}
    </LeagueShell>
  );
}
