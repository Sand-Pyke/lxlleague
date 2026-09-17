import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { RankLabel } from "@/components/rank-label";
import { championIcon, itemAsset, itemIcon } from "@/lib/game-assets";
import { getMatchResultData } from "@/server/matches";

export const dynamic = "force-dynamic";

const POS_ORDER = ["TOP", "JUG", "MID", "ADC", "SUP"];
const BO_GAMES: Record<string, number> = { BO1: 1, BO3: 3, BO5: 5 };

const posRank = (position: string) => {
  const index = POS_ORDER.indexOf(position);
  return index < 0 ? POS_ORDER.length : index;
};

const kda = (kills: number, deaths: number, assists: number) =>
  ((kills + assists) / (deaths > 0 ? deaths : 1)).toFixed(1);

const killShare = (kills: number, assists: number, teamKills: number) =>
  teamKills > 0 ? Math.min(100, Math.round(((kills + assists) / teamKills) * 100)) : 0;

export default async function Result({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ game?: string }>;
}) {
  const { id } = await params;
  const { game } = await searchParams;
  const outcome = await getMatchResultData(Number(id));
  if (outcome.kind === "missing") notFound();

  const { match, games } = outcome.data;
  const total = BO_GAMES[match.bo] ?? 1;
  const requested = Number(game);
  const shown =
    games.some((item) => item.game_no === requested) && requested > 0
      ? requested
      : (games[0]?.game_no ?? 1);
  const current = games.find((item) => item.game_no === shown);
  const groups = [
    {
      key: "win",
      label: "胜方",
      rows: (current?.rows ?? []).filter((row) => row.result === "win"),
    },
    {
      key: "lose",
      label: "败方",
      rows: (current?.rows ?? []).filter((row) => row.result !== "win"),
    },
  ].map((group) => ({
    ...group,
    rows: [...group.rows].sort((a, b) => posRank(a.team_pos) - posRank(b.team_pos)),
  }));

  return (
    <LeagueShell>
      <div className="back">
        <Link href="/matches">← 返回赛事中心</Link>
      </div>
      <section className="result-hero">
        <p>FINAL RESULT · {match.bo}</p>
        <h1>{match.name}</h1>
        <div>
          <b>{match.teams[0]}</b>
          <strong>
            {match.score[0]} <i>:</i> {match.score[1]}
          </strong>
          <b>{match.teams[1]}</b>
        </div>
        <span>
          {match.date} · {match.status === "FINISHED" ? "比赛已结束" : "比赛进行中"}
        </span>
      </section>
      <section className="panel game-tabs">
        {Array.from({ length: total }, (_, index) => index + 1).map((gameNo) => (
          <Link
            className={gameNo === shown ? "selected" : ""}
            key={gameNo}
            href={`/matches/${id}/result?game=${gameNo}`}
          >
            GAME {gameNo}
            {games.some((item) => item.game_no === gameNo) && <i className="game-dot" />}
          </Link>
        ))}
      </section>
      {current ? (
        groups.map((group) => {
          const teamKills = group.rows.reduce((sum, row) => sum + row.kills, 0);
          return (
            <section className="panel result-table" key={group.key}>
              <div className="section-heading compact">
                <div>
                  <p>GAME {shown}</p>
                  <h2>
                    {group.label} · {group.rows[0]?.team_name || match.name}
                  </h2>
                </div>
              </div>
              <div className="result-head">
                <span>选手</span>
                <span>段位</span>
                <span>K / D / A</span>
                <span>KDA</span>
                <span>参战率</span>
                <span>补兵</span>
                <span>视野</span>
                <span>装备</span>
              </div>
              {group.rows.map((row) => {
                const hero = championIcon(row.champion);
                return (
                  <div className="result-row" key={row.id}>
                    <div className="result-player">
                      <div className="result-portrait">
                        {hero ? (
                          <img src={hero} alt={row.champion} />
                        ) : (
                          <b>{(row.display_name || row.username || "?").slice(0, 1)}</b>
                        )}
                        {row.team_pos && row.team_pos !== "无" && <i>{row.team_pos}</i>}
                        {row.is_mvp ? <em className="mvp">MVP</em> : null}
                        {row.is_svp ? <em className="svp">SVP</em> : null}
                      </div>
                      <span>
                        <b>
                          <img className="result-avatar" src={row.avatar || undefined} alt="" />
                          {row.display_name || row.username}
                        </b>
                        <small>
                          {row.champion || "未录入英雄"} · Lv.{row.level}
                        </small>
                      </span>
                    </div>
                    <span>
                      <RankLabel rank={row.rank} fallback="-" />
                    </span>
                    <span>
                      {row.kills} / {row.deaths} / {row.assists}
                    </span>
                    <span>{kda(row.kills, row.deaths, row.assists)}</span>
                    <span>{killShare(row.kills, row.assists, teamKills)}%</span>
                    <span>{row.cs}</span>
                    <span>{row.vision}</span>
                    <span className="result-items">
                      {row.items.length ? (
                        row.items
                          .slice(0, 6)
                          .map((item, index) =>
                            itemIcon(item) ? (
                              <img
                                key={`${item}-${index}`}
                                src={itemIcon(item)}
                                alt=""
                                title={itemAsset(item)?.name ?? item}
                              />
                            ) : (
                              <i className="item-missing" key={`${item}-${index}`} title={item} />
                            ),
                          )
                      ) : (
                        <small>-</small>
                      )}
                    </span>
                  </div>
                );
              })}

              {group.rows.length < 5 && (
                <p className="result-note">仅录入 {group.rows.length}/5 人数据</p>
              )}
            </section>
          );
        })
      ) : (
        <section className="panel empty">
          <h2>该局暂无战绩数据</h2>
        </section>
      )}
    </LeagueShell>
  );
}
