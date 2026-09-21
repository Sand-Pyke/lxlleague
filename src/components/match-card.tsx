import Link from "next/link";
import type { Match } from "@/lib/data";
import { formatMatchDate } from "@/lib/format-date";
import { Status } from "@/components/app-shell";

/**
 * 卡片内容（不含外层容器）：
 * 「比赛页的赛事列表」与「首页今日赛事卡」共用，避免两处各写一份。
 */
export function MatchCardBody({ match }: { match: Match }) {
  return (
    <>
      <div className="card-top">
        <Status status={match.status} />
        <span className="bo">{match.bo}</span>
        <time dateTime={match.date ?? undefined}>{formatMatchDate(match.date)}</time>
      </div>
      <h3>{match.name}</h3>
      <div className="match-meta">
        <span>♟ {match.playerCount} 位选手</span>
        <span>♜ {match.teamCount} 支队伍</span>
      </div>
      <span className="card-cta">
        {match.status === "FINISHED" ? "查看赛果" : "进入赛事"} <b>→</b>
      </span>
    </>
  );
}

/** 未结束进详情页，已结束直接进战绩页。 */
export function matchDestination(match: Match) {
  return match.status === "FINISHED" ? `/matches/${match.id}/result` : `/matches/${match.id}`;
}

export function MatchCard({ match }: { match: Match }) {
  return (
    <Link href={matchDestination(match)} className="match-card">
      <MatchCardBody match={match} />
    </Link>
  );
}
