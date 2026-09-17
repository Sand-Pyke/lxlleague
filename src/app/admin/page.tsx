"use client";

import { SafetyCertificateOutlined, TeamOutlined, TrophyOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Row, Spin, Statistic, Tabs } from "antd";
import { useCallback, useEffect, useState } from "react";
import { LeagueShell } from "@/components/app-shell";
import { MatchPanel } from "@/components/admin/match-panel";
import { SignupPanel } from "@/components/admin/signup-panel";
import { UserPanel } from "@/components/admin/user-panel";
import { asArray, errorText, getJson } from "@/components/admin/api-client";

type AdminUser = { id: number; status: string };

export default function AdminPage() {
  const [summary, setSummary] = useState({ matches: 0, players: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");

  /** 只刷新顶部统计：各面板审核 / 增删后调用，避免整页 loading 造成面板重建。 */
  const loadSummary = useCallback(async () => {
    try {
      const [matches, users] = await Promise.all([
        getJson("/api/match/list"),
        getJson("/api/admin/users"),
      ]);
      setSummary({
        matches: asArray(matches.match_list).length,
        players: asArray(users.users).length,
      });
      setPendingCount(
        asArray<AdminUser>(users.users).filter((user) => user.status === "PENDING").length,
      );
      setError("");
    } catch (requestError) {
      setError(errorText(requestError, "后台数据加载失败"));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getJson("/api/current_user");
      if (!current.login || !current.is_admin) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      await loadSummary();
    } catch (requestError) {
      setAllowed(false);
      setError(errorText(requestError, "后台数据加载失败"));
    } finally {
      setLoading(false);
    }
  }, [loadSummary]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LeagueShell>
      {loading ? (
        <div className="loading-state">
          <Spin size="large" />
        </div>
      ) : !allowed ? (
        <Alert
          type="error"
          showIcon
          message="无管理员权限"
          description={error || "请使用已通过审核的管理员账号登录后访问后台。"}
        />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card className="antd-panel">
                <Statistic title="赛事总数" value={summary.matches} prefix={<TrophyOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="antd-panel">
                <Statistic title="选手总数" value={summary.players} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card className="antd-panel">
                <Statistic
                  title="待审核账号"
                  value={pendingCount}
                  prefix={<SafetyCertificateOutlined />}
                />
              </Card>
            </Col>
          </Row>
          {/* 原先 page-title 区块里的说明：只保留影响操作的那一句，不再占一整块版面。 */}
          <p className="admin-hint">
            账号审核、报名管理在此完成；赛事编排与战绩录入需先在「赛事管理」中选择一场赛事。
          </p>
          <Tabs
            style={{ marginTop: 12 }}
            items={[
              { key: "users", label: "用户管理", children: <UserPanel onChanged={loadSummary} /> },
              { key: "signups", label: "报名记录", children: <SignupPanel /> },
              {
                key: "matches",
                label: "赛事管理",
                children: <MatchPanel onChanged={loadSummary} />,
              },
            ]}
          />
        </>
      )}
    </LeagueShell>
  );
}
