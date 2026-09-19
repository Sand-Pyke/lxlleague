"use client";

import { SearchOutlined, TeamOutlined } from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Select,
  Spin,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LeagueShell } from "@/components/app-shell";
import { RankLabel } from "@/components/rank-label";
import { POSITION_OPTIONS, RANKS, positionText } from "@/lib/admin-options";
import type { Player } from "@/lib/data";
import { championIcon } from "@/lib/game-assets";

/**
 * 段位筛选：与旧选手页一致，外形与其它筛选下拉保持一致。
 * 「全部段位」置顶，其余按 RANKS 词表（高段位在上）列出，选项带段位图标。
 */
const RANK_FILTER_OPTIONS = [
  { value: "all", label: "全部段位" },
  ...RANKS.filter((rank) => rank !== "").map((rank) => ({
    value: rank,
    label: <RankLabel rank={rank} />,
  })),
];

const GAME_FILTER_OPTIONS = [
  { value: "all", label: "全部场次" },
  { value: "30", label: "近30场以上" },
];

const POINT_FILTER_OPTIONS = [
  { value: "desc", label: "积分从高到低" },
  { value: "asc", label: "积分从低到高" },
];

const POSITION_FILTER_OPTIONS = [
  { value: "all", label: "全部位置" },
  ...POSITION_OPTIONS.map((position) => ({ value: position, label: positionText(position) })),
];

type Filters = {
  keyword: string;
  rank: string;
  points: string;
  games: string;
  position: string;
};

const defaultFilters: Filters = {
  keyword: "",
  rank: "all",
  points: "desc",
  games: "all",
  position: "all",
};

const resultDots = (recent: string) =>
  (recent ?? "")
    .split(" ")
    .filter(Boolean)
    .map((result, index) => (
      <span
        key={index}
        className={`result-dot ${result === "W" ? "result-dot--win" : "result-dot--loss"}`}
      >
        {result}
      </span>
    ));

/**
 * 资料卡的「常用英雄」：优先用选手自己设置的（最多 3 个），没设置时回退到战绩里最常用的那个。
 * 与个人主页档案卡的取值口径保持一致（components/profile/profile-view.tsx 的 heroStrip）。
 */
function heroNames(player: Player) {
  if (player.favoriteHeroes?.length) return player.favoriteHeroes;
  return player.hero ? [player.hero] : [];
}

function HeroCell({ player }: { player: Player }) {
  const heroes = heroNames(player);
  if (!heroes.length) return null;
  return (
    <span className="players-hero-list">
      {heroes.map((hero) => {
        const icon = championIcon(hero);
        return (
          <span className="players-hero" key={hero}>
            {icon ? (
              <img src={icon} alt={hero} loading="lazy" />
            ) : (
              <span className="players-hero-empty" />
            )}
            <span>{hero}</span>
          </span>
        );
      })}
    </span>
  );
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("card");
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  useEffect(() => {
    fetch("/api/players")
      .then((response) => response.json())
      .then((data) => setPlayers(data.player_list ?? data.players ?? []))
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, []);

  const list = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    const filtered = players.filter((player) => {
      if (filters.rank !== "all" && (player.rank || "none") !== filters.rank) return false;
      if (filters.position !== "all" && player.position !== filters.position) return false;
      if (filters.games === "30" && player.games < 30) return false;
      if (!keyword) return true;
      return (
        player.name.toLowerCase().includes(keyword) ||
        player.username.toLowerCase().includes(keyword) ||
        String(player.id).includes(keyword) ||
        player.gameName.toLowerCase().includes(keyword) ||
        (player.position ?? "").toLowerCase().includes(keyword) ||
        positionText(player.position).includes(keyword) ||
        (player.rank ?? "").includes(keyword) ||
        (player.kookName ?? "").toLowerCase().includes(keyword)
      );
    });
    return filtered.sort((a, b) =>
      filters.points === "asc" ? a.points - b.points : b.points - a.points,
    );
  }, [players, filters]);

  const columns: TableColumnsType<Player> = [
    {
      title: "选手",
      key: "player",
      render: (_, player) => (
        <Link className="table-player" href={`/profile?uid=${player.id}`}>
          <Avatar src={player.avatar || undefined} icon={<TeamOutlined />} />
          <span>
            <b>{player.name}</b>
            <small>{player.gameName || "未设置"}</small>
          </span>
        </Link>
      ),
    },
    {
      title: "位置",
      key: "position",
      width: 92,
      render: (_, player) => positionText(player.position),
    },
    {
      title: "段位",
      key: "rank",
      width: 108,
      render: (_, player) => <RankLabel rank={player.rank} />,
    },
    { title: "常用英雄", key: "hero", render: (_, player) => <HeroCell player={player} /> },
    { title: "胜率", key: "winRate", width: 82, render: (_, player) => `${player.winRate}%` },
    { title: "场次", dataIndex: "games", key: "games", width: 74 },
    { title: "KDA", dataIndex: "kda", key: "kda", width: 78 },
    { title: "积分", dataIndex: "points", key: "points", width: 82 },
    { title: "近期", key: "recent", width: 132, render: (_, player) => resultDots(player.recent) },
  ];

  return (
    <LeagueShell>
      {/* 原先 page-title 区块里的人数信息，压成一行小字保留。 */}
      <p className="players-hint">
        LXL 注册选手 <b>{players.length}</b> 名 · 点击选手可查看个人主页
      </p>
      <div className="players-toolbar">
        <Input
          allowClear
          className="players-search"
          placeholder="搜索昵称/ID"
          prefix={<SearchOutlined />}
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <div className="players-filters">
          {/*
            段位只有十来个，要求面板一次铺满、不要滚动条。
            - virtual={false} 去掉虚拟滚动；
            - classNames.popup.root 给弹层加类名，供 globals.css 覆盖内层的 256px 内联高度
              （antd 6 已废弃 popupClassName，且移除了 listHeight）。
          */}
          <Select
            className="players-rank-select"
            classNames={{ popup: { root: "rank-dropdown" } }}
            value={filters.rank}
            options={RANK_FILTER_OPTIONS}
            virtual={false}
            style={{ minWidth: 128 }}
            onChange={(rank) => setFilters({ ...filters, rank })}
          />
          <Select
            value={filters.points}
            options={POINT_FILTER_OPTIONS}
            style={{ minWidth: 148 }}
            onChange={(points) => setFilters({ ...filters, points })}
          />
          <Select
            value={filters.games}
            options={GAME_FILTER_OPTIONS}
            style={{ minWidth: 128 }}
            onChange={(games) => setFilters({ ...filters, games })}
          />
          <Select
            value={filters.position}
            options={POSITION_FILTER_OPTIONS}
            style={{ minWidth: 118 }}
            onChange={(position) => setFilters({ ...filters, position })}
          />
          <Button onClick={() => setFilters(defaultFilters)}>重置筛选</Button>
          <Segmented
            className="players-view"
            value={view}
            options={[
              { value: "card", label: "卡片视图" },
              { value: "list", label: "列表视图" },
            ]}
            onChange={(value) => setView(String(value))}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <Spin size="large" />
        </div>
      ) : list.length ? (
        view === "card" ? (
          <Row gutter={[16, 16]}>
            {list.map((player) => (
              <Col key={player.id} xs={24} sm={12} lg={8} xl={6}>
                <Link className="players-card-link" href={`/profile?uid=${player.id}`}>
                  <Card className="player-antd-card">
                    <div className="players-card-head">
                      <Avatar size={40} src={player.avatar || undefined} icon={<TeamOutlined />} />
                      <div>
                        <b>{player.name}</b>
                        <small>{player.gameName || "未设置"}</small>
                      </div>
                      <span className="players-uid">ID:{player.id}</span>
                    </div>
                    <div className="players-tags">
                      <Tag color="purple">{positionText(player.position)}</Tag>
                      <Tag color="gold">
                        <RankLabel rank={player.rank} />
                      </Tag>
                    </div>
                    {heroNames(player).length > 0 && (
                      <div className="players-hero-row">
                        <span className="players-hero-label">常用英雄</span>
                        <HeroCell player={player} />
                      </div>
                    )}
                    <Row className="players-stats">
                      <Col span={8}>
                        <b className="prof-green">{player.winRate}%</b>
                        <small>胜率</small>
                      </Col>
                      <Col span={8}>
                        <b>{player.games}</b>
                        <small>场次</small>
                      </Col>
                      <Col span={8}>
                        <b className="prof-cyan">{player.kda}</b>
                        <small>KDA</small>
                      </Col>
                      <Col span={8}>
                        <b>
                          {player.avgKills}/{player.avgDeaths}
                        </b>
                        <small>击杀/死亡</small>
                      </Col>
                      <Col span={8}>
                        <b className="prof-gold">{player.points}</b>
                        <small>积分</small>
                      </Col>
                      <Col span={8}>
                        <b>{player.mvp}</b>
                        <small>MVP次数</small>
                      </Col>
                    </Row>
                    <div className="players-recent">
                      {resultDots(player.recent).length ? (
                        resultDots(player.recent)
                      ) : (
                        <span className="prof-muted">暂无对局</span>
                      )}
                    </div>
                  </Card>
                </Link>
              </Col>
            ))}
          </Row>
        ) : (
          <Card className="antd-panel">
            <Table
              columns={columns}
              dataSource={list}
              rowKey="id"
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ x: 1080 }}
            />
          </Card>
        )
      ) : (
        <Card className="antd-panel">
          <Empty description={players.length ? "没有符合条件的选手" : "暂无选手数据"} />
        </Card>
      )}
    </LeagueShell>
  );
}
