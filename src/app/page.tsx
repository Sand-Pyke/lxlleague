import Link from "next/link";
import { LeagueShell, Status } from "@/components/league-shell";
import { MatchCard } from "@/components/match-card";
import { leaderboard, matches, players } from "@/lib/data";

export default function Home() {
  const leaders = leaderboard().slice(0, 5);
  const recentMatch = matches.find((match) => match.status === "FINISHED");
  const activeMatchCount = matches.filter((match) => match.status === "LIVE").length;

  return (
    <LeagueShell>
      <section className="hero">
        <div className="eyebrow">LSPL · LEAGUE OF LEGENDS</div>
        <h1>峡谷冠军联赛</h1>
        <p>每一场对局，都是通往冠军的证明。</p>
        <div className="hero-actions">
          <Link href="/matches" className="button primary">
            查看赛事
          </Link>
          <Link href="/players" className="button ghost">
            选手中心
          </Link>
        </div>
        <div className="hero-stats">
          <div>
            <b>{players.length}</b>
            <span>注册选手</span>
          </div>
          <div>
            <b>{matches.filter((match) => match.status === "FINISHED").length}</b>
            <span>已完成对局</span>
          </div>
          <div>
            <b>{activeMatchCount}</b>
            <span>活跃赛事</span>
          </div>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <p>LIVE BOARD</p>
          <h2>今日赛事</h2>
        </div>
        <Link href="/matches">查看全部 →</Link>
      </section>
      {matches.length ? (
        <div className="match-grid">
          {matches.slice(0, 2).map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ) : (
        <div className="empty">暂无赛事数据</div>
      )}

      <div className="home-grid">
        <section className="panel">
          <div className="section-heading compact">
            <div>
              <p>TOP PLAYERS</p>
              <h2>选手排行</h2>
            </div>
            <Link href="/rankings">完整榜单 →</Link>
          </div>
          {leaders.length ? (
            leaders.map((player, index) => (
              <div className="rank-line" key={player.id}>
                <strong className={`rank-number rank-${index + 1}`}>{index + 1}</strong>
                <img src={player.avatar} alt="" />
                <div>
                  <b>{player.name}</b>
                  <small>
                    {player.position} · {player.rank}
                  </small>
                </div>
                <span>{player.winRate}% 胜率</span>
              </div>
            ))
          ) : (
            <div className="empty">暂无选手数据</div>
          )}
        </section>

        <section className="panel scoreboard">
          <p>RECENT RESULT</p>
          {recentMatch ? (
            <>
              <h2>{recentMatch.name}</h2>
              <div className="score-row">
                <b>{recentMatch.teams[0]}</b>
                <strong>
                  {recentMatch.score[0]} <i>:</i> {recentMatch.score[1]}
                </strong>
                <b>{recentMatch.teams[1]}</b>
              </div>
              <div className="result-note">
                <Status status="FINISHED" /> {recentMatch.round}
              </div>
              <Link href={`/matches/${recentMatch.id}/result`} className="text-link">
                查看本场数据 →
              </Link>
            </>
          ) : (
            <div className="empty">暂无已结束赛事</div>
          )}
        </section>
      </div>
    </LeagueShell>
  );
}
