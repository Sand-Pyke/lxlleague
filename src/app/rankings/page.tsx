"use client";

import { CrownFilled, CrownOutlined } from "@ant-design/icons";
import { Avatar, Card, Empty, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import Link from "next/link";
import { LeagueShell } from "@/components/app-shell";
import { RankLabel } from "@/components/rank-label";
import { positionText } from "@/lib/admin-options";
import type { Player } from "@/lib/data";
import { useEffect, useState } from "react";

/**
 * 领奖台只展示前三名，数组下标即榜单名次（0 = 冠军）。
 * 渲染顺序仍然是 1 / 2 / 3，视觉位置交给 CSS 的 grid-column 摆成
 * 「冠军居中抬高、亚季军分列左右」，因此读屏与 Tab 顺序依旧是名次顺序。
 */
const PODIUM_SLOTS = [0, 1, 2];

function PodiumSlot({ place, player }: { place: number; player?: Player }) {
  // 榜单不足三人时用虚线圆占位：既保持领奖台构图，也贴合真实赛事「虚位以待」的语义。
  if (!player) {
    return (
      <li className="rank-podium-slot" data-place={place}>
        <span className="rank-medal rank-medal--empty" />
        <b className="rank-podium-name">虚位以待</b>
        <span className="rank-podium-base" />
      </li>
    );
  }
  return (
    <li className="rank-podium-slot" data-place={place}>
      <span className="rank-medal">
        {place === 1 ? <CrownFilled className="rank-medal-crown" /> : null}
        <span className="rank-face">
          {player.avatar ? <img src={player.avatar} alt="" /> : <b>{player.name.slice(0, 1)}</b>}
        </span>
      </span>
      <Link className="rank-podium-name" href={`/profile?uid=${player.id}`}>
        {player.name}
      </Link>
      <span className="rank-podium-sub">{player.gameName || "—"}</span>
      <span className="rank-podium-points">
        <b>{player.points}</b>
        <small>积分</small>
      </span>
      <span className="rank-podium-base">
        <b>{place}</b>
        <small>
          {player.wins}胜{player.losses}负 · 胜率 {player.winRate}%
        </small>
      </span>
    </li>
  );
}

export default function RankingsPage() {
  const [list, setList] = useState<Player[]>([]);
  useEffect(() => {
    fetch("/api/players")
      .then((response) => response.json())
      .then((data) => setList(data.players ?? []))
      .catch(() => setList([]));
  }, []);
  // 未参赛的选手还未产生积分，不进入榜单（选手中心仍会列出全部注册选手）。
  const ranked = list.filter((player) => player.games > 0);
  // 前三名已经由领奖台呈现，表格只从第 4 名开始列，避免同一批人出现两次。
  // 名次从完整榜单里取，表格自己不知道被截掉了几行。
  const placeOf = new Map(ranked.map((player, index) => [player.id, index + 1]));
  const rest = ranked.slice(3);
  const columns: TableColumnsType<Player> = [
    {
      title: "排名",
      key: "rank",
      width: 76,
      render: (_, player) => <Tag>{placeOf.get(player.id) ?? "-"}</Tag>,
    },
    {
      title: "选手",
      key: "player",
      render: (_, player) => (
        <Link className="table-player" href={`/profile?uid=${player.id}`}>
          <Avatar src={player.avatar || undefined} />{" "}
          <span>
            <b>{player.name}</b>
            <small>{player.gameName}</small>
          </span>
        </Link>
      ),
    },
    // 段位紧跟选手，带段位图标。
    {
      title: "段位",
      key: "rank",
      width: 104,
      render: (_, player) => <RankLabel rank={player.rank} />,
    },
    {
      title: "位置",
      key: "position",
      width: 88,
      responsive: ["sm"],
      // 库里存的是 MID/JUG/ADC/SUP/TOP，展示时统一转成中文。
      render: (_, player) => positionText(player.position),
    },
    {
      title: "胜/负",
      key: "record",
      render: (_, player) => `${player.wins} / ${player.losses}`,
      responsive: ["md"],
    },
    { title: "胜率", key: "rate", render: (_, player) => `${player.winRate}%` },
    { title: "KDA", dataIndex: "kda", key: "kda", responsive: ["sm"] },
    // 积分放在最后：它是排序依据，也是整张表里最重要的数字。
    { title: "积分", dataIndex: "points", key: "points", width: 82 },
  ];
  return (
    <LeagueShell>
      <Card
        className="antd-panel"
        title={
          <>
            <CrownOutlined /> 冠军榜单
          </>
        }
      >
        {ranked.length ? (
          <>
            <ol className="rank-podium">
              {PODIUM_SLOTS.map((index) => (
                <PodiumSlot key={index} place={index + 1} player={ranked[index]} />
              ))}
            </ol>
            {/* 不足三人时领奖台已说完全部结果，就不再摆一张空表格。 */}
            {rest.length ? (
              <>
                <div className="rank-rest-title">第 4 名起</div>
                <Table
                  className="rankings-table"
                  columns={columns}
                  dataSource={rest}
                  rowKey="id"
                  pagination={false}
                />
              </>
            ) : null}
          </>
        ) : (
          <Empty description="暂无排行数据，产生比赛积分后自动显示" />
        )}
      </Card>
    </LeagueShell>
  );
}
