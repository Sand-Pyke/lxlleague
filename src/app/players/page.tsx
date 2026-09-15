"use client";

import { TeamOutlined } from "@ant-design/icons";
import { Avatar, Card, Col, Empty, Row, Statistic, Tag, Typography } from "antd";
import { LeagueShell } from "@/components/app-shell";
import { players } from "@/lib/data";

export default function PlayersPage() {
  return (
    <LeagueShell>
      <section className="page-title">
        <Typography.Text type="secondary">PLAYER CENTER</Typography.Text>
        <Typography.Title>选手中心</Typography.Title>
        <Typography.Paragraph>认识并关注每一位峡谷召唤师。</Typography.Paragraph>
      </section>
      {players.length ? (
        <Row gutter={[16, 16]}>
          {players.map((player) => (
            <Col key={player.id} xs={24} sm={12} lg={8} xl={6}>
              <Card className="player-antd-card" cover={<div className="player-antd-cover" />}>
                <div className="player-antd-avatar">
                  <Avatar size={72} src={player.avatar} icon={<TeamOutlined />} />
                </div>
                <Tag color="purple">{player.position}</Tag>
                <Typography.Title level={4}>{player.name}</Typography.Title>
                <Typography.Text type="secondary">{player.gameName}</Typography.Text>
                <Typography.Paragraph ellipsis={{ rows: 2 }}>{player.bio}</Typography.Paragraph>
                <Row>
                  <Col span={8}>
                    <Statistic title="胜场" value={player.wins} />
                  </Col>
                  <Col span={8}>
                    <Statistic title="胜率" value={player.winRate} suffix="%" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="KDA" value={player.kda} />
                  </Col>
                </Row>
                <Tag color="gold">{player.rank}</Tag>
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Card className="antd-panel">
          <Empty description="暂无选手数据" />
        </Card>
      )}
    </LeagueShell>
  );
}
