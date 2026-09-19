import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell, Status } from "@/components/app-shell";
import { Bracket } from "@/components/bracket";
import { MatchRoster } from "@/components/match-roster";
import { MatchSignup } from "@/components/match-signup";
import { MatchCountdown } from "@/components/match-countdown";
import { formatMatchDate } from "@/lib/format-date";
import { getMatchPageData } from "@/server/matches";

export const dynamic = "force-dynamic";

export default async function MatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { match, players, rounds, totalRounds, viewer, signed, championName } =
    await getMatchPageData(Number(id));
  if (!match) notFound();
  return (
    <LeagueShell>
      <div className="back">
        <Link href="/matches">← 返回赛事中心</Link>
      </div>
      <section className="match-hero">
        <div className="match-hero-schedule">
          <div className="match-hero-head">
            <div className="match-hero-head-info">
              <Status status={match.status} />
              <p className="match-hero-meta">
                {match.round} · {match.bo}
              </p>
              <h1>{match.name}</h1>
              <span className="match-hero-time">比赛时间 {formatMatchDate(match.date)}</span>
            </div>
            {match.status === "CREATED" ? (
              <div className="match-hero-countdown">
                <p className="countdown-title">比赛倒计时</p>
                <MatchCountdown target={match.date} status={match.status} />
              </div>
            ) : null}
          </div>
          <p className="match-hero-schedule-title">赛程</p>
          <Bracket
            rounds={rounds}
            totalRounds={totalRounds}
            matchId={match.id}
            championName={championName}
          />
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
              missingFields={viewer?.missingFields ?? []}
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
        <MatchRoster players={players} />
      </div>
    </LeagueShell>
  );
}
