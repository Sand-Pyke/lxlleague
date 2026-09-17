"use client";

import { DeleteOutlined, KeyOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  isUnsetPosition,
  positionText,
  type ReviewStatus,
} from "@/lib/admin-options";
import { RankLabel } from "@/components/rank-label";
import { asArray, errorText, getJson, postJson, successText } from "./api-client";
import { useViewer } from "../auth-provider";

type AdminUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  status: ReviewStatus;
  /** 审核备注，如「-修改段位」。 */
  reviewNote: string;
  /** 待审核的新段位；非空表示有一笔段位修改申请在排队。 */
  pendingRank: string;
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

const formatTime = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

export function UserPanel({ onChanged }: { onChanged?: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  // 只有核心管理员（admin 账号）才能授予 / 撤销管理员，或重置其他账号的密码。
  const viewer = useViewer();
  const isCoreAdmin = viewer?.isCoreAdmin ?? false;
  // 段位重置：先选中某条用户，再选段位，按钮区才会出现「重置段位」。
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRank, setSelectedRank] = useState<string | undefined>(undefined);

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
        return true;
      } catch (requestError) {
        message.error(errorText(requestError, fallback));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [load, onChanged],
  );

  const selectedUser =
    selectedUserId === null ? null : (users.find((user) => user.id === selectedUserId) ?? null);

  /** 重置选中用户的段位；成功后清空选择，列表刷新后即显示新段位。 */
  async function resetSelectedRank() {
    if (!selectedUser || selectedRank === undefined) return;
    const success = await run(
      () => postJson("/api/admin/users/rank", { userId: selectedUser.id, rank: selectedRank }),
      selectedUser.id,
      "段位已重置",
    );
    if (success) {
      setSelectedUserId(null);
      setSelectedRank(undefined);
    }
  }

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

  function openResetConfirm(user: AdminUser) {
    setResetTarget(user);
    setResetAcknowledged(false);
  }

  const columns: ColumnsType<AdminUser> = [
    {
      title: "账号",
      key: "account",
      render: (_, user) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{user.username}</Typography.Text>
          {/* KOOK 由用户自己在个人中心维护，后台不再提示未填写。 */}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {user.isAdmin ? "管理员" : "普通用户"}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "段位",
      key: "rank",
      width: 120,
      render: (_, user) => <RankLabel rank={user.profile?.rank} fallback="未设置" />,
    },
    {
      title: "游戏资料",
      key: "profile",
      render: (_, user) =>
        user.profile ? (
          <Space orientation="vertical" size={0}>
            <Typography.Text>{user.profile.gameName || "未设置"}</Typography.Text>
            {/* 待审核的新账号位置还没定；位置未填写时也不展示「未填写」占位。 */}
            {user.status !== "PENDING" && !isUnsetPosition(user.profile.mainPosition) ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {positionText(user.profile.mainPosition)}
                {user.profile.subPosition ? ` / ${positionText(user.profile.subPosition)}` : ""}
              </Typography.Text>
            ) : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">未完善</Typography.Text>
        ),
    },
    {
      title: "备注",
      key: "reviewNote",
      width: 120,
      render: (_, user) =>
        user.reviewNote ? (
          <Tag color="orange">{user.reviewNote}</Tag>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
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
      width: 200,
      render: (_, user) => (
        <Space wrap size={[4, 4]}>
          {/* 待审核的新注册账号：只留「通过 / 拒绝」两个决定。 */}
          {user.status === "PENDING" ? (
            <>
              <Button
                size="small"
                type="primary"
                loading={busyId === user.id}
                onClick={() =>
                  void run(
                    () =>
                      postJson("/api/admin/users/status", { userId: user.id, status: "APPROVED" }),
                    user.id,
                    "已通过审核",
                  )
                }
              >
                通过
              </Button>
              <Button
                size="small"
                danger
                loading={busyId === user.id}
                onClick={() =>
                  void run(
                    () =>
                      postJson("/api/admin/users/status", { userId: user.id, status: "REJECTED" }),
                    user.id,
                    "已拒绝",
                  )
                }
              >
                拒绝
              </Button>
            </>
          ) : null}

          {/* 已通过的正式账号：核心管理员可管理权限与重置密码，去留仍对所有管理员开放。 */}
          {user.status === "APPROVED" && isCoreAdmin ? (
            <Button
              size="small"
              loading={busyId === user.id}
              onClick={() =>
                void run(
                  () =>
                    postJson("/api/admin/users/admin", {
                      userId: user.id,
                      isAdmin: !user.isAdmin,
                    }),
                  user.id,
                  "管理员权限已更新",
                )
              }
            >
              {user.isAdmin ? "取消管理员" : "设为管理员"}
            </Button>
          ) : null}
          {user.status === "APPROVED" && isCoreAdmin ? (
            <Button
              size="small"
              danger
              icon={<KeyOutlined />}
              loading={busyId === user.id}
              onClick={() => openResetConfirm(user)}
            >
              重置密码
            </Button>
          ) : null}

          {/* 已拒绝的账号保留重新通过的退路（误操作后不用先打回待审核）。 */}
          {user.status === "REJECTED" ? (
            <Button
              size="small"
              type="primary"
              loading={busyId === user.id}
              onClick={() =>
                void run(
                  () =>
                    postJson("/api/admin/users/status", { userId: user.id, status: "APPROVED" }),
                  user.id,
                  "已通过审核",
                )
              }
            >
              通过
            </Button>
          ) : null}

          {/* 待审核的新账号直接拒绝即可，不需要额外的删除入口。 */}
          {user.status !== "PENDING" ? (
            <Popconfirm
              title={`删除 ${user.username}？`}
              description="该账号的报名与战绩会一并删除，且不可恢复。"
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() =>
                run(() => postJson(`/api/admin/users/delete/${user.id}`), user.id, "用户已删除")
              }
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === user.id}>
                删除
              </Button>
            </Popconfirm>
          ) : null}
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
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}
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
      {selectedUser ? (
        <Space wrap style={{ marginBottom: 12 }}>
          <Typography.Text>重置「{selectedUser.username}」的段位：</Typography.Text>
          <Select
            style={{ width: 150 }}
            placeholder="选择段位"
            allowClear
            value={selectedRank}
            onChange={(value) => setSelectedRank(value as string | undefined)}
            options={RANK_OPTIONS}
          />
          {selectedRank !== undefined ? (
            <Button
              type="primary"
              danger
              loading={busyId === selectedUser.id}
              onClick={() => void resetSelectedRank()}
            >
              重置段位
            </Button>
          ) : null}
        </Space>
      ) : null}
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
          rowSelection={{
            type: "radio",
            selectedRowKeys: selectedUserId === null ? [] : [selectedUserId],
            onChange: (keys) => setSelectedUserId(keys.length ? Number(keys[0]) : null),
          }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      ) : (
        <Empty description="没有符合条件的账号" />
      )}
      <Modal
        title="高危操作：重置用户密码"
        open={Boolean(resetTarget)}
        okText="确认重置"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !resetAcknowledged }}
        confirmLoading={resetTarget ? busyId === resetTarget.id : false}
        onCancel={() => {
          if (!busyId) setResetTarget(null);
        }}
        onOk={() => {
          if (!resetTarget || !resetAcknowledged) return;
          void run(
            () => postJson("/api/admin/users/password", { userId: resetTarget.id }),
            resetTarget.id,
            "密码重置成功，请通知用户修改密码",
          ).then((success) => {
            if (success) setResetTarget(null);
          });
        }}
      >
        <Alert
          type="error"
          showIcon
          message={`你即将重置用户「${resetTarget?.username ?? ""}」的密码`}
          description="这是高危操作。密码将被设置为 lxl123456，原密码立即失效。请仅在确认用户身份后操作，并通知用户登录后马上修改密码。"
        />
        <Checkbox
          style={{ marginTop: 16 }}
          checked={resetAcknowledged}
          onChange={(event) => setResetAcknowledged(event.target.checked)}
        >
          我已知晓该操作的风险，并确认要重置密码
        </Checkbox>
      </Modal>
    </Card>
  );
}
