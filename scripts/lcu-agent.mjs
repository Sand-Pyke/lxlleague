#!/usr/bin/env node
/**
 * LCU Agent —— 本地战绩采集器（全自动导入的采集端）
 *
 * 为什么必须单独跑一个本地程序：英雄联盟客户端暴露的 LCU 接口只监听 127.0.0.1 的
 * 随机端口，密码每次启动都会变（写在安装目录的 lockfile 里），而且用的是自签证书。
 * 线上的 Next.js 服务端根本够不到它，所以采集只能在装了客户端的这台机器上做。
 *
 * 用法：
 *   node scripts/lcu-agent.mjs --probe                           # 先诊断客户端（不需要令牌）
 *   node scripts/lcu-agent.mjs --probe --token <令牌>            # 连服务端一起诊断
 *   node scripts/lcu-agent.mjs --token <令牌> --once --dry-run   # 看会传什么
 *   node scripts/lcu-agent.mjs --token <令牌> --once             # 真正导入一轮
 *   node scripts/lcu-agent.mjs --token <令牌>                    # 常驻，一局结束就自动导入
 *   node scripts/lcu-agent.mjs --token <令牌> --ui               # 打开本地可视化导入台
 *
 *   --token    后台「战绩录入 → 自动导入」里那串导入令牌（不传则读环境变量 LXL_IMPORT_TOKEN）
 *   --api      本站地址，默认 http://localhost:3000
 *   --probe    只诊断：逐步检查凭据/鉴权/召唤师/历史/映射，不上传（无需令牌）
 *   --once     只扫一次就退出（联调用；不带则常驻轮询）
 *   --interval 轮询间隔秒数，默认 20
 *   --dry-run  只打印将要上传的内容，不真的 POST
 *   --lockfile 手动指定 lockfile 路径（自动找不到时用）
 *   --ux-log   手动指定 LeagueClientUx.log（WeGame 空 lockfile 时的兜底）
 *   --ui       启动本机可视化导入台（默认 http://127.0.0.1:3179）
 *   --ui-port  可视化导入台端口，默认 3179
 *
 * 依赖：只用 Node 内置模块（node:fs / node:https），不需要 npm install。
 * 要求 Node >= 18（用到全局 fetch）。
 *
 * ⚠️ 只能抓到**本机登录账号参与过**的对局（LCU 的对局历史是按登录账号取的），
 *    所以请把它跑在裁判/房主那台机器上。一局的详情里包含全部参与者，一台就够。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import path from "node:path";

// ---------- 命令行参数 ----------
const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? true) : fallback;
};
const has = (name) => args.includes(`--${name}`);

const TOKEN = String(flag("token", process.env.LXL_IMPORT_TOKEN ?? "")).trim();
const API_BASE = String(flag("api", "http://localhost:3000")).replace(/\/+$/, "");
const ONCE = has("once");
const DRY_RUN = has("dry-run");
const PROBE = has("probe");
const UI = has("ui");
const INTERVAL_MS = Math.max(5, Number(flag("interval", 20))) * 1000;
const rawUiPort = Number(flag("ui-port", 3179));
const UI_PORT =
  Number.isInteger(rawUiPort) && rawUiPort >= 1024 && rawUiPort <= 65535 ? rawUiPort : 3179;

/**
 * queueId 白名单；空数组 = 不看队列，什么局都收。
 * ⚠️ 必须先滤掉空串再转数字：Number("") === 0，否则「没传 --queues」会被当成
 * 「只收自定义房」，把排位/匹配的局全丢掉。
 */
const QUEUES = String(flag("queues", ""))
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item !== "")
  .map((item) => Number(item))
  .filter((value) => Number.isFinite(value));

/** 一局里至少要有几名本站选手才导入。默认 2：挡住路人排位，保留真实联赛局。 */
const rawMinPlayers = Number(flag("min-players", 2));
const MIN_PLAYERS =
  Number.isFinite(rawMinPlayers) && rawMinPlayers >= 1 ? Math.floor(rawMinPlayers) : 2;

// 导入令牌由 randomBytes(...).toString("base64url") 生成，只会包含这组字符。
// 及早拒绝“<重置后的新令牌>”这类占位文本或复制时混进的中文，避免 fetch 在页面加载
// 时才因 HTTP Header 非法而报出难以理解的 ByteString 错误。
if (TOKEN && !/^[A-Za-z0-9_-]+$/.test(TOKEN)) {
  console.error("导入令牌格式无效：请从后台复制完整令牌，不能包含中文、空格或尖括号。");
  console.error("请在 PowerShell 中重新设置：$env:LXL_IMPORT_TOKEN = '<新令牌>'");
  process.exit(1);
}

if (!TOKEN && !PROBE) {
  console.error("缺少导入令牌。两种都可以：");
  console.error('  1) 环境变量： $env:LXL_IMPORT_TOKEN = "<令牌>"');
  console.error("  2) 命令行：   node scripts/lcu-agent.mjs --token <令牌>");
  console.error("令牌在后台「赛事管理 → 管理 → 战绩录入 → 自动导入」里复制。");
  console.error("只想先诊断客户端的话可以用 --probe，那不需要令牌。");
  process.exit(1);
}

// ---------- 通用小工具 ----------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) =>
  console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}]`, ...parts);
const warn = (...parts) =>
  console.warn(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}]`, ...parts);

/**
 * String.padEnd 按 UTF-16 码元数算长度，汉字占 1 而实际占 2 列，所以中文名字一列就歪。
 * 这里按真实显示宽度算，再把剩下的列数补成空格。
 */
function displayWidth(text) {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7ff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6b) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

const padRight = (text, columns) => text + " ".repeat(Math.max(0, columns - displayWidth(text)));

// ---------- 1. 找到 LCU ----------

/** 常见安装目录的父级：在这些目录里做「有界递归」找 lockfile，比穷举盘符快得多。 */
const LOCKFILE_PARENTS = [
  ...["C:", "D:", "E:", "F:"].flatMap((drive) => [
    `${drive}\\WeGameApps`,
    `${drive}\\Riot Games`,
    `${drive}\\Tencent`,
    `${drive}\\腾讯游戏`,
    `${drive}\\Program Files\\WeGameApps`,
    `${drive}\\Program Files (x86)\\WeGameApps`,
    `${drive}\\Program Files\\Riot Games`,
    `${drive}\\Program Files (x86)\\Riot Games`,
  ]),
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Riot Games") : "",
].filter(Boolean);

/** 递归深度上限。国服实测形如
 *  D:\WeGameApps\英雄联盟（含经典模式）\LeagueClient\lockfile —— 从父目录算起是 2 层，
 *  所以 3 层足够覆盖，又不会把整块盘翻一遍。 */
const SEARCH_DEPTH = 3;

/** LXL_DEBUG=1 时记录搜索走过的目录，便于定位「为什么没找到」。 */
const searchVisits = [];

/** 在目录树里有界地找 lockfile。返回找到的路径或 null。 */
function searchLockfile(dir, depth = 0, visited = new Set()) {
  if (!dir || depth > SEARCH_DEPTH || visited.has(dir) || !existsSync(dir)) return null;
  visited.add(dir);
  if (process.env.LXL_DEBUG) searchVisits.push(`${dir}`);
  const direct = path.join(dir, "lockfile");
  if (existsSync(direct)) return direct;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    // 没权限的目录直接跳过；LXL_DEBUG=1 时把原因打出来，否则这种静默失败很难排查。
    if (process.env.LXL_DEBUG) {
      warn(`  [debug] 读目录失败 ${dir} → ${error.code}: ${error.message}`);
    }
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = searchLockfile(path.join(dir, entry.name), depth + 1, visited);
    if (found) return found;
  }
  return null;
}

/** 查找过程的诊断轨迹：失败时打出来，便于定位「为什么没找到」。 */
const lockfileTrace = [];

/** 收集**所有**候选 lockfile。不能「找到第一个文件就收工」—— 国服实测
 *  D:\WeGameApps\英雄联盟（含经典模式）\LeagueClient\lockfile 是个 0 字节残留，
 *  真正能用的是别的路径，只看第一个文件就会误判为「没找到客户端」。 */
function findLockfileCandidates() {
  const explicit = flag("lockfile");
  if (typeof explicit === "string") {
    return existsSync(explicit) ? [explicit] : [];
  }

  const found = [];
  const visited = new Set();
  const collect = (dir) => {
    const file = searchLockfile(dir, 0, visited);
    if (file) found.push(file);
  };

  for (const file of [
    "C:\\Riot Games\\League of Legends\\lockfile",
    "C:\\Program Files\\Riot Games\\League of Legends\\lockfile",
    "D:\\Riot Games\\League of Legends\\lockfile",
    "E:\\Riot Games\\League of Legends\\lockfile",
    path.join(process.env.LOCALAPPDATA ?? "", "Riot Games", "League of Legends", "lockfile"),
  ]) {
    if (file && existsSync(file)) found.push(file);
  }
  for (const parent of LOCKFILE_PARENTS) collect(parent);
  if (has("scan")) {
    for (const drive of ["C:\\", "D:\\", "E:\\", "F:\\"]) collect(drive);
  }
  return found;
}

/**
 * 收集 LeagueClientUx 启动日志。正常客户端不需要走到这里；但 WeGame 的空 lockfile
 * 是真实会出现的状态，日志是此时唯一不需要读取受保护进程参数的本地凭据来源。
 */
function findUxLogCandidates() {
  const explicit = flag("ux-log");
  if (typeof explicit === "string") return existsSync(explicit) ? [explicit] : [];

  const dirs = new Set(findLockfileCandidates().map((file) => path.dirname(file)));
  const files = [];
  for (const dir of dirs) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !/^.*LeagueClientUx\.log$/i.test(entry.name)) continue;
        const file = path.join(dir, entry.name);
        files.push({ file, mtime: statSync(file).mtimeMs });
      }
    } catch {
      // 日志目录被清理或没有读取权限时直接尝试下一个候选目录。
    }
  }
  return files.sort((left, right) => right.mtime - left.mtime).map((entry) => entry.file);
}

/** 从最新到最旧解析 Ux 日志；返回时绝不记录令牌原文。 */
function credentialsFromUxLogs() {
  const candidates = [];
  for (const file of findUxLogCandidates()) {
    try {
      const raw = readFileSync(file, "utf8");
      const ports = [...raw.matchAll(/--app-port=(\d+)/g)];
      const tokens = [...raw.matchAll(/--remoting-auth-token=([^\s"']+)/g)];
      const port = ports.at(-1)?.[1];
      const token = tokens.at(-1)?.[1];
      if (!port || !token) continue;
      candidates.push({
        file,
        creds: {
          port: Number(port),
          password: token,
          protocol: "https",
          from: "LeagueClientUx 日志",
        },
      });
    } catch {
      // 单个旧日志损坏不妨碍继续尝试其它候选。
    }
  }
  return candidates;
}

/**
 * 逐个候选尝试，并用真实请求验证它是不是英雄联盟的 LCU。
 * 为什么必须验证：同目录下还有个 Riot Client 的 lockfile，格式一模一样、
 * 也能连上，但 `/lol-summoner/v1/current-summoner` 会 404 —— 直接用会得到很迷惑的报错。
 */
async function readCredentials() {
  const rejected = [];
  for (const file of findLockfileCandidates()) {
    lockfileTrace.push(file);
    let raw = "";
    try {
      raw = readFileSync(file, "utf8").trim();
    } catch (error) {
      rejected.push(`${file}（读不了：${error.code}）`);
      continue;
    }
    if (!raw) {
      rejected.push(`${file}（空文件，客户端可能没启动完）`);
      continue;
    }
    const [name, pid, port, password, protocol] = raw.split(":");
    if (!port || !password) {
      rejected.push(`${file}（格式不符）`);
      continue;
    }
    const creds = {
      port: Number(port),
      password,
      protocol: protocol || "https",
      from: `lockfile（${name}${pid ? ` pid=${pid}` : ""}）`,
    };
    if (await looksLikeLcu(creds)) {
      log(`已读到 lockfile：${file}（${name} pid=${pid} port=${port}）`);
      return { creds, rejected };
    }
    rejected.push(`${file}（能连上，但 /lol-summoner 不是这个客户端的：${name}）`);
  }

  const fromProcess = await credentialsFromProcess();
  if (fromProcess) {
    // 进程参数同样要验证：拿到的可能是 Riot Client 或其它组件的端口。
    if (await looksLikeLcu(fromProcess)) return { creds: fromProcess, rejected };
    rejected.push(`进程参数给的端口 ${fromProcess.port} 不是英雄联盟的 LCU`);
  }

  // 国服 WeGame 有时会留下一个 0 字节 lockfile，同时因客户端提权而读不到进程参数。
  // LeagueClientUx 的启动日志仍会记录当次 --app-port / --remoting-auth-token，作为最后兜底。
  for (const fromLog of credentialsFromUxLogs()) {
    if (await looksLikeLcu(fromLog.creds)) {
      log(`已从 LeagueClientUx 日志读到端口 ${fromLog.creds.port}`);
      return { creds: fromLog.creds, rejected };
    }
    rejected.push(`${fromLog.file}（日志凭据已过期或不是当前客户端）`);
  }
  return { creds: null, rejected };
}

/** 用一次轻量请求判断这组凭据是不是英雄联盟客户端的 LCU。 */
async function looksLikeLcu(creds) {
  try {
    const response = await lcuRaw(creds, "GET", "/lol-summoner/v1/current-summoner");
    if (response.status === 200) return true;
    if (process.env.LXL_DEBUG) {
      warn(`  [debug] 端口 ${creds.port} 返回 ${response.status}，不是英雄联盟的 LCU`);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 兜底发现：从客户端进程的启动参数里抠端口与 token。
 * 参数里带着 `--app-port=xxxxx --remoting-auth-token=yyyyy`。
 *
 * ⚠️ 两条实测经验：
 *  1. **不要只查 LeagueClientUx.exe**：国服 WeGame 版实测 LCU 端口是
 *     `LeagueClient.exe` 持有的（LeagueClientUx.exe 一个监听端口都没有），
 *     所以这里扫所有 `LeagueClient*` 进程。
 *  2. 客户端以管理员权限运行时，普通权限读到的 CommandLine 是**空的**，
 *     此时必须以管理员身份运行本脚本才能走通这条路。
 */
function credentialsFromProcess() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name LIKE 'LeagueClient%'\" | " +
    "Where-Object { $_.CommandLine -like '*--app-port=*' } | " +
    "Select-Object -First 1 -ExpandProperty CommandLine";
  const runners = [
    ["powershell", ["-NoProfile", "-NonInteractive", "-Command", script]],
    ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]],
  ];
  let sawEmpty = false;
  for (const [bin, argv] of runners) {
    try {
      const output = execFileSync(bin, argv, { encoding: "utf8", timeout: 20000 });
      const port = output.match(/--app-port=(\d+)/)?.[1];
      const token = output.match(/--remoting-auth-token=([\w-]+)/)?.[1];
      if (port && token) {
        log(`已从客户端进程参数读到端口 ${port}（不需要 lockfile）`);
        return {
          port: Number(port),
          password: token,
          protocol: "https",
          from: "客户端进程参数",
        };
      }
      if (!output.trim()) sawEmpty = true;
    } catch {
      /* 换下一个解释器再试 */
    }
  }
  if (sawEmpty) {
    warn(
      "客户端进程命令行为空 —— 客户端以管理员权限运行，普通权限读不到。请用管理员身份运行本脚本。",
    );
  }
  return null;
}

/**
 * 按 lockfile 里的协议发请求（真实客户端恒为 https），返回原始状态码不抛异常，
 * 供「这条凭据到底是不是 LCU」的探测使用。
 * 之所以真的读协议字段：scripts/mock-lcu.mjs 会以 http 伪造成一个 LCU，
 * 这样不装游戏也能把「lockfile → 接口 → 映射 → 上传」整条链路跑通。
 */
function lcuRaw(creds, method, endpoint) {
  const secure = creds.protocol !== "http";
  const transport = secure ? https : http;
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${creds.password}`).toString("base64");
    const req = transport.request(
      {
        host: "127.0.0.1",
        port: creds.port,
        method,
        path: endpoint,
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        timeout: 8000,
        ...(secure ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("LCU 请求超时")));
    req.on("error", reject);
    req.end();
  });
}

/** Basic Auth 的用户名固定是 riot；https 下必须关掉证书校验（LCU 是自签证书）。 */
async function lcuRequest(creds, method, endpoint) {
  const response = await lcuRaw(creds, method, endpoint);
  if (response.status >= 400 || !response.status) {
    throw new Error(`LCU ${endpoint} 返回 ${response.status}: ${response.body.slice(0, 200)}`);
  }
  if (!response.body) return null;
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`LCU ${endpoint} 返回的不是 JSON`);
  }
}

// ---------- 2. 与服务端通信 ----------

async function api(pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`${pathname} → HTTP ${response.status}：${data.error ?? "未知错误"}`);
  return data;
}

// ---------- 3. 映射 ----------

/** 本站存的是中文英雄称号，champions.json 的 id 就是 Riot 的 championId。 */
let championById = new Map();
function loadChampions() {
  try {
    const file = new URL("../public/assets/champions.json", import.meta.url);
    const list = JSON.parse(readFileSync(file, "utf8"));
    championById = new Map(list.map((item) => [String(item.id), item.name]));
    log(`已载入英雄表 ${championById.size} 条`);
  } catch (error) {
    warn("载入 champions.json 失败，将直接把 championId 当英雄名上传：", String(error));
  }
}

/**
 * 把 LCU 的一局详情映射成本站 /api/import/records 需要的 rows。
 *
 * ⚠️ LCU 这个端点有**两种形态**，都必须兼容（国服实测走的是第二种）：
 *   A) 扁平形态：participant 上直接带 puuid / riotIdGameName / championId /
 *      champLevel / visionScore / goldEarned / totalMinionsKilled / item0..
 *   B) 经典 Match-v4 形态：participant 只有
 *      { participantId, championId, spell1Id, spell2Id, teamId, timeline, stats }，
 *      **没有 puuid、没有召唤师名**，玩家身份在顶层 `participantIdentities[].player`
 *      （summonerName / gameName / puuid），其余数值全在 `participant.stats` 里。
 * 所以这里一律「先读扁平字段，再回落到 stats / participantIdentities」。
 */
function buildRows(game, context) {
  const participants = game?.participants ?? [];
  // context 可能为空：--probe 不带令牌时只诊断客户端，没有名单可匹配。
  const players = context?.players ?? [];
  const byPuuid = new Map(players.filter((p) => p.puuid).map((p) => [p.puuid, p]));
  const byName = new Map();
  const addName = (key, player) => {
    if (!key) return;
    const previous = byName.get(key);
    // 同一个游戏名可能被错误填到两个账号，宁可不匹配也绝不能猜一个写入。
    byName.set(key, previous && previous !== player ? null : player);
  };
  for (const player of players) {
    const fullName = player.gameName.trim().toLowerCase();
    addName(fullName, player);
    // 本站资料常填完整 Riot ID（游戏名#标签），但 LCU 对局详情多数只给游戏名。
    // 兼容该差异；若出现同名，addName 会把该别名标为 null，避免误导入。
    addName(fullName.split("#")[0], player);
  }

  // participantId → { puuid, name }，经典形态下身份只能从这里取。
  const identities = new Map();
  for (const entry of game?.participantIdentities ?? []) {
    const player = entry?.player ?? {};
    identities.set(Number(entry?.participantId), {
      puuid: String(player.puuid ?? ""),
      name: String(player.gameName ?? player.summonerName ?? player.riotIdGameName ?? "").trim(),
    });
  }

  const rows = [];
  const unmatched = [];
  // 全体参与者的映射结果（含没匹配上的），只为 --probe 能逐项核对数值而留。
  const all = [];

  for (const participant of participants) {
    const stats = participant.stats ?? {};
    const identity = identities.get(Number(participant.participantId)) ?? {};
    const key = String(participant.puuid ?? identity.puuid ?? "");
    const name = String(
      participant.riotIdGameName ??
        participant.gameName ??
        participant.summonerName ??
        identity.name ??
        "",
    ).trim();

    // 扁平字段优先，缺失时回落到 stats（经典形态所有数值都在 stats 里）。
    const num = (flat, nested) =>
      Number(participant[flat] ?? stats[nested ?? flat] ?? stats[flat] ?? 0) || 0;
    // LCU 的 item0..item6，item6 是饰品种类，这里跟手工录入保持一致只取 6 个主栏位。
    const items = [0, 1, 2, 3, 4, 5]
      .map((slot) => participant[`item${slot}`] ?? stats[`item${slot}`])
      .filter((id) => Number(id) > 0)
      .join(",");
    const mapped = {
      name: name || key || `participantId=${participant.participantId}`,
      puuid: key,
      team: Number(participant.teamId ?? 0),
      champion:
        championById.get(String(participant.championId)) ?? String(participant.championId ?? ""),
      result: stats.win ? "win" : "lose",
      kills: num("kills"),
      deaths: num("deaths"),
      assists: num("assists"),
      cs: num("totalMinionsKilled") + num("neutralMinionsKilled"),
      gold: num("goldEarned"),
      vision: num("visionScore"),
      level: num("champLevel"),
      items,
    };

    const normalizedName = name.toLowerCase();
    const player =
      byPuuid.get(key) ?? byName.get(normalizedName) ?? byName.get(normalizedName.split("#")[0]);
    if (!player) {
      unmatched.push(mapped.name);
      all.push({ ...mapped, user_id: 0 });
      continue;
    }

    // name 只用于诊断展示，不进上传体。
    const { name: _displayName, team: _teamId, ...fields } = mapped;
    rows.push({
      user_id: player.userId,
      // 带上 puuid：服务端配对成功后会把它记到资料上，下次即使改名也认得。
      puuid: key,
      ...fields,
      // MVP / SVP / 队内名次留空：赛后在「战绩录入」的编辑弹窗里勾选，那里本来就能改。
      is_mvp: false,
      is_svp: false,
      team_rank: 0,
    });
    all.push({ ...mapped, user_id: player.userId });
  }

  return { rows, unmatched, all };
}

// ---------- 4. 主流程 ----------

const uploaded = new Set();

async function scanOnce(creds) {
  const context = await api("/api/import/context");
  if (!context.match) {
    warn("服务端没有可写入的赛事，先在后台建一场并进入「进行中」。");
    return 0;
  }

  const summoner = await lcuRequest(creds, "GET", "/lol-summoner/v1/current-summoner");
  const puuid = summoner?.puuid;
  if (!puuid) {
    warn("拿不到当前召唤师的 puuid，客户端可能还没登录完毕。");
    return 0;
  }

  const history = await lcuRequest(
    creds,
    "GET",
    `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=0&endIndex=5`,
  );
  const games = (history?.games?.games ?? []).filter((game) => game?.gameId);
  let sent = 0;

  for (const summary of games) {
    const gameId = String(summary.gameId);
    if (uploaded.has(gameId)) continue;

    // 详情里才有 queueId 和参与者，过滤得放在拉完详情之后。
    const detail = await lcuRequest(creds, "GET", `/lol-match-history/v1/games/${gameId}`);
    if (!detail?.participants?.length) continue;

    const queueId = Number(detail.queueId ?? -1);
    const { rows, unmatched } = buildRows(detail, context);

    // 队列白名单：--queues 没给就不过滤（queueId=-1 表示 LCU 没给，也放行）。
    if (QUEUES.length && !QUEUES.includes(queueId)) {
      log(`对局 ${gameId}：queueId=${queueId} 不在 --queues ${QUEUES.join("/")} 里，跳过。`);
      uploaded.add(gameId);
      continue;
    }

    // 人数门槛：一局里匹配上的本站选手太少，就当是路人局，不污染赛事记录。
    if (rows.length < MIN_PLAYERS) {
      warn(
        `对局 ${gameId}：只匹配到 ${rows.length} 名本站选手（queueId=${queueId}），` +
          `不足 --min-players ${MIN_PLAYERS}，判为路人局跳过。`,
      );
      if (unmatched.length) warn(`  本局参与者：${unmatched.join("、")}`);
      warn("  → 若这确实是你们自己的比赛，说明选手的「游戏ID」还没填对（跑 --probe 看对照表）。");
      warn(`  → 确实就是要导这一局，可以用 --min-players 1 重跑。`);
      uploaded.add(gameId);
      continue;
    }

    const payload = {
      sourceGameId: gameId,
      matchId: context.match.id,
      roundNo: context.match.currentRound,
      // 不传 gameNo：由服务端排到该赛事的下一个空位。agent 无从得知这是 BO5 的第几局，
      // 而同一局的重复上传会靠 sourceGameId 命中唯一键、只刷新数据不动槽位。
      playedAt: new Date(detail.gameCreation ?? Date.now()).toISOString(),
      rows,
    };

    if (DRY_RUN) {
      log(`[dry-run] 对局 ${gameId} 将上传 ${rows.length} 行：`);
      console.log(JSON.stringify(payload, null, 2));
    } else {
      const result = await api("/api/import/records", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      log(`对局 ${gameId}：${result.msg}`);
      if (unmatched.length) warn(`  未匹配：${unmatched.join("、")}`);
    }
    uploaded.add(gameId);
    sent += 1;
  }

  return sent;
}

/**
 * 诊断模式：把整条链路逐步跑一遍并报告每一步的成败，**不上传任何数据**。
 * 真机联调先跑这个：失败时能直接看出卡在哪一步（凭据 / 鉴权 / 召唤师 / 历史 / 映射）。
 */
async function probe() {
  const step = (index, title) => log(`\n[${index}] ${title}`);

  // 第 1 步是服务端侧的检查，没有令牌就跳过 —— 客户端那几步不需要它，
  // 这样刚装好客户端、还没进后台的人也能先把 LCU 这一侧诊断完。
  let context = null;
  step(1, "读取本站导入配置（令牌鉴权）");
  if (!TOKEN) {
    warn("  ⤵ 未提供令牌，跳过。客户端部分仍会照常诊断。");
    warn("    → 补上后可一并检查服务端： --token <令牌>");
  } else {
    try {
      context = await api("/api/import/context");
    } catch (error) {
      console.error(`  ✖ ${error.message}`);
      console.error("    → 令牌不对或已被重置：去后台「战绩录入 → 自动导入」重新复制一次。");
      return 1;
    }
    if (!context.match) {
      console.error("  ✖ 服务端没有可写入的赛事。先到后台建一场，或把某场置为「进行中」。");
      return 1;
    }
    log(
      `  ✔ 目标赛事：${context.match.name}（id=${context.match.id}，第 ${context.match.currentRound} 轮）`,
    );
    log(`  ✔ 本站已审核选手 ${context.players.length} 人`);
  }

  step(2, "查找客户端凭据");
  const { creds, rejected } = await readCredentials();
  if (!creds) {
    console.error("  ✖ 拿不到客户端凭据。");
    console.error("    ① 确认客户端已启动【并已登录】（登录界面时 lockfile 可能还是空的）；");
    console.error(
      "    ② 若客户端以管理员权限运行，本脚本也要用管理员身份运行，否则读不到进程参数；",
    );
    console.error('    ③ 也可以直接指定：--lockfile "D:\\...\\lockfile"');
    if (rejected.length) {
      console.error("    已排除的候选：");
      for (const item of rejected) console.error(`      · ${item}`);
    } else {
      console.error("    常见安装目录一个都没命中（Riot / WeGame / Tencent 都没有）。");
    }
    console.error("    还不行就加 --scan 让它在整块盘上找（慢一些）。");
    if (process.env.LXL_DEBUG) {
      warn(`  [debug] 搜索走过 ${searchVisits.length} 个目录：`);
      for (const dir of searchVisits.slice(0, 40)) warn(`    ${dir}`);
    }
    return 1;
  }
  if (rejected.length) {
    warn(`  （跳过了 ${rejected.length} 个不可用候选：${rejected.join("；")}）`);
  }
  log(`  ✔ 端口 ${creds.port}（来源：${creds.from}）`);

  step(3, "调用 /lol-summoner/v1/current-summoner");
  let summoner;
  try {
    summoner = await lcuRequest(creds, "GET", "/lol-summoner/v1/current-summoner");
  } catch (error) {
    console.error(`  ✖ 失败：${error.message}`);
    console.error("    → 客户端可能还没登录完成，或被防火墙拦了本机回环请求。");
    return 1;
  }
  if (!summoner?.puuid) {
    console.error("  ✖ 没拿到 puuid，客户端可能还没登录完成。");
    return 1;
  }
  log(`  ✔ 当前账号：${summoner.gameName ?? "?"}#${summoner.tagLine ?? "?"}`);
  log(`    puuid ${summoner.puuid}`);

  step(4, "拉取对局历史");
  const history = await lcuRequest(
    creds,
    "GET",
    `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=5`,
  );
  const games = (history?.games?.games ?? []).filter((game) => game?.gameId);
  log(`  ✔ 最近 ${games.length} 局：${games.map((g) => g.gameId).join("、") || "（空）"}`);
  if (!games.length) {
    warn("  历史为空：确认这台机器的账号近期打过自定义房。");
    return 0;
  }

  step(5, "逐局读取详情（看 queueId 分布）");
  const details = [];
  for (const summary of games.slice(0, 6)) {
    let one;
    try {
      one = await lcuRequest(creds, "GET", `/lol-match-history/v1/games/${summary.gameId}`);
    } catch (error) {
      warn(`    ${summary.gameId}  取详情失败：${error.message}`);
      continue;
    }
    details.push(one);
    // 这里不用 context 的名单就不能看出「匹配上几人」，但这一眼就能看出 queueId 分组。
    const matched = context ? buildRows(one, context).rows.length : -1;
    const when = one?.gameCreation ? new Date(one.gameCreation).toLocaleString("zh-CN") : "?";
    log(
      `    ${summary.gameId}  queueId=${one?.queueId ?? "?"}  ` +
        `参与者 ${one?.participants?.length ?? 0}` +
        (matched >= 0 ? `  匹配上本站 ${matched}` : "") +
        `  ${when}`,
    );
  }
  const queueIds = [...new Set(details.map((one) => Number(one?.queueId ?? -1)))];
  if (queueIds.length === 1) {
    log(`  ✔ 这批对局都是 queueId=${queueIds[0]}`);
    log(`    → 如果这全是你们自己的比赛，启动时加 --queues ${queueIds[0]} 就能把路人局挡在外面。`);
  } else if (queueIds.length > 1) {
    log(`  ✔ 这批对局跨了多个队列：${queueIds.join("、")}`);
    log(`    → 用 --queues ${queueIds.join(",")} 才能全收到（--queues 可以写多个，逗号分隔）。`);
  }
  if (!details.length) {
    warn("  这几局的详情都取不到，无法继续。");
    return 1;
  }

  step(6, "映射最新一局并逐项核对");
  const detail = details[0];
  const participants = detail?.participants ?? [];
  log(
    `  ✔ 对局 ${detail?.gameId ?? "?"}，参与者 ${participants.length} 人，` +
      `queueId=${detail?.queueId ?? "?"}`,
  );
  if (participants.length && process.env.LXL_DEBUG) {
    // 字段名是最容易对不上的地方，LXL_DEBUG=1 时全打出来（含顶层与 stats）。
    warn(`    [debug] 顶层字段：${Object.keys(detail).join(", ")}`);
    warn(`    [debug] participant 字段：${Object.keys(participants[0]).join(", ")}`);
    warn(`    [debug] stats 字段：${Object.keys(participants[0].stats ?? {}).join(", ")}`);
    const identities = detail?.participantIdentities ?? [];
    warn(
      `    [debug] participantIdentities：${identities.length} 条` +
        (identities[0]
          ? `，首条 player 字段：${Object.keys(identities[0].player ?? {}).join(", ")}`
          : ""),
    );
  }
  const identities = detail?.participantIdentities ?? [];
  if (participants.length && !identities.length && !participants[0].puuid) {
    warn("    ⚠ 既没有 participantIdentities 也没有 participant.puuid，无法辨认玩家是谁");
  }
  const { rows, unmatched, all } = buildRows(detail, context);

  // 不管有没有名单，都把映射结果全打出来：数值对不对要拿客户端结算界面核对。
  log("  ── 本局映射结果（可与客户端结算界面对照）──");
  let lastTeam = 0;
  for (const row of all) {
    if (row.team !== lastTeam) {
      lastTeam = row.team;
      log(`    【${lastTeam === 100 ? "蓝方" : lastTeam === 200 ? "红方" : `队伍 ${lastTeam}`}】`);
    }
    const self = row.puuid && row.puuid === summoner.puuid ? "  ← 本机账号" : "";
    const mark = row.user_id ? "" : "  ⚠ 未匹配本站";
    log(
      `      ${padRight(row.name, 22)}${padRight(row.champion, 14)}` +
        `${row.result === "win" ? "胜" : "负"}  KDA ${row.kills}/${row.deaths}/${row.assists}` +
        `  CS ${row.cs}  经济 ${row.gold}  视野 ${row.vision}  等级 ${row.level}` +
        `  装备 ${row.items || "-"}${self}${mark}`,
    );
  }
  const zero = all.filter((row) => !row.kills && !row.cs && !row.gold);
  if (zero.length) {
    warn(`    ⚠ 有 ${zero.length} 人的数值全是 0，映射可能没对上路子（数值字段名变了？）`);
  }

  if (!context) {
    log(`\n诊断结束（客户端部分正常），没有写入任何数据。`);
    log("带上 --token 再跑一次，就能看到哪些参与者能匹配上本站账号。");
    return 0;
  }

  log(`\n  ✔ 匹配上本站账号 ${rows.length} 人，未匹配 ${unmatched.length} 人`);
  if (unmatched.length) {
    warn(`    未匹配：${unmatched.join("、")}`);
    warn(
      "    → 到后台「选手管理」里，把对应选手的「游戏ID」改成与上面完全一致（含特殊字符），再跑一次。",
    );
    warn("    → 本机账号（← 标记的那行）自己也得上名单，否则它参与的对局不会被记录。");
  }

  log(`\n诊断结束，没有写入任何数据。去掉 --probe 就会真正导入。`);
  log(
    `导入时会按当前策略过滤：` +
      `${QUEUES.length ? `只收队列 ${QUEUES.join("/")}` : "不限队列（--queues 可收窄）"}，` +
      `至少 ${MIN_PLAYERS} 名本站选手（--min-players 可调）。`,
  );
  return 0;
}

// ---------- 5. 本地可视化导入台 ----------

/**
 * 浏览器不能直接连接 LCU：它只接受本机 Basic Auth，而且会受同源策略限制。
 * `--ui` 因此由 agent 在 127.0.0.1 上提供一个极薄的操作界面；所有 LCU 请求、
 * 导入令牌和向站点的写入仍只发生在这个 Node 进程中，页面永远拿不到令牌。
 */
const localUiHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LXL 本地战绩导入台</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, "Microsoft YaHei", system-ui, sans-serif; background: #080d17; color: #edf3ff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; background: radial-gradient(circle at 15% -20%, #183866 0, transparent 36%), #080d17; }
      main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 34px 0 60px; }
      header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 20px; }
      h1 { font-size: 25px; margin: 0 0 7px; letter-spacing: .2px; }
      h2 { margin: 0; font-size: 16px; }
      p { margin: 0; color: #9fb0ca; line-height: 1.65; font-size: 13px; }
      button, select { border: 0; border-radius: 8px; font: inherit; cursor: pointer; }
      button { color: #06101e; font-weight: 700; background: #70d8ff; padding: 9px 14px; }
      button:hover { background: #a5e8ff; }
      button:disabled { cursor: not-allowed; opacity: .55; }
      select { background: #192438; color: #edf3ff; padding: 8px 10px; border: 1px solid #2d3e5b; }
      .grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 14px; }
      .card { border: 1px solid #20304a; background: rgba(15, 25, 42, .92); box-shadow: 0 15px 40px rgba(0,0,0,.18); border-radius: 13px; padding: 18px; }
      .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
      .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 13px; }
      .pill { font-size: 12px; background: #17263d; color: #bfd7ff; padding: 5px 8px; border-radius: 999px; }
      .pill.ok { color: #8cf0bd; background: #12382c; }
      .pill.warn { color: #ffd682; background: #442e11; }
      .notice { display: none; border-radius: 8px; padding: 11px 12px; margin: 0 0 14px; font-size: 13px; line-height: 1.55; }
      .notice.error { display: block; background: #471d2a; color: #ffc1cc; }
      .notice.success { display: block; background: #12382c; color: #b6f8d1; }
      .games { display: grid; gap: 8px; max-height: 350px; overflow: auto; padding-right: 2px; }
      .game { width: 100%; text-align: left; padding: 12px; color: #dfeaff; background: #121e31; border: 1px solid #233653; }
      .game:hover, .game.active { border-color: #70d8ff; background: #162b47; }
      .game strong { display: block; margin-bottom: 4px; font-size: 13px; }
      .game small { color: #9eb1ce; }
      .summary { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 13px; }
      .summary label { color: #aebed5; font-size: 13px; }
      .table-wrap { overflow: auto; border: 1px solid #22334d; border-radius: 9px; }
      table { width: 100%; border-collapse: collapse; min-width: 760px; font-size: 13px; }
      th { text-align: left; background: #15243a; color: #9eb5d6; font-size: 11px; letter-spacing: .3px; }
      th, td { padding: 10px 11px; border-bottom: 1px solid #20304a; }
      tr:last-child td { border-bottom: 0; }
      .matched { color: #8cf0bd; font-weight: 700; }
      .unmatched { color: #ffb4be; }
      .empty { color: #91a4c2; font-size: 13px; padding: 28px 10px; text-align: center; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; align-items: center; margin-top: 15px; }
      .muted { color: #93a6c4; font-size: 12px; }
      @media (max-width: 760px) { main { width: min(100% - 22px, 1180px); padding-top: 20px; } header { display: block; } header button { margin-top: 14px; } .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div><h1>LXL 本地战绩导入台</h1><p>只在这台安装英雄联盟客户端的电脑上运行。先预览，再确认写入进行中的赛事。</p></div>
        <button id="refresh">刷新对局</button>
      </header>
      <div id="notice" class="notice"></div>
      <section class="grid">
        <div class="card"><div class="card-head"><h2>导入目标</h2><span id="lcuState" class="pill">正在连接 LCU…</span></div><div id="context"><div class="empty">正在读取赛事上下文…</div></div></div>
        <div class="card"><div class="card-head"><h2>最近对局</h2><span id="gameCount" class="pill">0 局</span></div><div id="games" class="games"><div class="empty">正在读取本机对局历史…</div></div></div>
      </section>
      <section class="card" style="margin-top:14px"><div class="card-head"><h2>战绩预览</h2><span id="previewState" class="pill warn">请选择一局</span></div><div id="preview"><div class="empty">选中右侧对局后，这里会显示全部 10 名参与者及本站账号匹配结果。</div></div></section>
    </main>
    <script>
      const state = { data: null, selected: null, busy: false };
      const byId = (id) => document.getElementById(id);
      const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#039;");
      const setNotice = (text = "", type = "") => { const el = byId("notice"); el.textContent = text; el.className = type ? "notice " + type : "notice"; };
      const gameTime = (value) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "时间未知";
      function render() {
        const data = state.data;
        if (!data) return;
        const context = data.context;
        byId("lcuState").textContent = data.lcu.connected ? "LCU 已连接" : "LCU 未连接";
        byId("lcuState").className = "pill " + (data.lcu.connected ? "ok" : "warn");
        byId("context").innerHTML = context.match ? '<strong>' + escape(context.match.name) + '</strong><div class="meta"><span class="pill ok">进行中</span><span class="pill">第 ' + context.match.currentRound + ' 轮</span><span class="pill">BO' + context.match.bo + '</span><span class="pill">已报名 ' + context.players.length + ' 人</span></div><p style="margin-top:12px">写入目标由服务端固定为当前进行中的赛事和轮次，避免误导入到历史赛事。</p>' : '<div class="empty">服务端没有进行中的赛事。请先在管理后台把目标赛事设为「进行中」。</div>';
        const games = data.games || [];
        byId("gameCount").textContent = games.length + " 局";
        byId("games").innerHTML = games.length ? games.map((game) => '<button class="game ' + (state.selected === game.id ? 'active' : '') + '" data-game="' + escape(game.id) + '"><strong>' + gameTime(game.playedAt) + '</strong><small>对局 ' + escape(game.id) + ' · 队列 ' + escape(game.queueId) + ' · 匹配 ' + game.matchedCount + ' / ' + game.players.length + ' 人</small></button>').join("") : '<div class="empty">没有可读取的对局历史。</div>';
        document.querySelectorAll("[data-game]").forEach((button) => button.onclick = () => { state.selected = button.dataset.game; render(); });
        renderPreview();
      }
      function renderPreview() {
        const game = (state.data?.games || []).find((item) => item.id === state.selected);
        const target = byId("preview"); const badge = byId("previewState");
        if (!game) { badge.textContent = "请选择一局"; badge.className = "pill warn"; target.innerHTML = '<div class="empty">选中右侧对局后，这里会显示全部 10 名参与者及本站账号匹配结果。</div>'; return; }
        badge.textContent = "已匹配 " + game.matchedCount + " 人"; badge.className = "pill " + (game.matchedCount >= state.data.policy.minPlayers ? "ok" : "warn");
        const rows = game.players.map((player) => '<tr><td>' + escape(player.team === 100 ? '蓝方' : player.team === 200 ? '红方' : '队伍 ' + player.team) + '</td><td>' + escape(player.name) + '</td><td>' + escape(player.champion || '-') + '</td><td>' + escape(player.result === 'win' ? '胜' : '负') + '</td><td>' + player.kills + ' / ' + player.deaths + ' / ' + player.assists + '</td><td>' + player.cs + '</td><td>' + (player.matched ? '<span class="matched">' + escape(player.username) + '</span>' : '<span class="unmatched">未匹配</span>') + '</td></tr>').join("");
        target.innerHTML = '<div class="summary"><span class="pill">队列 ' + escape(game.queueId) + '</span><span class="pill">对局时间 ' + gameTime(game.playedAt) + '</span><label>局号 <select id="gameNo"><option value="">自动分配</option>' + Array.from({length: 5}, (_, i) => '<option value="' + (i + 1) + '">第 ' + (i + 1) + ' 局</option>').join("") + '</select></label><span class="muted">至少匹配 ' + state.data.policy.minPlayers + ' 名本站选手才允许导入</span></div><div class="table-wrap"><table><thead><tr><th>阵营</th><th>游戏 ID</th><th>英雄</th><th>结果</th><th>K / D / A</th><th>CS</th><th>本站账号</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="actions"><span class="muted">导入后可在后台战绩录入中补充 MVP、SVP 与队内名次。</span><button id="import" ' + (state.busy || !state.data.context.match || game.matchedCount < state.data.policy.minPlayers ? 'disabled' : '') + '>确认导入本局</button></div>';
        const button = byId("import"); if (button) button.onclick = importSelected;
      }
      async function refresh() {
        byId("refresh").disabled = true; setNotice();
        try { const response = await fetch("/api/status"); const data = await response.json(); if (!response.ok) throw new Error(data.error || "读取失败"); state.data = data; if (!data.games.some((game) => game.id === state.selected)) state.selected = data.games[0]?.id ?? null; render(); if (data.warning) setNotice(data.warning, "error"); }
        catch (error) { setNotice(error.message || "读取本地导入台失败", "error"); }
        finally { byId("refresh").disabled = false; }
      }
      async function importSelected() {
        const game = (state.data?.games || []).find((item) => item.id === state.selected); if (!game) return;
        if (!confirm('确认将这局的 ' + game.matchedCount + ' 条已匹配战绩写入当前进行中的赛事吗？')) return;
        state.busy = true; renderPreview(); setNotice();
        try { const gameNo = byId("gameNo")?.value || undefined; const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId: game.id, gameNo }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "导入失败"); setNotice(data.msg || "导入完成", "success"); await refresh(); }
        catch (error) { setNotice(error.message || "导入失败", "error"); }
        finally { state.busy = false; renderPreview(); }
      }
      byId("refresh").onclick = refresh; refresh();
    </script>
  </body>
</html>`;

function writeUiJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function readUiBody(request, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) request.destroy(new Error("请求内容过大"));
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求内容不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

/** 返回页面需要的脱敏数据；PUUID 与导入令牌不会离开 agent 进程。 */
async function localUiSnapshot() {
  const context = await api("/api/import/context");
  const { creds, rejected } = await readCredentials();
  if (!creds) {
    return {
      context,
      games: [],
      policy: { minPlayers: MIN_PLAYERS, queues: QUEUES },
      lcu: { connected: false },
      warning: `没有连接到英雄联盟客户端。${rejected[0] ?? "请启动客户端并完成登录。"}`,
    };
  }

  const summoner = await lcuRequest(creds, "GET", "/lol-summoner/v1/current-summoner");
  if (!summoner?.puuid) throw new Error("客户端尚未完成登录，无法取得当前账号");
  const history = await lcuRequest(
    creds,
    "GET",
    `/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=5`,
  );
  const summaries = (history?.games?.games ?? []).filter((game) => game?.gameId);
  const games = [];
  for (const summary of summaries) {
    const id = String(summary.gameId);
    try {
      const detail = await lcuRequest(creds, "GET", `/lol-match-history/v1/games/${id}`);
      if (!detail?.participants?.length) continue;
      const { all, rows } = buildRows(detail, context);
      games.push({
        id,
        queueId: Number(detail.queueId ?? -1),
        playedAt: detail.gameCreation ?? summary.gameCreation ?? null,
        matchedCount: rows.length,
        players: all.map((player) => ({
          name: player.name,
          username: context.players.find((item) => item.userId === player.user_id)?.username ?? "",
          matched: Boolean(player.user_id),
          team: player.team,
          champion: player.champion,
          result: player.result,
          kills: player.kills,
          deaths: player.deaths,
          assists: player.assists,
          cs: player.cs,
        })),
      });
    } catch (error) {
      warn(
        `可视化导入台读取对局 ${id} 失败：`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return {
    context,
    games,
    policy: { minPlayers: MIN_PLAYERS, queues: QUEUES },
    lcu: { connected: true, account: String(summoner.gameName ?? summoner.displayName ?? "") },
  };
}

async function importFromLocalUi(body) {
  const gameId = String(body?.gameId ?? "").trim();
  if (!gameId || gameId.length > 128) throw new Error("请选择有效的对局");
  const context = await api("/api/import/context");
  if (!context.match) throw new Error("没有进行中的赛事，不能导入");

  const { creds } = await readCredentials();
  if (!creds) throw new Error("没有连接到英雄联盟客户端");
  const detail = await lcuRequest(creds, "GET", `/lol-match-history/v1/games/${gameId}`);
  if (!detail?.participants?.length) throw new Error("这局没有可读取的参与者数据");
  const queueId = Number(detail.queueId ?? -1);
  if (QUEUES.length && !QUEUES.includes(queueId)) {
    throw new Error(`队列 ${queueId} 不在允许列表（${QUEUES.join(", ")}）中`);
  }
  const { rows } = buildRows(detail, context);
  if (rows.length < MIN_PLAYERS) {
    throw new Error(`只匹配到 ${rows.length} 名本站选手，至少需要 ${MIN_PLAYERS} 名`);
  }
  const requestedGameNo =
    body?.gameNo === undefined || body.gameNo === "" ? undefined : Number(body.gameNo);
  if (
    requestedGameNo !== undefined &&
    (!Number.isInteger(requestedGameNo) || requestedGameNo < 1 || requestedGameNo > 5)
  ) {
    throw new Error("局号必须在 1 到 5 之间");
  }
  return api("/api/import/records", {
    method: "POST",
    body: JSON.stringify({
      sourceGameId: gameId,
      matchId: context.match.id,
      roundNo: context.match.currentRound,
      ...(requestedGameNo ? { gameNo: requestedGameNo } : {}),
      playedAt: new Date(detail.gameCreation ?? Date.now()).toISOString(),
      rows,
    }),
  });
}

async function startLocalUi() {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    try {
      if (request.method === "GET" && pathname === "/") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(localUiHtml);
        return;
      }
      if (request.method === "GET" && pathname === "/api/status") {
        writeUiJson(response, 200, await localUiSnapshot());
        return;
      }
      if (request.method === "POST" && pathname === "/api/import") {
        const result = await importFromLocalUi(await readUiBody(request));
        writeUiJson(response, 200, result);
        return;
      }
      writeUiJson(response, 404, { error: "找不到该本地接口" });
    } catch (error) {
      writeUiJson(response, 400, {
        error: error instanceof Error ? error.message : "本地导入台发生错误",
      });
    }
  });
  server.listen(UI_PORT, "127.0.0.1", () => {
    log(`可视化导入台已启动：http://127.0.0.1:${UI_PORT}`);
    log("令牌只保留在 agent 进程中；按 Ctrl+C 停止本地导入台。");
  });
}

async function main() {
  log(`目标站点 ${API_BASE}${DRY_RUN ? "（dry-run，不会真的写入）" : ""}`);
  loadChampions();
  log(
    `导入策略：${QUEUES.length ? `只收 queueId ${QUEUES.join("/")}` : "不限队列"}，` +
      `一局至少 ${MIN_PLAYERS} 名本站选手。`,
  );

  if (PROBE) {
    process.exit(await probe());
  }

  if (UI) {
    await startLocalUi();
    return;
  }

  if (ONCE) {
    const { creds, rejected } = await readCredentials();
    if (!creds) {
      console.error(
        "拿不到客户端凭据。请确认客户端已启动并已登录；客户端若以管理员权限运行，" +
          "本脚本也要用管理员身份运行。也可先跑 --probe 看详细诊断。",
      );
      for (const item of rejected) console.error(`  · ${item}`);
      process.exit(1);
    }
    const sent = await scanOnce(creds);
    log(`扫描完成，处理了 ${sent} 局。`);
    return;
  }

  log(`常驻模式，每 ${INTERVAL_MS / 1000} 秒扫描一次。Ctrl+C 退出。`);
  for (;;) {
    try {
      const { creds } = await readCredentials();
      if (!creds) {
        warn("客户端未就绪（还没启动、或 lockfile 为空），等待中…");
      } else {
        await scanOnce(creds);
      }
    } catch (error) {
      warn("本轮扫描出错：", error instanceof Error ? error.message : String(error));
    }
    await sleep(INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error("agent 退出：", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
