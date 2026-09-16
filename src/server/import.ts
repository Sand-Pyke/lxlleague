import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/server/api";
import { normalizeImportedRow, upsertGameRecords } from "@/server/records";

/**
 * 自动导入战绩（LCU agent）的服务端入口。
 *
 * 采集程序只能跑在装了英雄联盟客户端的机器上 —— LCU 只监听 127.0.0.1 的随机端口、
 * 密码每次启动都从安装目录的 lockfile 里读，线上的 Next.js 服务端够不到它。
 * 所以这里只负责「接收 + 鉴权 + 人物匹配 + 幂等入库」，采集逻辑在 scripts/lcu-agent.mjs。
 *
 * 鉴权用 User.importToken（迁移 202609160002 就建好了、一直没接上），
 * 独立于登录 cookie；且要求 token 持有人是管理员，避免普通选手伪造战绩。
 */

/** 从 Authorization: Bearer <token> 或 X-Import-Token 里取 token。 */
function tokenFrom(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  return (bearer || request.headers.get("x-import-token") || "").trim();
}

/** 校验 token 并返回持有人；非管理员一律拒绝。 */
async function requireImporter(request: NextRequest) {
  const token = tokenFrom(request);
  if (!token) {
    throw new ApiError(401, "缺少导入令牌：请在 Authorization 头里带 Bearer <token>");
  }
  const user = await prisma.user.findUnique({
    where: { importToken: token },
    select: { id: true, username: true, isAdmin: true },
  });
  if (!user) throw new ApiError(401, "导入令牌无效");
  if (!user.isAdmin) throw new ApiError(403, "只有管理员可以导入战绩");
  return user;
}

const json = (payload: object, status = 200) => NextResponse.json(payload, { status });

const errorJson = (error: unknown) => {
  if (error instanceof ApiError) {
    return json({ ok: false, error: error.message }, error.status);
  }
  return json({ ok: false, error: "导入失败，请查看服务端日志" }, 500);
};

/**
 * GET /api/import/context
 * agent 启动时拉一次：告诉它当前该往哪场赛事、哪一轮写，以及怎么把 Riot 的
 * 玩家/英雄对到本站的人和中文英雄名上。
 */
export async function importContext(request: NextRequest) {
  try {
    await requireImporter(request);

    // 优先取进行中的赛事；没有就退到最近创建的一场，方便先联调。
    const match =
      (await prisma.match.findFirst({ where: { status: "LIVE" }, orderBy: { id: "desc" } })) ??
      (await prisma.match.findFirst({ orderBy: { id: "desc" } }));

    const users = await prisma.user.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        username: true,
        profile: { select: { gameName: true, puuid: true } },
      },
      orderBy: { id: "asc" },
    });

    return json({
      ok: true,
      match: match
        ? {
            id: match.id,
            name: match.name,
            status: match.status,
            currentRound: match.currentRound,
            bo: match.bo,
          }
        : null,
      players: users.map((user) => ({
        userId: user.id,
        username: user.username,
        gameName: user.profile?.gameName ?? "",
        puuid: user.profile?.puuid ?? "",
      })),
    });
  } catch (error) {
    return errorJson(error);
  }
}

/**
 * POST /api/import/records
 * body: { sourceGameId, matchId?, roundNo?, gameNo?, playedAt?, rows: [...] }
 * rows 里每行的玩家用 user_id（本站 id）、puuid、game_name 任一方式指定，优先级同序。
 */
export async function importRecords(request: NextRequest) {
  try {
    await requireImporter(request);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceGameId = String(body.sourceGameId ?? "").trim();
    if (!sourceGameId) throw new ApiError(400, "缺少 sourceGameId（LCU 的 gameId），无法做幂等");

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (!rawRows.length) throw new ApiError(400, "rows 为空");
    if (rawRows.length > 10) throw new ApiError(400, "一局最多 10 名玩家");

    const matchId = Number(body.matchId ?? 0) > 0 ? Number(body.matchId) : 0;
    const match = matchId > 0 ? await prisma.match.findUnique({ where: { id: matchId } }) : null;
    if (matchId > 0 && !match) throw new ApiError(404, "赛事不存在");

    const roundNo = Number(body.roundNo ?? match?.currentRound ?? 1) || 1;
    // 不传 gameNo 就由服务端自动排到该赛事的下一个空位（agent 不知道这是 BO5 的第几局）。
    const gameNo = Number(body.gameNo ?? 0) || 0;
    const playedAt = body.playedAt ? new Date(String(body.playedAt)) : new Date();

    const errors: string[] = [];
    const rows = [];

    for (const [index, raw] of rawRows.entries()) {
      const line = index + 1;
      const source = (raw ?? {}) as Record<string, unknown>;

      // 玩家匹配：本站 id > puuid > 游戏ID（召唤师名）。
      const rowPuuid = String(source.puuid ?? "").trim();
      let userId = Number(source.user_id ?? source.userId ?? 0) || 0;
      if (!userId && rowPuuid) {
        const profile = await prisma.playerProfile.findFirst({
          where: { puuid: rowPuuid },
          select: { userId: true },
        });
        userId = profile?.userId ?? 0;
      }
      if (!userId) {
        const gameName = String(source.game_name ?? source.gameName ?? "").trim();
        if (gameName) {
          const profile = await prisma.playerProfile.findFirst({
            where: { gameName: { equals: gameName, mode: "insensitive" } },
            select: { userId: true },
          });
          userId = profile?.userId ?? 0;
        }
      }
      if (!userId) {
        errors.push(`第${line}行：匹配不到玩家（puuid/游戏ID 都对不上本站账号）`);
        continue;
      }

      // 配对成功后顺手把 puuid 记到资料上：第一次靠召唤师名对上，之后改名也不怕。
      // 只在资料里还没有 puuid 时写入，不覆盖已有的，避免脏数据把老映射顶掉。
      if (rowPuuid) {
        await prisma.playerProfile.updateMany({
          where: { userId, puuid: "" },
          data: { puuid: rowPuuid },
        });
      }

      const normalized = normalizeImportedRow({ ...source, user_id: userId });
      if (!normalized) {
        errors.push(`第${line}行：英雄或胜负缺失`);
        continue;
      }
      rows.push(normalized);
    }

    if (!rows.length) {
      return json({ ok: false, error: "没有任何可入库的行", errors }, 400);
    }

    const {
      created,
      updated,
      gameNo: slot,
    } = await upsertGameRecords({
      sourceGameId,
      matchId,
      roundNo,
      gameNo,
      gameNoExplicit: gameNo > 0,
      playedAt,
      rows,
    });

    // 纯重复上传（agent 重扫）时不要报「第 N 局」——那一轮什么都没新建，
    // 局号是自动排位算出来的下一个空位，写出来会让人以为又多了一局。
    const slotText = created > 0 ? `第 ${slot} 局，` : "";
    return json({
      ok: true,
      msg: `导入完成：${slotText}新增 ${created} 条，更新 ${updated} 条${
        errors.length ? `，${errors.length} 条未能匹配` : ""
      }`,
      gameNo: slot,
      created,
      updated,
      errors,
    });
  } catch (error) {
    return errorJson(error);
  }
}
