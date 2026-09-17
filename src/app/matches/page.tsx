"use client";

import { CalendarOutlined } from "@ant-design/icons";
import { Card, Empty, Segmented, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { LeagueShell } from "@/components/app-shell";
import { useViewer } from "@/components/auth-provider";
import { MatchCard } from "@/components/match-card";
import type { Match } from "@/lib/data";

type MatchTab = "today" | "history" | "mine";

export default function MatchesPage() {
  const viewer = useViewer();
  const [matches, setMatches] = useState<Match[]>([]);
  const [tab, setTab] = useState<MatchTab>("today");
  const [loading, setLoading] = useState(true);

  // 未登录时没有「我的比赛」；核心管理员（admin）是运维账号、不参与比赛，也不展示该页签。
  const showMineTab = Boolean(viewer && !viewer.isCoreAdmin);
  // 退出登录后残留的「我的比赛」选中态要退回默认页签，否则会出现所有页签都不高亮的空状态。
  const activeTab: MatchTab = tab === "mine" && !showMineTab ? "today" : tab;

  useEffect(() => {
    fetch("/api/match/list")
      .then((response) => response.json())
      .then((data) => setMatches(data.match_list ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      matches.filter((match) => {
        if (activeTab === "history") return match.status === "FINISHED";
        if (activeTab === "mine") return Boolean(match.signed);
        return match.status !== "FINISHED";
      }),
    [matches, activeTab],
  );

  return (
    <LeagueShell>
      <Card className="antd-panel" variant="borderless">
        <Segmented
          block
          value={activeTab}
          onChange={(value) => setTab(value as MatchTab)}
          options={[
            { label: "当前赛事", value: "today", icon: <CalendarOutlined /> },
            { label: "历史比赛", value: "history" },
            ...(showMineTab ? [{ label: "我的比赛", value: "mine" }] : []),
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
