"use client";

import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Modal,
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
import {
  RANK_OPTIONS,
  REVIEW_STATUS_COLOR,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUSES,
  positionText,
  type ReviewStatus,
} from "@/lib/admin-options";
import { asArray, deleteJson, errorText, getJson, postJson, successText } from "./api-client";

type AdminUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  status: ReviewStatus;
  kookName: string | null;
  createdAt: string;
  profile: {
    gameName: string;
    rank: string;
    mainPosition: string;
    subPosition: string;
    avatar: string;
  } | null;
};

type UserRecord = {
  id: number;
  match_id: number | null;
  match_name: string;
  game_no: number;
  champion: string;
  result: string;
  kills: number;
  deaths: number;
  assists: number;
  is_mvp: boolean;
  played_at: string;
};

const formatTime = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

export function UserPanel({ onChanged }: { onChanged?: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [gameNameTarget, setGameNameTarget] = useState<AdminUser | null>(null);
  const [gameNameValue, setGameNameValue] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [recordsTarget, setRecordsTarget] = useState<AdminUser | null>(null);
  const [records, setRecords] = useState<UserRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson("/api/admin/users");
      setUsers(asArray<AdminUser>(data.users));
    } catch (requestError) {
      setError(errorText(requestError, "无法读取用户列表"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 统一的动作包装：调用接口 → 提示后端返回的 msg → 刷新列表与顶部统计。 */
  const run = useCallback(
    async (action: () => Promise<Record<string, unknown>>, targetId: number, fallback: string) => {
      setBusyId(targetId);
      try {
        const data = await action();
        message.success(successText(data, fallback));
        await load();
        onChanged?.();
      } catch (requestError) {
        message.error(errorText(requestError, fallback));
      } finally {
        setBusyId(null);
      }
    },
    [load, onChanged],
  );

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter !== "ALL" && user.status !== statusFilter) return false;
      if (!text) return true;
      return [user.username, user.profile?.gameName ?? "", user.kookName ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [keyword, statusFilter, users]);

  const pendingCount = users.filter((user) => user.status === "PENDING").length;

  async function openRecords(user: AdminUser) {
    setRecordsTarget(user);
    setRecords([]);
    setRecordsLoading(true);
    try {
      const data = await getJson(`/api/admin/users/records/${user.id}`);
      setRecords(asArray<UserRecord>(data.records));
    } catch (requestError) {
      message.error(errorText(requestError, "无法读取战绩"));
    } finally {
      setRecordsLoading(false);
    }
  }

  const columns: ColumnsType<AdminUser> = [
    {
      title: "账号",
      key: "account",
      render: (_, user) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{user.username}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {user.isAdmin ? "管理员" : "普通用户"} · KOOK {user.kookName || "未填写"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "游戏资料",
      key: "profile",
      render: (_, user) =>
        user.profile ? (
          <Space direction="vertical" size={0}>
            <Typography.Text>{user.profile.gameName || "未设置"}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user.profile.rank || "未定段"} · {positionText(user.profile.mainPosition)}
              {user.profile.subPosition ? ` / ${positionText(user.profile.subPosition)}` : ""}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">未完善</Typography.Text>
        ),
    },
    {
      title: "段位",
      key: "rank",
      width: 150,
      render: (_, user) => (
        <Select
          size="small"
          style={{ width: 130 }}
          value={user.profile?.rank ?? ""}
          options={RANK_OPTIONS}
          loading={busyId === user.id}
          onChange={(rank) =>
            void run(
              () => postJson("/api/admin/users/rank", { userId: user.id, rank }),
              user.id,
              "段位已更新",
            )
          }
        />
      ),
    },
    {
      title: "审核状态",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status: ReviewStatus) => (
        <Tag color={REVIEW_STATUS_COLOR[status]}>{REVIEW_STATUS_LABEL[status]}</Tag>
      ),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (value: string) => formatTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 330,
      render: (_, user) => (
        <Space wrap size={[4, 4]}>
          {user.status !== "APPROVED" ? (
            <Button
              size="small"
              type="primary"
              loading={busyId === user.id}
              onClick={() =>
                void run(
                  () => postJson("/api/admin/users/status", { userId: user.id, status: "APPROVED" }),
                  user.id,
                  "已通过审核",
                )
              }
            >
              通过
            </Button>
          ) : null}
          {user.status !== "REJECTED" ? (
            <Button
              size="small"
              danger
              loading={busyId === user.id}
              onClick={() =>
                void run(
                  () => postJson("/api/admin/users/status", { userId: user.id, status: "REJECTED" }),
                  user.id,
                  "已拒绝",
                )
              }
            >
              拒绝
            </Button>
          ) : null}
          {user.status !== "PENDING" ? (
            <Button
              size="small"
              loading={busyId === user.id}
              onClick={() =>
                void run(
                  () => postJson("/api/admin/users/status", { userId: user.id, status: "PENDING" }),
                  user.id,
                  "已设为待审核",
                )
              }
            >
              待审核
            </Button>
          ) : null}
          <Button
            size="small"
            onClick={() => {
              setGameNameTarget(user);
              setGameNameValue(user.profile?.gameName ?? "");
            }}
          >
            改游戏ID
          </Button>
          <Button
            size="small"
            onClick={() => {
              setPasswordTarget(user);
              setPasswordValue("");
            }}
          >
            重置密码
          </Button>
          <Button size="small" onClick={() => void openRecords(user)}>
            战绩
          </Button>
          <Button
            size="small"
            loading={busyId === user.id}
            onClick={() =>
              void run(
                () => postJson("/api/admin/users/admin", { userId: user.id, isAdmin: !user.isAdmin }),
                user.id,
                "管理员权限已更新",
              )
            }
          >
            {user.isAdmin ? "取消管理员" : "设为管理员"}
          </Button>
          <Popconfirm
            title={`删除 ${user.username}？`}
            description="该账号的报名与战绩会一并删除，且不可恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() =>
              run(
                () => postJson(`/api/admin/users/delete/${user.id}`),
                user.id,
                "用户已删除",
              )
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === user.id}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="antd-panel"
      title="用户管理"
      extra={
        <Space>
          {pendingCount ? <Tag color="gold">{pendingCount} 个待审核</Tag> : null}
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
          placeholder="搜索账号 / 游戏ID / KOOK"
          style={{ width: 260 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select
          style={{ width: 150 }}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          options={[
            { value: "ALL", label: "全部状态" },
            ...REVIEW_STATUSES.map((status) => ({
              value: status,
              label: REVIEW_STATUS_LABEL[status],
            })),
          ]}
        />
      </Space>
      {loading && !users.length ? (
        <div className="loading-state">
          <Spin size="large" />
        </div>
      ) : filtered.length ? (
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filtered}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      ) : (
        <Empty description="没有符合条件的账号" />
      )}

      <Modal
        open={Boolean(gameNameTarget)}
        title={`设置 ${gameNameTarget?.username ?? ""} 的游戏ID`}
        okText="保存"
        cancelText="取消"
        onCancel={() => setGameNameTarget(null)}
        onOk={() => {
          const target = gameNameTarget;
          if (!target) return;
          void run(
            () => postJson("/api/admin/users/game_name", { userId: target.id, gameName: gameNameValue }),
            target.id,
            "游戏ID已更新",
          ).then(() => setGameNameTarget(null));
        }}
      >
        <Input
          value={gameNameValue}
          maxLength={80}
          placeholder="游戏ID"
          onChange={(event) => setGameNameValue(event.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        title={`重置 ${passwordTarget?.username ?? ""} 的密码`}
        okText="重置"
        cancelText="取消"
        onCancel={() => setPasswordTarget(null)}
        onOk={() => {
          const target = passwordTarget;
          if (!target) return;
          if (passwordValue.length < 6) {
            message.error("新密码至少 6 位");
            return;
          }
          void run(
            () => postJson("/api/admin/users/password", { userId: target.id, password: passwordValue }),
            target.id,
            "密码重置成功",
          ).then(() => setPasswordTarget(null));
        }}
      >
        <Input.Password
          value={passwordValue}
          placeholder="新密码（至少 6 位）"
          onChange={(event) => setPasswordValue(event.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(recordsTarget)}
        title={`${recordsTarget?.username ?? ""} 的战绩`}
        width={860}
        footer={
          <Space>
            <Popconfirm
              title="清空该选手全部战绩？"
              description="清空后积分与榜单会立即重算，且不可恢复。"
              okText="清空"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => {
                const target = recordsTarget;
                if (!target) return;
                void run(
                  () => deleteJson(`/api/admin/users/records/${target.id}`),
                  target.id,
                  "该选手战绩已清空",
                ).then(() => setRecordsTarget(null));
              }}
            >
              <Button danger>清空全部战绩</Button>
            </Popconfirm>
            <Button onClick={() => setRecordsTarget(null)}>关闭</Button>
          </Space>
        }
        onCancel={() => setRecordsTarget(null)}
      >
        {recordsLoading ? (
          <div className="loading-state">
            <Spin />
          </div>
        ) : records.length ? (
          <Table
            rowKey="id"
            size="small"
            dataSource={records}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            columns={[
              { title: "赛事", dataIndex: "match_name", key: "match_name" },
              { title: "小局", dataIndex: "game_no", key: "game_no", width: 70 },
              { title: "英雄", dataIndex: "champion", key: "champion", width: 120 },
              {
                title: "结果",
                dataIndex: "result",
                key: "result",
                width: 80,
                render: (result: string, record) => (
                  <Tag color={result === "win" ? "green" : "red"}>
                    {result === "win" ? "胜" : "负"}
                    {record.is_mvp ? " · MVP" : ""}
                  </Tag>
                ),
              },
              {
                title: "KDA",
                key: "kda",
                width: 110,
                render: (_, record) => `${record.kills}/${record.deaths}/${record.assists}`,
              },
              { title: "日期", dataIndex: "played_at", key: "played_at", width: 120 },
            ]}
          />
        ) : (
          <Empty description="暂无战绩" />
        )}
      </Modal>
    </Card>
  );
}
