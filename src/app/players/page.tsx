import { LeagueShell } from "@/components/league-shell";
import { players } from "@/lib/data";

export default function PlayersPage() {
  return (
    <LeagueShell>
      <section className="page-title">
        <p>PLAYER CENTER</p>
        <h1>选手中心</h1>
        <span>认识并关注每一位峡谷召唤师。</span>
      </section>
      <div className="player-grid">
        {players.map((player) => (
          <article key={player.id} className="player-card">
            <div className="player-cover" />
            <img src={player.avatar} alt="" />
            <span className="role">{player.position}</span>
            <h2>{player.name}</h2>
            <p className="game-name">{player.gameName}</p>
            <p className="bio">{player.bio}</p>
            <div className="player-numbers">
              <div>
                <b>{player.wins}</b>
                <span>胜场</span>
              </div>
              <div>
                <b>{player.winRate}%</b>
                <span>胜率</span>
              </div>
              <div>
                <b>{player.kda}</b>
                <span>KDA</span>
              </div>
            </div>
            <span className="tier">{player.rank}</span>
          </article>
        ))}
      </div>
    </LeagueShell>
  );
}
