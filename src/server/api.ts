import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";

/**
 * 领域层抛出的业务错误。路由层统一翻译成响应，避免每个 handler 重复拼状态码。
 * `msg` 与原 Flask 服务的响应字段保持一致，前端历史代码无需改动。
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string) => new ApiError(400, message);
export const unauthorized = (message = "请先登录") => new ApiError(401, message);
export const forbidden = (message = "需要管理员权限") => new ApiError(403, message);
export const notFound = (message: string) => new ApiError(404, message);

/** 解析必填的正整数 ID（路径参数或请求体字段），非法值直接 400。 */
export function requiredId(value: unknown, message = "参数无效") {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw badRequest(message);
  return id;
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ msg: error.message, error: error.message }, { status: error.status });
  }
  throw error;
}

/** 包装路由 handler，把 ApiError 转成响应。 */
export async function withApiErrors(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    return errorResponse(error);
  }
}

export function ok(payload: object = {}) {
  return NextResponse.json({ ok: true, ...payload });
}

/**
 * 后台路由的统一外壳：管理员鉴权 → 解析 body/params/query → 翻译领域层结果。
 * 领域层用 `{ kind }` 判别联合表达业务失败（不抛异常），在这里统一翻成 HTTP 响应。
 */
export function adminRoute<P extends Record<string, string> = Record<string, string>>(
  handler: (context: {
    request: NextRequest;
    adminId: number;
    params: P;
    body: Record<string, unknown>;
    query: URLSearchParams;
  }) => Promise<object | void>,
) {
  // 第二个参数由 Next 注入；静态路由同样会传（params 为空对象），这里仍做空值保护
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    const { user, response } = await requireAdmin(request);
    if (response) return response;

    return withApiErrors(async () => {
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? {}
          : ((await request.json().catch(() => ({}))) as Record<string, unknown>);
      const result = await handler({
        request,
        adminId: user!.id,
        params: context?.params ? await context.params : ({} as P),
        body,
        query: new URL(request.url).searchParams,
      });
      return ok(result ?? {});
    });
  };
}

/** 领域层 `{ kind }` 失败码 → 错误响应。 */
const KIND_ERRORS: Record<string, { status: number; message: string }> = {
  match_not_found: { status: 404, message: "赛事不存在" },
  not_found: { status: 404, message: "记录不存在" },
  sign_not_found: { status: 404, message: "报名记录不存在" },
  team_mismatch: { status: 400, message: "队伍不存在或不属于该赛事" },
  invalid_position: { status: 400, message: "位置不正确" },
  not_in_team: { status: 400, message: "该选手不在队伍中" },
  out_of_range: { status: 400, message: "已经在队伍首位/末位了" },
  duplicate: { status: 400, message: "同名队伍已存在" },
  empty: { status: 400, message: "还没有可固化的对战（请先创建队伍或选取对战）" },
  no_score: { status: 400, message: "本轮还有对战未录入比分，请先录入全部对战结果" },
  tie: { status: 400, message: "本轮有对阵比分打平，请录入分出胜负的系列比分" },
  bad_team_count: { status: 400, message: "参赛队伍数必须是 2/4/8/16/32 支" },
  already_finished: { status: 400, message: "赛事已结束，无需再次结束本轮" },
  rate_limited: { status: 429, message: "录入过于频繁，请稍后再试" },
};

function throwKindError(kind: string, extra: Record<string, unknown>): never {
  if (kind === "over_budget") {
    const { used, budget, fee } = extra as { used: number; budget: number; fee: number };
    throw new ApiError(400, `预算不足：该队已用 ${used}/${budget}，该选手费用 ${fee}`);
  }
  const known = KIND_ERRORS[kind];
  throw new ApiError(known?.status ?? 400, known?.message ?? "操作失败");
}

/**
 * 断言领域层操作成功，返回 `ok` 分支（TS 会据此收窄类型，便于取 `roundNo`/`assigned`）。
 * 失败时抛出带原语义的 ApiError。
 */
export function assertOk<R extends { kind: string }>(result: R): Extract<R, { kind: "ok" }> {
  if (result.kind === "ok") return result as Extract<R, { kind: "ok" }>;
  throwKindError(result.kind, result as unknown as Record<string, unknown>);
}

/** `assertOk` 的便捷包装：成功时返回带统一 `msg` 的响应体。 */
export function unwrap<R extends { kind: string }>(result: R, success: string) {
  const { kind: _kind, ...rest } = assertOk(result);
  return { msg: success, ...(rest as Record<string, unknown>) };
}
