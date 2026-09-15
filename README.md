# LSPL 峡谷冠军联赛

基于 Next.js App Router 的全栈赛事平台。页面包括赛事中心、选手、排行、个人中心、赛事详情、对阵、赛果及管理后台。

## 技术栈

- Next.js 15、React 19、TypeScript
- Next.js Route Handlers：`src/app/api/[...path]/route.ts`
- 原生响应式 CSS
- 原项目视觉资源：`public/assets`

## 快速开始

```bash
npm install
npm run dev
```

生产构建与启动：

```bash
npm run build
npm run start
```

## 可用脚本

```bash
npm run format        # 使用 Prettier 格式化项目代码
npm run format:check  # 检查 Prettier 格式
npm run build         # 类型检查和生产构建
```

## 路由

| 页面     | 路径                  |
| -------- | --------------------- |
| 首页     | `/`                   |
| 比赛中心 | `/matches`            |
| 选手中心 | `/players`            |
| 排行榜   | `/rankings`           |
| 个人主页 | `/profile`            |
| 赛事详情 | `/matches/:id`        |
| 阵容对位 | `/matches/:id/lineup` |
| 赛果详情 | `/matches/:id/result` |
| 管理后台 | `/admin`              |

## API 与数据状态

核心 API 包括当前用户、赛事列表、选手榜单、首页面板、个人资料、赛事详情、赛果和阵容接口。项目当前不携带任何赛事、选手、个人资料或赛果 Mock 数据：集合接口会返回空数组；不存在的赛事详情、赛果、阵容、报名和取消报名请求会返回 `404`。

`src/lib/data.ts` 只保留类型与数据访问边界。接入生产数据库时，可以将该文件替换为 Prisma、Drizzle 或其他数据访问实现，页面和 API 契约可保持不变。

## 目录说明

```text
src/app/             页面路由、全局样式与 API
src/components/      导航壳、赛事卡片等可复用组件
src/lib/data.ts      数据类型与空数据访问边界
public/assets/       原工程迁移的背景、英雄、装备和头像资源
```
