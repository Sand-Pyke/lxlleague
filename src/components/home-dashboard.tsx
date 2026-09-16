"use client";

import {
  ArrowRightOutlined,
  PlayCircleOutlined,
  TrophyOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Empty, Row, Space, Statistic, Typography } from "antd";
import Link from "next/link";
import type { ReactNode } from "react";
import { LeagueShell, Status } from "@/components/app-shell";
import { MatchCardBody, matchDestination } from "@/components/match-card";
import { RankLabel } from "@/components/rank-label";
import { positionText } from "@/lib/admin-options";
import type { Match, Player } from "@/lib/data";

type Props = { matches: Match[]; players: Player[] };

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
            <b>{player.name}</b>
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

export function HomeDashboard({ matches, players }: Props) {
  const leaders = players.slice(0, 5);
  // MVP 榜单：按 MVP 次数排，同次数看积分。
  // 只统计打过比赛的选手（排除未参赛的占位账号），并固定取 5 人：
  // 每条 .rank-line 高约 64px，行数少了右边卡片会明显矮于左边的赛事卡，两列看着不齐。
  const mvpLeaders = [...players]
    .filter((player) => player.games > 0)
    .sort((a, b) => b.mvp - a.mvp || b.points - a.points)
    .slice(0, 5);
  const recentMatch = matches.find((match) => match.status === "FINISHED");
  // 「今日赛事」只放一场：优先进行中的，否则取列表第一场，其余走「查看全部」。
  const featuredMatch = matches.find((match) => match.status === "LIVE") ?? matches[0];
  const finishedMatchCount = matches.filter((match) => match.status === "FINISHED").length;
  const activeMatchCount = matches.filter((match) => match.status === "LIVE").length;

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
            <Statistic title="注册选手" value={players.length} />
          </Col>
          <Col xs={8}>
            <Statistic title="已完成对局" value={finishedMatchCount} />
          </Col>
          <Col xs={8}>
            <Statistic title="活跃赛事" value={activeMatchCount} />
          </Col>
        </Row>
      </Card>
      {/* 四块面板等宽等高：.home-board 两列等分 + 行高取 1fr，「今日赛事」也在其中。 */}
      <div className="home-board">
        <HomePanel title="今日赛事" extra={<Link href="/matches">查看全部</Link>}>
          {featuredMatch ? (
            <Link className="match-spotlight" href={matchDestination(featuredMatch)}>
              <MatchCardBody match={featuredMatch} />
            </Link>
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
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 MVP 数据" />
          )}
        </HomePanel>

        <HomePanel title="选手排行" extra={<Link href="/rankings">完整榜单</Link>}>
          {leaders.length ? (
            <RankRows players={leaders} value={(player) => `${player.winRate}% 胜率`} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无选手数据" />
          )}
        </HomePanel>

        <HomePanel title="最近赛果">
          {recentMatch ? (
            <>
              <Typography.Title level={4}>{recentMatch.name}</Typography.Title>
              <div className="score-row">
                <b>{recentMatch.teams[0]}</b>
                <strong>
                  {recentMatch.score[0]} <i>:</i> {recentMatch.score[1]}
                </strong>
                <b>{recentMatch.teams[1]}</b>
              </div>
              <div className="result-note">
                <Status status="FINISHED" /> {recentMatch.round}
              </div>
              <Link href={`/matches/${recentMatch.id}/result`}>
                <Button type="link" icon={<ArrowRightOutlined />} iconPlacement="end">
                  查看本场数据
                </Button>
              </Link>
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已结束赛事" />
          )}
        </HomePanel>
      </div>
    </LeagueShell>
  );
}
