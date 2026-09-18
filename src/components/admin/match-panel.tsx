"use client";

import { PlusOutlined, ReloadOutlined, SettingOutlined, SolutionOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Match } from "@/lib/data";
import {
  BO_OPTIONS,
  BO_WINS,
  MATCH_STATUS_COLOR,
  MATCH_STATUS_LABEL,
  MATCH_STATUSES,
  boScoreHint,
  isValidBoScore,
  type MatchStatus,
} from "@/lib/admin-options";
import { asArray, errorText, getJson, postJson, successText } from "./api-client";
import { RecordPanel } from "./record-panel";
import { RosterPanel, type TeamsBoard } from "./roster-panel";

type MatchRow = Match & { player_count: number; team_count: number; live_url: string };

type MatchForm = { name: string; bo: string; round: string; status: MatchStatus; useFee: boolean };

const emptyForm: MatchForm = { name: "", bo: "BO1", round: "常规赛", status: "CREATED", useFee: true };

export function MatchPanel({ onChanged }: { onChanged?: () => void }) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<MatchStatus | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [board, setBoard] = useState<TeamsBoard | null>(null);
  const [boardLoading, setBoardLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<MatchForm>(emptyForm);
  const [editForm, setEditForm] = useState<MatchForm | null>(null);
  const [liveValue, setLiveValue] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);
  const [scorePairs, setScorePairs] = useState<
    {
      teamOneId: number;
      teamTwoId: number;
      scoreOne: number;
      scoreTwo: number;
      hasScore: boolean;
    }[]
  >([]);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);

  const selected = useMemo(
    () => matches.find((match) => match.id === selectedId) ?? null,
    [matches, selectedId],
  );

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getJson("/api/match/list");
      setMatches(asArray<MatchRow>(data.match_list));
    } catch (requestError) {
      setError(errorText(requestError, "无法读取赛事列表"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBoard = useCallback(async (matchId: number | null) => {
    if (!matchId) {
      setBoard(null);
      return;
    }
    setBoardLoading(true);
    try {
      const data = await getJson(`/api/admin/teams/${matchId}`);
      setBoard(data as unknown as TeamsBoard);
    } catch (requestError) {
      message.error(errorText(requestError, "无法读取队伍看板"));
      setBoard(null);
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    void loadBoard(selectedId);
  }, [loadBoard, selectedId]);

  /** 统一的动作包装：提示后端 msg → 刷新赛事列表与顶部统计（必要时同时刷新队伍看板）。 */
  async function run(
    action: () => Promise<Record<string, unknown>>,
    fallback: string,
    options: { refreshBoard?: boolean } = {},
  ) {
    setBusy(true);
    try {
      const data = await action();
      message?.success(successText(data, fallback));
      await loadMatches();
      onChanged?.();
      if (options.refreshBoard !== false && selectedId) await loadBoard(selectedId);
      return true;
    } catch (requestError) {
      message.error(errorText(requestError, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const teamNameOf = (id: number | undefined | null) =>
    board?.teams.find((team) => team.id === id)?.name ?? (id ? `队伍 #${id}` : "");

  const filtered = useMemo(
    () => matches.filter((match) => statusFilter === "ALL" || match.status === statusFilter),
    [matches, statusFilter],
  );

  const columns: ColumnsType<MatchRow> = [
    { title: "#", dataIndex: "id", key: "id", width: 60 },
    {
      title: "赛事",
      key: "name",
      render: (_, match) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{match.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {match.round} · {new Date(match.date).toLocaleDateString("zh-CN")}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: MatchStatus) => (
        <Tag color={MATCH_STATUS_COLOR[status]}>{MATCH_STATUS_LABEL[status]}</Tag>
      ),
    },
    { title: "赛制", dataIndex: "bo", key: "bo", width: 80 },
    {
      title: "报名 / 队伍",
      key: "counts",
      width: 120,
      render: (_, match) => `${match.player_count} 人 / ${match.team_count} 队`,
    },
    {
      title: "选费",
      key: "useFee",
      width: 90,
      render: (_, match) => (
        <Switch
          size="small"
          checked={match.useFee}
          loading={busy}
          onChange={(useFee) =>
            void run(
              () => postJson(`/api/admin/match/set_fee/${match.id}`, { useFee }),
              "已更新选费设置",
            )
          }
        />
      ),
    },
    {
      title: "当前轮次",
      dataIndex: "currentRound",
      key: "currentRound",
      width: 100,
      render: (value: number) => `第 ${value || 1} 轮`,
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_, match) => (
        <Space size={4}>
          <Button
            size="small"
            type={match.id === selectedId ? "primary" : "default"}
            onClick={() => setSelectedId(match.id)}
          >
            管理
          </Button>
          <Popconfirm
            title={`删除赛事「${match.name}」？`}
            description="该赛事的报名、队伍、轮次与战绩会被一并删除。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() =>
              run(() => postJson(`/api/admin/match/delete/${match.id}`), "比赛已删除", {
                refreshBoard: false,
              }).then((succeeded) => {
                if (succeeded) setSelectedId((current) => (current === match.id ? null : current));
              })
            }
          >
            <Button size="small" danger loading={busy}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Card
        className="antd-panel"
        title="赛事管理"
        extra={
          <Space>
            <Select
              size="small"
              style={{ width: 120 }}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { value: "ALL", label: "全部状态" },
                ...MATCH_STATUSES.map((status) => ({
                  value: status,
                  label: MATCH_STATUS_LABEL[status],
                })),
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadMatches()} loading={loading}>
              刷新
            </Button>
          </Space>
        }
      >
        {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}
        <Space style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateForm(emptyForm);
              setCreateOpen(true);
            }}
          >
            新建赛事
          </Button>
        </Space>
        {loading && !matches.length ? (
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
            scroll={{ x: 900 }}
          />
        ) : (
          <Empty description="暂无赛事" />
        )}
      </Card>

      {selected ? (
        <Card
          className="antd-panel"
          title={
            <Space>
              <SettingOutlined />
              <span>操作台 · {selected.name}</span>
              <Tag color={MATCH_STATUS_COLOR[selected.status]}>
                {MATCH_STATUS_LABEL[selected.status]}
              </Tag>
              <Tag>{selected.bo}</Tag>
              <Tag>{selected.useFee ? "启用选费" : "不选费"}</Tag>
            </Space>
          }
          extra={
            <Button size="small" onClick={() => setSelectedId(null)}>
              收起
            </Button>
          }
        >
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Space wrap>
              <Typography.Text type="secondary">基础信息</Typography.Text>
              <Button
                size="small"
                onClick={() =>
                  setEditForm({
                    name: selected.name,
                    bo: selected.bo,
                    round: selected.round,
                    status: selected.status,
                    useFee: selected.useFee,
                  })
                }
              >
                编辑名称 / 轮次 / 状态
              </Button>
              <Select
                size="small"
                style={{ width: 100 }}
                value={selected.bo}
                disabled={selected.status !== "CREATED"}
                options={BO_OPTIONS.map((bo) => ({ value: bo, label: bo }))}
                onChange={(bo) =>
                  void run(() => postJson(`/api/admin/match/set_bo/${selected.id}`, { bo }), "赛制已更新")
                }
              />
              <Button
                size="small"
                onClick={() => {
                  setLiveValue(selected.liveUrl ?? "");
                  setLiveOpen(true);
                }}
              >
                设置直播链接
              </Button>
              {selected.liveUrl ? (
                <Typography.Link href={selected.liveUrl} target="_blank" rel="noreferrer">
                  观看直播
                </Typography.Link>
              ) : null}
            </Space>

            <Space wrap>
              <Typography.Text type="secondary">状态流转</Typography.Text>
              <Button
                size="small"
                type="primary"
                disabled={selected.status !== "CREATED"}
                loading={busy}
                onClick={() =>
                  void run(() => postJson(`/api/admin/match/finish_pick/${selected.id}`), "已结束选人，赛事开始")
                }
              >
                结束选人并开赛
              </Button>
              <Button
                size="small"
                danger
                disabled={selected.status !== "LIVE"}
                loading={busy}
                onClick={() =>
                  void run(() => postJson(`/api/admin/match/finish/${selected.id}`), "比赛已结束")
                }
              >
                结束赛事
              </Button>
            </Space>

            <Space wrap>
              <Typography.Text type="secondary">对战与战果</Typography.Text>
              <Button
                size="small"
                disabled={!board?.teams.length || selected.status === "CREATED"}
                onClick={() => {
                  setScorePairs(
                    (board?.round_pairs ?? []).map((pair) => ({
                      teamOneId: pair.team_one,
                      teamTwoId: pair.team_two,
                      scoreOne: pair.score_one,
                      scoreTwo: pair.score_two,
                      hasScore: pair.has_score,
                    })),
                  );
                  setScoreOpen(true);
                }}
              >
                录入本轮战果
              </Button>
              <Button
                size="small"
                disabled={!board?.has_score || selected.status === "CREATED"}
                onClick={() =>
                  void run(
                    () => postJson(`/api/admin/match/round/end/${selected.id}`),
                    "本轮已结束",
                  )
                }
                loading={busy}
              >
                结束本轮
              </Button>
            </Space>

            <Space wrap>
              <Typography.Text type="secondary">报名与队伍</Typography.Text>
              <Button
                size="small"
                icon={<SolutionOutlined />}
                onClick={() => setRosterOpen(true)}
              >
                队伍编排
              </Button>
              <Button
                size="small"
                icon={<SolutionOutlined />}
                onClick={() => setRecordsOpen(true)}
              >
                战绩录入
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                共 {selected.player_count} 人报名、{selected.team_count} 支队伍
              </Typography.Text>
            </Space>

            {boardLoading ? (
              <div className="loading-state">
                <Spin />
              </div>
            ) : board?.teams.length ? (
              <Space wrap>
                {board.teams.map((team) => (
                  <Tag key={team.id}>
                    {team.name} · {team.player_count} 人
                    {board.match.use_fee ? ` · 已用 ${team.used_fee}` : ""}
                  </Tag>
                ))}
                {board.match.use_fee && board.budget ? <Tag color="blue">预算 {board.budget}</Tag> : null}
              </Space>
            ) : null}
          </Space>
        </Card>
      ) : null}

      <Modal
        open={createOpen}
        title="新建赛事"
        okText="创建"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          if (!createForm.name.trim()) {
            message.error("比赛名称不能为空");
            return;
          }
          void run(
            () =>
              postJson("/api/admin/match/create", {
                name: createForm.name.trim(),
                bo: createForm.bo,
                round: createForm.round,
                status: createForm.status,
                use_fee: createForm.useFee,
              }),
            "比赛已创建",
          ).then((succeeded) => {
            if (succeeded) setCreateOpen(false);
          });
        }}
      >
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          <Input
            placeholder="比赛名称"
            maxLength={100}
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
          />
          <Space>
            <Select
              style={{ width: 120 }}
              value={createForm.bo}
              options={BO_OPTIONS.map((bo) => ({ value: bo, label: bo }))}
              onChange={(bo) => setCreateForm({ ...createForm, bo })}
            />
            <Select
              style={{ width: 140 }}
              value={createForm.status}
              options={MATCH_STATUSES.map((status) => ({
                value: status,
                label: MATCH_STATUS_LABEL[status],
              }))}
              onChange={(status) => setCreateForm({ ...createForm, status })}
            />
            <span>
              选费 <Switch checked={createForm.useFee} onChange={(useFee) => setCreateForm({ ...createForm, useFee })} />
            </span>
          </Space>
          <Input
            placeholder="赛事阶段，例如「常规赛」"
            maxLength={40}
            value={createForm.round}
            onChange={(event) => setCreateForm({ ...createForm, round: event.target.value })}
          />
        </Space>
      </Modal>

      <Modal
        open={Boolean(editForm)}
        title={`编辑赛事 · ${selected?.name ?? ""}`}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setEditForm(null)}
        onOk={() => {
          const form = editForm;
          if (!form || !selected) return;
          void run(
            () =>
              postJson(`/api/admin/match/update/${selected.id}`, {
                name: form.name,
                round: form.round,
                status: form.status,
              }),
            "比赛信息已更新",
          ).then((succeeded) => {
            if (succeeded) setEditForm(null);
          });
        }}
      >
        {editForm ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <Input
              placeholder="比赛名称"
              maxLength={100}
              value={editForm.name}
              disabled={selected?.status !== "CREATED"}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
            />
            <Input
              placeholder="赛事阶段"
              maxLength={40}
              value={editForm.round}
              onChange={(event) => setEditForm({ ...editForm, round: event.target.value })}
            />
            <Select
              style={{ width: "100%" }}
              value={editForm.status}
              options={MATCH_STATUSES.map((status) => ({
                value: status,
                label: MATCH_STATUS_LABEL[status],
              }))}
              onChange={(status) => setEditForm({ ...editForm, status })}
            />
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={liveOpen}
        title="设置直播链接"
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => setLiveOpen(false)}
        onOk={() => {
          if (!selected) return;
          void run(
            () => postJson(`/api/admin/match/live/${selected.id}`, { liveUrl: liveValue.trim() }),
            "直播链接已保存",
          ).then((succeeded) => {
            if (succeeded) setLiveOpen(false);
          });
        }}
      >
        <Input
          placeholder="https://..."
          value={liveValue}
          maxLength={300}
          onChange={(event) => setLiveValue(event.target.value)}
        />
      </Modal>

      <Modal
        open={scoreOpen}
        title="录入本轮战果"
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        width={640}
        onCancel={() => setScoreOpen(false)}
        onOk={() => {
          if (!selected) return;
          if (!scorePairs.length) {
            message.error("当前轮次没有可录入的对阵");
            return;
          }
          const editablePairs = scorePairs.filter((pair) => !pair.hasScore);
          if (!editablePairs.length) {
            message.error("本轮战果已全部录入，不能修改");
            return;
          }
          const invalidPair = editablePairs.find(
            (pair) => !isValidBoScore(selected.bo, pair.scoreOne, pair.scoreTwo),
          );
          if (invalidPair) {
            message.error(
              `${boScoreHint(selected.bo)}（${teamNameOf(invalidPair.teamOneId)} vs ${teamNameOf(invalidPair.teamTwoId)}）`,
            );
            return;
          }
          void run(
            () =>
              Promise.all(
                editablePairs.map((pair) =>
                  postJson("/api/admin/match/score", {
                    matchId: selected.id,
                    roundNo: selected.currentRound || 1,
                    teamOneId: pair.teamOneId,
                    teamTwoId: pair.teamTwoId,
                    scoreOne: pair.scoreOne,
                    scoreTwo: pair.scoreTwo,
                  }),
                ),
              ).then(() => ({ msg: "战果已保存" })),
            "战果已保存",
          ).then((succeeded) => {
            if (succeeded) setScoreOpen(false);
          });
        }}
      >
        <Space orientation="vertical" size={10} style={{ width: "100%" }}>
          {scorePairs.some((pair) => pair.hasScore) ? (
            <Alert type="info" showIcon title="已录入战果的对阵不可修改" />
          ) : null}
          {scorePairs.length ? (
            scorePairs.map((pair, index) => (
              <div
                key={`${pair.teamOneId}-${pair.teamTwoId}`}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}
              >
                <span style={{ flex: 1, textAlign: "right" }}>{teamNameOf(pair.teamOneId)}</span>
                <InputNumber
                  min={0}
                  max={selected ? (BO_WINS[selected.bo] ?? 0) : 0}
                  value={pair.scoreOne}
                  disabled={pair.hasScore}
                  onChange={(value) =>
                    setScorePairs((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, scoreOne: Number(value) || 0 } : item,
                      ),
                    )
                  }
                />
                <span>:</span>
                <InputNumber
                  min={0}
                  max={selected ? (BO_WINS[selected.bo] ?? 0) : 0}
                  value={pair.scoreTwo}
                  disabled={pair.hasScore}
                  onChange={(value) =>
                    setScorePairs((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, scoreTwo: Number(value) || 0 } : item,
                      ),
                    )
                  }
                />
                {pair.hasScore ? <Tag color="green">已录入</Tag> : null}
                <span style={{ flex: 1 }}>{teamNameOf(pair.teamTwoId)}</span>
              </div>
            ))
          ) : (
            <Alert
              type="info"
              showIcon
              title="当前轮次没有可录入的对阵，请先完成队伍编排并结束选人开赛。"
            />
          )}
        </Space>
      </Modal>

      <Drawer
        open={rosterOpen}
        title={`队伍编排 · ${selected?.name ?? ""}`}
        size={1100}
        onClose={() => setRosterOpen(false)}
        destroyOnHidden
      >
        {selected && board ? (
          <RosterPanel board={board} loading={boardLoading} onReload={() => loadBoard(selected.id)} />
        ) : (
          <div className="loading-state">
            <Spin />
          </div>
        )}
      </Drawer>

      <Drawer
        open={recordsOpen}
        title={`战绩录入 · ${selected?.name ?? ""}`}
        size={1100}
        onClose={() => setRecordsOpen(false)}
        destroyOnHidden
      >
        {selected ? <RecordPanel matchId={selected.id} signs={board?.signs ?? []} /> : null}
      </Drawer>
    </Space>
  );
}
