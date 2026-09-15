"use client";
import { useState } from "react";
import { LeagueShell } from "@/components/league-shell";
import { matches, players } from "@/lib/data";

export default function ProfilePage() {
  const [editing, setEditing] = useState(false); const [name, setName] = useState("小丫丫"); const player = players[0];
  return <LeagueShell><section className="profile-hero"><div className="profile-glow"/><img src={player.avatar} alt="个人头像"/><div><p>SUMMONER PROFILE</p>{editing ? <input value={name} onChange={(e) => setName(e.target.value)} autoFocus /> : <h1>{name}</h1>}<span>{player.gameName} · {player.rank}</span><p className="profile-bio">{player.bio}</p></div><button className="button ghost" onClick={() => setEditing(!editing)}>{editing ? "保存资料" : "编辑资料"}</button></section><section className="profile-stats"><div><b>{player.wins}</b><span>总胜场</span></div><div><b>{player.winRate}%</b><span>赛事胜率</span></div><div><b>{player.kda}</b><span>场均 KDA</span></div><div><b>{player.mvp}</b><span>MVP 次数</span></div></section><div className="profile-grid"><section className="panel"><div className="section-heading compact"><div><p>MATCH HISTORY</p><h2>比赛记录</h2></div></div>{matches.slice(0, 3).map((m) => <div className="history-row" key={m.id}><div><b>{m.name}</b><small>{m.date} · {m.bo}</small></div><strong>{m.teams[0]} <i>{m.score[0]} : {m.score[1]}</i> {m.teams[1]}</strong><span className={m.status === "FINISHED" ? "win" : "pending"}>{m.status === "FINISHED" ? "已结束" : "进行中"}</span></div>)}</section><aside className="panel profile-side"><p>POSITION</p><h2>{player.position}</h2><p>常用位置</p><hr/><p>CONNECT</p><b>LSPL · 玩家认证</b><span className="verified">✓ 已认证</span></aside></div></LeagueShell>;
}
