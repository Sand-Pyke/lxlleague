"use client";

import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
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
import { useViewer } from "@/components/auth-provider";
import {
  REVIEW_STATUS_COLOR,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUSES,
  isUnsetPosition,
  positionText,
  type ReviewStatus,
} from "@/lib/admin-options";
import { asArray, errorText, getJson, postJson, successText } from "./api-client";

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
  const viewer = useViewer();
  /** 核心管理员（admin）可以管理其他管理员；普通管理员只能管理用户。 */
  const isCoreAdmin = Boolean(viewer?.isCoreAdmin);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);

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
      title: "游戏资料",
      key: "profile",
      render: (_, user) =>
        user.profile ? (
          <Space orientation="vertical" size={0}>
            <Typography.Text>{user.profile.gameName || "未设置"}</Typography.Text>
            {/* 待审核的新账号位置还没定；位置未填写时也不展示「未填写」占位。
                段位由用户自行维护（修改需重新审核），后台不重复展示。 */}
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
      render: (_, user) => {
        // 管理员账号之间互不干涉：普通管理员既不展示也不能操作其他管理员
        // （服务端会再校验一次，这里只是不让按钮出现在界面上）。
        const manageable = !user.isAdmin || isCoreAdmin;
        if (!manageable) {
          return (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              管理员账号，无操作权限
            </Typography.Text>
          );
        }

        return (
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
                        postJson("/api/admin/users/status", {
                          userId: user.id,
                          status: "APPROVED",
                        }),
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
                        postJson("/api/admin/users/status", {
                          userId: user.id,
                          status: "REJECTED",
                        }),
                      user.id,
                      "已拒绝",
                    )
                  }
                >
                  拒绝
                </Button>
              </>
            ) : null}

            {/* 已通过的正式账号：权限只由核心管理员调整。 */}
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

            {/* 已拒绝的账号保留重新通过的退路（误操作后不用先打回待审核）。 */}
            {user.status === "REJECTED" ? (
              <Button
                size="small"
                type="primary"
                loading={busyId === user.id}
                onClick={() =>
                  void run(
                    () =>
                      postJson("/api/admin/users/status", {
                        userId: user.id,
                        status: "APPROVED",
                      }),
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
        );
      },
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
    </Card>
  );
}
