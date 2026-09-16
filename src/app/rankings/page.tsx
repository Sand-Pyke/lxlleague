"use client";

import { CrownOutlined } from "@ant-design/icons";
import { Avatar, Card, Empty, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import Link from "next/link";
import { LeagueShell } from "@/components/app-shell";
import type { Player } from "@/lib/data";
import { useEffect, useState } from "react";

export default function RankingsPage() {
  const [list, setList] = useState<Player[]>([]);
  useEffect(() => {
    fetch("/api/players")
      .then((response) => response.json())
      .then((data) => setList(data.players ?? []))
      .catch(() => setList([]));
  }, []);
  const columns: TableColumnsType<Player> = [
    {
      title: "排名",
      key: "rank",
      width: 76,
      render: (_, __, index) => <Tag color={index < 3 ? "gold" : "default"}>{index + 1}</Tag>,
    },
    {
      title: "选手",
      key: "player",
      render: (_, player) => (
        <Link className="table-player" href={`/profile?uid=${player.id}`}>
          <Avatar src={player.avatar} />{" "}
          <span>
            <b>{player.name}</b>
            <small>{player.gameName}</small>
          </span>
        </Link>
      ),
    },
    { title: "位置", dataIndex: "position", key: "position", responsive: ["sm"] },
    {
      title: "胜/负",
      key: "record",
      render: (_, player) => `${player.wins} / ${player.losses}`,
      responsive: ["md"],
    },
    { title: "胜率", key: "rate", render: (_, player) => `${player.winRate}%` },
    { title: "KDA", dataIndex: "kda", key: "kda", responsive: ["sm"] },
  ];
  return (
    <LeagueShell>
      <section className="page-title">
        <Typography.Text type="secondary">CHAMPION RANKING</Typography.Text>
        <Typography.Title>排行榜中心</Typography.Title>
        <Typography.Paragraph>用战绩见证实力，用排名证明热爱。</Typography.Paragraph>
      </section>
      <Card
        className="antd-panel"
        title={
          <>
            <CrownOutlined /> 冠军榜单
          </>
        }
      >
        {list.length ? (
          <Table columns={columns} dataSource={list} rowKey="id" pagination={false} />
        ) : (
          <Empty description="暂无排行数据" />
        )}
      </Card>
    </LeagueShell>
  );
}
