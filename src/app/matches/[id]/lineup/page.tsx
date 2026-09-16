import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { getMatchLineupData, getMatchRoundsData } from "@/server/matches";

export const dynamic = "force-dynamic";

export default async function Lineup({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { id } = await params;
  const { round } = await searchParams;
  const [outcome, schedule] = await Promise.all([
    getMatchLineupData(Number(id), round),
    getMatchRoundsData(Number(id)),
  ]);
  if (outcome.kind === "missing" && outcome.reason === "match") notFound();
  if (schedule.kind === "missing") notFound();

  const currentRound = schedule.data.current_round;
  const rounds = [
    ...new Set([...schedule.data.rounds.map((item) => item.round_no), currentRound]),
  ].sort((a, b) => a - b);
  const data = outcome.kind === "ok" ? outcome.data : null;
  const shown = data ? data.match.view_round : Number(round) || currentRound;
  const filledRounds = new Set(schedule.data.rounds.map((item) => item.round_no));

  return (
    <LeagueShell>
      <div className="back">
        <Link href={`/matches/${id}`}>← 返回赛事详情</Link>
      </div>
      <section className="page-title centered">
        <p>MATCHUP</p>
        <h1>{data ? data.match.name : "对阵阵容"}</h1>
        <span>第 {shown} 轮 · 对阵阵容</span>
      </section>
      <section className="panel game-tabs">
        {rounds.map((item) => (
          <Link
            className={item === shown ? "selected" : ""}
            key={item}
            href={`/matches/${id}/lineup?round=${item}`}
          >
            第 {item} 轮
            {filledRounds.has(item) && <i className="game-dot" />}
          </Link>
        ))}
      </section>
      {data && data.pairs.length > 0 ? (
        data.pairs.map((pair, index) => (
          <section className="panel pair-card" key={`${pair.team1.id}-${pair.team2.id}-${index}`}>
            <div className="pair-head">
              <b>{pair.team1.name}</b>
              <span>
                {pair.score[0]} : {pair.score[1]}
              </span>
              <b>{pair.team2.name}</b>
            </div>
            <div className="lineup">
              <section>
                <h2>
                  {pair.team1.name} <small>蓝色方</small>
                </h2>
                {pair.team1.rows.map((row) => (
                  <article key={row.pos}>
                    <span>{row.pos}</span>
                    {row.name ? (
                      <>
                        <img src={row.avatar} alt="" />
                        <b>{row.name}</b>
                        <em>{row.rank}</em>
                      </>
                    ) : (
                      <em>— 空 —</em>
                    )}
                  </article>
                ))}
              </section>
              <div className="vs-orb">VS</div>
              <section className="red">
                <h2>
                  <small>红色方</small> {pair.team2.name}
                </h2>
                {pair.team2.rows.map((row) => (
                  <article key={row.pos}>
                    {row.name ? (
                      <>
                        <em>{row.rank}</em>
                        <b>{row.name}</b>
                        <img src={row.avatar} alt="" />
                      </>
                    ) : (
                      <em>— 空 —</em>
                    )}
                    <span>{row.pos}</span>
                  </article>
                ))}
              </section>
            </div>
          </section>
        ))
      ) : (
        <section className="panel empty">
          <h2>该轮次暂无对战数据</h2>
          <Link className="button ghost" href={`/matches/${id}/lineup`}>
            查看当前轮
          </Link>
        </section>
      )}
    </LeagueShell>
  );
}
