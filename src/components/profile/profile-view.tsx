"use client";

import {
  CameraOutlined,
  LoginOutlined,
  LogoutOutlined,
  PictureOutlined,
  UserAddOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { errorText, getJson, postJson, successText } from "@/components/admin/api-client";
import { LeagueShell } from "@/components/app-shell";
import { POSITION_OPTIONS, positionText } from "@/lib/admin-options";
import { BACKGROUND_OPTIONS } from "@/lib/backgrounds";
import { championIcon, itemIcon } from "@/lib/game-assets";

type HeroStat = { champion: string; games: number; win_rate: number; kda: number };

type HistoryRow = {
  id: number;
  match_id: number | null;
  match_name: string;
  champion: string;
  result: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  played_at: string | null;
  game_no: number;
  round_no: number;
  level: number;
  cs: number;
  vision: number;
  gold: number;
  items: string[];
  is_mvp: boolean;
  is_svp: boolean;
  participation: number;
};

type ProfileUser = {
  id: number;
  name: string;
  username: string;
  gameName: string;
  mainPosition: string;
  subPosition: string;
  rank: string;
  bio: string;
  avatar: string;
  kookName: string;
  background: string;
  is_admin: boolean;
  mvp: number;
  svp: number;
  points: number;
  teamChampion: number;
  runnerup: number;
};

type ProfileStats = {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  kda: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
};

type ProfilePayload = {
  isSelf: boolean;
  user: ProfileUser;
  stats: ProfileStats;
  heroes: HeroStat[];
  ranking: number;
  ranking_total: number;
  match_history: HistoryRow[];
};

type EditKind = "bio" | "kook" | "game" | "account" | "pwd" | "pos" | "bg";

const EDIT_TITLE: Record<EditKind, string> = {
  bio: "编辑个人简介",
  kook: "设置 KOOK 昵称",
  game: "设置游戏ID",
  account: "修改账户ID",
  pwd: "修改密码",
  pos: "设置位置",
  bg: "选择背景图",
};

const emptyDraft = {
  bio: "",
  kookName: "",
  gameName: "",
  accountName: "",
  oldPwd: "",
  newPwd: "",
  mainPos: "",
  subPos: "无",
  bg: "",
};

const dateText = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** 个人主页：档案卡 + 赛季数据 + 常用英雄/荣誉 + 比赛历史，本人可自助编辑资料。 */
export function ProfileView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const [messageApi, contextHolder] = message.useMessage();
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "anon" | "missing" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [editKind, setEditKind] = useState<EditKind | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = (await getJson(
        `/api/user/profile${uid ? `?uid=${encodeURIComponent(uid)}` : ""}`,
      )) as unknown as ProfilePayload;
      setPayload(data);
      setStatus("ready");
    } catch (error) {
      const text = errorText(error, "个人资料加载失败");
      if (text.includes("登录")) {
        setStatus("anon");
      } else if (text.includes("不存在")) {
        setStatus("missing");
      } else {
        setErrorMessage(text);
        setStatus("error");
      }
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(kind: EditKind) {
    if (!payload) return;
    setDraft({
      bio: payload.user.bio ?? "",
      kookName: payload.user.kookName ?? "",
      gameName: payload.user.gameName ?? "",
      accountName: payload.user.username ?? "",
      oldPwd: "",
      newPwd: "",
      mainPos: POSITION_OPTIONS.includes(payload.user.mainPosition) ? payload.user.mainPosition : "",
      subPos: POSITION_OPTIONS.includes(payload.user.subPosition) ? payload.user.subPosition : "无",
      bg: payload.user.background.replace("/assets/bgs/", ""),
    });
    setEditKind(kind);
  }

  async function uploadImage(file: File, kind: "avatar" | "bg") {
    const form = new FormData();
    form.append(kind, file);
    try {
      const response = await fetch(kind === "avatar" ? "/api/avatar/upload" : "/api/user/bg/upload", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        messageApi.error(typeof data.msg === "string" ? data.msg : "上传失败");
        return;
      }
      messageApi.success(kind === "avatar" ? "头像已更新" : "背景已更新");
      setEditKind(null);
      await load();
    } catch {
      messageApi.error("上传失败，请稍后重试");
    }
  }

  async function submitEdit() {
    if (!editKind || !payload) return;
    if (editKind === "pos" && !draft.mainPos) {
      messageApi.error("请选择主位置");
      return;
    }
    if (editKind === "pwd" && !draft.newPwd) {
      messageApi.error("请输入新密码");
      return;
    }
    setSaving(true);
    try {
      const request: Record<EditKind, [string, Record<string, unknown>]> = {
        bio: ["/api/user/update_bio", { bio: draft.bio }],
        kook: ["/api/user/update_kook", { kook_name: draft.kookName }],
        game: ["/api/user/game_name", { game_name: draft.gameName }],
        account: ["/api/user/change_username", { username: draft.accountName }],
        pwd: ["/api/user/change_pwd", { old_pwd: draft.oldPwd, new_pwd: draft.newPwd }],
        pos: ["/api/user/update_pos", { main_pos: draft.mainPos, sub_pos: draft.subPos || "无" }],
        bg: ["/api/user/bg", { bg: draft.bg }],
      };
      const [url, body] = request[editKind];
      const data = await postJson(url, body);
      messageApi.success(successText(data, "已保存"));
      setEditKind(null);
      await load();
    } catch (error) {
      messageApi.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    router.push("/");
  }

  const user = payload?.user;
  const stats = payload?.stats;
  const history = payload?.match_history ?? [];
  const self = Boolean(payload?.isSelf);

  const columns: ColumnsType<HistoryRow> = [
    {
      title: "比赛",
      dataIndex: "played_at",
      width: 150,
      render: (value: string | null, row) => (
        <Space size={4}>
          <span className="prof-date">{dateText(value)}</span>
          <Tag color={row.result === "win" ? "green" : "red"}>
            {row.result === "win" ? "胜" : "负"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "赛事",
      dataIndex: "match_name",
      width: 170,
      render: (value: string, row) =>
        row.match_id ? (
          <Link href={`/matches/${row.match_id}/result?game=${row.game_no}`}>{value}</Link>
        ) : (
          <span className="prof-muted">{value}</span>
        ),
    },
    {
      title: "英雄",
      dataIndex: "champion",
      width: 130,
      render: (value: string, row) => {
        const icon = championIcon(value);
        return (
          <div className="prof-champion">
            {icon ? <img src={icon} alt={value} /> : <b>{value.slice(0, 1) || "?"}</b>}
            <span>
              {value || "未记录"}
              <small>Lv.{row.level || 0}</small>
            </span>
            {row.is_mvp ? <em className="mvp">MVP</em> : null}
            {row.is_svp ? <em className="svp">SVP</em> : null}
          </div>
        );
      },
    },
    {
      title: "KDA",
      dataIndex: "kda",
      width: 150,
      render: (value: number, row) => (
        <span className="prof-kda">
          {row.kills} / <i>{row.deaths}</i> / {row.assists}
          <small>{Number(value).toFixed(2)} KDA</small>
        </span>
      ),
    },
    {
      title: "参战率",
      dataIndex: "participation",
      width: 90,
      render: (value: number) => <span className="prof-share">{value}%</span>,
    },
    { title: "补兵", dataIndex: "cs", width: 80, render: (value: number) => value || 0 },
    { title: "视野", dataIndex: "vision", width: 80, render: (value: number) => value || 0 },
    {
      title: "装备",
      dataIndex: "items",
      width: 200,
      render: (items: string[]) => (
        <div className="prof-items">
          {Array.from({ length: 6 }, (_, index) => {
            const icon = itemIcon(items[index] ?? "");
            return icon ? (
              <img key={index} src={icon} alt="装备" />
            ) : (
              <span className="prof-items-empty" key={index} />
            );
          })}
        </div>
      ),
    },
  ];

  return (
    <LeagueShell>
      {contextHolder}
      <section className="page-title">
        <Typography.Text type="secondary">SUMMONER PROFILE</Typography.Text>
        <Typography.Title>个人主页</Typography.Title>
        <Typography.Paragraph>管理个人资料、查看比赛记录并追踪你的赛场表现。</Typography.Paragraph>
      </section>

      {status === "loading" ? (
        <div className="loading-state">
          <Spin size="large" />
        </div>
      ) : status === "anon" ? (
        <Card className="profile-empty-card">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="登录后即可查看个人主页">
            <Space>
              <Link href="/login">
                <Button type="primary" icon={<LoginOutlined />}>
                  登录
                </Button>
              </Link>
              <Link href="/register">
                <Button icon={<UserAddOutlined />}>注册账号</Button>
              </Link>
            </Space>
          </Empty>
        </Card>
      ) : status === "missing" ? (
        <Card className="antd-panel">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="用户不存在" />
        </Card>
      ) : status === "error" ? (
        <Card className="antd-panel">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={errorMessage} />
        </Card>
      ) : user && stats ? (
        <div className="prof-page">
          <section className="prof-hero">
            {user.background ? (
              <div className="prof-hero-bg" style={{ backgroundImage: `url("${user.background}")` }} />
            ) : null}
            <div className="prof-hero-inner">
              <div className="prof-avatar-box">
                <Avatar size={96} src={user.avatar || undefined} icon={<UserOutlined />} />
                {self ? (
                  <div className="prof-avatar-actions">
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        void uploadImage(file as File, "avatar");
                        return false;
                      }}
                    >
                      <a>
                        <CameraOutlined /> 更换头像
                      </a>
                    </Upload>
                    <a onClick={() => openEdit("bg")}>
                      <PictureOutlined /> 选择背景
                    </a>
                  </div>
                ) : null}
              </div>
              <div className="prof-identity">
                <h1>{user.name}</h1>
                <div className="prof-meta">
                  <span className="prof-rank">{user.rank || "未定段"}</span>
                  <Tag
                    className={self ? "prof-tag clickable" : "prof-tag"}
                    title={self ? "点击修改位置" : undefined}
                    onClick={self ? () => openEdit("pos") : undefined}
                  >
                    主位置 {positionText(user.mainPosition)}
                  </Tag>
                  <Tag
                    className={self ? "prof-tag clickable" : "prof-tag"}
                    title={self ? "点击修改位置" : undefined}
                    onClick={self ? () => openEdit("pos") : undefined}
                  >
                    副位置 {positionText(user.subPosition)}
                  </Tag>
                  {payload?.heroes.length ? (
                    <span className="prof-heroes" title="常用英雄">
                      {payload.heroes.map((hero) => {
                        const icon = championIcon(hero.champion);
                        return icon ? (
                          <img key={hero.champion} src={icon} alt={hero.champion} title={hero.champion} />
                        ) : null;
                      })}
                    </span>
                  ) : null}
                  <span className="prof-ladder">
                    LXL 第 <b>{payload?.ranking || "-"}</b> 位选手
                  </span>
                </div>
              </div>
              <div className="prof-hero-side">
                <Link href="/">
                  <Button size="small">返回首页</Button>
                </Link>
                {self && user.is_admin ? (
                  <Link href="/admin">
                    <Button size="small" type="primary">
                      管理后台
                    </Button>
                  </Link>
                ) : null}
                {self ? (
                  <Button size="small" danger icon={<LogoutOutlined />} onClick={() => void logout()}>
                    退出登录
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="prof-grid">
            <div className="prof-main">
              <Card
                className="antd-panel"
                title="个人简介"
                extra={
                  self ? (
                    <Button size="small" onClick={() => openEdit("bio")}>
                      编辑简介
                    </Button>
                  ) : null
                }
              >
                <Typography.Paragraph className="prof-bio">
                  {user.bio || "这个人很懒，什么都没有留下"}
                </Typography.Paragraph>
                {self ? (
                  <div className="prof-settings">
                    <div className="prof-settings-title">我的资料设置</div>
                    {(
                      [
                        { label: "账户ID", value: user.username || "未设置", kind: "account" },
                        { label: "KOOK昵称", value: user.kookName || "未设置", kind: "kook" },
                        { label: "游戏ID", value: user.gameName || "未设置", kind: "game" },
                        { label: "登录密码", value: "••••••", kind: "pwd" },
                      ] as Array<{ label: string; value: string; kind: EditKind }>
                    ).map((row) => (
                      <div className="prof-settings-row" key={row.kind}>
                        <span>
                          {row.label}：<b>{row.value}</b>
                        </span>
                        <Button size="small" type="link" onClick={() => openEdit(row.kind)}>
                          设置
                        </Button>
                      </div>
                    ))}
                    <p className="prof-settings-note">
                      游戏ID（召唤师名）用于战绩导入时匹配到你的账号，需与游戏内名称一致。
                    </p>
                  </div>
                ) : null}
              </Card>

              <Card className="antd-panel" title="赛季数据">
                <div className="prof-stats">
                  {[
                    { label: "比赛场次", value: stats.games, tone: "" },
                    { label: "胜场", value: stats.wins, tone: "green" },
                    { label: "负场", value: stats.losses, tone: "red" },
                    { label: "胜率", value: `${stats.winRate}%`, tone: "gold" },
                    { label: "KDA", value: stats.kda, tone: "cyan" },
                    { label: "场均击杀", value: stats.avgKills, tone: "" },
                    { label: "场均死亡", value: stats.avgDeaths, tone: "" },
                    { label: "场均助攻", value: stats.avgAssists, tone: "" },
                  ].map((item) => (
                    <div className="prof-stat" key={item.label}>
                      <b className={item.tone ? `prof-${item.tone}` : undefined}>{item.value}</b>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="prof-side">
              <Card className="antd-panel" title="常用英雄">
                {payload?.heroes.length ? (
                  payload.heroes.map((hero) => {
                    const icon = championIcon(hero.champion);
                    return (
                      <div className="prof-hero-row" key={hero.champion}>
                        {icon ? <img src={icon} alt={hero.champion} /> : <b>{hero.champion.slice(0, 1)}</b>}
                        <div>
                          <strong>{hero.champion}</strong>
                          <small>
                            {hero.games} 场 · 胜率 {hero.win_rate}%
                          </small>
                        </div>
                        <span>{hero.kda} KDA</span>
                      </div>
                    );
                  })
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无比赛记录" />
                )}
              </Card>

              <Card className="antd-panel" title="战队经历">
                <div className="prof-placeholder">暂未开放</div>
              </Card>

              <Card className="antd-panel" title="荣誉">
                {user.mvp || user.svp || user.teamChampion || user.runnerup ? (
                  <div className="prof-honors">
                    {user.teamChampion ? <Tag color="gold">赛事冠军 × {user.teamChampion}</Tag> : null}
                    {user.runnerup ? <Tag color="purple">赛事亚军 × {user.runnerup}</Tag> : null}
                    {user.mvp ? <Tag color="blue">MVP × {user.mvp}</Tag> : null}
                    {user.svp ? <Tag color="cyan">SVP × {user.svp}</Tag> : null}
                    <span className="prof-points">积分 {user.points}</span>
                  </div>
                ) : (
                  <div className="prof-placeholder">暂无荣誉，继续加油</div>
                )}
              </Card>
            </div>
          </div>

          <Card
            className="antd-panel prof-history"
            title={
              <Space>
                <span>比赛历史</span>
                <Typography.Text type="secondary">共 {history.length} 场</Typography.Text>
              </Space>
            }
          >
            {history.length ? (
              <Table
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={history}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                scroll={{ x: 1100 }}
                onRow={(row) => ({
                  className: row.match_id ? "prof-history-row" : undefined,
                  onClick: () => {
                    if (row.match_id) router.push(`/matches/${row.match_id}/result?game=${row.game_no}`);
                  },
                })}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无比赛记录" />
            )}
          </Card>
        </div>
      ) : null}

      <Modal
        open={editKind !== null}
        title={editKind ? EDIT_TITLE[editKind] : ""}
        okText="保存"
        cancelText="取消"
        width={editKind === "bg" ? 720 : 460}
        confirmLoading={saving}
        onCancel={() => setEditKind(null)}
        onOk={() => void submitEdit()}
      >
        {editKind === "bio" ? (
          <Input.TextArea
            rows={4}
            maxLength={300}
            showCount
            value={draft.bio}
            placeholder="介绍一下你自己（最多 300 字）"
            onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
          />
        ) : null}
        {editKind === "kook" ? (
          <Input
            value={draft.kookName}
            maxLength={20}
            placeholder="KOOK 昵称（中文/字母/数字/下划线）"
            onChange={(event) => setDraft({ ...draft, kookName: event.target.value })}
          />
        ) : null}
        {editKind === "game" ? (
          <Input
            value={draft.gameName}
            maxLength={80}
            placeholder="游戏内召唤师名"
            onChange={(event) => setDraft({ ...draft, gameName: event.target.value })}
          />
        ) : null}
        {editKind === "account" ? (
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            <Input
              value={draft.accountName}
              maxLength={16}
              placeholder="账户ID（2-16 个字符）"
              onChange={(event) => setDraft({ ...draft, accountName: event.target.value })}
            />
            <Typography.Text type="secondary">修改后请使用新账户ID登录。</Typography.Text>
          </Space>
        ) : null}
        {editKind === "pwd" ? (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Input.Password
              value={draft.oldPwd}
              placeholder="原密码"
              onChange={(event) => setDraft({ ...draft, oldPwd: event.target.value })}
            />
            <Input.Password
              value={draft.newPwd}
              placeholder="新密码"
              onChange={(event) => setDraft({ ...draft, newPwd: event.target.value })}
            />
          </Space>
        ) : null}
        {editKind === "pos" ? (
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                主位置
              </Typography.Text>
              <Select
                style={{ width: "100%" }}
                value={draft.mainPos || undefined}
                placeholder="未填写"
                options={POSITION_OPTIONS.map((position) => ({
                  value: position,
                  label: positionText(position),
                }))}
                onChange={(value) => setDraft({ ...draft, mainPos: value })}
              />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                副位置
              </Typography.Text>
              <Select
                style={{ width: "100%" }}
                value={draft.subPos}
                options={[{ value: "无", label: "无" }].concat(
                  POSITION_OPTIONS.map((position) => ({
                    value: position,
                    label: positionText(position),
                  })),
                )}
                onChange={(value) => setDraft({ ...draft, subPos: value })}
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              主位置为必选，报名赛事时会自动带入。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "bg" ? (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div className="prof-bg-grid">
              {BACKGROUND_OPTIONS.map((option) => (
                <button
                  className={draft.bg === option.file ? "selected" : ""}
                  key={option.file}
                  type="button"
                  onClick={() => setDraft({ ...draft, bg: option.file })}
                >
                  <span style={{ backgroundImage: `url("/assets/bgs/${option.file}")` }} />
                  {option.label}
                </button>
              ))}
            </div>
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                void uploadImage(file as File, "bg");
                return false;
              }}
            >
              <Button size="small" icon={<PictureOutlined />}>
                上传自定义背景（≤5MB）
              </Button>
            </Upload>
          </Space>
        ) : null}
      </Modal>
    </LeagueShell>
  );
}
