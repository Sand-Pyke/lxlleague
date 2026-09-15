import Link from "next/link";
import type { Match } from "@/lib/data";
import { Status } from "./league-shell";

export function MatchCard({ match }: { match: Match }) {
  const destination =
    match.status === "FINISHED" ? `/matches/${match.id}/result` : `/matches/${match.id}`;
  return (
    <Link href={destination} className="match-card">
      <div className="card-top">
        <Status status={match.status} />
        <span className="bo">{match.bo}</span>
        <time>{match.date}</time>
      </div>
      <h3>{match.name}</h3>
      <div className="match-meta">
        <span>♟ {match.playerCount} 位选手</span>
        <span>♜ {match.teamCount} 支队伍</span>
      </div>
      <span className="card-cta">
        {match.status === "FINISHED" ? "查看赛果" : "进入赛事"} <b>→</b>
      </span>
    </Link>
  );
}
