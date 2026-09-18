import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { RankLabel } from "@/components/rank-label";
import { championIcon, itemAsset, itemIcon } from "@/lib/game-assets";
import { formatMatchDate } from "@/lib/format-date";
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
  searchParams: Promise<{ round?: string; t1?: string; t2?: string; game?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const outcome = await getMatchResultData(Number(id), {
    round: query.round ? Number(query.round) : null,
    teamOneId: query.t1 ? Number(query.t1) : null,
    teamTwoId: query.t2 ? Number(query.t2) : null,
  });
  if (outcome.kind === "missing") notFound();

  const {
    match,
    rounds,
    selected_round: selectedRound,
    pairs,
    selected_pair: selectedPair,
    games,
  } = outcome.data;

  const total = BO_GAMES[match.bo] ?? 3;
  // 小局标签动态渲染：已有系列比分时按实际打完的局数展示（如 2:0 只显示 GAME 1/2）
  const activePair = pairs.find((pair) => pair.selected) ?? null;
  const gamesToShow =
    activePair && activePair.has_score && activePair.score[0] + activePair.score[1] > 0
      ? Math.min(activePair.score[0] + activePair.score[1], total)
      : total;
  const requestedGame = Number(query.game);
  const shownGame =
    games.some((item) => item.game_no === requestedGame) && requestedGame > 0
      ? requestedGame
      : (games[0]?.game_no ?? 1);
  const current = games.find((item) => item.game_no === shownGame);
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
        <p>TOURNAMENT RESULT · {match.bo}</p>
        <h1>{match.name}</h1>
        {match.champion_name ? (
          <div className="champion">
            <small>CHAMPION · 冠军</small>
            <b>{match.champion_name}</b>
          </div>
        ) : (
          <p className="round-state">
            共 {match.total_rounds} 轮 · 当前第 {match.current_round} 轮
          </p>
        )}
        <span>
          {formatMatchDate(match.date)} · {match.status === "FINISHED" ? "比赛已结束" : "比赛进行中"}
        </span>
      </section>

      <section className="panel game-tabs">
        {rounds.map((roundNo) => (
          <Link
            className={roundNo === selectedRound ? "selected" : ""}
            key={roundNo}
            href={`/matches/${id}/result?round=${roundNo}`}
          >
            第 {roundNo} 轮
          </Link>
        ))}
      </section>

      <section className="schedule">
        <p className="schedule-round">
          第 {selectedRound} 轮 <small>点击比分查看该组逐局明细</small>
        </p>
        {pairs.length ? (
          pairs.map((pair) => (
            <div
              className={`panel pair-card${pair.selected ? " active" : ""}`}
              key={`${pair.team_one_id}-${pair.team_two_id}`}
            >
              <div className="pair-head">
                <b>{pair.team1}</b>
                <Link
                  className="pair-score"
                  href={`/matches/${id}/result?round=${selectedRound}&t1=${pair.team_one_id}&t2=${pair.team_two_id}`}
                >
                  {pair.has_score ? `${pair.score[0]} : ${pair.score[1]}` : "— : —"}
                </Link>
                <b>{pair.team2}</b>
              </div>
            </div>
          ))
        ) : (
          <section className="panel empty">
            <h2>本轮暂无对阵</h2>
          </section>
        )}
      </section>

      {selectedPair ? (
        <>
          <section className="panel game-tabs">
            {Array.from({ length: gamesToShow }, (_, index) => index + 1).map((gameNo) => (
              <Link
                className={gameNo === shownGame ? "selected" : ""}
                key={gameNo}
                href={`/matches/${id}/result?round=${selectedRound}&t1=${selectedPair.team_one_id}&t2=${selectedPair.team_two_id}&game=${gameNo}`}
              >
                GAME {gameNo}
                {games.some((item) => item.game_no === gameNo) && <i className="game-dot" />}
              </Link>
            ))}
          </section>

          <p className="schedule-round">
            {selectedPair.team1} <small>VS</small> {selectedPair.team2}
          </p>

          {current ? (
            groups.map((group) => {
              const teamKills = group.rows.reduce((sum, row) => sum + row.kills, 0);
              return (
                <section className="panel result-table" key={group.key}>
                  <div className="section-heading compact">
                    <div>
                      <p>GAME {shownGame}</p>
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
              <h2>该组该局暂无战绩数据</h2>
            </section>
          )}
        </>
      ) : null}
    </LeagueShell>
  );
}
