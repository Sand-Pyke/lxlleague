"use client";

import { CalendarOutlined } from "@ant-design/icons";
import { Card, Empty, Segmented, Spin, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { LeagueShell } from "@/components/app-shell";
import { MatchCard } from "@/components/match-card";
import type { Match } from "@/lib/data";

type MatchTab = "today" | "history" | "mine";

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [tab, setTab] = useState<MatchTab>("today");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/match/list")
      .then((response) => response.json())
      .then((data) => setMatches(data.match_list ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      matches.filter((match) => {
        if (tab === "history") return match.status === "FINISHED";
        if (tab === "mine") return Boolean(match.signed);
        return match.status !== "FINISHED";
      }),
    [matches, tab],
  );

  return (
    <LeagueShell>
      <section className="page-title">
        <Typography.Text type="secondary">MATCH CENTER</Typography.Text>
        <Typography.Title>比赛中心</Typography.Title>
        <Typography.Paragraph>参与峡谷对决，记录每一次高光时刻。</Typography.Paragraph>
      </section>
      <Card className="antd-panel" bordered={false}>
        <Segmented
          block
          value={tab}
          onChange={(value) => setTab(value as MatchTab)}
          options={[
            { label: "当前赛事", value: "today", icon: <CalendarOutlined /> },
            { label: "历史比赛", value: "history" },
            { label: "我的比赛", value: "mine" },
          ]}
        />
      </Card>
      <div className="matches-content">
        {loading ? (
          <div className="loading-state">
            <Spin size="large" />
          </div>
        ) : filtered.length ? (
          <div className="match-grid">
            {filtered.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <Card className="antd-panel">
            <Empty description="暂无符合条件的赛事" />
          </Card>
        )}
      </div>
    </LeagueShell>
  );
}
