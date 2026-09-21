import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // 生成 .next/standalone，Docker 运行镜像只需携带最小依赖，镜像体积和启动都更快
  output: "standalone",
  // ali-oss 有动态 require 与条件导出，交给运行时按 node_modules 原样加载更稳妥
  serverExternalPackages: ["ali-oss"],
  experimental: {
    // 全站 middleware 会克隆请求体，默认只保留前 10MB：视频上传等大请求体会被截断，
    // 表现为「标题不能为空」等表单字段丢失。上限提到 250MB（视频上限默认 200MB）。
    middlewareClientMaxBodySize: "250mb",
  },
};

export default nextConfig;
