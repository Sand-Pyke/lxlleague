"use client";

import { CalendarOutlined } from "@ant-design/icons";
import { Card, Empty, Segmented, Spin } from "antd";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { useViewer } from "@/components/auth-provider";
import { MatchCard } from "@/components/match-card";
import type { Match } from "@/lib/data";

type MatchTab = "today" | "history" | "mine";

function MatchesContent() {
  const viewer = useViewer();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // 未登录时没有「我的比赛」；核心管理员（admin）是运维账号、不参与比赛，也不展示该页签。
  const showMineTab = Boolean(viewer && !viewer.isCoreAdmin);
  // 页签由 URL 的 ?tab= 驱动，便于从首页统计卡直达指定页签；非法值退回「当前赛事」。
  const rawTab = searchParams.get("tab");
  const tab: MatchTab =
    rawTab === "history" || (rawTab === "mine" && showMineTab) ? rawTab : "today";

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

  const changeTab = (value: string | number) => {
    const next = value as MatchTab;
    router.replace(next === "today" ? "/matches" : `/matches?tab=${next}`);
  };

  return (
    <LeagueShell>
      <Card className="antd-panel" variant="borderless">
        <Segmented
          block
          value={tab}
          onChange={changeTab}
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

export default function MatchesPage() {
  return (
    <Suspense
      fallback={
        <div className="loading-state">
          <Spin size="large" />
        </div>
      }
    >
      <MatchesContent />
    </Suspense>
  );
}
