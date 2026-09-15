import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell, Status } from "@/components/league-shell";
import { getMatch, players } from "@/lib/data";

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const match = getMatch(Number(id)); if (!match) notFound();
  return <LeagueShell><div className="back"><Link href="/matches">← 返回赛事中心</Link></div><section className="match-hero"><div><Status status={match.status}/><p>{match.round} · {match.bo}</p><h1>{match.name}</h1><span>{match.date}</span></div><div className="big-score"><b>{match.teams[0]}</b><strong>{match.score[0]} <i>:</i> {match.score[1]}</strong><b>{match.teams[1]}</b></div></section><div className="detail-grid"><section className="panel"><div className="section-heading compact"><div><p>EVENT INFO</p><h2>赛事信息</h2></div></div><dl className="details"><div><dt>赛制</dt><dd>{match.bo}</dd></div><div><dt>参赛选手</dt><dd>{match.playerCount} 人</dd></div><div><dt>对阵队伍</dt><dd>{match.teamCount} 支</dd></div><div><dt>比赛状态</dt><dd>{match.status === "LIVE" ? "正在进行" : match.status === "FINISHED" ? "已结束" : "报名中"}</dd></div></dl><div className="detail-actions"><button className="button primary">{match.status === "CREATED" ? "立即报名" : "关注赛事"}</button><Link className="button ghost" href={`/matches/${match.id}/lineup`}>查看对阵</Link>{match.status === "FINISHED" && <Link className="button ghost" href={`/matches/${match.id}/result`}>赛果数据</Link>}</div></section><aside className="panel roster"><p>REGISTERED PLAYERS</p><h2>已报名选手</h2>{players.slice(0, 5).map((p) => <div key={p.id}><img src={p.avatar} alt=""/><span><b>{p.name}</b><small>{p.position}</small></span><em>{p.rank}</em></div>)}</aside></div></LeagueShell>;
}
