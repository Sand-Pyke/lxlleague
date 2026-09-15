# LSPL 峡谷冠军联赛

基于 Next.js App Router 重构的全栈赛事平台。原有 HTML/JavaScript 页面已拆分为可维护的 Next.js 路由、React 组件与 Route Handlers；保留了暗色电竞视觉、赛事中心、选手、排行、个人中心、赛事详情、对阵、赛果及管理后台页面。

## 技术栈

- Next.js 15、React 19、TypeScript
- Next.js Route Handlers（`src/app/api/[...path]/route.ts`）提供同源 JSON API
- 原生响应式 CSS；原项目背景、英雄、装备与头像资源位于 `public/assets`

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。生产构建与启动：

```bash
npm run build
npm run start
```

## 路由

| 页面 | 路径 |
| --- | --- |
| 首页 | `/` |
| 比赛中心 | `/matches` |
| 选手中心 | `/players` |
| 排行榜 | `/rankings` |
| 个人主页 | `/profile` |
| 赛事详情 | `/matches/:id` |
| 阵容对位 | `/matches/:id/lineup` |
| 赛果详情 | `/matches/:id/result` |
| 管理后台 | `/admin` |

## API

已兼容核心读取接口：`/api/current_user`、`/api/match/list`、`/api/players`、`/api/home/board_v2`、`/api/match/detail/:id`、`/api/match/result/:id`、`/api/match/lineup/:id` 与用户资料接口。登录、注册、报名等写接口由 Next.js API 路由处理，并通过 Cookie 保存演示登录态。

## 目录说明

```text
src/app/             页面路由、全局样式与 API
src/components/      导航壳、赛事卡片等可复用组件
src/lib/data.ts      联赛演示数据与类型
public/assets/       从原工程迁移的静态视觉资源
```

当前数据层为便于本地预览的内存演示数据。接入生产环境时，可将 `src/lib/data.ts` 替换为 Prisma、Drizzle 或其他数据库访问层，而页面与 API 契约保持不变。
