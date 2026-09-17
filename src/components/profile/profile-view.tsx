"use client";

import {
  CameraOutlined,
  LoginOutlined,
  PictureOutlined,
  ReloadOutlined,
  SmileOutlined,
  UserAddOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
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
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { errorText, getJson, postJson, successText } from "@/components/admin/api-client";
import { LeagueShell } from "@/components/app-shell";
import { RankLabel } from "@/components/rank-label";
import { useThemeMode } from "@/components/theme-provider";
import {
  NO_SUB_POSITION,
  POSITION_OPTIONS,
  RANK_OPTIONS,
  normalizeSubPosition,
  positionText,
  subPositionChoices,
} from "@/lib/admin-options";
import { BACKGROUND_OPTIONS } from "@/lib/backgrounds";
import {
  DEFAULT_AVATAR_OPTIONS,
  defaultAvatarPath,
  isDefaultAvatar,
  randomDefaultAvatar,
} from "@/lib/default-avatars";
import { MAX_FAVORITE_HEROES } from "@/lib/favorite-heroes";
import {
  PASSWORD_HINT,
  passwordFormatError,
  USERNAME_HINT,
  usernameFormatError,
} from "@/lib/credentials";
import { GAME_NAME_HINT, isValidGameName } from "@/lib/game-name";
import { championChoices, championIcon, itemIcon } from "@/lib/game-assets";
import { missingSignupRequirements } from "@/lib/profile-requirements";

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
  /** 自己挑的常用英雄（最多 3 个，英雄名） */
  favoriteHeroes: string[];
  kookName: string;
  background: string;
  is_admin: boolean;
  status: string;
  /** 待审核的新段位；非空表示有一笔段位修改申请在排队。 */
  pending_rank: string;
  review_note: string;
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
  is_core_admin: boolean;
  user: ProfileUser;
  stats: ProfileStats;
  heroes: HeroStat[];
  ranking: number;
  ranking_total: number;
  match_history: HistoryRow[];
};

type EditKind =
  "bio" | "kook" | "game" | "hero" | "account" | "pwd" | "pos" | "rank" | "avatar" | "bg";

const EDIT_TITLE: Record<EditKind, string> = {
  bio: "编辑个人简介",
  kook: "设置 KOOK 昵称",
  game: "设置游戏ID",
  hero: "设置常用英雄",
  account: "修改账户ID",
  pwd: "修改密码",
  pos: "设置位置",
  rank: "修改段位",
  avatar: "选择表情头像",
  bg: "选择背景图",
};

const emptyDraft = {
  bio: "",
  kookName: "",
  gameName: "",
  heroes: [] as string[],
  accountName: "",
  oldPwd: "",
  newPwd: "",
  mainPos: "",
  subPos: NO_SUB_POSITION,
  rank: "",
  avatar: "",
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
  const { mode } = useThemeMode();
  const [messageApi, contextHolder] = message.useMessage();
  const [payload, setPayload] = useState<ProfilePayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "anon" | "missing" | "error">(
    "loading",
  );
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

  // 自定义背景仅在深色模式下可用；切回浅色时关掉可能还开着的背景弹窗。
  useEffect(() => {
    if (mode !== "dark") setEditKind((kind) => (kind === "bg" ? null : kind));
  }, [mode]);

  function openEdit(kind: EditKind) {
    if (!payload) return;
    setDraft({
      bio: payload.user.bio ?? "",
      kookName: payload.user.kookName ?? "",
      gameName: payload.user.gameName ?? "",
      heroes: [...(payload.user.favoriteHeroes ?? [])],
      accountName: payload.user.username ?? "",
      oldPwd: "",
      newPwd: "",
      mainPos: POSITION_OPTIONS.includes(payload.user.mainPosition)
        ? payload.user.mainPosition
        : "",
      subPos: POSITION_OPTIONS.includes(payload.user.subPosition)
        ? payload.user.subPosition
        : NO_SUB_POSITION,
      rank: payload.user.rank ?? "",
      // 只有内置表情头像能在弹窗里高亮选中；自定义上传的图保持未选中状态。
      avatar: isDefaultAvatar(payload.user.avatar) ? payload.user.avatar : "",
      bg: payload.user.background.replace("/assets/bgs/", ""),
    });
    setEditKind(kind);
  }

  async function uploadImage(file: File, kind: "avatar" | "bg") {
    const form = new FormData();
    form.append(kind, file);
    try {
      const response = await fetch(
        kind === "avatar" ? "/api/avatar/upload" : "/api/user/bg/upload",
        {
          method: "POST",
          body: form,
        },
      );
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        messageApi.error(typeof data.msg === "string" ? data.msg : "上传失败");
        return;
      }
      messageApi.success(kind === "avatar" ? "头像已更新" : "背景已更新");
      setEditKind(null);
      await load();
      // 顶栏头像与全站背景都由根布局在服务端注入，上传后需刷新服务端组件才会同步。
      if (kind === "avatar" || kind === "bg") router.refresh();
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
    if (editKind === "pwd") {
      const passwordError = passwordFormatError(draft.newPwd);
      if (passwordError) {
        messageApi.error(passwordError);
        return;
      }
    }
    if (editKind === "account") {
      const usernameError = usernameFormatError(draft.accountName.trim());
      if (usernameError) {
        messageApi.error(usernameError);
        return;
      }
    }
    if (editKind === "rank" && !draft.rank) {
      messageApi.error("请选择段位");
      return;
    }
    if (editKind === "game" && !isValidGameName(draft.gameName)) {
      messageApi.error(`游戏ID格式不正确：${GAME_NAME_HINT}`);
      return;
    }
    if (editKind === "avatar" && !draft.avatar) {
      messageApi.error("请选择一个表情头像");
      return;
    }
    setSaving(true);
    try {
      const request: Record<EditKind, [string, Record<string, unknown>]> = {
        bio: ["/api/user/update_bio", { bio: draft.bio }],
        kook: ["/api/user/update_kook", { kook_name: draft.kookName }],
        game: ["/api/user/game_name", { game_name: draft.gameName }],
        hero: ["/api/user/favorite_heroes", { heroes: draft.heroes }],
        account: ["/api/user/change_username", { username: draft.accountName }],
        pwd: ["/api/user/change_pwd", { old_pwd: draft.oldPwd, new_pwd: draft.newPwd }],
        pos: [
          "/api/user/update_pos",
          { main_pos: draft.mainPos, sub_pos: normalizeSubPosition(draft.mainPos, draft.subPos) },
        ],
        // 段位不能直接改：提交后账号会重新进入待审核状态。
        rank: ["/api/user/rank", { rank: draft.rank }],
        avatar: ["/api/user/avatar", { avatar: draft.avatar }],
        bg: ["/api/user/bg", { bg: draft.bg }],
      };
      const [url, body] = request[editKind];
      const data = await postJson(url, body);
      messageApi.success(successText(data, "已保存"));
      setEditKind(null);
      await load();
      // 顶栏显示账户ID、头像与全站背景都来自根布局的服务端注入，改完需刷新才会同步。
      if (editKind === "account" || editKind === "avatar" || editKind === "bg") router.refresh();
    } catch (error) {
      messageApi.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  const user = payload?.user;
  const stats = payload?.stats;
  const history = payload?.match_history ?? [];
  const self = Boolean(payload?.isSelf);
  // 核心管理员（admin）是系统账号而非选手：不展示段位/位置/排名与各项数据面板，
  // 仅保留档案卡与「个人简介」里的账户设置。
  const coreAdmin = Boolean(payload?.is_core_admin);
  // 常用英雄分两份：自己挑的（用于「常用英雄」卡片与头像行）与战绩推导的（用于「英雄战绩」）。
  const favoriteHeroes = user?.favoriteHeroes ?? [];
  const statHeroes = payload?.heroes ?? [];
  const heroStrip = favoriteHeroes.length
    ? favoriteHeroes
    : statHeroes.map((hero) => hero.champion);
  // 报名赛事前需补全的资料项，缺哪几项直接列在「我的资料设置」里。
  const missingForSignup = user
    ? missingSignupRequirements({
        gameName: user.gameName,
        mainPosition: user.mainPosition,
        rank: user.rank,
        kookName: user.kookName,
      })
    : [];

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
          {/* 必须包一层元素：.prof-kda 是纵向 flex，直接写 "击杀 / <i>阵亡</i> / 助攻" 的话
              斜杠与 <i> 会被当成多个匿名 flex 子项，各自占一行。 */}
          <span>
            {row.kills} / <i>{row.deaths}</i> / {row.assists}
          </span>
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
        <div className={coreAdmin ? "prof-page prof-page--core-admin" : "prof-page"}>
          {/* 自定义背景层已提到全站外壳（LeagueShell）里，这里不再重复渲染。 */}
          <section className="prof-hero">
            <div className="prof-hero-inner">
              <div className="prof-avatar-box">
                {self ? (
                  <Tooltip title="点击上传自定义头像">
                    <Upload
                      accept="image/*"
                      showUploadList={false}
                      beforeUpload={(file) => {
                        void uploadImage(file as File, "avatar");
                        return false;
                      }}
                    >
                      <button type="button" className="prof-avatar-trigger" aria-label="更换头像">
                        {user.avatar ? (
                          <Avatar size={96} src={user.avatar} />
                        ) : (
                          <span className="prof-avatar-placeholder">
                            <CameraOutlined />
                            <small>点击上传头像</small>
                          </span>
                        )}
                      </button>
                    </Upload>
                  </Tooltip>
                ) : user.avatar ? (
                  <Avatar size={96} src={user.avatar} />
                ) : (
                  <span className="prof-avatar-placeholder">
                    <UserOutlined />
                  </span>
                )}
                {self ? (
                  <div className="prof-avatar-actions">
                    <a onClick={() => openEdit("avatar")}>
                      <SmileOutlined /> 表情头像
                    </a>
                    {mode === "dark" ? (
                      <a onClick={() => openEdit("bg")}>
                        <PictureOutlined /> 选择背景
                      </a>
                    ) : (
                      <span className="prof-avatar-note">切到深色模式可设置背景</span>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="prof-identity">
                {/* 看别人的主页时默认展示游戏ID（召唤师名），没设置则退回账户ID。 */}
                <h1>{self ? user.name : user.gameName || user.username}</h1>
                <div className="prof-meta">
                  <span className="prof-rank">
                    <RankLabel rank={user.rank} fallback="未定段" />
                  </span>
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
                  {heroStrip.length ? (
                    <span
                      className="prof-heroes"
                      title={favoriteHeroes.length ? "常用英雄" : "常用英雄（按战绩）"}
                    >
                      {heroStrip.map((name) => {
                        const icon = championIcon(name);
                        return icon ? <img key={name} src={icon} alt={name} title={name} /> : null;
                      })}
                    </span>
                  ) : null}
                  <span className="prof-ladder">
                    LXL 第 <b>{payload?.ranking || "-"}</b> 位选手
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="prof-grid">
            <div className="prof-main">
              <Card
                className="antd-panel"
                title="个人简介"
                extra={
                  self && !coreAdmin ? (
                    <Button size="small" onClick={() => openEdit("bio")}>
                      编辑简介
                    </Button>
                  ) : null
                }
              >
                <Typography.Paragraph className="prof-bio">
                  {coreAdmin ? "本页面王牌管理员" : user.bio || "这个人很懒，什么都没有留下"}
                </Typography.Paragraph>
                {/* 核心管理员是系统账号：不提供任何自助设置（账户、密码、段位等）。 */}
                {self && !coreAdmin ? (
                  <div className="prof-settings">
                    <div className="prof-settings-title">我的资料设置</div>
                    {(
                      [
                        { label: "账户ID", value: user.username || "未设置", kind: "account" },
                        { label: "KOOK昵称", value: user.kookName || "未设置", kind: "kook" },
                        { label: "游戏ID", value: user.gameName || "未设置", kind: "game" },
                        {
                          label: "常用英雄",
                          value: favoriteHeroes.length ? favoriteHeroes.join(" / ") : "未设置",
                          kind: "hero" as EditKind,
                        },
                        {
                          label: "段位",
                          value: (
                            <>
                              <RankLabel rank={user.rank} fallback="未设置" />
                              {user.pending_rank ? (
                                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                                  （审核中：{user.pending_rank}）
                                </Typography.Text>
                              ) : null}
                            </>
                          ),
                          kind: "rank" as EditKind,
                        },
                        { label: "登录密码", value: "••••••", kind: "pwd" },
                      ] as Array<{ label: string; value: ReactNode; kind: EditKind }>
                    ).map((row) => (
                      <div className="prof-settings-row" key={row.kind}>
                        <span>
                          {row.label}：<b>{row.value}</b>
                        </span>
                        {(row.kind !== "account" && row.kind !=='rank') && (
                          <Button size="small" type="link" onClick={() => openEdit(row.kind)}>
                            {row.value === "未设置" ? "设置" : "修改"}
                          </Button>
                        )}
                      </div>
                    ))}
                    <p className="prof-settings-note">
                      游戏ID（召唤师名）用于战绩导入时匹配到你的账号，需与游戏内名称一致， 格式为
                      名称#数字编号（例如 向阳而生#32250）。
                    </p>
                    {missingForSignup.length ? (
                      <Alert
                        className="prof-signup-warning"
                        type="warning"
                        showIcon
                        title={`报名赛事前需先补全：${missingForSignup.join("、")}`}
                      />
                    ) : null}
                  </div>
                ) : null}
              </Card>

              {/* 核心管理员是系统账号而非选手：赛季数据整个不渲染。
                  不用 CSS 隐藏，否则会撞上 .prof-main > .ant-card:last-child 的
                  display: flex（特异性 0,3,0）盖掉隐藏规则（0,2,0）。 */}
              {coreAdmin ? null : (
                <Card className="antd-panel prof-stats-card" title="赛季数据">
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
              )}
            </div>

            <div className="prof-side">
              <Card
                className="antd-panel"
                title="常用英雄"
              >
                {favoriteHeroes.length ? (
                  favoriteHeroes.map((name) => {
                    const icon = championIcon(name);
                    return (
                      <div className="prof-hero-row" key={name}>
                        {icon ? <img src={icon} alt={name} /> : <b>{name.slice(0, 1)}</b>}
                        <div>
                          <strong>{name}</strong>
                          <small>自选常用英雄</small>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={self ? "还未设置常用英雄" : "暂无常用英雄"}
                  />
                )}
              </Card>

              <Card className="antd-panel" title="英雄战绩">
                {statHeroes.length ? (
                  statHeroes.map((hero) => {
                    const icon = championIcon(hero.champion);
                    return (
                      <div className="prof-hero-row" key={hero.champion}>
                        {icon ? (
                          <img src={icon} alt={hero.champion} />
                        ) : (
                          <b>{hero.champion.slice(0, 1)}</b>
                        )}
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
                    {user.teamChampion ? (
                      <Tag color="gold">赛事冠军 × {user.teamChampion}</Tag>
                    ) : null}
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
                    if (row.match_id)
                      router.push(`/matches/${row.match_id}/result?game=${row.game_no}`);
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
        width={editKind === "bg" ? 720 : editKind === "avatar" ? 560 : 460}
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
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            <Input
              value={draft.gameName}
              maxLength={32}
              placeholder="例如 向阳而生#32250"
              onChange={(event) => setDraft({ ...draft, gameName: event.target.value })}
            />
            <Typography.Text type="secondary">
              {GAME_NAME_HINT}，需与游戏内名称完全一致（战绩导入按它匹配你的账号）。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "hero" ? (
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              value={draft.heroes}
              maxCount={MAX_FAVORITE_HEROES}
              placeholder={`最多选择 ${MAX_FAVORITE_HEROES} 个常用英雄`}
              options={championChoices.map((choice) => ({
                value: choice.value,
                label: (
                  <span className="prof-hero-option">
                    {choice.icon ? <img src={choice.icon} alt="" /> : null}
                    {choice.label}
                  </span>
                ),
              }))}
              // 选择器只按 label 搜索，这里把英雄名/英文别名一并塞进 label 的文本里，
              // 保证搜「安妮」或「Annie」都能命中同一条。
              filterOption={(input, option) => {
                const choice = championChoices.find((item) => item.value === option?.value);
                const haystack = `${choice?.keywords ?? ""}${option?.value ?? ""}`.toLowerCase();
                return haystack.includes(input.trim().toLowerCase());
              }}
              onChange={(value: string[]) => setDraft({ ...draft, heroes: value })}
            />
            <Typography.Text type="secondary">
              最多 {MAX_FAVORITE_HEROES} 个，展示在个人主页；留空则不展示自选英雄。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "account" ? (
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            <Input
              value={draft.accountName}
              maxLength={24}
              placeholder={USERNAME_HINT}
              onChange={(event) => setDraft({ ...draft, accountName: event.target.value })}
            />
            <Typography.Text type="secondary">
              修改后请使用新账户ID登录；账户ID不支持中文。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "pwd" ? (
          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <Input.Password
              value={draft.oldPwd}
              placeholder="原密码"
              onChange={(event) => setDraft({ ...draft, oldPwd: event.target.value })}
            />
            <Input.Password
              value={draft.newPwd}
              placeholder={`新密码（${PASSWORD_HINT}）`}
              onChange={(event) => setDraft({ ...draft, newPwd: event.target.value })}
            />
          </Space>
        ) : null}
        {editKind === "rank" ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <Select
              style={{ width: "100%" }}
              value={draft.rank || undefined}
              placeholder="选择段位"
              virtual={false}
              classNames={{ popup: { root: "rank-dropdown" } }}
              options={RANK_OPTIONS.map((option) => ({
                value: option.value,
                label: <RankLabel rank={option.value} fallback="未设置" />,
              }))}
              onChange={(value) => setDraft({ ...draft, rank: value })}
            />
            <Typography.Text type="secondary">
              段位在注册时提交、审核通过后不可自行修改。提交修改申请后账号会回到「待审核」，
              需等管理员通过后新段位才生效；审核期间请勿退出登录（退出后无法重新登录）。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "pos" ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
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
                // 副位置不能与主位置相同：改主位置时顺手把撞上的副位置清成「无」。
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    mainPos: value,
                    subPos: normalizeSubPosition(value, current.subPos),
                  }))
                }
              />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                副位置
              </Typography.Text>
              <Select
                style={{ width: "100%" }}
                value={draft.subPos}
                options={[{ value: NO_SUB_POSITION, label: "无" }].concat(
                  subPositionChoices(draft.mainPos).map((position) => ({
                    value: position,
                    label: positionText(position),
                  })),
                )}
                onChange={(value) => setDraft({ ...draft, subPos: value })}
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              主位置为必选，报名赛事时会自动带入；副位置不能与主位置相同。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "avatar" ? (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <div className="prof-emoji-grid">
              {DEFAULT_AVATAR_OPTIONS.map((option) => (
                <button
                  className={draft.avatar === defaultAvatarPath(option.id) ? "selected" : ""}
                  key={option.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, avatar: defaultAvatarPath(option.id) })}
                >
                  <span style={{ backgroundImage: `url("${defaultAvatarPath(option.id)}")` }} />
                  {option.label}
                </button>
              ))}
            </div>
            <Space size={12} wrap>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => setDraft({ ...draft, avatar: randomDefaultAvatar() })}
              >
                随机换一个
              </Button>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void uploadImage(file as File, "avatar");
                  return false;
                }}
              >
                <Button size="small" icon={<CameraOutlined />}>
                  上传自定义头像（≤5MB）
                </Button>
              </Upload>
            </Space>
            <Typography.Text type="secondary">
              注册时会随机发一个表情头像，随时可以在这里更换，也可以上传自己的图片
              （圆形展示，建议使用正方形图片）。
            </Typography.Text>
          </Space>
        ) : null}
        {editKind === "bg" ? (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
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
