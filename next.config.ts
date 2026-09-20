import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // 生成 .next/standalone，Docker 运行镜像只需携带最小依赖，镜像体积和启动都更快
  output: "standalone",
  // ali-oss 有动态 require 与条件导出，交给运行时按 node_modules 原样加载更稳妥
  serverExternalPackages: ["ali-oss"],
};

export default nextConfig;
