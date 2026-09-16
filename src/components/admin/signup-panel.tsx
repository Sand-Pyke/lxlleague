"use client";

import { ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { positionText } from "@/lib/admin-options";
import { asArray, errorText, getJson, postJson, successText } from "./api-client";

type SignupRow = {
  sign_id: number;
  user_id: number;
  username: string;
  match_id: number;
  match_name: string;
  yy_name: string;
  main_pos: string;
  sub_pos: string;
  can_substitute: boolean;
};

export function SignupPanel() {
  const [rows, setRows] = useState<SignupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [matchFilter, setMatchFilter] = useState<number | "ALL">("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson("/api/admin/sign/list");
      setRows(asArray<SignupRow>(data.signup_list));
    } catch (requestError) {
      setError(errorText(requestError, "无法读取报名记录"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancelSignup(row: SignupRow) {
    setBusyId(row.sign_id);
    try {
      const data = await postJson(`/api/admin/sign/cancel/${row.sign_id}`);
      message.success(successText(data, "已取消该选手报名"));
      await load();
    } catch (requestError) {
      message.error(errorText(requestError, "取消失败"));
    } finally {
      setBusyId(null);
    }
  }

  const matchOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows) seen.set(row.match_id, row.match_name);
    return [
      { value: "ALL" as const, label: "全部赛事" },
      ...[...seen].map(([id, name]) => ({ value: id, label: `${name} (#${id})` })),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (matchFilter !== "ALL" && row.match_id !== matchFilter) return false;
      if (!text) return true;
      return [row.username, row.yy_name, row.match_name].join(" ").toLowerCase().includes(text);
    });
  }, [keyword, matchFilter, rows]);

  const columns: ColumnsType<SignupRow> = [
    { title: "赛事", dataIndex: "match_name", key: "match_name" },
    {
      title: "账号",
      dataIndex: "username",
      key: "username",
      width: 140,
    },
    {
      title: "YY / 语音名",
      dataIndex: "yy_name",
      key: "yy_name",
      width: 150,
      render: (value: string) => value || <Typography.Text type="secondary">未填写</Typography.Text>,
    },
    {
      title: "位置",
      key: "positions",
      width: 170,
      render: (_, row) => (
        <Space size={4}>
          <Tag color="purple">{positionText(row.main_pos)}</Tag>
          {row.sub_pos ? <Tag>{positionText(row.sub_pos)}</Tag> : null}
        </Space>
      ),
    },
    {
      title: "替补",
      dataIndex: "can_substitute",
      key: "can_substitute",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="blue">可替补</Tag> : "—"),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_, row) => (
        <Popconfirm
          title={`取消 ${row.username} 的报名？`}
          okText="取消报名"
          okButtonProps={{ danger: true }}
          cancelText="返回"
          onConfirm={() => cancelSignup(row)}
        >
          <Button size="small" danger loading={busyId === row.sign_id}>
            取消报名
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      className="antd-panel"
      title="报名记录"
      extra={
        <Space>
          <Tag>{rows.length} 条</Tag>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      }
    >
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="搜索账号 / 语音名"
          style={{ width: 260 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select
          style={{ width: 240 }}
          value={matchFilter}
          onChange={(value) => setMatchFilter(value)}
          options={matchOptions}
        />
      </Space>
      {loading && !rows.length ? (
        <div className="loading-state">
          <Spin size="large" />
        </div>
      ) : filtered.length ? (
        <Table
          rowKey="sign_id"
          size="small"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 12, showSizeChanger: false }}
        />
      ) : (
        <Empty description="暂无待选人的报名记录" />
      )}
    </Card>
  );
}
