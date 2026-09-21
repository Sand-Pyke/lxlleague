import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/app-shell";
import { Bracket } from "@/components/bracket";
import { RankLabel } from "@/components/rank-label";
import { championIcon, itemAsset, itemIcon } from "@/lib/game-assets";
import { formatMatchDate } from "@/lib/format-date";
import { roundTitle } from "@/lib/round-title";
import { teamLogo } from "@/lib/teams";
import { getMatchResultData, getMatchRoundsData } from "@/server/matches";

export const dynamic = "force-dynamic";

const POS_ORDER = ["TOP", "JUG", "MID", "ADC", "SUP"];

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
  const [outcome, schedule] = await Promise.all([
    getMatchResultData(Number(id), {
      round: query.round ? Number(query.round) : null,
      teamOneId: query.t1 ? Number(query.t1) : null,
      teamTwoId: query.t2 ? Number(query.t2) : null,
    }),
    getMatchRoundsData(Number(id)),
  ]);
  if (outcome.kind === "missing") notFound();
  if (schedule.kind === "missing") notFound();

  const {
    match,
    selected_round: selectedRound,
    pairs,
    selected_pair: selectedPair,
    games,
  } = outcome.data;

  const activePair = pairs.find((pair) => pair.selected) ?? null;
  // 该对阵已录入的小局（服务器按 game_no 升序返回）
  const hasRecords = games.length > 0;
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

      {schedule.data.rounds.length > 0 ? (
        <section className="panel bracket-panel">
          <Bracket
            rounds={schedule.data.rounds}
            totalRounds={schedule.data.total_rounds}
            matchId={id}
          />
        </section>
      ) : null}

      <section className="result-hero">
        <p>TOURNAMENT RESULT · {match.bo}</p>
        <h1>{match.name}</h1>
        {match.champion_name ? (
          <div className="champion">
            <small>CHAMPION · 冠军</small>
            <b>{match.champion_name}</b>
          </div>
        ) : (
          <p className="round-state">{roundTitle(match.current_round, match.total_rounds)}</p>
        )}
        {match.fmvp_name ? (
          <div className="fmvp">
            <small>今日FMVP</small>
            <b>{match.fmvp_name}</b>
          </div>
        ) : null}
        <span>
          {formatMatchDate(match.date)} ·{" "}
          {match.status === "FINISHED" ? "比赛已结束" : "比赛进行中"}
        </span>
      </section>

      {selectedPair ? (
        <>
          <section className="schedule">
            <div className="panel pair-card active">
              <div className="pair-head">
                <b>
                  {teamLogo(selectedPair.team1) && (
                    <img
                      className="pair-team-logo pair-team-logo--large"
                      src={teamLogo(selectedPair.team1)}
                      alt={selectedPair.team1}
                    />
                  )}
                </b>
                <span className="pair-score">
                  {activePair?.has_score ? `${activePair.score[0]} : ${activePair.score[1]}` : "VS"}
                </span>
                <b>
                  {teamLogo(selectedPair.team2) && (
                    <img
                      className="pair-team-logo pair-team-logo--large"
                      src={teamLogo(selectedPair.team2)}
                      alt={selectedPair.team2}
                    />
                  )}
                </b>
              </div>
            </div>
          </section>

          {hasRecords ? (
            <>
              <section className="panel game-tabs">
                {games.map((game) => (
                  <Link
                    className={game.game_no === shownGame ? "selected" : ""}
                    key={game.game_no}
                    href={`/matches/${id}/result?round=${selectedRound}&t1=${selectedPair.team_one_id}&t2=${selectedPair.team_two_id}&game=${game.game_no}`}
                    scroll={false}
                  >
                    GAME {game.game_no}
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
                                  <img
                                    className="result-avatar"
                                    src={row.avatar || undefined}
                                    alt=""
                                  />
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
                                  .slice(0, 7)
                                  .map((item, index) =>
                                    itemIcon(item) ? (
                                      <img
                                        key={`${item}-${index}`}
                                        src={itemIcon(item)}
                                        alt=""
                                        title={itemAsset(item)?.name ?? item}
                                      />
                                    ) : (
                                      <i
                                        className="item-missing"
                                        key={`${item}-${index}`}
                                        title={item}
                                      />
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
          ) : (
            <section className="panel empty">
              <h2>该对阵尚未录入战绩</h2>
            </section>
          )}
        </>
      ) : (
        <section className="panel empty">
          <h2>本轮暂无对阵</h2>
        </section>
      )}
    </LeagueShell>
  );
}
