import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell, Status } from "@/components/app-shell";
import { MatchSignup } from "@/components/match-signup";
import { RankLabel } from "@/components/rank-label";
import { getMatchPageData } from "@/server/matches";

export const dynamic = "force-dynamic";

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match, players, rounds, viewer, signed } = await getMatchPageData(Number(id));
  if (!match) notFound();
  return (
    <LeagueShell>
      <div className="back">
        <Link href="/matches">← 返回赛事中心</Link>
      </div>
      <section className="match-hero">
        <div>
          <Status status={match.status} />
          <p>
            {match.round} · {match.bo}
          </p>
          <h1>{match.name}</h1>
          <span>{match.date}</span>
        </div>
        <div className="big-score">
          <b>{match.teams[0]}</b>
          <strong>
            {match.score[0]} <i>:</i> {match.score[1]}
          </strong>
          <b>{match.teams[1]}</b>
        </div>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <div className="section-heading compact">
            <div>
              <p>EVENT INFO</p>
              <h2>赛事信息</h2>
            </div>
          </div>
          <dl className="details">
            <div>
              <dt>赛制</dt>
              <dd>{match.bo}</dd>
            </div>
            <div>
              <dt>参赛选手</dt>
              <dd>{match.playerCount} 人</dd>
            </div>
            <div>
              <dt>对阵队伍</dt>
              <dd>{match.teamCount} 支</dd>
            </div>
            <div>
              <dt>比赛状态</dt>
              <dd>
                {match.status === "LIVE"
                  ? "正在进行"
                  : match.status === "FINISHED"
                    ? "已结束"
                    : "报名中"}
              </dd>
            </div>
          </dl>
          <div className="detail-actions">
            <MatchSignup
              matchId={match.id}
              signable={match.status === "CREATED"}
              loggedIn={Boolean(viewer)}
              isCoreAdmin={viewer?.isCoreAdmin ?? false}
              signed={Boolean(signed)}
              defaultMain={viewer?.mainPosition ?? ""}
              defaultSub={viewer?.subPosition ?? ""}
            />
            <Link className="button ghost" href={`/matches/${match.id}/lineup`}>
              查看对阵
            </Link>
            {match.status === "FINISHED" && (
              <Link className="button ghost" href={`/matches/${match.id}/result`}>
                赛果数据
              </Link>
            )}
          </div>
        </section>
        <aside className="panel roster">
          <p>REGISTERED PLAYERS</p>
          <h2>已报名选手 · {players.length}</h2>
          {players.length === 0 && <span>暂无选手报名</span>}
          {players.map((player) => (
            <div key={player.id}>
              <img src={player.avatar || undefined} alt="" />
              <span>
                <b>{player.name}</b>
                <small>{player.teamPosition || player.position}</small>
              </span>
              <em>
                <RankLabel rank={player.rank} fallback="未定段" />
              </em>
            </div>
          ))}
        </aside>
      </div>
      <section className="panel schedule">
        <div className="section-heading compact">
          <div>
            <p>SCHEDULE</p>
            <h2>赛程</h2>
          </div>
          <Link className="text-link" href={`/matches/${match.id}/lineup`}>
            查看对阵 →
          </Link>
        </div>
        {rounds.length === 0 ? (
          <p className="result-note">暂无对阵安排</p>
        ) : (
          rounds.map((round) => (
            <div key={round.round_no}>
              <p className="schedule-round">
                第 {round.round_no} 轮
                {round.round_no === match.currentRound && <small>当前轮</small>}
              </p>
              {round.pairs.map((pair, index) => (
                <div className="schedule-row" key={`${pair.t1}-${pair.t2}-${index}`}>
                  <b>{pair.team1}</b>
                  <span>
                    {pair.score[0]} : {pair.score[1]}
                  </span>
                  <b>{pair.team2}</b>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </LeagueShell>
  );
}
