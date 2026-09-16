#!/usr/bin/env node
/**
 * Mock LCU —— 假的英雄联盟客户端，用来在没有游戏的机器上联调 lcu-agent。
 *
 * 它做三件事：
 *   1. 起一个只监听 127.0.0.1 的 HTTP 服务，实现 agent 会调的那三个 LCU 接口；
 *   2. 写一个 lockfile（格式与真实客户端一致，协议写成 http 所以不需要证书）；
 *   3. 如果给了 --token/--api，就拉一次本站的真实选手名单来造参与者，
 *      这样 agent 的「匹配到本站账号」这条主路径才能真的走通。
 *
 * 用法：
 *   node scripts/mock-lcu.mjs --token <导入令牌> [--port 39251] [--games 2] [--api http://localhost:3000]
 *
 * 然后另开一个终端跑 agent（注意要 --lockfile 指到这个 mock 写的文件）：
 *   node scripts/lcu-agent.mjs --token <同一个令牌> --lockfile <上面打印出来的路径> --once --dry-run
 *   node scripts/lcu-agent.mjs --token <同一个令牌> --lockfile <同一个路径> --once
 *
 * 默认 lockfile 路径：<系统临时目录>/lxl-mock-lcu/lockfile
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};

const PORT = Number(flag("port", 39251));
const API_BASE = String(flag("api", "http://localhost:3000")).replace(/\/+$/, "");
const TOKEN = String(flag("token", process.env.LXL_IMPORT_TOKEN ?? "")).trim();
const GAMES = Math.max(1, Number(flag("games", 2)));
/** 多局时轮换队列，模拟「自定义房 + 排位混在一起」的真实情况。 */
const QUEUE_IDS = [3130, 420, 3130, 430, 3130, 440];
// --classic 让 mock 返回**经典 Match-v4 形态**（国服实测走的是这个）：
// participant 上只有 participantId/championId/teamId/stats，身份在 participantIdentities。
const CLASSIC = args.includes("--classic");
const PASSWORD = "mock-lcu-password";
const SELF_PUUID = "mock-puuid-self";
const LOCKFILE = String(flag("lockfile", path.join(os.tmpdir(), "lxl-mock-lcu", "lockfile")));

const log = (...parts) => console.log("[mock-lcu]", ...parts);

// ---------- 造数据 ----------

/** 英雄表：取前 10 个真实英雄，保证 agent 的 championId → 中文名映射一定命中。 */
function loadChampionIds() {
  try {
    const file = new URL("../public/assets/champions.json", import.meta.url);
    const list = JSON.parse(readFileSync(file, "utf8"));
    return list.slice(0, 10).map((item) => Number(item.id));
  } catch {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  }
}

/** 优先用本站真实选手，让「匹配到账号」这条路径真的被覆盖到。 */
async function loadParticipants() {
  if (!TOKEN) {
    log("未提供 --token，将使用虚构参与者（agent 会全部报「匹配不到」）");
    return Array.from({ length: 10 }, (_, index) => ({
      puuid: `mock-puuid-${index + 1}`,
      name: `MockSummoner${index + 1}`,
    }));
  }
  try {
    const response = await fetch(`${API_BASE}/api/import/context`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    const players = (data.players ?? []).slice(0, 10);
    log(`已从本站读到 ${players.length} 名选手：${players.map((p) => p.gameName).join("、")}`);
    return players.map((player, index) => ({
      puuid: player.puuid || `mock-puuid-user-${player.userId}`,
      name: player.gameName || player.username || `User${player.userId}`,
      index,
    }));
  } catch (error) {
    log("读取本站选手失败，退回虚构参与者：", error instanceof Error ? error.message : error);
    return Array.from({ length: 10 }, (_, index) => ({
      puuid: `mock-puuid-${index + 1}`,
      name: `MockSummoner${index + 1}`,
    }));
  }
}

/**
 * 经典 Match-v4 形态：participant 上**没有** puuid / 召唤师名 / champLevel / 经济视野装备，
 * 玩家身份在顶层 participantIdentities[].player，其余数值全在 participant.stats 里。
 * 用来验证 agent 的双形态兼容。
 */
function buildClassicGame(gameId, participants, championIds) {
  return {
    gameId: String(gameId),
    gameCreation: Date.now() - 30 * 60 * 1000,
    gameDuration: 1800,
    queueId: 0,
    participantIdentities: participants.map((participant, index) => ({
      participantId: index + 1,
      player: {
        puuid: participant.puuid,
        gameName: participant.name,
        summonerName: participant.name,
        accountId: `acc-${index + 1}`,
      },
    })),
    participants: participants.map((participant, index) => {
      const win = index < Math.ceil(participants.length / 2);
      return {
        participantId: index + 1,
        championId: championIds[index % championIds.length],
        spell1Id: 4,
        spell2Id: 14,
        teamId: win ? 100 : 200,
        timeline: { lane: "MID", role: "SOLO" },
        highestAchievedSeasonTier: "GOLD",
        stats: {
          win,
          kills: 3 + index,
          deaths: 1 + (index % 4),
          assists: 5 + index,
          goldEarned: 9000 + index * 450,
          visionScore: 20 + index * 3,
          totalMinionsKilled: 150 + index * 5,
          neutralMinionsKilled: 10,
          champLevel: 13 + (index % 5),
          item0: 3153,
          item1: 3006,
          item2: 6672,
          item3: 0,
          item4: 0,
          item5: 0,
          item6: 3340,
        },
      };
    }),
  };
}

function buildGame(gameId, participants, championIds) {
  return {
    gameId: String(gameId),
    gameCreation: Date.now() - 30 * 60 * 1000,
    gameDuration: 1800,
    queueId: 0, // 自定义房
    participants: participants.map((participant, index) => {
      const win = index < Math.ceil(participants.length / 2);
      return {
        participantId: index + 1,
        puuid: participant.puuid,
        riotIdGameName: participant.name,
        championId: championIds[index % championIds.length],
        teamId: win ? 100 : 200,
        champLevel: 13 + (index % 5),
        visionScore: 20 + index * 3,
        goldEarned: 9000 + index * 450,
        totalMinionsKilled: 150 + index * 5,
        neutralMinionsKilled: 10,
        item0: 3153,
        item1: 3006,
        item2: 6672,
        item3: 0,
        item4: 0,
        item5: 0,
        item6: 3340,
        stats: {
          win,
          kills: 3 + index,
          deaths: 1 + (index % 4),
          assists: 5 + index,
        },
      };
    }),
  };
}

// ---------- 服务 ----------

const GAME_IDS = Array.from({ length: GAMES }, (_, index) => 1000000 + index + 1);

async function main() {
  const championIds = loadChampionIds();
  const participants = await loadParticipants();
  const games = new Map(
    GAME_IDS.map((id, index) => {
      const game = CLASSIC
        ? buildClassicGame(id, participants, championIds)
        : buildGame(id, participants, championIds);
      // 多局时轮换 queueId（默认 3130，国服自定义房实测值），用来测 --queues 的多种分支。
      game.queueId = QUEUE_IDS[index % QUEUE_IDS.length];
      return [String(id), game];
    }),
  );

  const server = http.createServer((req, res) => {
    const expected = `Basic ${Buffer.from(`riot:${PASSWORD}`).toString("base64")}`;
    if (req.headers.authorization !== expected) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "unauthorized" }));
      log(`401 ${req.url}（Basic Auth 不对）`);
      return;
    }

    const send = (payload, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      log(`${status} ${req.url}${status === 200 ? "" : " ← 未实现的端点"}`);
    };

    const url = req.url ?? "";
    if (url === "/lol-summoner/v1/current-summoner") {
      send({ puuid: SELF_PUUID, gameName: participants[0]?.name ?? "MockSummoner1" });
      return;
    }
    if (url.startsWith("/lol-match-history/v1/products/lol/")) {
      send({ games: { games: GAME_IDS.map((id) => ({ gameId: id })) } });
      return;
    }
    const detail = url.match(/^\/lol-match-history\/v1\/games\/(\d+)/);
    if (detail) {
      const game = games.get(detail[1]);
      if (!game) {
        send({ message: "not found" }, 404);
        return;
      }
      send(game);
      return;
    }
    send({ message: "not implemented" }, 404);
  });

  server.on("error", (error) => {
    console.error(`[mock-lcu] 起服务失败（端口 ${PORT} 可能被占用）：${error.message}`);
    process.exit(1);
  });

  server.listen(PORT, "127.0.0.1", () => {
    mkdirSync(path.dirname(LOCKFILE), { recursive: true });
    // 与真实客户端同格式：<进程名>:<pid>:<端口>:<密码>:<协议>
    writeFileSync(LOCKFILE, `MockLeagueClient:${process.pid}:${PORT}:${PASSWORD}:http`);
    log(`已启动，监听 127.0.0.1:${PORT}（${CLASSIC ? "经典 Match-v4 形态" : "扁平形态"}）`);
    log(`lockfile 已写入：${LOCKFILE}`);
    log(`伪造了 ${GAMES} 局：${GAME_IDS.join("、")}`);
    log("");
    log("另开一个终端跑（令牌用同一个，建议走环境变量，避免令牌被记进日志）：");
    log(`  $env:LXL_IMPORT_TOKEN = "<令牌>"`);
    log(`  node scripts/lcu-agent.mjs --probe --lockfile "${LOCKFILE}"`);
    log(`  node scripts/lcu-agent.mjs --once  --lockfile "${LOCKFILE}"`);
    log("");
    log("Ctrl+C 停止。");
  });
}

main().catch((error) => {
  console.error("[mock-lcu] 启动失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
