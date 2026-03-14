# ClawCompany — 架构设计与执行方案

## 一、项目定位

**一句话：ClawCompany = Paperclip 的公司编排 + 自带 agent runtime + 深度集成 ClawAPI 多模型路由**

### 与 Paperclip 的关键区别

| 维度 | Paperclip | ClawCompany |
|------|-----------|-------------|
| Agent 来源 | 外部（OpenClaw、Claude Code、Codex）| **内置 runtime**，自带 agent 执行引擎 |
| 模型选择 | 每个 agent 绑一个外部 provider | **每个角色绑不同模型**，通过 ClawAPI 统一路由 |
| 核心定位 | 控制平面（Control Plane）| **控制 + 执行一体化** |
| 成本优化 | 追踪外部 agent 开销 | **架构层面优化**：任务下沉，便宜模型做苦力 |
| 安装门槛 | 需要配置 OpenClaw/Codex 等外部 agent | **开箱即用**：一个 API key 跑起整个公司 |
| 中国适配 | 需要翻墙配各种 API | **ClawAPI 统一出口**，天然适配 |

### 核心卖点

1. **一键启动 AI 公司** — `npx clawcompany init`，输入 ClawAPI key 即可
2. **角色 = 模型** — Chairman 用 Opus、CEO 用 Sonnet、Worker 用 OSS-120B，架构天然多模型
3. **任务级联** — 重活下沉到便宜模型，决策上升到贵模型，成本降 50%+
4. **中国友好** — ClawAPI 做统一代理，无需配置多个 API provider

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│                   ClawCompany UI                     │
│           (React + Vite, 实时仪表盘)                  │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ │
│  │ Org Chart│ │  Board   │ │  Budget   │ │ Audit  │ │
│  └──────────┘ └──────────┘ └───────────┘ └────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │ REST/WebSocket
┌───────────────────────┴─────────────────────────────┐
│               ClawCompany Server                     │
│                (Node.js + Express)                    │
│                                                      │
│  ┌────────────┐ ┌─────────────┐ ┌────────────────┐  │
│  │  Company    │ │ Task        │ │  Agent         │  │
│  │  Manager    │ │ Orchestrator│ │  Runtime       │  │
│  └────────────┘ └──────┬──────┘ └───────┬────────┘  │
│                        │                │            │
│  ┌─────────────────────┴────────────────┴──────────┐ │
│  │            Model Router (核心)                    │ │
│  │    根据 agent role → 选择 ClawAPI model           │ │
│  │    Chairman → opus | CEO → sonnet | ...          │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────┴──────────────────────────┐ │
│  │        Tool System (MCP-compatible)              │ │
│  │   文件系统 | Shell | HTTP | 自定义 skill          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │        Database (PGlite embedded / Postgres)     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────┘
                           │ OpenAI-compatible API
                    ┌──────┴──────┐
                    │   ClawAPI   │
                    │  8 models   │
                    │  1 API key  │
                    └─────────────┘
```

---

## 三、核心模块设计

### 3.1 Model Router（模型路由器 — 核心差异化）

这是 ClawCompany 与 Paperclip 最根本的区别。

```typescript
// packages/model-router/src/router.ts

interface RoleModelMapping {
  chairman:   string;  // 默认 claude-opus-4-6
  ceo:        string;  // 默认 claude-sonnet-4-6
  cto:        string;  // 默认 gpt-5.4
  researcher: string;  // 默认 gemini-3.1-pro
  analyst:    string;  // 默认 gpt-5-mini
  secretary:  string;  // 默认 gemini-3.1-flash-lite
  worker:     string;  // 默认 gpt-oss-120b
  intern:     string;  // 默认 gpt-oss-20b
}

interface ModelRouter {
  // 根据 agent 的 role 自动选模型
  getModelForRole(role: AgentRole): string;

  // 根据余额自动降级：EARN → SAVE → SURVIVE
  getModelWithFallback(role: AgentRole, balance: number): string;

  // 动态路由：根据任务复杂度选模型
  routeByComplexity(task: Task): { model: string; role: AgentRole };

  // 完成 ClawAPI 调用
  chat(params: ChatParams): Promise<ChatResponse>;
}
```

**三层策略引擎：**

```
EARN 模式（balance > $5）     → Chairman/CEO 全力输出
SAVE 模式（$1 < balance < $5）→ 日常用 Secretary，重要决策才上 CEO
SURVIVE 模式（balance < $1）  → Worker/Intern 维持基础运转
```

### 3.2 Agent Runtime（内置执行引擎）

不像 Paperclip 需要外接 OpenClaw，ClawCompany 自带轻量级 agent runtime：

```typescript
// packages/agent-runtime/src/agent.ts

interface Agent {
  id: string;
  role: AgentRole;        // chairman | ceo | cto | researcher | ...
  model: string;          // 从 ModelRouter 获取
  systemPrompt: string;   // 角色 prompt
  tools: Tool[];          // 可用工具
  budget: Budget;         // 预算限制
  reportsTo: string | null; // 上级 agent id
  reports: string[];      // 下属 agent ids
}

interface AgentRuntime {
  // 执行一个任务
  execute(agent: Agent, task: Task): Promise<TaskResult>;

  // 委派给下级
  delegate(from: Agent, to: Agent, subtask: Task): Promise<TaskResult>;

  // 上报给上级
  escalate(from: Agent, to: Agent, issue: Issue): Promise<Decision>;

  // Heartbeat - 定时醒来检查任务
  heartbeat(agent: Agent): Promise<void>;
}
```

**关键设计：Agent 自动委派链**

```
用户下达任务: "分析这份合同并决定是否签署"

Chairman (Opus, $0.08):
  → "这需要先提取关键条款，让 Worker 做"
  → delegate to Worker

Worker (OSS-120B, $0.001):
  → 提取合同关键条款，结构化数据
  → 完成，上报 Secretary

Secretary (Flash-Lite, $0.005):
  → 把结构化数据整理成简报
  → 上报 CEO

CEO (Sonnet, $0.05):
  → 分析风险和收益
  → 上报 Chairman

Chairman (Opus, $0.08):
  → 基于分析做最终决策
  → 总成本: ~$0.14（如果 Chairman 独立完成: ~$0.30）
```

### 3.3 Task Orchestrator（任务编排器）

```typescript
// packages/task-orchestrator/src/orchestrator.ts

interface TaskOrchestrator {
  // 创建任务，自动分配给合适的 agent
  createTask(task: TaskInput): Promise<Task>;

  // 任务分解：大任务 → 子任务链
  decompose(task: Task): Promise<Task[]>;

  // 执行管线：按依赖关系串/并行执行
  executePipeline(tasks: Task[]): Promise<PipelineResult>;

  // 目标链：每个任务追溯到公司目标
  getGoalChain(task: Task): Goal[];
}

// 任务自动分配规则
const TASK_ROUTING_RULES = {
  // 按关键词匹配
  keywords: {
    'strategic|decide|invest|approve': 'chairman',
    'plan|manage|organize|review':     'ceo',
    'code|build|architect|debug':      'cto',
    'research|analyze|data|compare':   'researcher',
    'summarize|translate|format':      'secretary',
    'extract|classify|tag|bulk':       'worker',
  },
  // 按预估 token 量
  tokenThresholds: {
    below_500:   'intern',
    below_2000:  'secretary',
    below_10000: 'ceo',
    above_10000: 'chairman',
  }
};
```

### 3.4 Company Manager（公司管理）

```typescript
// packages/company/src/company.ts

interface Company {
  id: string;
  name: string;
  mission: string;         // "Build the #1 AI trading bot"
  goals: Goal[];
  orgChart: OrgChart;      // 组织架构
  agents: Agent[];
  budget: CompanyBudget;
  clawApiKey: string;      // ClawAPI key
}

interface OrgChart {
  chairman: Agent;
  directReports: {
    ceo: Agent;
    // CEO 的下属
    reports: {
      cto: Agent;
      researcher: Agent;
      // CTO 的下属
      ctoReports: Agent[]; // workers, interns
    }
  }
}
```

### 3.5 Tool System（工具系统，MCP 兼容）

```typescript
// packages/tools/src/index.ts

// 内置工具
const BUILTIN_TOOLS = [
  'file_system',      // 读写文件
  'shell',            // 执行命令
  'http',             // HTTP 请求
  'browser',          // 浏览器操作 (headless)
  'code_interpreter', // 代码执行沙箱
];

// MCP 兼容层 — 可以接入外部 MCP server
interface MCPBridge {
  connectServer(url: string): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, params: any): Promise<any>;
}
```

---

## 四、数据模型

```sql
-- 公司
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  mission TEXT,
  claw_api_key TEXT NOT NULL,  -- 加密存储
  budget_total DECIMAL,
  budget_spent DECIMAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  role TEXT NOT NULL,  -- chairman, ceo, cto, ...
  model TEXT NOT NULL,  -- claude-opus-4-6, gpt-oss-120b, ...
  name TEXT,
  system_prompt TEXT,
  reports_to UUID REFERENCES agents(id),
  budget_monthly DECIMAL,
  budget_spent DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'active',  -- active, paused, terminated
  heartbeat_interval INTEGER DEFAULT 300,  -- seconds
  last_heartbeat TIMESTAMP
);

-- 目标
CREATE TABLE goals (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  parent_id UUID REFERENCES goals(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  priority INTEGER DEFAULT 0
);

-- 任务
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  goal_id UUID REFERENCES goals(id),
  parent_task_id UUID REFERENCES tasks(id),
  assigned_to UUID REFERENCES agents(id),
  created_by UUID REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',  -- pending, in_progress, review, done, failed
  priority INTEGER DEFAULT 0,
  estimated_tokens INTEGER,
  actual_tokens INTEGER,
  cost DECIMAL,
  result TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- 消息/对话 (agent 间通信)
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  from_agent UUID REFERENCES agents(id),
  to_agent UUID REFERENCES agents(id),
  role TEXT NOT NULL,  -- system, user, assistant, tool
  content TEXT NOT NULL,
  model_used TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost DECIMAL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 审计日志
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  agent_id UUID REFERENCES agents(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 五、项目结构

```
clawcompany/
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
│
├── packages/
│   ├── db/                   # Drizzle schema + migrations
│   │   ├── src/schema.ts
│   │   ├── src/migrate.ts
│   │   └── drizzle.config.ts
│   │
│   ├── shared/               # 共享类型和常量
│   │   ├── src/types.ts
│   │   ├── src/constants.ts
│   │   └── src/api-paths.ts
│   │
│   ├── model-router/         # ★ 核心：模型路由器
│   │   ├── src/router.ts
│   │   ├── src/strategies.ts  # EARN/SAVE/SURVIVE
│   │   ├── src/clawapi.ts     # ClawAPI client
│   │   └── src/fallback.ts
│   │
│   ├── agent-runtime/        # ★ 核心：Agent 执行引擎
│   │   ├── src/agent.ts
│   │   ├── src/executor.ts
│   │   ├── src/delegation.ts
│   │   ├── src/heartbeat.ts
│   │   └── src/prompts/       # 各角色 system prompt
│   │       ├── chairman.md
│   │       ├── ceo.md
│   │       ├── cto.md
│   │       └── ...
│   │
│   ├── task-orchestrator/    # 任务编排
│   │   ├── src/orchestrator.ts
│   │   ├── src/decomposer.ts
│   │   ├── src/router.ts      # 任务分配规则
│   │   └── src/pipeline.ts
│   │
│   └── tools/                # 工具系统
│       ├── src/builtin/
│       │   ├── filesystem.ts
│       │   ├── shell.ts
│       │   ├── http.ts
│       │   └── browser.ts
│       ├── src/mcp-bridge.ts  # MCP 兼容层
│       └── src/registry.ts
│
├── server/                   # Express API server
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── companies.ts
│   │   │   ├── agents.ts
│   │   │   ├── tasks.ts
│   │   │   ├── goals.ts
│   │   │   └── audit.ts
│   │   ├── services/
│   │   │   ├── company.service.ts
│   │   │   ├── agent.service.ts
│   │   │   ├── task.service.ts
│   │   │   └── heartbeat.service.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── budget-guard.ts  # 超预算自动拦截
│   └── package.json
│
├── ui/                       # React + Vite dashboard
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # 公司总览
│   │   │   ├── OrgChart.tsx       # 组织架构图
│   │   │   ├── TaskBoard.tsx      # 看板
│   │   │   ├── AgentDetail.tsx    # Agent 详情
│   │   │   ├── CostAnalytics.tsx  # 成本分析
│   │   │   └── AuditLog.tsx       # 审计日志
│   │   └── components/
│   └── package.json
│
├── cli/                      # CLI 工具
│   ├── src/
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── init.ts       # 初始化公司
│   │   │   ├── hire.ts       # 雇佣 agent
│   │   │   ├── task.ts       # 创建/管理任务
│   │   │   ├── status.ts     # 查看状态
│   │   │   └── balance.ts    # 查看余额
│   │   └── onboard.ts        # 交互式引导
│   └── package.json
│
├── templates/                # 预设公司模板
│   ├── trading-desk/         # 交易公司
│   ├── content-agency/       # 内容机构
│   ├── dev-shop/             # 开发团队
│   └── research-lab/         # 研究实验室
│
├── skills/                   # Agent 技能包
│   ├── coding/
│   ├── research/
│   ├── trading/
│   └── content/
│
├── doc/
│   ├── SPEC.md
│   ├── DEVELOPING.md
│   ├── API.md
│   └── TEMPLATES.md
│
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## 六、分步执行计划

### Phase 1：Core MVP（2-3 周）

**目标：能跑起来的最小系统 — 一个 ClawAPI key 启动 AI 公司**

```
Week 1: 基础骨架
├── Day 1-2: 项目初始化
│   ├── pnpm workspace 搭建
│   ├── tsconfig, ESLint, Vitest 配置
│   ├── packages/shared 类型定义
│   └── packages/db schema + PGlite 嵌入式
│
├── Day 3-4: Model Router (核心)
│   ├── ClawAPI client (OpenAI-compatible)
│   ├── Role → Model 映射表
│   ├── 三层策略引擎 (EARN/SAVE/SURVIVE)
│   └── 自动降级和错误重试
│
└── Day 5-7: Agent Runtime (核心)
    ├── Agent 基础类
    ├── 单 agent 执行循环
    ├── System prompt 加载
    └── 基础工具: shell + filesystem

Week 2: 编排层
├── Day 8-9: Task Orchestrator
│   ├── 任务 CRUD
│   ├── 自动分配（关键词 + token 预估）
│   └── 委派链 (delegate/escalate)
│
├── Day 10-11: Server API
│   ├── Express server 搭建
│   ├── 公司/Agent/任务 REST API
│   └── WebSocket 实时更新
│
└── Day 12-14: CLI + 初体验
    ├── `npx clawcompany init` 引导流程
    ├── `clawcompany hire` 雇佣 agent
    ├── `clawcompany task` 下达任务
    └── 端到端测试：创建公司 → 下达任务 → 看到结果
```

**Phase 1 交付物：**
- `npx clawcompany init` 可以启动
- 输入 ClawAPI key 后自动创建默认公司 (Chairman + CEO + Worker)
- 可以通过 CLI 下达任务，看到 agent 执行和委派
- 成本追踪基础功能

---

### Phase 2：Dashboard + 治理（2 周）

```
Week 3: UI Dashboard
├── React + Vite 项目
├── 公司总览面板 (agent 状态、成本、活跃任务)
├── 组织架构可视化 (交互式 org chart)
├── 看板视图 (拖拽式任务板)
└── 实时 agent 活动流

Week 4: 治理与控制
├── Approval gates (需要人类批准的节点)
├── Budget guard (超预算自动暂停)
├── Heartbeat 调度器 (定时唤醒 agent)
├── 审计日志 (完整操作追溯)
└── Agent 暂停/恢复/终止
```

---

### Phase 3：模板市场 + 生态（2 周）

```
Week 5: 公司模板系统
├── 模板 export/import
├── 预设模板: trading-desk, content-agency, dev-shop
├── 自定义 skill 包
└── 模板里包含: org chart + agent config + prompts + tools

Week 6: 扩展与生态
├── MCP 兼容层 (接入外部 MCP server)
├── Webhook 支持 (外部事件触发)
├── Plugin 系统 (扩展点)
└── Docker 一键部署
```

---

## 七、与 OpenClaw 的兼容策略

ClawCompany 不是 OpenClaw 的竞争者，而是其**上层编排 + 多模型增强**：

```
方式 1: ClawCompany 内置 runtime (推荐)
→ 轻量级 agent, 直接调 ClawAPI
→ 适合大部分场景

方式 2: ClawCompany + OpenClaw adapter
→ CTO 角色使用 OpenClaw 作为执行器
→ 适合需要 OpenClaw 工具链的编码任务
→ 通过 heartbeat API 桥接

方式 3: 混合模式
→ Chairman/CEO 用内置 runtime (快速决策)
→ CTO/Engineer 用 OpenClaw (强编码能力)
→ Worker/Intern 用内置 runtime (简单任务)
```

---

## 八、关键技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 语言 | TypeScript | 与 Paperclip 生态一致，前后端统一 |
| 包管理 | pnpm workspace | monorepo，模块化 |
| Server | Express + tRPC | REST + 类型安全 RPC |
| Database | Drizzle ORM + PGlite | 嵌入式 Postgres，零配置 |
| UI | React + Vite + Tailwind | 快速开发，现代 UI |
| AI API | OpenAI-compatible | ClawAPI 天然兼容 |
| Testing | Vitest | 快，TypeScript 原生 |
| CLI | Commander.js + Inquirer | 交互式引导 |

---

## 九、差异化竞争力总结

1. **开箱即用** — 不需要预装 OpenClaw/Codex，一个 key 搞定
2. **成本优化天然内置** — 架构层面的多模型路由，不是后加的
3. **中国友好** — ClawAPI 统一入口，没有 API 碎片化问题
4. **公司模板** — 一键导入预设的 AI 公司配置
5. **轻量级** — 不像 Paperclip 需要协调外部 agent 进程，全内置

---

## 十、Quick Start 设计（用户视角）

```bash
# 1. 安装
npx clawcompany init

# 交互式引导：
# ? Enter your ClawAPI key: sk-claw-xxxxx
# ? Company name: My Trading Desk
# ? Choose template: [Trading Desk] [Content Agency] [Dev Shop] [Custom]
# ✓ Company created with 3 agents (Chairman, CEO, Worker)
# ✓ Server running at http://localhost:3200

# 2. 下达任务
clawcompany task "Research the top 5 DeFi protocols by TVL and write a report"

# CEO (Sonnet) 分析任务 → 分配给 Researcher
# Researcher (Gemini Pro) 搜索和分析 → 交给 Secretary 整理
# Secretary (Flash-Lite) 整理成报告 → 交给 CEO 审核
# CEO (Sonnet) 审核通过 → 提交给 Chairman
# Chairman (Opus) 最终批准 → 输出完整报告
# 总成本: ~$0.20

# 3. 查看状态
clawcompany status
# 🏢 My Trading Desk
# 💰 Balance: $4.80 | Spent today: $0.20
# 👔 Chairman (Opus)    — Idle
# 👩‍💼 CEO (Sonnet)      — Reviewing report
# 👷 Worker (OSS-120B)  — Processing data extraction
```
