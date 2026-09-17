"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RankLabel } from "@/components/rank-label";

type RosterPlayer = {
  id: number;
  name: string;
  /** 主位置（profile.mainPosition，可为 FILL / 空） */
  position: string;
  /** 报名/组队后的位置槽（TOP/JUG/MID/ADC/SUP） */
  teamPosition: string;
  rank: string;
  avatar: string;
};

const POSITION_GROUPS = [
  { key: "TOP", label: "上单" },
  { key: "JUG", label: "打野" },
  { key: "MID", label: "中单" },
  { key: "ADC", label: "AD" },
  { key: "SUP", label: "辅助" },
] as const;

const POSITION_TEXT: Record<string, string> = {
  TOP: "上单",
  JUG: "打野",
  MID: "中单",
  ADC: "AD",
  SUP: "辅助",
};

const VISIBLE_COUNT = 6;

const positionText = (value: string) => POSITION_TEXT[value] ?? (value || "未填写");

/** 报名名单：按分路统计人数，默认只展示前 6 人，其余点「查看全部」展开。 */
export function MatchRoster({ players }: { players: RosterPlayer[] }) {
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const player of players) {
      const position = player.teamPosition || player.position;
      map.set(position, (map.get(position) ?? 0) + 1);
    }
    return map;
  }, [players]);

  const hasMore = players.length > VISIBLE_COUNT;
  const hidden = players.length - VISIBLE_COUNT;
  const visible = showAll ? players : players.slice(0, VISIBLE_COUNT);

  return (
    <aside className="panel roster">
      <p>REGISTERED PLAYERS</p>
      <h2>已报名选手 · {players.length}</h2>
      <div className="roster-groups">
        {POSITION_GROUPS.map(({ key, label }) => (
          <span key={key} className="roster-group">
            {label}（{counts.get(key) ?? 0}）
          </span>
        ))}
      </div>
      {players.length === 0 && <span>暂无选手报名</span>}
      {visible.map((player) => (
        <Link key={player.id} href={`/profile?uid=${player.id}`} className="roster-row">
          <img src={player.avatar || undefined} alt="" />
          <span>
            <b>{player.name}</b>
            <small>{positionText(player.teamPosition || player.position)}</small>
          </span>
          <em>
            <RankLabel rank={player.rank} fallback="未定段" />
          </em>
        </Link>
      ))}
      {hasMore &&
        (showAll ? (
          <button type="button" className="roster-more" onClick={() => setShowAll(false)}>
            收起
          </button>
        ) : (
          <button type="button" className="roster-more" onClick={() => setShowAll(true)}>
            查看全部（剩余 {hidden} 人）
          </button>
        ))}
    </aside>
  );
}
