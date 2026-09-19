import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { Bracket } from "@/components/bracket";
import { RankLabel } from "@/components/rank-label";
import { roundTitle } from "@/lib/round-title";
import { teamLogo } from "@/lib/teams";
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
      {/* 原先 page-title 区块里的赛事名与当前轮次，收成一行放在返回链接旁边。 */}
      <div className="lineup-head">
        <div className="back">
          <Link href={`/matches/${id}`}>← 返回赛事详情</Link>
        </div>
        <h2 className="lineup-title">{data ? data.match.name : "对阵阵容"}</h2>
        <span className="lineup-round">{roundTitle(shown, schedule.data.total_rounds)} · 对阵阵容</span>
      </div>
      <section className="panel bracket-panel">
        <Bracket
          rounds={schedule.data.rounds}
          totalRounds={schedule.data.total_rounds}
          matchId={id}
          championName={schedule.data.champion_name}
        />
      </section>
      <section className="panel game-tabs">
        {rounds.map((item) => (
          <Link
            className={item === shown ? "selected" : ""}
            key={item}
            href={`/matches/${id}/lineup?round=${item}`}
          >
            {roundTitle(item, schedule.data.total_rounds)}
            {filledRounds.has(item) && <i className="game-dot" />}
          </Link>
        ))}
      </section>
      {data && data.pairs.length > 0 ? (
        data.pairs.map((pair, index) => (
          <section className="panel pair-card" key={`${pair.team1.id}-${pair.team2.id}-${index}`}>
            <div className="pair-head">
              <b>
                {pair.team1.name}
                {teamLogo(pair.team1.name) && (
                  <img className="pair-team-logo" src={teamLogo(pair.team1.name)} alt="" />
                )}
              </b>
              <span>
                {pair.team2.id ? (
                  <Link
                    className="pair-score"
                    href={`/matches/${id}/result?round=${shown}&t1=${pair.team1.id}&t2=${pair.team2.id}`}
                  >
                    {pair.score[0]} : {pair.score[1]}
                  </Link>
                ) : (
                  `${pair.score[0]} : ${pair.score[1]}`
                )}
              </span>
              <b>
                {teamLogo(pair.team2.name) && (
                  <img className="pair-team-logo" src={teamLogo(pair.team2.name)} alt="" />
                )}
                {pair.team2.name}
              </b>
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
                        <img src={row.avatar || undefined} alt="" />
                        <b>{row.name}</b>
                        <em>
                          <RankLabel rank={row.rank} fallback="未定段" />
                        </em>
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
                        <em>
                          <RankLabel rank={row.rank} fallback="未定段" />
                        </em>
                        <b>{row.name}</b>
                        <img src={row.avatar || undefined} alt="" />
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
