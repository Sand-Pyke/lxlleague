# LXL 峡谷冠军联赛

基于 Next.js App Router 的全栈赛事平台。页面包括赛事中心、选手、排行、个人中心、赛事详情、对阵、赛果及管理后台。

## 技术栈

- Next.js 15、React 19、TypeScript
- Next.js Route Handlers：`src/app/api`
- Ant Design 6、`@ant-design/nextjs-registry`
- 浅色 / 深色主题切换（保存在浏览器本地）
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
npm run assets:default-avatars  # 重新生成注册默认表情头像（需联网，素材见 public/assets/avatars/default/README.md）
```

## LCU 可视化战绩导入台

英雄联盟客户端的 LCU 只监听安装客户端电脑的本机地址，因此网页后台不能直接读取它。管理员在裁判/房主电脑上复制后台「赛事管理 → 战绩录入 → 自动导入」提供的可视化命令后执行：

```powershell
$env:LXL_IMPORT_TOKEN = "<导入令牌>"
node scripts/lcu-agent.mjs --api "<本站地址>" --ui
```

随后打开 `http://127.0.0.1:3179`。导入台会展示当前进行中的赛事、最近五局对局、全部十名参与者及其本站账号匹配状态；选择一局并确认后才会写入。导入令牌只保留在本地 agent 进程中，不会暴露给浏览器页面。

服务端仍会校验目标赛事必须为进行中状态、轮次未变、选手已报名、局次合法和来源对局幂等。自动轮询模式不受影响；不带 `--ui` 时，agent 仍按原方式运行。端口冲突时可加 `--ui-port 3180`。

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
src/components/      导航壳、赛事卡片等跨页面复用组件
src/server/          按领域组织的服务端业务与 API Handler
src/lib/data.ts      数据类型与空数据访问边界
public/assets/       原工程迁移的背景、英雄、装备和头像资源
public/assets/avatars/default/  注册默认表情头像（Twemoji 合成，含来源说明与生成脚本）
```

## 前端模块边界

- `src/app`：唯一的前端路由与页面目录；每个 URL 的页面实现直接放在对应的 `page.tsx` 中。
- `src/components`：只放跨页面复用的 UI，例如应用导航壳和赛事卡片。
- `src/server`：按认证、赛事、首页、选手和用户等领域组织服务端逻辑；`src/app/api` 只保留原有 URL 的 Route Handler 映射。
