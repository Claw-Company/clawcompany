# ClawCompany — 从零到 v0.1.0 执行计划

> 目标：6 周内完成 MVP，GitHub 首发，clawcompany.org 上线

---

## Step 0: 基础设施搭建（Day 1）

### 0.1 创建 GitHub Organization

```bash
# 1. 浏览器操作
#    github.com → Settings → Organizations → New organization
#    Name: clawcompany
#    Plan: Free (足够用)
#    Contact email: alex@clawcompany.org

# 2. 组织设置
#    - Avatar: ClawCompany logo（龙虾/螃蟹爪子图标）
#    - Bio: "Build for WEB4.0, Claws Autonomous."
#    - URL: https://clawcompany.org
#    - Location: Global
#    - 把 alex-xuweilong 设为 Owner
```

### 0.2 创建主仓库

```bash
# 在 GitHub 上创建 clawcompany/clawcompany
# Description: "Build for WEB4.0, Claws Autonomous. Your AI company, one key to run them all."
# License: MIT
# 勾选 Add README

# 本地 clone
git clone git@github.com:clawcompany/clawcompany.git
cd clawcompany
```

### 0.3 域名配置

```
clawcompany.org DNS 设置:
  - A record → GitHub Pages IP (如果用 GitHub Pages)
  - 或 CNAME → clawcompany.github.io
  - 后续可以换成 Vercel/Cloudflare Pages
```

---

## Step 1: 项目脚手架（Day 1-2）

### 1.1 初始化 monorepo

```bash
# pnpm workspace
pnpm init
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'server'
  - 'ui'
  - 'cli'
```

```jsonc
// package.json
{
  "name": "clawcompany",
  "version": "0.1.0",
  "private": true,
  "description": "Build for WEB4.0, Claws Autonomous.",
  "scripts": {
    "dev": "pnpm --filter server dev & pnpm --filter ui dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9.15.0"
}
```

### 1.2 TypeScript + ESLint + Vitest

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true
  }
}
```

### 1.3 项目结构创建

```bash
mkdir -p packages/{shared,db,model-router,agent-runtime,task-orchestrator,providers,tools}
mkdir -p server/src/{routes,services,middleware}
mkdir -p ui/src/{pages,components}
mkdir -p cli/src/commands
mkdir -p templates/{default,trading-desk,content-agency,dev-shop}
mkdir -p doc
```

### 1.4 首次提交

```bash
git add -A
git commit -m "feat: initial project scaffold

- pnpm monorepo with workspace packages
- TypeScript, ESLint, Vitest configuration
- Project structure: packages, server, ui, cli, templates, doc"

git push origin main
```

---

## Step 2: 核心类型和数据库（Day 2-3）

### 2.1 packages/shared — 类型定义

```
文件清单:
  packages/shared/src/types.ts        — Role, Mission, Task, Agent 等核心类型
  packages/shared/src/constants.ts    — 默认角色、默认模型映射、budget tiers
  packages/shared/src/api-paths.ts    — REST API 路径常量
  packages/shared/src/defaults.ts     — BUILTIN_ROLES, DEFAULT_PROVIDERS
```

### 2.2 packages/db — 数据库 Schema

```
文件清单:
  packages/db/src/schema.ts           — Drizzle schema (companies, agents, tasks, messages, audit_log)
  packages/db/src/client.ts           — PGlite 嵌入式 + Postgres 生产环境
  packages/db/src/migrate.ts          — 自动迁移
  packages/db/drizzle.config.ts       — Drizzle 配置
```

### 2.3 提交

```bash
git add -A
git commit -m "feat: core types and database schema

- Shared types: Role, Mission, Task, Agent, Provider
- Default role mappings with ClawAPI as default supplier
- Drizzle ORM schema with PGlite embedded DB
- Auto-migration on startup"
```

---

## Step 3: Provider System + Model Router（Day 3-5）★ 核心

### 3.1 packages/providers — Provider 抽象层

```
文件清单:
  packages/providers/src/types.ts            — ProviderConfig, LLMProvider 接口
  packages/providers/src/registry.ts         — ProviderRegistry (注册、发现、管理)
  packages/providers/src/openai-compatible.ts — OpenAI-compatible adapter (ClawAPI, DeepSeek, Ollama)
  packages/providers/src/anthropic.ts        — Anthropic 原生 adapter
  packages/providers/src/pricing.ts          — 模型定价表（自动计算成本）
  packages/providers/src/__tests__/          — 单元测试
```

### 3.2 packages/model-router — 模型路由器

```
文件清单:
  packages/model-router/src/router.ts        — ModelRouter 核心
  packages/model-router/src/strategies.ts    — EARN/SAVE/SURVIVE 三层策略
  packages/model-router/src/fallback.ts      — 降级链逻辑
  packages/model-router/src/resolver.ts      — Role → Provider + Model 解析
  packages/model-router/src/__tests__/       — 单元测试
```

### 3.3 提交

```bash
git add -A
git commit -m "feat: provider system and model router

- ProviderRegistry: register, discover, hot-reload providers
- OpenAI-compatible adapter (ClawAPI, DeepSeek, Ollama, any endpoint)
- Anthropic native adapter
- ModelRouter: role-based model selection, EARN/SAVE/SURVIVE strategies
- Automatic fallback chain when balance is low
- Cost calculation per request"
```

---

## Step 4: Agent Runtime + Task Orchestrator（Day 5-8）★ 核心

### 4.1 packages/agent-runtime — Agent 执行引擎

```
文件清单:
  packages/agent-runtime/src/agent.ts        — Agent 基础类
  packages/agent-runtime/src/executor.ts     — 单 agent 执行循环 (think → act → observe)
  packages/agent-runtime/src/delegation.ts   — 委派链 (delegate down, escalate up)
  packages/agent-runtime/src/report-chain.ts — 汇报链 (逐级上报、审核、整合)
  packages/agent-runtime/src/heartbeat.ts    — 心跳调度器
  packages/agent-runtime/src/prompts/        — 各角色 system prompt
    ├── chairman.md
    ├── ceo.md
    ├── cto.md
    ├── secretary.md
    ├── worker.md
    └── fallback.md
```

### 4.2 packages/task-orchestrator — 任务编排

```
文件清单:
  packages/task-orchestrator/src/orchestrator.ts  — 使命分解 + 任务管理
  packages/task-orchestrator/src/decomposer.ts    — Chairman 拆解逻辑
  packages/task-orchestrator/src/task-router.ts   — 任务自动分配
  packages/task-orchestrator/src/pipeline.ts      — 依赖关系管理 + 并行执行
  packages/task-orchestrator/src/lifecycle.ts     — 使命生命周期状态机
```

### 4.3 packages/tools — 内置工具

```
文件清单:
  packages/tools/src/builtin/filesystem.ts   — 文件读写
  packages/tools/src/builtin/shell.ts        — Shell 命令执行
  packages/tools/src/builtin/http.ts         — HTTP 请求
  packages/tools/src/registry.ts             — 工具注册中心
  packages/tools/src/mcp-bridge.ts           — MCP 兼容层
```

### 4.4 端到端测试

```
写一个完整的测试:
  1. 创建公司（ClawAPI 作为默认 provider）
  2. Chairman 收到使命
  3. Chairman 拆解成 3 个工作流
  4. 分配给 CEO 和 Worker
  5. Worker 执行完汇报给 CEO
  6. CEO 审核后汇报给 Chairman
  7. Chairman 整合并"交付"
  8. 验证成本追踪正确
```

### 4.5 提交

```bash
git add -A
git commit -m "feat: agent runtime and task orchestrator

- Agent execution loop: think → act → observe
- Mission decomposition by Chairman (Opus)
- Delegation chain: Chairman → CEO → CTO/Worker
- Report chain: results flow back up with review at each level
- Task pipeline with dependency management and parallel execution
- Mission lifecycle state machine
- Built-in tools: filesystem, shell, http
- MCP bridge for external tool integration
- End-to-end test: mission → decompose → execute → report → deliver"
```

---

## Step 5: Server API（Day 8-10）

### 5.1 Express + tRPC server

```
文件清单:
  server/src/index.ts                — 入口，Express + WebSocket
  server/src/routes/companies.ts     — 公司 CRUD
  server/src/routes/roles.ts         — 角色管理 (增删改)
  server/src/routes/providers.ts     — Provider 管理
  server/src/routes/missions.ts      — 使命下达 + 状态查询
  server/src/routes/tasks.ts         — 任务管理
  server/src/routes/audit.ts         — 审计日志
  server/src/services/               — 业务逻辑层
  server/src/middleware/auth.ts       — 认证
  server/src/middleware/budget-guard.ts — 预算拦截
```

### 5.2 提交

```bash
git commit -m "feat: REST API server

- Express server with WebSocket real-time updates
- Company, Role, Provider, Mission, Task CRUD APIs
- Budget guard middleware (auto-pause on overspend)
- Audit logging for all operations
- Health check endpoint"
```

---

## Step 6: CLI 工具（Day 10-12）

### 6.1 CLI 命令

```
文件清单:
  cli/src/index.ts                   — 入口 (Commander.js)
  cli/src/commands/init.ts           — npx clawcompany init (交互式引导)
  cli/src/commands/mission.ts        — clawcompany mission "..." (下达使命)
  cli/src/commands/role.ts           — clawcompany role list/add/set/remove
  cli/src/commands/provider.ts       — clawcompany provider list/add/remove
  cli/src/commands/status.ts         — clawcompany status (公司状态)
  cli/src/commands/balance.ts        — clawcompany balance (余额查询)
  cli/src/onboard.ts                 — 首次引导流程
```

### 6.2 核心体验：10 秒启动

```bash
$ npx clawcompany init
# 输入 ClawAPI key → 验证 → 创建默认公司 → 启动 server → 完成

$ clawcompany mission "Analyze the DeFi market"
# Chairman 开始工作...
```

### 6.3 提交

```bash
git commit -m "feat: CLI tool

- Interactive onboarding: npx clawcompany init
- Mission management: clawcompany mission '...'
- Role CRUD: clawcompany role list/add/set/remove
- Provider management: clawcompany provider list/add
- Status dashboard: clawcompany status
- Balance check: clawcompany balance"
```

---

## Step 7: 文档 + README（Day 12-13）

### 7.1 README.md — 从 Vision 文档转化

```
内容来源: ClawCompany-Vision.md 中的 README 草稿
补充:
  - 安装说明
  - Quick start (带 GIF/视频)
  - Architecture 概览图
  - 默认角色表
  - 添加 Provider 说明
  - Contributing guide
  - License (MIT)
```

### 7.2 doc/ 目录

```
doc/
├── SPEC.md                  — 完整技术规格（来自 Architecture 文档）
├── MISSION-LIFECYCLE.md     — 使命生命周期（来自 Mission Lifecycle 文档）
├── PROVIDERS.md             — Provider 系统（来自 Provider System 文档）
├── ROLES.md                 — 角色系统（来自 Role System 文档）
├── DEVELOPING.md            — 开发者指南
├── CLI.md                   — CLI 命令参考
├── API.md                   — REST API 文档
└── TEMPLATES.md             — 公司模板使用指南
```

### 7.3 提交

```bash
git commit -m "docs: comprehensive documentation

- README with quick start, architecture overview, and examples
- Full spec, mission lifecycle, provider, and role system docs
- CLI reference, API reference, developer guide
- Contributing guide and code of conduct"
```

---

## Step 8: 首页网站（Day 13-15）

### 8.1 clawcompany.org

```
技术: Next.js / Astro 静态站，部署到 Vercel / Cloudflare Pages
仓库: clawcompany/website

内容:
  - Hero: "Build for WEB4.0, Claws Autonomous."
  - WEB 演进图 (1.0 → 4.0)
  - 工作原理 (使命生命周期 6 步动画)
  - 默认角色和模型映射
  - 开放供给层说明
  - Quick start 代码块
  - GitHub star 按钮
  - Discord / 社区链接
```

### 8.2 提交

```bash
# 在 clawcompany/website 仓库
git commit -m "feat: launch website at clawcompany.org"
```

---

## Step 9: Dashboard UI（Day 15-20）

### 9.1 React + Vite Dashboard

```
ui/src/pages/
  ├── Dashboard.tsx          — 公司总览 (状态、成本、活跃使命)
  ├── OrgChart.tsx           — 组织架构交互图
  ├── MissionBoard.tsx       — 使命看板 (进行中、已完成)
  ├── RoleManager.tsx        — 角色管理 (增删改模型)
  ├── ProviderSettings.tsx   — Provider 设置
  ├── CostAnalytics.tsx      — 成本分析图表
  └── AuditLog.tsx           — 审计日志
```

### 9.2 提交

```bash
git commit -m "feat: dashboard UI

- Company overview with real-time agent status
- Interactive org chart
- Mission board with kanban view
- Role manager with model/provider editing
- Cost analytics with per-agent breakdown
- Audit log viewer"
```

---

## Step 10: 测试 + 打磨 + 发布（Day 20-25）

### 10.1 测试

```
- 单元测试: Model Router, Provider Registry, Task Router
- 集成测试: Mission → Decompose → Execute → Report → Deliver
- E2E 测试: npx clawcompany init → mission → 看到结果
- 在真实 ClawAPI key 上跑完整流程
```

### 10.2 Docker

```dockerfile
# Dockerfile + docker-compose.yml
# 一键部署：docker compose up
```

### 10.3 v0.1.0 发布

```bash
# Tag
git tag v0.1.0
git push origin v0.1.0

# GitHub Release
# Title: "v0.1.0 — Build for WEB4.0, Claws Autonomous"
# Body: changelog + quick start + 截图

# npm publish (CLI 工具)
npm publish --access public
# 用户可以: npx clawcompany init
```

---

## 总时间线

```
Week 1 (Day 1-7):
  ✓ GitHub org + 仓库创建
  ✓ 项目脚手架
  ✓ 核心类型 + 数据库
  ✓ Provider System + Model Router ★
  ✓ Agent Runtime (基础) ★

Week 2 (Day 8-14):
  ✓ Task Orchestrator + 使命生命周期
  ✓ Server API
  ✓ CLI 工具
  ✓ 文档 + README
  ✓ 首页网站 (clawcompany.org)

Week 3 (Day 15-21):
  ✓ Dashboard UI
  ✓ 公司模板 (default, trading-desk, content-agency)
  ✓ 集成测试

Week 4 (Day 22-28):
  ✓ Docker 部署
  ✓ 打磨 + bug 修复
  ✓ v0.1.0 发布
  ✓ 社区建设 (Discord, Twitter/X)

Week 5-6 (如果需要):
  ✓ Dashboard 完善
  ✓ 更多模板
  ✓ 社区反馈迭代
```

---

## Git 提交规范

```
feat:     新功能
fix:      bug 修复
docs:     文档
refactor: 重构
test:     测试
chore:    构建/配置

示例:
  feat: mission decomposition by Chairman
  feat: add DeepSeek provider support
  fix: fallback chain not triggering on 402
  docs: add provider system documentation
  test: e2e mission lifecycle test
```

---

## GitHub Organization 生态规划

```
clawcompany/clawcompany     — 主仓库（server + cli + ui + packages）
clawcompany/website         — clawcompany.org 官网
clawcompany/templates       — 公司模板市场（后续独立）
clawcompany/awesome-clawcompany — 社区资源汇总

关联但不在 org 下:
  clawapi (已有)             — 模型供给服务
  alex-xuweilong (个人)      — 其他个人项目
```
