import Link from "next/link";
import { LeagueShell, Status } from "@/components/league-shell";
import { MatchCard } from "@/components/match-card";
import { leaderboard, matches } from "@/lib/data";

export default function Home() {
  const leaders = leaderboard().slice(0, 5);
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
            <b>24</b>
            <span>注册选手</span>
          </div>
          <div>
            <b>12</b>
            <span>已完成对局</span>
          </div>
          <div>
            <b>4</b>
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
      <div className="match-grid">
        {matches.slice(0, 2).map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
      <div className="home-grid">
        <section className="panel">
          <div className="section-heading compact">
            <div>
              <p>TOP PLAYERS</p>
              <h2>选手排行</h2>
            </div>
            <Link href="/rankings">完整榜单 →</Link>
          </div>
          {leaders.map((player, i) => (
            <div className="rank-line" key={player.id}>
              <strong className={`rank-number rank-${i + 1}`}>{i + 1}</strong>
              <img src={player.avatar} alt="" />
              <div>
                <b>{player.name}</b>
                <small>
                  {player.position} · {player.rank}
                </small>
              </div>
              <span>{player.winRate}% 胜率</span>
            </div>
          ))}
        </section>
        <section className="panel scoreboard">
          <p>RECENT RESULT</p>
          <h2>{matches[2].name}</h2>
          <div className="score-row">
            <b>{matches[2].teams[0]}</b>
            <strong>
              {matches[2].score[0]} <i>:</i> {matches[2].score[1]}
            </strong>
            <b>{matches[2].teams[1]}</b>
          </div>
          <div className="result-note">
            <Status status="FINISHED" /> {matches[2].round}
          </div>
          <Link href="/matches/3/result" className="text-link">
            查看本场数据 →
          </Link>
        </section>
      </div>
    </LeagueShell>
  );
}
