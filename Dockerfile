# 依赖层：npm ci 结果 + openssl，被 build / migrate 复用
FROM crpi-i9zdaj7focplqv2n.cn-hangzhou.personal.cr.aliyuncs.com/lol-champion/node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# 构建层：生成 Prisma Client + 编译 Next.js（output: "standalone"）
FROM deps AS build
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate
COPY next.config.ts tsconfig.json next-env.d.ts ./
COPY public ./public
COPY src ./src
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x?schema=public" SESSION_SECRET=build-placeholder CAPTCHA_SECRET=build-placeholder ADMIN_PASSWORD=build-placeholder NODE_OPTIONS="--max-old-space-size=1536" npx next build

# 迁移 & 种子层：一次性容器
FROM deps AS migrate
WORKDIR /app
COPY prisma ./prisma
RUN npx prisma generate
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.mjs"]

# 运行层：只保留 standalone 产物 + Prisma 引擎
FROM crpi-i9zdaj7focplqv2n.cn-hangzhou.personal.cr.aliyuncs.com/lol-champion/node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

RUN mkdir -p /app/data/uploads

EXPOSE 3000
CMD ["node", "server.js"]