import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { getMatchPageData } from "@/server/matches";

export const dynamic = "force-dynamic";

export default async function Lineup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match, players } = await getMatchPageData(Number(id));
  if (!match) notFound();
  return (
    <LeagueShell>
      <div className="back">
        <Link href={`/matches/${id}`}>← 返回赛事详情</Link>
      </div>
      <section className="page-title centered">
        <p>MATCHUP</p>
        <h1>
          {match.teams[0]} <i>VS</i> {match.teams[1]}
        </h1>
        <span>{match.name} · 对阵阵容</span>
      </section>
      <div className="lineup">
        <section>
          <h2>
            {match.teams[0]} <small>蓝色方</small>
          </h2>
          {players.slice(0, 5).map((p) => (
            <article key={p.id}>
              <span>{p.position}</span>
              <img src={p.avatar} alt="" />
              <b>{p.name}</b>
              <em>{p.gameName}</em>
            </article>
          ))}
        </section>
        <div className="vs-orb">VS</div>
        <section className="red">
          <h2>
            {match.teams[1]} <small>红色方</small>
          </h2>
          {players.slice(5, 10).map((p) => (
            <article key={p.id}>
              <em>{p.gameName}</em>
              <b>{p.name}</b>
              <img src={p.avatar} alt="" />
              <span>{p.position}</span>
            </article>
          ))}
        </section>
      </div>
    </LeagueShell>
  );
}
