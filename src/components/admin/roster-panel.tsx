"use client";

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
  SwapOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { useMemo, useState } from "react";
import { RankLabel } from "@/components/rank-label";
import { POSITION_OPTIONS, RANKS, positionText } from "@/lib/admin-options";
import { LEAGUE_LABEL, TEAMS_BY_LEAGUE } from "@/lib/teams";
import { errorText, postJson, successText } from "./api-client";

export type RosterTeam = {
  id: number;
  match_id: number;
  name: string;
  player_count: number;
  used_fee: number;
};

export type RosterSign = {
  id: number;
  user_id: number;
  username: string;
  yy_name: string;
  game_name: string;
  avatar: string;
  rank: string;
  main_pos: string;
  sub_pos: string;
  can_substitute: boolean;
  team_id: number | null;
  team_pos: string;
  pos_order: number;
  fee: number;
};

export type TeamsBoard = {
  match: {
    id: number;
    name: string;
    status: string;
    use_fee: boolean;
    bo: string;
    total_rounds: number;
  };
  teams: RosterTeam[];
  signs: RosterSign[];
  current_round: number;
  has_score: boolean;
  round_pairs: {
    team_one: number;
    team_two: number;
    score_one: number;
    score_two: number;
    has_score: boolean;
  }[];
  budget: number;
  fmvp: {
    user_id: number;
    username: string;
    game_name: string;
    avatar: string;
  } | null;
};

type Props = {
  board: TeamsBoard;
  loading: boolean;
  onReload: () => Promise<void>;
};

const positionSelectOptions = POSITION_OPTIONS.map((position) => ({
  value: position,
  label: positionText(position),
}));

const rankFilterOptions = RANKS.filter((rank) => rank !== "").map((rank) => ({
  value: rank || "none",
  label: <RankLabel rank={rank} />,
}));

const poolFilterOptions = [
  { value: "all", label: "全部" },
  { value: "formal", label: "正式选手" },
  { value: "sub", label: "候补选手" },
];

export function RosterPanel({ board, loading, onReload }: Props) {
  const [busy, setBusy] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<Record<number, number | undefined>>({});
  const [pendingPos, setPendingPos] = useState<Record<number, string | undefined>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [poolFilter, setPoolFilter] = useState("all");
  const [poolRank, setPoolRank] = useState("all");
  const [poolPos, setPoolPos] = useState("all");
  const [poolKeyword, setPoolKeyword] = useState("");
  // 选人顺序：默认按已用费用升序，点「重新生成」时同费用随机（与旧后台一致）。
  const [pickOrder, setPickOrder] = useState<number[]>([]);
  // 预算不足时的临时调额弹窗（记录被拦截的选手与队内已用费用）。
  const [budgetBlock, setBudgetBlock] = useState<{
    signId: number;
    used: number;
    fee: number;
  } | null>(null);
  const [overrideBudget, setOverrideBudget] = useState<number>(0);

  const { teams, signs, budget, match } = board;
  const unassigned = useMemo(() => signs.filter((sign) => !sign.team_id), [signs]);
  const teamOptions = useMemo(
    () =>
      teams.map((team) => ({
        value: team.id,
        label: `${team.name}（${team.player_count} 人 · 已用 ${team.used_fee}）`,
      })),
    [teams],
  );

  /**
   * 正式/候补：按报名顺序给「偶数支队伍 × 5 个位置」的名额，
   * 已分队的人先占用名额，剩下的名额给最早报名的人（与旧后台口径一致）。
   */
  const formalIds = useMemo(() => {
    let evenTeams = Math.floor(signs.length / 5);
    if (evenTeams % 2 === 1) evenTeams -= 1;
    const formalSlots = Math.max(0, evenTeams) * 5;
    const assigned = signs.filter((sign) => sign.team_id).length;
    const remainSlots = Math.max(0, formalSlots - assigned);
    return new Set(
      [...unassigned]
        .sort((a, b) => a.id - b.id)
        .slice(0, remainSlots)
        .map((sign) => sign.id),
    );
  }, [signs, unassigned]);

  const pool = useMemo(() => {
    const keyword = poolKeyword.trim().toLowerCase();
    return unassigned.filter((sign) => {
      if (poolFilter === "formal" && !formalIds.has(sign.id)) return false;
      if (poolFilter === "sub" && formalIds.has(sign.id)) return false;
      if (poolRank !== "all" && (sign.rank || "none") !== poolRank) return false;
      if (poolPos !== "all" && sign.main_pos !== poolPos) return false;
      if (!keyword) return true;
      return (
        (sign.username ?? "").toLowerCase().includes(keyword) ||
        (sign.yy_name ?? "").toLowerCase().includes(keyword) ||
        (sign.game_name ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [unassigned, formalIds, poolFilter, poolRank, poolPos, poolKeyword]);

  /** 队伍按选人顺序排列：新队伍自动补到末尾（默认仍按费用升序）。 */
  const orderedTeams = useMemo(() => {
    const byFee = [...teams].sort((a, b) => a.used_fee - b.used_fee);
    const ids = pickOrder.filter((id) => teams.some((team) => team.id === id));
    const ordered = ids
      .map((id) => teams.find((team) => team.id === id))
      .filter((team): team is RosterTeam => Boolean(team));
    const missing = byFee.filter((team) => !ids.includes(team.id));
    return [...ordered, ...missing];
  }, [teams, pickOrder]);

  const usedTeamNames = useMemo(() => teams.map((team) => team.name.toUpperCase()), [teams]);

  const occupied = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    for (const sign of signs) {
      if (sign.team_id && sign.team_pos) {
        (map[sign.team_id] ??= new Set()).add(sign.team_pos);
      }
    }
    return map;
  }, [signs]);

  /** 统一的动作包装：提示后端 msg → 重新拉取看板。 */
  async function run(action: () => Promise<Record<string, unknown>>, fallback: string) {
    setBusy(true);
    try {
      const data = await action();
      message.success(successText(data, fallback));
      await onReload();
    } catch (requestError) {
      message.error(errorText(requestError, fallback));
    } finally {
      setBusy(false);
    }
  }

  const assign = (signId: number, overrideBudget?: number) =>
    run(
      () =>
        postJson("/api/admin/team/assign", {
          signId,
          teamId: pendingTeam[signId] ?? null,
          teamPosition: pendingPos[signId] ?? null,
          overrideBudget,
        }),
      "分配成功",
    );

  /** 点「分配」时先做本地预算检查，不足则弹出临时调额确认框。 */
  const requestAssign = (signId: number) => {
    if (!match.use_fee || !budget) {
      void assign(signId);
      return;
    }
    const sign = signs.find((item) => item.id === signId);
    const team = teams.find((item) => item.id === pendingTeam[signId]);
    if (!sign || !team) {
      void assign(signId);
      return;
    }
    if (team.used_fee + sign.fee <= budget) {
      void assign(signId);
      return;
    }
    setBudgetBlock({ signId, used: team.used_fee, fee: sign.fee });
    setOverrideBudget(team.used_fee + sign.fee);
  };

  function TeamCard({ team, pickIndex }: { team: RosterTeam; pickIndex: number }) {
    const members = signs
      .filter((sign) => sign.team_id === team.id)
      .sort((a, b) => a.pos_order - b.pos_order || a.id - b.id);
    const overBudget = match.use_fee && team.used_fee > budget;

    return (
      <Card
        className="antd-panel"
        size="small"
        title={
          <Space>
            <Typography.Text strong>{team.name}</Typography.Text>
            {teams.length > 1 ? <Tag color="geekblue">第 {pickIndex} 顺位</Tag> : null}
            <Tag>{team.player_count} 人</Tag>
            {match.use_fee ? (
              <Tag color={overBudget ? "red" : "blue"}>
                已用 {team.used_fee}
                {budget ? ` / ${budget}` : ""}
              </Tag>
            ) : null}
          </Space>
        }
        extra={
          <Popconfirm
            title={`删除队伍 ${team.name}？`}
            description="队员会被移回未分配。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => run(() => postJson(`/api/admin/team/delete/${team.id}`), "队伍已删除")}
          >
            <Button size="small" danger type="text" loading={busy}>
              删除
            </Button>
          </Popconfirm>
        }
      >
        {members.length ? (
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {members.map((member) => (
              <Space key={member.id} align="center" wrap style={{ width: "100%" }}>
                <Avatar size="small" src={member.avatar || undefined}>
                  {member.username.slice(0, 1)}
                </Avatar>
                <Typography.Text style={{ minWidth: 96 }}>{member.game_name}</Typography.Text>
                <Tag color="purple">
                  <RankLabel rank={member.rank} fallback="未定段" />
                </Tag>
                {match.use_fee ? <Tag>费用 {member.fee}</Tag> : null}
                <Select
                  size="small"
                  style={{ width: 96 }}
                  placeholder="位置"
                  value={member.team_pos || undefined}
                  options={positionSelectOptions}
                  loading={busy}
                  onChange={(teamPosition) =>
                    run(
                      () =>
                        postJson("/api/admin/team/assign", {
                          signId: member.id,
                          teamId: member.team_id,
                          teamPosition,
                        }),
                      "位置已更新",
                    )
                  }
                />
                <Tooltip title="上移">
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    loading={busy}
                    onClick={() =>
                      run(
                        () =>
                          postJson("/api/admin/team/move", { signId: member.id, direction: "up" }),
                        "已调换位置",
                      )
                    }
                  />
                </Tooltip>
                <Tooltip title="下移">
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    loading={busy}
                    onClick={() =>
                      run(
                        () =>
                          postJson("/api/admin/team/move", {
                            signId: member.id,
                            direction: "down",
                          }),
                        "已调换位置",
                      )
                    }
                  />
                </Tooltip>
                <Button
                  size="small"
                  loading={busy}
                  onClick={() =>
                    run(
                      () => postJson("/api/admin/team/assign", { signId: member.id, teamId: null }),
                      "已移回未分配",
                    )
                  }
                >
                  移回未分配
                </Button>
              </Space>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">还没有队员</Typography.Text>
        )}
      </Card>
    );
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Space wrap>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={() => {
            setNewTeamName("");
            setCreateOpen(true);
          }}
        >
          新建队伍
        </Button>
        <Button
          icon={<ReloadOutlined />}
          loading={busy}
          onClick={() =>
            run(
              () => postJson("/api/admin/team/auto_assign", { matchId: match.id }),
              "智能分配完成",
            )
          }
        >
          一键智能分配
        </Button>
        <Button icon={<ReloadOutlined />} onClick={() => void onReload()} loading={loading}>
          刷新看板
        </Button>
        {match.use_fee && budget ? <Tag color="blue">单队预算 {budget}</Tag> : null}
        <Tag>第 {board.current_round} 轮</Tag>
        <Tag>
          已分 {signs.filter((sign) => sign.team_id).length}/{signs.length} 人
        </Tag>
        <Tag>{unassigned.length} 人未分配</Tag>
      </Space>

      <Card
        className="antd-panel"
        size="small"
        title="可选的战队代号（点击建队）"
        extra={
          <Space size={4}>
            <Tooltip title="选人顺序：已用费用低的队伍先选，同费用随机">
              <Button
                size="small"
                icon={<SwapOutlined />}
                disabled={teams.length < 2}
                onClick={() =>
                  setPickOrder(
                    [...teams]
                      .sort((a, b) => a.used_fee - b.used_fee || Math.random() - 0.5)
                      .map((team) => team.id),
                  )
                }
              >
                重新生成队伍的顺序
              </Button>
            </Tooltip>
            {teams.length ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {orderedTeams.map((team, index) => `${index + 1}.${team.name}`).join(" - ")}
              </Typography.Text>
            ) : null}
          </Space>
        }
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          {TEAMS_BY_LEAGUE.map(({ league, teams: leagueTeams }) => (
            <div key={league}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {LEAGUE_LABEL[league]}：&nbsp;
              </Typography.Text>
              <Space wrap style={{ marginTop: 6 }}>
                {leagueTeams.map((team) => {
                  const used = usedTeamNames.includes(team.name.toUpperCase());
                  return (
                    <Tooltip
                      key={team.name}
                      title={used ? "该队伍已存在" : `创建队伍 ${team.name}`}
                    >
                      <Button
                        size="small"
                        type={used ? "default" : "primary"}
                        disabled={used || busy}
                        onClick={() =>
                          run(
                            () =>
                              postJson("/api/admin/team/create", {
                                matchId: match.id,
                                name: team.name,
                              }),
                            `${team.name} 创建成功`,
                          )
                        }
                      >
                        <img src={team.logo} alt={team.name} className="team-option-logo" />
                        {team.name}
                        {used ? " ✓" : ""}
                      </Button>
                    </Tooltip>
                  );
                })}
              </Space>
            </div>
          ))}
        </Space>
      </Card>

      {loading && !teams.length && !signs.length ? (
        <div className="loading-state">
          <Spin />
        </div>
      ) : (
        <>
          <div className="admin-grid">
            {orderedTeams.map((team, index) => (
              <TeamCard key={team.id} team={team} pickIndex={index + 1} />
            ))}
            {!teams.length ? <Empty description="还没有队伍，先新建一支" /> : null}
          </div>

          <Card
            className="antd-panel"
            size="small"
            title={`未分配选手（${unassigned.length}）`}
            extra={
              <Space wrap size={6}>
                <Segmented
                  size="small"
                  value={poolFilter}
                  options={poolFilterOptions}
                  onChange={(value) => setPoolFilter(String(value))}
                />
                <Select
                  size="small"
                  style={{ width: 110 }}
                  value={poolRank}
                  options={[{ value: "all", label: "全部段位" }, ...rankFilterOptions]}
                  onChange={setPoolRank}
                />
                <Select
                  size="small"
                  style={{ width: 104 }}
                  value={poolPos}
                  options={[
                    { value: "all", label: "全部位置" },
                    ...POSITION_OPTIONS.map((position) => ({ value: position, label: position })),
                  ]}
                  onChange={setPoolPos}
                />
                <Input
                  size="small"
                  allowClear
                  style={{ width: 150 }}
                  placeholder="搜索选手名字..."
                  value={poolKeyword}
                  onChange={(event) => setPoolKeyword(event.target.value)}
                />
              </Space>
            }
          >
            {pool.length ? (
              <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                {pool.map((sign) => {
                  const targetTeam = pendingTeam[sign.id];
                  const slots = targetTeam ? occupied[targetTeam] : undefined;
                  return (
                    <Space key={sign.id} wrap align="center">
                      <Avatar size="small" src={sign.avatar || undefined}>
                        {sign.username.slice(0, 1)}
                      </Avatar>
                      <Typography.Text style={{ minWidth: 96 }}>{sign.game_name}</Typography.Text>
                      <Tag color="purple">
                        <RankLabel rank={sign.rank} fallback="未定段" />
                      </Tag>
                      <Tag>{positionText(sign.main_pos)}</Tag>
                      {sign.sub_pos ? <Tag>副 {positionText(sign.sub_pos)}</Tag> : null}
                      {sign.can_substitute ? <Tag color="blue">可替补</Tag> : null}
                      <Tag color={formalIds.has(sign.id) ? "default" : "gold"}>
                        {formalIds.has(sign.id) ? "正式" : "候补"}
                      </Tag>
                      {match.use_fee ? <Tag>费用 {sign.fee}</Tag> : null}
                      <Select
                        size="small"
                        style={{ width: 220 }}
                        placeholder="选择队伍"
                        value={targetTeam}
                        options={teamOptions}
                        onChange={(teamId) => {
                          setPendingTeam((prev) => ({ ...prev, [sign.id]: teamId }));
                          setPendingPos((prev) => ({ ...prev, [sign.id]: undefined }));
                        }}
                      />
                      <Select
                        size="small"
                        style={{ width: 96 }}
                        placeholder="位置"
                        value={pendingPos[sign.id]}
                        disabled={!targetTeam}
                        options={positionSelectOptions.map((option) => ({
                          ...option,
                          disabled: slots?.has(option.value) ?? false,
                        }))}
                        onChange={(position) =>
                          setPendingPos((prev) => ({ ...prev, [sign.id]: position }))
                        }
                      />
                      <Button
                        size="small"
                        type="primary"
                        disabled={!targetTeam}
                        loading={busy}
                        onClick={() => void requestAssign(sign.id)}
                      >
                        分配
                      </Button>
                    </Space>
                  );
                })}
              </Space>
            ) : unassigned.length ? (
              <Empty description="该分类暂无未分队选手" />
            ) : (
              <Empty description="所有报名选手都已分配" />
            )}
          </Card>
        </>
      )}

      <Modal
        open={createOpen}
        title="新建队伍"
        okText="创建"
        cancelText="取消"
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          if (!newTeamName.trim()) {
            message.error("队伍名不能为空");
            return;
          }
          void run(
            () =>
              postJson("/api/admin/team/create", { matchId: match.id, name: newTeamName.trim() }),
            "队伍创建成功",
          ).then(() => setCreateOpen(false));
        }}
      >
        <Input
          value={newTeamName}
          maxLength={40}
          placeholder="队伍名，例如「蓝队」"
          onChange={(event) => setNewTeamName(event.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(budgetBlock)}
        title="预算不足"
        okText="临时调整预算并分配"
        cancelText="取消"
        okButtonProps={{
          disabled:
            overrideBudget < (budgetBlock?.used ?? 0) + (budgetBlock?.fee ?? 0),
        }}
        onCancel={() => setBudgetBlock(null)}
        onOk={() => {
          if (!budgetBlock) return;
          void assign(budgetBlock.signId, overrideBudget).then(() => setBudgetBlock(null));
        }}
      >
        <Typography.Paragraph>
          该队已用 {budgetBlock?.used}/{budget}，该选手费用 {budgetBlock?.fee}，超出当前单队预算。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          可输入一个临时预算让该选手加入，仅对本次分配生效，不会改变动态预算计算。
        </Typography.Paragraph>
        <Space align="center">
          <Typography.Text>临时预算</Typography.Text>
          <InputNumber
            min={1}
            style={{ width: 160 }}
            value={overrideBudget}
            onChange={(value) => setOverrideBudget(Number(value ?? 0))}
          />
        </Space>
      </Modal>
    </Space>
  );
}
