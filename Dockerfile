# 依赖层：npm ci 结果 + openssl，被 build / migrate 复用
# --mount=type=cache 让 npm 缓存跨构建持久化，服务器上重复 --build 时不再反复下载依赖
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# 构建层：生成 Prisma Client + 编译 Next.js（output: "standalone"）
FROM deps AS build
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate
COPY next.config.ts tsconfig.json next-env.d.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# 迁移 & 种子层：一次性容器（prisma CLI 在 devDependencies 里，只有这里需要它）
FROM deps AS migrate
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.mjs"]

# 运行层：只保留 standalone 产物 + Prisma 引擎，不再带 typescript / prisma CLI 等 devDependencies
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# nft 追踪偶尔会漏掉 Prisma 的引擎二进制，这里显式补上（幂等，不影响其他文件）
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# 上传图片的落盘目录（生产环境由 compose 把宿主机目录挂到这里，见 UPLOAD_DIR）。
RUN mkdir -p /app/data/uploads

EXPOSE 3000
CMD ["node", "server.js"]
