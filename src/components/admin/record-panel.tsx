"use client";

import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  InputNumber,
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
import { POSITION_OPTIONS, positionText } from "@/lib/admin-options";
import {
  championIcon,
  championOptions,
  formatGold,
  itemAsset,
  itemIcon,
  itemIdFromInput,
  itemOptions,
} from "@/lib/game-assets";
import { asArray, errorText, getJson, postJson, successText } from "./api-client";
import type { RosterSign } from "./roster-panel";

type AdminUserOption = { id: number; username: string };

type RecordRow = {
  id: number;
  user_id: number;
  username: string;
  champion: string;
  result: string;
  team_rank: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  vision: number;
  items: string[];
  is_mvp: boolean;
  is_svp: boolean;
  game_no: number;
  round_no: number;
  played_at: string;
};

type RowDraft = {
  key: string;
  userId?: number;
  champion: string;
  result: "win" | "lose";
  kills: number;
  deaths: number;
  assists: number;
  isMvp: boolean;
  isSvp: boolean;
  level: number;
  cs: number;
  gold: number;
  vision: number;
  teamRank: number;
  teamPos?: string;
  items: string;
};

let rowSeed = 0;
const newRow = (): RowDraft => ({
  key: `row-${++rowSeed}`,
  champion: "",
  result: "win",
  kills: 0,
  deaths: 0,
  assists: 0,
  isMvp: false,
  isSvp: false,
  level: 1,
  cs: 0,
  gold: 0,
  vision: 0,
  teamRank: 0,
  teamPos: undefined,
  items: "",
});

const maxGameNo = 5;
const itemSlots = 6;

/** 把「装备名称或 id、中英文逗号分隔」的文本统一成入库用的 id 串（旧项目同样以 id 存库）。 */
const toItemIds = (value: string) =>
  value
    .replace(/，/g, ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => itemIdFromInput(part) || part)
    .slice(0, itemSlots)
    .join(",");

const itemSlotValues = (value: string) => {
  const parts = value
    .replace(/，/g, ",")
    .split(",")
    .map((part) => part.trim());
  return Array.from({ length: itemSlots }, (_, index) => parts[index] ?? "");
};

/** 装备图标串：最多 6 格，没有图标文件的装备显示占位方块。 */
function ItemIcons({ items }: { items: string[] }) {
  const list = items.filter(Boolean).slice(0, itemSlots);
  if (!list.length) return <Typography.Text type="secondary">-</Typography.Text>;
  return (
    <Space size={4} wrap>
      {list.map((item, index) => {
        const icon = itemIcon(item);
        const name = itemAsset(item)?.name ?? item;
        return icon ? (
          <img
            className="record-item"
            src={icon}
            alt={name}
            title={name}
            key={`${item}-${index}`}
          />
        ) : (
          <span className="record-item record-item-empty" title={name} key={`${item}-${index}`} />
        );
      })}
    </Space>
  );
}

export function RecordPanel({ matchId, signs }: { matchId: number; signs: RosterSign[] }) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [users, setUsers] = useState<AdminUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [gameNo, setGameNo] = useState(1);
  const [roundNo, setRoundNo] = useState(1);
  const [playedAt, setPlayedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [draft, setDraft] = useState<RowDraft[]>(() => [newRow()]);
  const [editTarget, setEditTarget] = useState<RecordRow | null>(null);
  const [editDraft, setEditDraft] = useState<RowDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (matchId > 0) {
        const data = await getJson(`/api/admin/result/list?matchId=${matchId}`);
        const list = asArray<RecordRow>(data.records);
        setRows(list);
        const nextGame = list.reduce((max, row) => Math.max(max, row.game_no), 0) + 1;
        setGameNo(Math.min(nextGame, maxGameNo));
        setRoundNo(list.reduce((max, row) => Math.max(max, row.round_no), 0) || 1);
      } else {
        setRows([]);
        setGameNo(1);
      }
      if (matchId === 0 || !signs.length) {
        const data = await getJson("/api/admin/users");
        setUsers(
          asArray<{ id: number; username: string }>(data.users).map((user) => ({
            id: user.id,
            username: user.username,
          })),
        );
      }
    } catch (requestError) {
      setError(errorText(requestError, "无法读取战绩"));
    } finally {
      setLoading(false);
    }
  }, [matchId, signs.length]);

  useEffect(() => {
    void load();
  }, [load]);

  const useSignups = matchId > 0 && signs.length > 0;

  const playerOptions = useMemo(() => {
    if (useSignups) {
      return signs.map((sign) => ({
        value: sign.user_id,
        label: `${sign.username}（${sign.rank || "未定段"}${sign.team_pos ? ` · ${positionText(sign.team_pos)}` : ""}）`,
      }));
    }
    return users.map((user) => ({ value: user.id, label: user.username }));
  }, [signs, useSignups, users]);

  async function run(action: () => Promise<Record<string, unknown>>, fallback: string) {
    setBusy(true);
    try {
      const data = await action();
      message.success(successText(data, fallback));
      const errors = asArray<string>(data.errors);
      if (errors.length) {
        Modal.warning({
          title: `${errors.length} 行未能录入`,
          content: (
            <ul style={{ paddingLeft: 18 }}>
              {errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ),
        });
      }
      await load();
      return data;
    } catch (requestError) {
      message.error(errorText(requestError, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const filled = draft.filter((row) => row.userId);
    const body = {
      matchId,
      rows: filled.map((row) => ({
        user_id: row.userId,
        champion: row.champion.trim(),
        result: row.result,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        is_mvp: row.isMvp,
        is_svp: row.isSvp,
        team_rank: row.teamRank,
        level: row.level,
        cs: row.cs,
        gold: row.gold,
        vision: row.vision,
        items: toItemIds(row.items),
        team_pos: row.teamPos,
        game_no: gameNo,
        round_no: roundNo,
        played_at: playedAt,
      })),
    };
    const data = await run(() => postJson("/api/admin/result/batch", body), "战绩已录入");
    if (!data) return;
    // 只清掉已成功的行，保留失败行让管理员修改后重新提交
    const failedLines = new Set(
      asArray<string>(data.errors)
        .map((item) => /^第(\d+)行/.exec(item)?.[1])
        .filter(Boolean)
        .map(Number),
    );
    const kept = filled.filter((_, index) => failedLines.has(index + 1));
    setDraft(kept.length ? kept : [newRow()]);
  }

  const updateDraft = (key: string, patch: Partial<RowDraft>) =>
    setDraft((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const draftColumns: ColumnsType<RowDraft> = [
    {
      title: "玩家",
      key: "userId",
      width: 180,
      render: (_, row) => (
        <Select
          showSearch
          size="small"
          optionFilterProp="label"
          style={{ width: "100%" }}
          placeholder="选择玩家"
          value={row.userId}
          options={playerOptions}
          onChange={(userId) => updateDraft(row.key, { userId })}
        />
      ),
    },
    {
      title: "英雄",
      key: "champion",
      width: 170,
      render: (_, row) => (
        <Space size={4}>
          {championIcon(row.champion) ? (
            <img className="record-hero" src={championIcon(row.champion)} alt="" title={row.champion} />
          ) : null}
          <Input
            size="small"
            list="champion-options"
            style={{ width: 118 }}
            value={row.champion}
            maxLength={50}
            placeholder="英雄名"
            onChange={(event) => updateDraft(row.key, { champion: event.target.value })}
          />
        </Space>
      ),
    },
    {
      title: "位置",
      key: "teamPos",
      width: 100,
      render: (_, row) => (
        <Select
          size="small"
          allowClear
          style={{ width: "100%" }}
          placeholder="位置"
          value={row.teamPos}
          options={POSITION_OPTIONS.map((value) => ({ value, label: positionText(value) }))}
          onChange={(teamPos) => updateDraft(row.key, { teamPos })}
        />
      ),
    },
    {
      title: "胜负",
      key: "result",
      width: 90,
      render: (_, row) => (
        <Select
          size="small"
          style={{ width: "100%" }}
          value={row.result}
          options={[
            { value: "win", label: "胜" },
            { value: "lose", label: "负" },
          ]}
          onChange={(result) => updateDraft(row.key, { result })}
        />
      ),
    },
    {
      title: "K / D / A",
      key: "kda",
      width: 190,
      render: (_, row) => (
        <Space size={2}>
          <InputNumber
            size="small"
            min={0}
            style={{ width: 56 }}
            value={row.kills}
            onChange={(value) => updateDraft(row.key, { kills: Number(value) || 0 })}
          />
          <InputNumber
            size="small"
            min={0}
            style={{ width: 56 }}
            value={row.deaths}
            onChange={(value) => updateDraft(row.key, { deaths: Number(value) || 0 })}
          />
          <InputNumber
            size="small"
            min={0}
            style={{ width: 56 }}
            value={row.assists}
            onChange={(value) => updateDraft(row.key, { assists: Number(value) || 0 })}
          />
        </Space>
      ),
    },
    {
      title: "MVP",
      key: "isMvp",
      width: 60,
      render: (_, row) => (
        <Checkbox
          checked={row.isMvp}
          onChange={(event) => updateDraft(row.key, { isMvp: event.target.checked })}
        />
      ),
    },
    {
      title: "SVP",
      key: "isSvp",
      width: 60,
      render: (_, row) => (
        <Checkbox
          checked={row.isSvp}
          onChange={(event) => updateDraft(row.key, { isSvp: event.target.checked })}
        />
      ),
    },
    {
      title: "等级 / 补刀 / 经济 / 视野",
      key: "extra",
      width: 268,
      render: (_, row) => (
        <Space size={2}>
          {(
            [
              ["level", 18, 52],
              ["cs", 999, 62],
              ["gold", 999999, 74],
              ["vision", 999, 52],
            ] as const
          ).map(([field, max, width]) => (
            <InputNumber
              key={field}
              size="small"
              min={0}
              max={max}
              style={{ width }}
              value={row[field]}
              onChange={(value) => updateDraft(row.key, { [field]: Number(value) || 0 })}
            />
          ))}
        </Space>
      ),
    },
    {
      title: "装备（名称或 id，逗号分隔）",
      key: "items",
      width: 210,
      render: (_, row) => (
        <Input
          size="small"
          value={row.items}
          maxLength={200}
          placeholder="如：无尽之刃,3153"
          onChange={(event) => updateDraft(row.key, { items: event.target.value })}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 60,
      render: (_, row) => (
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => setDraft((prev) => prev.filter((item) => item.key !== row.key))}
        />
      ),
    },
  ];

  const recordColumns: ColumnsType<RecordRow> = [
    { title: "局", dataIndex: "game_no", key: "game_no", width: 60 },
    { title: "轮", dataIndex: "round_no", key: "round_no", width: 60 },
    { title: "玩家", dataIndex: "username", key: "username", width: 110 },
    {
      title: "英雄",
      dataIndex: "champion",
      key: "champion",
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          {championIcon(row.champion) ? (
            <img className="record-hero" src={championIcon(row.champion)} alt="" />
          ) : null}
          <span>{row.champion || "-"}</span>
        </Space>
      ),
    },
    {
      title: "结果",
      key: "result",
      width: 110,
      render: (_, row) => (
        <Space size={4}>
          <Tag color={row.result === "win" ? "green" : "red"}>{row.result === "win" ? "胜" : "负"}</Tag>
          {row.is_mvp ? <Tag color="gold">MVP</Tag> : null}
          {row.is_svp ? <Tag color="purple">SVP</Tag> : null}
        </Space>
      ),
    },
    {
      title: "KDA",
      key: "kda",
      width: 100,
      render: (_, row) => `${row.kills}/${row.deaths}/${row.assists}`,
    },
    {
      title: "其他",
      key: "extra",
      render: (_, row) =>
        `等级 ${row.level} · CS ${row.cs} · 经济 ${formatGold(row.gold)} · 视野 ${row.vision}`,
    },
    {
      title: "装备",
      key: "items",
      width: 220,
      render: (_, row) => <ItemIcons items={row.items} />,
    },
    { title: "日期", dataIndex: "played_at", key: "played_at", width: 110 },
    {
      title: "操作",
      key: "actions",
      width: 130,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() => {
              setEditTarget(row);
              setEditDraft({
                key: `edit-${row.id}`,
                userId: row.user_id,
                champion: row.champion,
                result: row.result === "win" ? "win" : "lose",
                kills: row.kills,
                deaths: row.deaths,
                assists: row.assists,
                isMvp: row.is_mvp,
                isSvp: row.is_svp,
                level: row.level,
                cs: row.cs,
                gold: row.gold,
                vision: row.vision,
                teamRank: row.team_rank,
                items: row.items.map((item) => itemAsset(item)?.name ?? item).join(","),
              });
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="删除这条战绩？"
            description="选手统计与榜单会立即重算。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() =>
              run(() => postJson(`/api/admin/result/delete/${row.id}`), "战绩已删除")
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
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <datalist id="champion-options">
        {championOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="item-options">
        {itemOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Card
        className="antd-panel"
        size="small"
        title={`批量录入（最多 10 行）${matchId > 0 ? "" : " · 自由对局"}`}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        }
      >
        {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} /> : null}
        <Space wrap style={{ marginBottom: 12 }}>
          <span>
            局号{" "}
            <Select
              size="small"
              style={{ width: 72 }}
              value={gameNo}
              options={Array.from({ length: maxGameNo }, (_, index) => ({
                value: index + 1,
                label: `第 ${index + 1} 局`,
              }))}
              onChange={setGameNo}
            />
          </span>
          <span>
            轮次{" "}
            <InputNumber size="small" min={1} max={99} value={roundNo} onChange={(value) => setRoundNo(Number(value) || 1)} />
          </span>
          <span>
            日期{" "}
            <Input
              size="small"
              type="date"
              style={{ width: 150 }}
              value={playedAt}
              onChange={(event) => setPlayedAt(event.target.value)}
            />
          </span>
          {!useSignups && matchId > 0 ? (
            <Typography.Text type="warning">
              该赛事暂无报名选手，玩家下拉已切换为全部账号
            </Typography.Text>
          ) : null}
        </Space>
        <Table
          rowKey="key"
          size="small"
          columns={draftColumns}
          dataSource={draft}
          pagination={false}
          scroll={{ x: 1400 }}
        />
        <Space style={{ marginTop: 12 }}>
          <Button
            icon={<PlusOutlined />}
            disabled={draft.length >= 10}
            onClick={() => setDraft((prev) => [...prev, newRow()])}
          >
            添加一行
          </Button>
          <Button
            icon={<PlusOutlined />}
            disabled={draft.length >= 10}
            onClick={() =>
              setDraft((prev) => {
                const add = Array.from({ length: Math.min(5, 10 - prev.length) }, () => newRow());
                const next = [...prev, ...add];
                return next.slice(0, 10);
              })
            }
          >
            一次加 5 行
          </Button>
          <Button
            type="primary"
            loading={busy}
            onClick={() => void submit()}
            disabled={!draft.some((row) => row.userId)}
          >
            提交录入
          </Button>
        </Space>
      </Card>

      <Card className="antd-panel" size="small" title={`已录入战绩（${rows.length} 条）`}>
        {loading && !rows.length ? (
          <div className="loading-state">
            <Spin />
          </div>
        ) : rows.length ? (
          <Table
            rowKey="id"
            size="small"
            columns={recordColumns}
            dataSource={rows}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1320 }}
          />
        ) : (
          <Empty description="还没有录入战绩" />
        )}
      </Card>

      <Modal
        open={Boolean(editTarget)}
        title={`编辑战绩 · ${editTarget?.username ?? ""}`}
        width={720}
        okText="保存"
        cancelText="取消"
        confirmLoading={busy}
        onCancel={() => {
          setEditTarget(null);
          setEditDraft(null);
        }}
        onOk={() => {
          const target = editTarget;
          const value = editDraft;
          if (!target || !value) return;
          void run(
            () =>
              postJson(`/api/admin/result/update/${target.id}`, {
                user_id: value.userId,
                champion: value.champion,
                result: value.result,
                team_rank: value.teamRank,
                level: value.level,
                kills: value.kills,
                deaths: value.deaths,
                assists: value.assists,
                cs: value.cs,
                gold: value.gold,
                vision: value.vision,
                is_mvp: value.isMvp,
                is_svp: value.isSvp,
                items: toItemIds(value.items),
              }),
            "战绩已更新",
          ).then((succeeded) => {
            if (succeeded) {
              setEditTarget(null);
              setEditDraft(null);
            }
          });
        }}
      >
        {editDraft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <Space wrap>
              <Select
                style={{ width: 200 }}
                value={editDraft.userId}
                options={playerOptions}
                showSearch
                optionFilterProp="label"
                onChange={(userId) => setEditDraft({ ...editDraft, userId })}
              />
              <Input
                style={{ width: 150 }}
                placeholder="英雄"
                list="champion-options"
                value={editDraft.champion}
                onChange={(event) => setEditDraft({ ...editDraft, champion: event.target.value })}
              />
              {championIcon(editDraft.champion) ? (
                <img className="record-hero" src={championIcon(editDraft.champion)} alt="" />
              ) : null}
              <Select
                style={{ width: 100 }}
                value={editDraft.result}
                options={[
                  { value: "win", label: "胜" },
                  { value: "lose", label: "负" },
                ]}
                onChange={(result) => setEditDraft({ ...editDraft, result })}
              />
              <Checkbox
                checked={editDraft.isMvp}
                onChange={(event) => setEditDraft({ ...editDraft, isMvp: event.target.checked })}
              >
                MVP
              </Checkbox>
              <Checkbox
                checked={editDraft.isSvp}
                onChange={(event) => setEditDraft({ ...editDraft, isSvp: event.target.checked })}
              >
                SVP
              </Checkbox>
            </Space>
            <Space wrap>
              {(
                [
                  ["kills", "击杀"],
                  ["deaths", "死亡"],
                  ["assists", "助攻"],
                ] as const
              ).map(([field, label]) => (
                <span key={field}>
                  {label}{" "}
                  <InputNumber
                    min={0}
                    style={{ width: 72 }}
                    value={editDraft[field]}
                    onChange={(value) => setEditDraft({ ...editDraft, [field]: Number(value) || 0 })}
                  />
                </span>
              ))}
            </Space>
            <Space wrap>
              {(
                [
                  ["level", "等级"],
                  ["cs", "补刀"],
                  ["gold", "经济"],
                  ["vision", "视野"],
                  ["teamRank", "顺位"],
                ] as const
              ).map(([field, label]) => (
                <span key={field}>
                  {label}{" "}
                  <InputNumber
                    min={0}
                    style={{ width: 84 }}
                    value={editDraft[field]}
                    onChange={(value) => setEditDraft({ ...editDraft, [field]: Number(value) || 0 })}
                  />
                </span>
              ))}
            </Space>
            <Space orientation="vertical" size={6} style={{ width: "100%" }}>
              <Typography.Text type="secondary">装备（最多 6 件，可填名称或 id）</Typography.Text>
              <Space wrap size={6}>
                {itemSlotValues(editDraft.items).map((slot, index) => (
                  <Space orientation="vertical" size={2} key={`slot-${index}`} align="center">
                    <Input
                      style={{ width: 130 }}
                      list="item-options"
                      placeholder={`装备 ${index + 1}`}
                      value={slot}
                      onChange={(event) => {
                        const next = itemSlotValues(editDraft.items);
                        next[index] = event.target.value;
                        setEditDraft({
                          ...editDraft,
                          items: next
                            .map((part) => part.trim())
                            .filter(Boolean)
                            .join(","),
                        });
                      }}
                    />
                    {itemIcon(slot) ? (
                      <img
                        className="record-item"
                        src={itemIcon(slot)}
                        alt=""
                        title={itemAsset(slot)?.name ?? slot}
                      />
                    ) : (
                      <span className="record-item record-item-empty" />
                    )}
                  </Space>
                ))}
              </Space>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
