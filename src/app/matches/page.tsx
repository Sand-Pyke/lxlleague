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

  // 核心管理员（admin）是运维账号、不参与比赛，「我的比赛」对其没有意义；
  // 普通选手仍保留该页签。
  const showMineTab = !viewer?.isCoreAdmin;

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
      <Card className="antd-panel" variant="borderless">
        <Segmented
          block
          value={tab}
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
