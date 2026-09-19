import Link from "next/link";
import { roundTitle } from "@/lib/round-title";
import { teamLogo } from "@/lib/teams";

type BracketPair = {
  team1: string;
  team2: string;
  t1: number | null;
  t2: number | null;
  score: [number, number];
  has_score: boolean;
};

type BracketRoundData = {
  round_no: number;
  pairs: BracketPair[];
};

type Props = {
  /** 赛程轮次数据（round_no + pairs），未固化的轮次可缺省。 */
  rounds: BracketRoundData[];
  totalRounds: number;
  matchId: number | string;
  championName?: string | null;
};

function TeamRow({
  name,
  score,
  showScore,
  winner,
  loser,
  href,
}: {
  name: string;
  score: number | null;
  showScore: boolean;
  winner: boolean;
  loser: boolean;
  href: string | null;
}) {
  const pending = name === "待定";
  const logo = teamLogo(name);
  const classes = [
    "bracket-team",
    winner ? "bracket-team--winner" : "",
    loser ? "bracket-team--loser" : "",
    pending ? "bracket-team--pending" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <span className="bracket-team-logo">
        {logo ? <img src={logo} alt={name} /> : pending ? "?" : name.slice(0, 2)}
      </span>
      <span className="bracket-team-name">{name}</span>
      {showScore ? <span className="bracket-team-score">{score ?? 0}</span> : null}
    </>
  );
  return href && !pending ? (
    <Link className={classes} href={href}>
      {body}
    </Link>
  ) : (
    <span className={classes}>{body}</span>
  );
}

/**
 * 单败淘汰对阵图：总轮次 → 各轮对阵（数据缺失的轮次用「待定」占位）。
 * 首轮队伍数从第 1 轮的完整对阵推导（2/4/8/16/32 队）。
 */
export function Bracket({ rounds, totalRounds, matchId, championName }: Props) {
  const firstRoundPairs = rounds.find((item) => item.round_no === 1)?.pairs ?? [];
  const teamCount = firstRoundPairs.length * 2;

  if (teamCount === 0) return <p className="result-note">暂无对阵安排</p>;

  const bracketRounds = Array.from({ length: totalRounds }, (_, index) => {
    const roundNo = index + 1;
    const expected = Math.max(1, Math.round(teamCount / Math.pow(2, roundNo)));
    const existing = rounds.find((item) => item.round_no === roundNo)?.pairs ?? [];
    return Array.from({ length: expected }, (_, matchIndex) => {
      const pair = existing[matchIndex];
      const team1 = pair?.team1 || "待定";
      const team2 = pair?.team2 || "待定";
      const score1 = pair ? pair.score[0] : null;
      const score2 = pair ? pair.score[1] : null;
      const showScore = Boolean(
        pair?.has_score || (score1 !== null && score2 !== null && (score1 > 0 || score2 > 0)),
      );
      const winner =
        score1 !== null && score2 !== null && score1 !== score2
          ? score1 > score2
            ? ("team1" as const)
            : ("team2" as const)
          : null;
      const href =
        pair?.t1 && pair?.t2
          ? `/matches/${matchId}/result?round=${roundNo}&t1=${pair.t1}&t2=${pair.t2}`
          : null;
      return { team1, team2, score1, score2, showScore, winner, href };
    });
  });

  return (
    <>
      <div className="bracket">
        {bracketRounds.map((matches, roundIndex) => (
          <div className="bracket-round" key={roundIndex}>
            <p className="bracket-round-title">{roundTitle(roundIndex + 1, totalRounds)}</p>
            <div className="bracket-round-matches">
              {matches.map((match, matchIndex) => (
                <div className="bracket-match" key={matchIndex}>
                  <TeamRow
                    name={match.team1}
                    score={match.score1}
                    showScore={match.showScore}
                    winner={match.winner === "team1"}
                    loser={match.winner === "team2"}
                    href={match.href}
                  />
                  <TeamRow
                    name={match.team2}
                    score={match.score2}
                    showScore={match.showScore}
                    winner={match.winner === "team2"}
                    loser={match.winner === "team1"}
                    href={match.href}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {championName ? <p className="bracket-champion">🏆 冠军 · {championName}</p> : null}
    </>
  );
}
