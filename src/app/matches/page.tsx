"use client";
import { useEffect, useState } from "react";
import { LeagueShell } from "@/components/league-shell";
import { MatchCard } from "@/components/match-card";
import type { Match } from "@/lib/data";

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]); const [tab, setTab] = useState("today");
  useEffect(() => { fetch("/api/match/list").then((r) => r.json()).then((data) => setMatches(data.match_list)); }, []);
  const filtered = matches.filter((m) => tab === "today" ? m.date === "2026/9/16" : tab === "history" ? m.status === "FINISHED" : Boolean(m.signed));
  return <LeagueShell><section className="page-title"><p>MATCH CENTER</p><h1>比赛中心</h1><span>参与峡谷对决，记录每一次高光时刻。</span></section><div className="tabs">{[["today","当日比赛"],["history","历史比赛"],["mine","我的比赛"]].map(([key,label]) => <button className={tab === key ? "selected" : ""} onClick={() => setTab(key)} key={key}>{label}</button>)}</div><div className="match-grid">{filtered.map((match) => <MatchCard key={match.id} match={match} />)}</div>{!filtered.length && <div className="empty">暂无符合条件的赛事</div>}</LeagueShell>;
}
