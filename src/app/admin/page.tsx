import { LeagueShell } from "@/components/league-shell";
import { matches, players } from "@/lib/data";

export default function AdminPage() {
  return (
    <LeagueShell>
      <section className="page-title">
        <p>ADMIN CONSOLE</p>
        <h1>赛事管理后台</h1>
        <span>管理赛事、报名、选手与对局赛果。</span>
      </section>
      <div className="admin-grid">
        <section className="panel">
          <h2>赛事列表</h2>
          {matches.map((m) => (
            <div className="admin-row" key={m.id}>
              <div>
                <b>{m.name}</b>
                <small>
                  {m.date} · {m.bo}
                </small>
              </div>
              <span>{m.status}</span>
              <button>编辑</button>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>用户列表</h2>
          {players.slice(0, 6).map((p) => (
            <div className="admin-row" key={p.id}>
              <div>
                <b>{p.name}</b>
                <small>
                  {p.position} · {p.rank}
                </small>
              </div>
              <span>正常</span>
              <button>管理</button>
            </div>
          ))}
        </section>
      </div>
    </LeagueShell>
  );
}
