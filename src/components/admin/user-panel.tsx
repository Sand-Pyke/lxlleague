"use client";

import { DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState, type Key } from "react";
import { useViewer } from "@/components/auth-provider";
import { RankLabel } from "@/components/rank-label";
import {
  RANK_OPTIONS,
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
  /** 处罚截止时间（ISO 字符串），null 表示未处罚。 */
  banUntil: string | null;
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

/** 是否处于处罚期内。 */
const isBanned = (banUntil: string | null) =>
  Boolean(banUntil && new Date(banUntil).getTime() > Date.now());

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
  /** 正在重置段位的账号 + 选中的段位（undefined = 还没选）。 */
  const [rankTarget, setRankTarget] = useState<AdminUser | null>(null);
  const [rankValue, setRankValue] = useState<string | undefined>(undefined);
  /** 正在处罚的账号 + 处罚时长选项（1/3/7 天或自定义）。 */
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banChoice, setBanChoice] = useState("1");
  const [banCustomDays, setBanCustomDays] = useState(1);
  /** 批量审核：勾选的账号 ID（仅在「待审核」筛选下启用）、当前页码与每页条数。 */
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson("/api/admin/users");
      setUsers(asArray<AdminUser>(data.users));
      setSelectedRowKeys([]);
    } catch (requestError) {
      setError(errorText(requestError, "无法读取用户列表"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 统一的动作包装：调用接口 → 提示后端返回的 msg → 刷新列表与顶部统计。
   *  返回是否成功，供弹窗之类的交互决定要不要关闭。 */
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

  /** 列表变短后（如批量通过）自动把越界的页码收敛到最后一页。 */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  /** 勾选当前页上的全部待审核账号。 */
  const selectCurrentPage = () => {
    const start = (page - 1) * pageSize;
    const ids = filtered.slice(start, start + pageSize).map((user) => user.id);
    setSelectedRowKeys(ids);
  };

  /** 批量通过当前勾选的账号，成功后刷新列表。 */
  const approveSelected = async () => {
    if (!selectedRowKeys.length) {
      message.warning("请先勾选要审核的账号");
      return;
    }
    setBatchBusy(true);
    try {
      const data = await postJson("/api/admin/users/batch-approve", { userIds: selectedRowKeys });
      message.success(successText(data, "批量通过成功"));
      setSelectedRowKeys([]);
      await load();
      onChanged?.();
    } catch (requestError) {
      message.error(errorText(requestError, "批量通过失败"));
    } finally {
      setBatchBusy(false);
    }
  };

  /** 仅在「待审核」筛选下开放勾选与批量操作。 */
  const rowSelection = statusFilter === "PENDING"
    ? {
        selectedRowKeys,
        onChange: (keys: Key[]) => setSelectedRowKeys(keys.map(Number)),
      }
    : undefined;

  const columns: ColumnsType<AdminUser> = [
    {
      title: "账号",
      key: "account",
      width: 160,
      render: (_, user) => (
        <Space orientation="vertical" size={0}>
          <Space size={6} wrap>
            <Typography.Text strong>{user.username}</Typography.Text>
            {isBanned(user.banUntil) ? (
              <Tag color="red" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                已处罚至 {formatTime(user.banUntil!)}
              </Tag>
            ) : null}
          </Space>
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
      width: 200,
      render: (_, user) =>
        user.profile ? (
          <Space orientation="vertical" size={0}>
            <Typography.Text>{user.profile.gameName || "未设置"}</Typography.Text>
            {/* 注册时提交的段位（新账号审核）与改段位申请都在这里展示，审核员据此判断。 */}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <RankLabel rank={user.profile.rank} fallback="未设置" />
              {user.pendingRank ? (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  {" → 审核中：" + user.pendingRank}
                </Typography.Text>
              ) : null}
            </Typography.Text>
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
            {/* 重置段位：直接写资料；普通管理员只能改普通用户，管理员账号只有 admin 能改
              （服务端 assertCanManageUser 会再校验一次）。 */}
            <Button
              size="small"
              loading={busyId === user.id}
              onClick={() => {
                setRankTarget(user);
                setRankValue(user.profile?.rank || "");
              }}
            >
              重置段位
            </Button>

            {/* 处罚/解除处罚：普通管理员可处罚普通用户；管理员账号只有 admin 能处罚
              （manageable 与服务端 assertCanManageUser 双重把关）。 */}
            {user.status === "APPROVED" &&
              (isBanned(user.banUntil) ? (
                <Popconfirm
                  title={`解除 ${user.username} 的处罚？`}
                  description="解除后该用户可立即报名。"
                  okText="解除"
                  cancelText="取消"
                  onConfirm={() =>
                    run(
                      () => postJson("/api/admin/users/unban", { userId: user.id }),
                      user.id,
                      "已解除处罚",
                    )
                  }
                >
                  <Button size="small" loading={busyId === user.id}>
                    解除处罚
                  </Button>
                </Popconfirm>
              ) : (
                <Button
                  size="small"
                  danger
                  loading={busyId === user.id}
                  onClick={() => {
                    setBanTarget(user);
                    setBanChoice("1");
                    setBanCustomDays(1);
                  }}
                >
                  处罚
                </Button>
              ))}

            {/* 重置密码：固定为 lxl123456，仅核心管理员（admin）可用。 */}
            {isCoreAdmin ? (
              <Popconfirm
                title={`重置 ${user.username} 的密码？`}
                description="将重置为固定密码 lxl123456。"
                okText="重置"
                cancelText="取消"
                onConfirm={() =>
                  run(
                    () => postJson("/api/admin/users/password", { userId: user.id }),
                    user.id,
                    "密码已重置",
                  )
                }
              >
                <Button size="small" loading={busyId === user.id}>
                  重置密码
                </Button>
              </Popconfirm>
            ) : null}

            {/* 待审核的新账号直接拒绝即可，不需要额外的删除入口；删除仅 admin 可用。 */}
            {user.status !== "PENDING" && isCoreAdmin ? (
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
    <>
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
            placeholder="搜索账号 / 游戏ID"
            style={{ width: 260 }}
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
              setSelectedRowKeys([]);
            }}
          />
          <Select
            style={{ width: 150 }}
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value);
              setPage(1);
              setSelectedRowKeys([]);
            }}
            options={[
              { value: "ALL", label: "全部状态" },
              ...REVIEW_STATUSES.map((status) => ({
                value: status,
                label: REVIEW_STATUS_LABEL[status],
              })),
            ]}
          />
          {statusFilter === "PENDING" ? (
            <>
              <Button size="small" onClick={selectCurrentPage} disabled={!filtered.length}>
                全选当前页
              </Button>
              <Popconfirm
                title={`批量通过所选 ${selectedRowKeys.length} 个账号？`}
                description="将把这批账号一次性设为已通过审核。"
                okText="批量通过"
                cancelText="取消"
                onConfirm={() => void approveSelected()}
              >
                <Button
                  size="small"
                  type="primary"
                  loading={batchBusy}
                  disabled={!selectedRowKeys.length}
                >
                  批量通过{selectedRowKeys.length ? `（${selectedRowKeys.length}）` : ""}
                </Button>
              </Popconfirm>
            </>
          ) : null}
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
            rowSelection={rowSelection}
            scroll={{ x: 1020, y: 480 }}
            pagination={{
              pageSize,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              current: page,
              onChange: setPage,
              onShowSizeChange: (_current, size) => {
                setPageSize(size);
                setPage(1);
                setSelectedRowKeys([]);
              },
            }}
          />
        ) : (
          <Empty description="没有符合条件的账号" />
        )}
      </Card>

      <Modal
        open={Boolean(rankTarget)}
        title={`重置 ${rankTarget?.username ?? ""} 的段位`}
        okText="保存"
        cancelText="取消"
        confirmLoading={busyId === rankTarget?.id}
        onCancel={() => setRankTarget(null)}
        onOk={async () => {
          if (!rankTarget) return;
          if (rankValue === undefined) {
            message.warning("请先选择段位");
            return;
          }
          const succeeded = await run(
            () => postJson("/api/admin/users/rank", { userId: rankTarget.id, rank: rankValue }),
            rankTarget.id,
            "段位已重置",
          );
          if (succeeded) setRankTarget(null);
        }}
      >
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          {/* 段位下拉与其他页面共用一套共享样式（virtual + .rank-dropdown）。 */}
          <Select
            style={{ width: "100%" }}
            value={rankValue}
            placeholder="选择段位"
            virtual={false}
            classNames={{ popup: { root: "rank-dropdown" } }}
            options={RANK_OPTIONS.map((option) => ({
              value: option.value,
              label: <RankLabel rank={option.value} fallback="未设置" />,
            }))}
            onChange={(value) => setRankValue(value)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            重置后立即生效，并会同时清掉该账号待审的段位申请与备注。「未设置」表示清空段位。
          </Typography.Text>
        </Space>
      </Modal>

      <Modal
        open={Boolean(banTarget)}
        title={`处罚 ${banTarget?.username ?? ""}（禁止报名）`}
        okText="确认处罚"
        cancelText="取消"
        confirmLoading={busyId === banTarget?.id}
        onCancel={() => setBanTarget(null)}
        onOk={async () => {
          if (!banTarget) return;
          const days = banChoice === "custom" ? banCustomDays : Number(banChoice);
          if (!Number.isInteger(days) || days < 1) {
            message.warning("请填写有效的处罚天数");
            return;
          }
          const succeeded = await run(
            () => postJson("/api/admin/users/ban", { userId: banTarget.id, days }),
            banTarget.id,
            "处罚已生效",
          );
          if (succeeded) setBanTarget(null);
        }}
      >
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <Radio.Group
            value={banChoice}
            onChange={(event) => setBanChoice(event.target.value)}
            options={[
              { value: "1", label: "1 天" },
              { value: "3", label: "3 天" },
              { value: "7", label: "7 天" },
              { value: "custom", label: "自定义" },
            ]}
          />
          {banChoice === "custom" ? (
            <InputNumber
              style={{ width: "100%" }}
              min={1}
              max={3650}
              precision={0}
              value={banCustomDays}
              onChange={(value) => setBanCustomDays(Number(value ?? 1))}
              addonAfter="天"
            />
          ) : null}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            处罚期内该用户无法报名任何赛事，会看到「因不友善行为被处罚」的提示。
          </Typography.Text>
        </Space>
      </Modal>
    </>
  );
}
