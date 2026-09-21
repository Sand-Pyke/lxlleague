"use client";

import {
  PlayCircleOutlined,
  TrophyOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Empty, Row, Space, Statistic, Typography } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";
import { LeagueShell } from "@/components/app-shell";
import { MatchCardBody, matchDestination } from "@/components/match-card";
import { RankLabel } from "@/components/rank-label";
import { positionText } from "@/lib/admin-options";
import type { Match, Player, RecentResult } from "@/lib/data";

type Props = { matches: Match[]; players: Player[]; recent: RecentResult[] };

/**
 * 首页四块面板共用的外壳。四张卡片结构一致，配合 .home-board 的等分行高即为等大。
 * 「今日赛事」的标题也走这里，不再另用 section 标题，四块才真正对称。
 */
function HomePanel({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card title={title} extra={extra} className="antd-panel home-panel">
      {children}
    </Card>
  );
}

/** 榜单行：选手排行与 MVP 榜单共用同一套行结构，只有右侧取值不同。 */
function RankRows({
  players,
  value,
  valueClass,
}: {
  players: Player[];
  value: (player: Player) => ReactNode;
  valueClass?: string;
}) {
  return (
    <>
      {players.map((player, index) => (
        <Link className="rank-line" href={`/profile?uid=${player.id}`} key={player.id}>
          <strong className={`rank-number rank-${index + 1}`}>{index + 1}</strong>
          <img src={player.avatar || undefined} alt="" />
          <div>
            <b>{player.gameName || player.name}</b>
            <small>
              {positionText(player.position)} <RankLabel rank={player.rank} />
            </small>
          </div>
          <span className={valueClass}>{value(player)}</span>
        </Link>
      ))}
    </>
  );
}

export function HomeDashboard({ matches, players, recent }: Props) {
  // 榜单只列「有成绩」的选手，避免出现一整行 0 胜率 / 0 次 MVP 的空数据：
  // - 选手排行：积分 > 0（积分公式里全败也是 0 分，与 /rankings 完整榜单口径一致）；
  // - MVP 榜：真的拿过 MVP（mvp > 0），否则整榜都是「0 次 MVP」，没有意义。
  const ranked = players.filter((player) => player.points > 0);
  const leaders = ranked.slice(0, 5);
  // MVP 榜单：按 MVP 次数排，同次数看积分。固定取 5 人：
  // 每条 .rank-line 高约 64px，行数少了右边卡片会明显矮于左边的赛事卡，两列看着不齐。
  const mvpLeaders = players
    .filter((player) => player.mvp > 0)
    .sort((a, b) => b.mvp - a.mvp || b.points - a.points)
    .slice(0, 5);
  // 「今日赛事」最多放两场：进行中的优先，其余按时间升序；其余赛事走「查看全部」。
  const featuredMatches = matches
    .filter((match) => match.status !== "FINISHED")
    .sort((a, b) => {
      const liveDiff = Number(b.status === "LIVE") - Number(a.status === "LIVE");
      if (liveDiff) return liveDiff;
      // 设置了排期时间的排前面，未设置的沉底。
      const aTime = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 2);
  const finishedMatchCount = matches.filter((match) => match.status === "FINISHED").length;
  // 「活跃赛事」= 尚未结束的赛事（报名中/进行中），与「当前赛事」页签口径一致。
  const activeMatchCount = matches.filter((match) => match.status !== "FINISHED").length;

  return (
    <LeagueShell>
      <Card className="dashboard-hero" variant="borderless">
        <Row gutter={[32, 28]} align="middle">
          <Col xs={24} md={15}>
            <Typography.Text className="dashboard-kicker">LXL LEAGUE OF LEGENDS</Typography.Text>
            <Typography.Title level={1}>峡谷冠军联赛</Typography.Title>
            <Typography.Paragraph>每一场对局，都是通往冠军的证明。</Typography.Paragraph>
            <Space wrap>
              <Link href="/matches">
                <Button type="primary" size="large" icon={<PlayCircleOutlined />}>
                  查看赛事
                </Button>
              </Link>
              <Link href="/players">
                <Button size="large" icon={<UsergroupAddOutlined />}>
                  选手中心
                </Button>
              </Link>
            </Space>
          </Col>
          <Col xs={24} md={9}>
            <div className="dashboard-orb">
              <TrophyOutlined />
            </div>
          </Col>
        </Row>
        <Row className="dashboard-stats" gutter={[12, 12]}>
          <Col xs={8}>
            <Link className="stat-link" href="/players">
              <Statistic title="注册选手" value={players.length} />
            </Link>
          </Col>
          <Col xs={8}>
            <Link className="stat-link" href="/matches?tab=history">
              <Statistic title="已完成对局" value={finishedMatchCount} />
            </Link>
          </Col>
          <Col xs={8}>
            <Link className="stat-link" href="/matches?tab=today">
              <Statistic title="活跃赛事" value={activeMatchCount} />
            </Link>
          </Col>
        </Row>
      </Card>
      {/* 四块面板等宽等高：.home-board 两列等分 + 行高取 1fr，「今日赛事」也在其中。 */}
      <div className="home-board">
        <HomePanel title="今日赛事" extra={<Link href="/matches">查看全部</Link>}>
          {featuredMatches.length ? (
            <div className="match-duo">
              {featuredMatches.map((match) => (
                <Link key={match.id} className="match-spotlight" href={matchDestination(match)}>
                  <MatchCardBody match={match} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无赛事数据" />
          )}
        </HomePanel>

        <HomePanel title="MVP 榜单" extra={<span className="panel-hint">按 MVP 次数排序</span>}>
          {mvpLeaders.length ? (
            <RankRows
              players={mvpLeaders}
              valueClass="mvp-count"
              value={(player) => `${player.mvp} 次 MVP`}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无 MVP 数据，比赛结束后自动生成"
            />
          )}
        </HomePanel>

        <HomePanel title="选手排行" extra={<Link href="/rankings">完整榜单</Link>}>
          {leaders.length ? (
            <RankRows players={leaders} value={(player) => `${player.points} 积分`} />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无排行数据，比赛结束后自动生成"
            />
          )}
        </HomePanel>

        <HomePanel title="最近赛果" extra={<Link href="/matches?tab=history">查看全部</Link>}>
          {recent.length ? (
            <div className="recent-results">
              {recent.map((item) => (
                <Link className="recent-result" href={`/matches/${item.id}/result`} key={item.id}>
                  <span className="recent-result-name">
                    <b>{item.name}</b>
                    <small>
                      第 {item.round_no} 轮 · {item.status === "FINISHED" ? "已结束" : "进行中"}
                    </small>
                  </span>
                  <span className="recent-result-score">
                    {item.pairs.map((pair, index) => (
                      <span key={`${pair.team1}-${pair.team2}`}>
                        {pair.team1} {pair.score[0]} : {pair.score[1]} {pair.team2}
                        {index < item.pairs.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无赛果数据" />
          )}
        </HomePanel>
      </div>
    </LeagueShell>
  );
}
