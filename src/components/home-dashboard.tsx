"use client";

import {
  ArrowRightOutlined,
  PlayCircleOutlined,
  TrophyOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";
import { Button, Card, Col, Empty, Row, Space, Statistic, Typography } from "antd";
import Link from "next/link";
import { LeagueShell, Status } from "@/components/app-shell";
import { MatchCard } from "@/components/match-card";
import { positionText } from "@/lib/admin-options";
import type { Match, Player } from "@/lib/data";

type Props = { matches: Match[]; players: Player[] };

export function HomeDashboard({ matches, players }: Props) {
  const leaders = players.slice(0, 5);
  const recentMatch = matches.find((match) => match.status === "FINISHED");
  const finishedMatchCount = matches.filter((match) => match.status === "FINISHED").length;
  const activeMatchCount = matches.filter((match) => match.status === "LIVE").length;

  return (
    <LeagueShell>
      <Card className="dashboard-hero" bordered={false}>
        <Row gutter={[32, 28]} align="middle">
          <Col xs={24} md={15}>
            <Typography.Text className="dashboard-kicker">
              LXL LEAGUE OF LEGENDS
            </Typography.Text>
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
      <section className="antd-section">
        <div className="antd-section__heading">
          <div>
            <Typography.Text type="secondary">LIVE BOARD</Typography.Text>
            <Typography.Title level={3}>今日赛事</Typography.Title>
          </div>
          <Link href="/matches">
            <Button type="link" icon={<ArrowRightOutlined />} iconPosition="end">
              查看全部
            </Button>
          </Link>
        </div>
        {matches.length ? (
          <div className="match-grid">
            {matches.slice(0, 2).map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        ) : (
          <Card>
            <Empty description="暂无赛事数据" />
          </Card>
        )}
      </section>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="选手排行"
            extra={<Link href="/rankings">完整榜单</Link>}
            className="antd-panel"
          >
            {leaders.length ? (
              leaders.map((player, index) => (
                <Link className="rank-line" href={`/profile?uid=${player.id}`} key={player.id}>
                  <strong className={`rank-number rank-${index + 1}`}>{index + 1}</strong>
                  <img src={player.avatar} alt="" />
                  <div>
                    <b>{player.name}</b>
                    <small>
                      {positionText(player.position)} 路 {player.rank || "未设置"}
                    </small>
                  </div>
                  <span>{player.winRate}% 胜率</span>
                </Link>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无选手数据" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="最近赛果" className="antd-panel">
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
                  <Button type="link" icon={<ArrowRightOutlined />} iconPosition="end">
                    查看本场数据
                  </Button>
                </Link>
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已结束赛事" />
            )}
          </Card>
        </Col>
      </Row>
    </LeagueShell>
  );
}
