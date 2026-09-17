import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // 生成 .next/standalone，Docker 运行镜像只需携带最小依赖，镜像体积和启动都更快
  output: "standalone",
};

export default nextConfig;
