import { NextRequest, NextResponse } from "next/server";

/**
 * 全站中间件：CSRF（XSRF）防护 + 安全响应头。
 *
 * 应用本身没有任何 `dangerouslySetInnerHTML`，用户输入经过 React 转义后才渲染，
 * 因此这里的 XSS 防护是纵深防御：禁止加载站外脚本、禁止被 iframe 嵌套、
 * 禁止把本站表单提交到站外，并让浏览器不要凭内容嗅探改变响应类型。
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const isProduction = process.env.NODE_ENV === "production";

/**
 * 注意：样式与脚本保留了 'unsafe-inline'——Next 的运行期脚本与 antd 的内联样式依赖它，
 * 去掉会直接把站点打白屏。它挡不住「注入进页面里的内联脚本」，但能挡住站外脚本加载、
 * 站外数据外发、iframe 嵌套与站外表单提交，是成本很低的一层兜底。
 */
/** OSS 直传只放行当前配置的 Bucket，不能放宽到所有阿里云域名。 */
function ossConnectSource() {
  const bucket = process.env.OSS_BUCKET?.trim();
  const region = process.env.OSS_REGION?.trim();
  // 环境变量最终会写入响应头，先限制为 OSS 域名允许的字符，避免配置错误污染 CSP。
  if (
    !bucket ||
    !region ||
    !/^[a-z0-9][a-z0-9-]*$/i.test(bucket) ||
    !/^[a-z0-9][a-z0-9-]*$/i.test(region)
  ) {
    return "";
  }
  return ` https://${bucket}.${region}.aliyuncs.com`;
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'" +
      ossConnectSource() +
      (isProduction ? "" : " ws: http://localhost:* http://127.0.0.1:*"),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

function requestHost(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return host?.split(",")[0].trim().toLowerCase() ?? null;
}

function isSecureRequest(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded) return forwarded === "https";
  return request.nextUrl.protocol === "https:";
}

/**
 * 跨站写操作判定。判定顺序：
 * 1. `Sec-Fetch-Site`（现代浏览器最可靠的信号）：只放行 same-origin 与直接访问（none），
 *    显式的 cross-site / same-site（子域）一律拒绝。
 * 2. `Origin`（缺失时退回 `Referer`）的站点必须与本次请求的 Host 一致；
 *    `Origin: null` 这类无法解析的值按跨站处理。
 * 3. 两个头都没有时视为非浏览器客户端（curl / 脚本 / 监控探针）放行：
 *    CSRF 的前提是「浏览器自动带上 Cookie」，而浏览器发 POST 一定会带 Origin。
 *
 * Cookie 本身是 SameSite=Lax，跨站 POST 本来就不携带登录态，这里是第二道闸——
 * 防的是「Cookie 被放到同站点子域 / 旧浏览器不放行 SameSite」这类边界情况。
 */
function isCrossSiteWrite(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (site === "cross-site" || site === "same-site") return true;

  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;

  const host = requestHost(request);
  if (!host) return true;
  try {
    return new URL(source).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

export function middleware(request: NextRequest) {
  if (MUTATING_METHODS.has(request.method) && isCrossSiteWrite(request)) {
    return NextResponse.json(
      { ok: false, error: "跨站请求已被拦截，请刷新页面后重试" },
      { status: 403 },
    );
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", contentSecurityPolicy());
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // 只在确实走 HTTPS 时才发 HSTS：明文部署下发它没有意义，还可能把用户锁在 https 上。
  if (isSecureRequest(request)) {
    response.headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
