"use client";

import { SafetyCertificateOutlined, TeamOutlined, TrophyOutlined } from "@ant-design/icons";
import { Card, Col, Empty, Row, Statistic, Typography } from "antd";
import { LeagueShell } from "@/components/app-shell";
import { matches, players } from "@/lib/data";

export default function AdminPage() {
  return (
    <LeagueShell>
      <section className="page-title">
        <Typography.Text type="secondary">ADMIN CONSOLE</Typography.Text>
        <Typography.Title>赛事管理后台</Typography.Title>
        <Typography.Paragraph>统一管理赛事、报名、选手与对局赛果。</Typography.Paragraph>
      </section>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card className="antd-panel">
            <Statistic title="赛事总数" value={matches.length} prefix={<TrophyOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="antd-panel">
            <Statistic title="选手总数" value={players.length} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="antd-panel">
            <Statistic title="管理状态" value="正常" prefix={<SafetyCertificateOutlined />} />
          </Card>
        </Col>
      </Row>
      <Card className="antd-panel admin-empty-card">
        <Empty description="暂无可管理的赛事或选手数据" />
      </Card>
    </LeagueShell>
  );
}
