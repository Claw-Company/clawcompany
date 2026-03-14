# ClawCompany — 自定义角色系统设计

## 一、设计哲学

```
三层自由度：

1. 模型自由 — 任何角色可以绑定任何 provider 的任何模型
2. 角色自由 — 用户可以增/删/改角色，自定义名称和职责
3. 组织自由 — 汇报线随意调整，扁平/层级/矩阵都可以

唯一约束：至少保留一个角色。空公司没有意义。
```

## 二、角色数据模型

```typescript
// packages/shared/src/types.ts

interface Role {
  // ===== 基础信息 =====
  id: string;              // 唯一标识，如 "chairman", "custom_trader_1"
  name: string;            // 显示名称，如 "Chairman", "量化交易员", "SEO专员"
  description: string;     // 角色职责描述
  systemPrompt: string;    // 完整的 system prompt

  // ===== 模型配置 =====
  model: string;           // 模型 ID，如 "claude-opus-4-6"
  provider: string;        // Provider ID，如 "clawapi", "deepseek", "ollama"

  // ===== 组织关系 =====
  reportsTo: string | null;  // 上级角色 ID，null = 顶级角色
  canDelegateTo: string[];   // 可以委派任务的角色列表（默认为所有下级）
  canEscalateTo: string[];   // 可以上报的角色列表（默认为上级链）

  // ===== 预算与策略 =====
  budgetTier: 'earn' | 'save' | 'survive';  // 预算层级
  budgetMonthly: number | null;              // 月度预算上限（美元），null = 无限
  maxTokensPerTask: number | null;           // 单任务 token 上限

  // ===== 工具权限 =====
  tools: string[];         // 可用工具列表，如 ["shell", "http", "filesystem"]
  skills: string[];        // 技能包列表，如 ["coding", "research"]

  // ===== 元数据 =====
  isBuiltin: boolean;      // true = 系统预设角色，false = 用户自建
  isActive: boolean;       // 是否激活
  heartbeatInterval: number;  // 心跳间隔（秒），0 = 纯被动
  createdAt: string;
  updatedAt: string;
}
```

## 三、预设角色 vs 自定义角色

### 3.1 预设角色（isBuiltin = true）

系统自带，`npx clawcompany init` 后自动创建：

```typescript
const BUILTIN_ROLES: Partial<Role>[] = [
  {
    id: 'chairman',
    name: 'Chairman',
    description: 'Strategic decisions, final approval, high-value tasks',
    model: 'claude-opus-4-6',
    provider: 'clawapi',
    reportsTo: null,
    budgetTier: 'earn',
    tools: ['http', 'filesystem'],
    systemPrompt: `You are the Chairman of this AI company.
Your role: Make final strategic decisions. You receive analyzed briefings
from your CEO and Secretary, then approve or reject proposals.
You NEVER do routine work directly — delegate everything downward.
When you receive a task, decide: Can someone below handle this?
If yes → delegate. If it requires your judgment → decide.
Your time is the most expensive in the company. Use it wisely.`
  },

  {
    id: 'ceo',
    name: 'CEO',
    description: 'Daily management, planning, quality work',
    model: 'claude-sonnet-4-6',
    provider: 'clawapi',
    reportsTo: 'chairman',
    budgetTier: 'earn',
    tools: ['http', 'filesystem', 'shell'],
    systemPrompt: `You are the CEO of this AI company.
Your role: Manage daily operations. Break down goals into tasks,
assign them to the right people, review their output, and escalate
important decisions to the Chairman.
You are the bridge between strategy (Chairman) and execution (CTO, Workers).
For technical tasks → delegate to CTO.
For routine tasks → delegate to Workers.
For research → delegate to Researcher (if hired).
Only escalate to Chairman when a decision has significant impact.`
  },

  {
    id: 'cto',
    name: 'CTO',
    description: 'Technical architecture, coding, debugging',
    model: 'gpt-5.4',
    provider: 'clawapi',
    reportsTo: 'ceo',
    budgetTier: 'earn',
    tools: ['shell', 'filesystem', 'http', 'code_interpreter'],
    systemPrompt: `You are the CTO of this AI company.
Your role: Handle all technical work — architecture decisions, coding,
debugging, code review, system design. You report to the CEO.
For grunt work (data extraction, formatting) → delegate to Workers.
For complex research → request the CEO to assign a Researcher.
You own the technical quality of everything the company ships.`
  },

  {
    id: 'secretary',
    name: 'Secretary',
    description: 'Briefings, summaries, everyday quick tasks',
    model: 'gpt-5-mini',
    provider: 'clawapi',
    reportsTo: 'chairman',
    budgetTier: 'save',
    tools: ['http', 'filesystem'],
    systemPrompt: `You are the Secretary to the Chairman.
Your role: Prepare briefings, summarize documents, organize information,
handle correspondence, and manage the Chairman's inbox.
You filter noise so the Chairman only sees what matters.
Produce concise, well-structured summaries. No fluff.`
  },

  {
    id: 'worker',
    name: 'Worker',
    description: 'Fast routine tasks, extraction, formatting',
    model: 'gemini-3.1-flash-lite',
    provider: 'clawapi',
    reportsTo: 'ceo',
    budgetTier: 'save',
    tools: ['filesystem'],
    systemPrompt: `You are a Worker in this AI company.
Your role: Execute routine tasks quickly and reliably.
Data extraction, formatting, translation, classification, tagging.
You don't make decisions — you execute instructions from above.
Focus on speed and accuracy. Keep outputs structured.`
  },

  {
    id: 'fallback_a',
    name: 'Fallback A',
    description: 'Low-balance fallback, bulk processing',
    model: 'gpt-oss-120b',
    provider: 'clawapi',
    reportsTo: null,
    budgetTier: 'survive',
    isActive: true,
    tools: ['filesystem'],
    systemPrompt: `You are a fallback agent. The company is in low-balance mode.
Execute tasks as efficiently as possible with minimal token usage.
Be concise. Skip pleasantries. Output only what's needed.`
  },

  {
    id: 'fallback_b',
    name: 'Fallback B',
    description: 'Minimum cost, classification, tagging',
    model: 'gpt-oss-20b',
    provider: 'clawapi',
    reportsTo: null,
    budgetTier: 'survive',
    isActive: true,
    tools: [],
    systemPrompt: `You are the last-resort agent. Extremely low balance.
Only handle classification, tagging, and yes/no decisions.
Maximum 50 tokens per response. No explanations unless asked.`
  },
];
```

### 3.2 预设角色的可编辑范围

```
预设角色（isBuiltin = true）用户可以改：
  ✓ name           — 改名叫 "总裁" 或 "老板" 都行
  ✓ description    — 改职责描述
  ✓ systemPrompt   — 完全自定义 prompt
  ✓ model          — 换成任何模型
  ✓ provider       — 换成任何 provider
  ✓ reportsTo      — 改汇报关系
  ✓ budgetTier     — 改预算层级
  ✓ budgetMonthly  — 设月度预算
  ✓ tools          — 改工具权限
  ✓ isActive       — 停用（但不删除）

预设角色用户不能改：
  ✗ id             — 永远是 "chairman", "ceo" 等
  ✗ isBuiltin      — 永远是 true
  ✗ 删除           — 预设角色只能停用，不能删除
                     （防止用户误删后系统找不到 fallback）
```

### 3.3 自定义角色（isBuiltin = false）

用户创建的角色，完全自由：

```typescript
// 用户创建的自定义角色示例

// 示例 1: 量化交易员
{
  id: 'custom_trader',
  name: '量化交易员',
  description: '监控市场数据，执行交易策略，管理仓位',
  model: 'claude-sonnet-4-6',
  provider: 'clawapi',
  reportsTo: 'cto',
  budgetTier: 'earn',
  tools: ['http', 'shell', 'code_interpreter'],
  systemPrompt: `你是一名量化交易员。
你的职责：监控 DeFi 协议 TVL 变化，分析链上数据，
执行预设的交易策略。当发现异常波动时上报 CTO。
使用 Python 进行数据分析，通过 HTTP 工具获取实时数据。`,
  isBuiltin: false,
}

// 示例 2: SEO 专员
{
  id: 'custom_seo',
  name: 'SEO specialist',
  description: 'Keyword research, content optimization, rank tracking',
  model: 'gpt-5-mini',
  provider: 'clawapi',
  reportsTo: 'ceo',
  budgetTier: 'save',
  tools: ['http', 'filesystem'],
  isBuiltin: false,
}

// 示例 3: 本地代码审查员（用 Ollama 免费跑）
{
  id: 'custom_reviewer',
  name: 'Code reviewer',
  description: 'Review PRs, check code quality, suggest improvements',
  model: 'qwen3-coder:32b',
  provider: 'ollama',
  reportsTo: 'cto',
  budgetTier: 'save',  // Ollama 本地跑，实际成本为 0
  tools: ['shell', 'filesystem'],
  isBuiltin: false,
}
```

## 四、CLI 角色管理命令

```bash
# ========== 查看 ==========
$ clawcompany role list
┌────────────────┬──────────────────────┬──────────┬─────────┬──────────┐
│ Role           │ Model                │ Provider │ Reports │ Status   │
├────────────────┼──────────────────────┼──────────┼─────────┼──────────┤
│ Chairman       │ claude-opus-4-6      │ ClawAPI  │ —       │ active   │
│ CEO            │ claude-sonnet-4-6    │ ClawAPI  │ Chairman│ active   │
│ CTO            │ gpt-5.4              │ ClawAPI  │ CEO     │ active   │
│ Secretary      │ gpt-5-mini           │ ClawAPI  │ Chairman│ active   │
│ Worker         │ gemini-3.1-flash-lite│ ClawAPI  │ CEO     │ active   │
│ 量化交易员      │ claude-sonnet-4-6    │ ClawAPI  │ CTO     │ active   │
│ Code reviewer  │ qwen3-coder:32b      │ Ollama   │ CTO     │ active   │
│ Fallback A     │ gpt-oss-120b         │ ClawAPI  │ —       │ standby  │
│ Fallback B     │ gpt-oss-20b          │ ClawAPI  │ —       │ standby  │
└────────────────┴──────────────────────┴──────────┴─────────┴──────────┘

$ clawcompany role show cto
  Name:          CTO
  Model:         gpt-5.4 (via ClawAPI)
  Reports to:    CEO
  Budget tier:   earn
  Monthly budget: unlimited
  Tools:         shell, filesystem, http, code_interpreter
  Status:        active
  Type:          builtin

# ========== 创建自定义角色 ==========
$ clawcompany role add

? Role name: 量化交易员
? Description: 监控市场数据，执行交易策略
? Model: claude-sonnet-4-6
? Provider: ClawAPI
? Reports to: CTO
? Budget tier: earn
? Tools: http, shell, code_interpreter
? System prompt (press Enter to auto-generate):
  ✓ Role "量化交易员" created (id: custom_1)

# 或者一行搞定
$ clawcompany role add "Content writer" \
    --model gpt-5-mini \
    --provider clawapi \
    --reports-to ceo \
    --tier save \
    --tools http,filesystem

# ========== 修改角色 ==========
# 改名
$ clawcompany role set chairman --name "总裁"
  ✓ Chairman renamed to "总裁"

# 改模型
$ clawcompany role set cto --model deepseek-coder --provider deepseek
  ✓ CTO model changed: gpt-5.4 (ClawAPI) → deepseek-coder (DeepSeek)

# 改汇报关系
$ clawcompany role set custom_trader --reports-to chairman
  ✓ 量化交易员 now reports to 总裁 (was: CTO)

# 改预算
$ clawcompany role set ceo --budget 50
  ✓ CEO monthly budget set to $50.00

# 改 system prompt
$ clawcompany role set ceo --prompt-file ./my-ceo-prompt.md
  ✓ CEO system prompt updated from file

# 交互式修改（推荐）
$ clawcompany role edit cto
  [opens $EDITOR with current role config in YAML]

# ========== 停用 / 激活 ==========
$ clawcompany role disable secretary
  ✓ Secretary disabled (tasks will not be routed here)

$ clawcompany role enable secretary
  ✓ Secretary re-enabled

# ========== 删除 ==========
$ clawcompany role remove custom_trader
  ⚠ This will delete role "量化交易员" and unassign 3 tasks.
  ? Reassign tasks to: CEO
  ✓ Role deleted. 3 tasks reassigned to CEO.

# 预设角色不能删除
$ clawcompany role remove chairman
  ✗ Cannot delete builtin role "Chairman". Use --disable instead.

# ========== 重置 ==========
$ clawcompany role reset chairman
  ✓ Chairman reset to defaults (model: claude-opus-4-6, provider: clawapi)

$ clawcompany role reset --all
  ⚠ This will reset ALL builtin roles to defaults and remove custom roles.
  ? Confirm: yes
  ✓ 5 builtin roles reset. 2 custom roles removed.

# ========== 导入/导出 ==========
$ clawcompany role export > my-org.json
$ clawcompany role import my-org.json
```

## 五、配置文件结构

整合到 config.json 中：

```jsonc
{
  "providers": [ /* ... provider 列表 ... */ ],

  // ★ 角色配置：合并了预设和自定义
  "roles": {
    // 预设角色 — 用户修改的字段会覆盖默认值
    "chairman": {
      "name": "总裁",                    // 用户改了名
      "model": "claude-opus-4-6",       // 保持默认
      "provider": "clawapi"             // 保持默认
      // description, systemPrompt 等未指定 → 用系统默认值
    },

    "ceo": {
      // 全部用默认
    },

    "cto": {
      "model": "deepseek-coder",        // 用户改了模型
      "provider": "deepseek"            // 用户改了 provider
    },

    "secretary": {
      "isActive": false                 // 用户停用了秘书
    },

    "worker": {},

    "fallback_a": {},
    "fallback_b": {},

    // ★ 自定义角色 — 完整定义
    "custom_trader": {
      "name": "量化交易员",
      "description": "监控市场数据，执行交易策略",
      "model": "claude-sonnet-4-6",
      "provider": "clawapi",
      "reportsTo": "cto",
      "budgetTier": "earn",
      "tools": ["http", "shell", "code_interpreter"],
      "systemPrompt": "你是一名量化交易员..."
    },

    "custom_reviewer": {
      "name": "Code reviewer",
      "description": "Review PRs and code quality",
      "model": "qwen3-coder:32b",
      "provider": "ollama",
      "reportsTo": "cto",
      "budgetTier": "save",
      "tools": ["shell", "filesystem"]
    }
  },

  // 降级链（fallback 时按此顺序尝试）
  "fallbackChain": [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "gpt-5-mini",
    "gemini-3.1-flash-lite",
    "gpt-oss-120b",
    "gpt-oss-20b"
  ]
}
```

### 配置解析逻辑：合并策略

```typescript
// packages/shared/src/config-resolver.ts

function resolveRoles(config: UserConfig): Role[] {
  const resolved: Role[] = [];

  for (const [id, userOverrides] of Object.entries(config.roles)) {
    const builtin = BUILTIN_ROLES.find(r => r.id === id);

    if (builtin) {
      // ★ 预设角色：用户配置覆盖默认值（浅合并）
      resolved.push({
        ...builtin,             // 默认值
        ...userOverrides,       // 用户覆盖
        id,                     // ID 不可改
        isBuiltin: true,        // 标记不可改
      });
    } else {
      // ★ 自定义角色：必须有 name 和 model
      if (!userOverrides.name || !userOverrides.model) {
        throw new Error(`Custom role "${id}" must have name and model`);
      }
      resolved.push({
        ...getCustomRoleDefaults(),  // 默认 tools, tier 等
        ...userOverrides,
        id,
        isBuiltin: false,
      });
    }
  }

  return resolved;
}
```

## 六、Task Router — 如何决定任务分给谁

有了自定义角色，任务分配逻辑需要更智能：

```typescript
// packages/task-orchestrator/src/task-router.ts

class TaskRouter {
  constructor(private roles: Role[]) {}

  // 给一个任务找到最合适的角色
  route(task: Task): Role {
    const activeRoles = this.roles.filter(r => r.isActive && r.budgetTier !== 'survive');

    // 1. 用户显式指定了角色
    if (task.assignTo) {
      return this.roles.find(r => r.id === task.assignTo)!;
    }

    // 2. 关键词匹配角色的 description 和 skills
    const scores = activeRoles.map(role => ({
      role,
      score: this.matchScore(task, role),
    }));

    // 3. 按匹配度排序，同分时优先便宜的
    scores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return this.tierCost(a.role.budgetTier) - this.tierCost(b.role.budgetTier);
    });

    return scores[0].role;
  }

  private matchScore(task: Task, role: Role): number {
    let score = 0;
    const taskText = `${task.title} ${task.description}`.toLowerCase();
    const roleText = `${role.name} ${role.description} ${role.systemPrompt}`.toLowerCase();

    // 检查任务关键词是否匹配角色描述
    const keywords = taskText.split(/\s+/);
    for (const kw of keywords) {
      if (roleText.includes(kw)) score += 1;
    }

    // 检查角色的 tools 是否覆盖任务需要的工具
    if (task.requiredTools) {
      const coverage = task.requiredTools.filter(t => role.tools.includes(t)).length;
      score += coverage * 2;
    }

    // 优先匹配用户自定义的专门角色
    if (!role.isBuiltin) score += 3;  // 自定义角色加分

    return score;
  }
}
```

## 七、公司模板系统

模板 = 一组角色配置 + 组织关系 + prompt 集合：

```typescript
// templates/trading-desk/template.json
{
  "name": "Trading Desk",
  "description": "AI-powered trading company with market analysis",

  "roles": {
    // 继承默认的 chairman, ceo
    "chairman": {},
    "ceo": {},

    // 改写 CTO → 技术交易架构师
    "cto": {
      "name": "Quant architect",
      "description": "Design trading algorithms, manage infra",
      "model": "gpt-5.4"
    },

    // 去掉默认的 secretary, worker
    "secretary": { "isActive": false },
    "worker": { "isActive": false },

    // 添加专门角色
    "custom_analyst": {
      "name": "Market analyst",
      "description": "Monitor markets, detect patterns, generate signals",
      "model": "gemini-3.1-pro",
      "provider": "clawapi",
      "reportsTo": "ceo",
      "budgetTier": "earn",
      "tools": ["http", "code_interpreter"]
    },
    "custom_trader": {
      "name": "Execution trader",
      "description": "Execute trades, manage positions, risk control",
      "model": "claude-sonnet-4-6",
      "provider": "clawapi",
      "reportsTo": "cto",
      "budgetTier": "earn",
      "tools": ["http", "shell"]
    },
    "custom_data": {
      "name": "Data collector",
      "description": "Fetch on-chain data, aggregate feeds, clean datasets",
      "model": "gemini-3.1-flash-lite",
      "provider": "clawapi",
      "reportsTo": "custom_analyst",
      "budgetTier": "save",
      "tools": ["http", "filesystem"]
    }
  },

  "fallbackChain": [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "gemini-3.1-flash-lite",
    "gpt-oss-120b"
  ]
}
```

### 内置模板列表

```
templates/
├── default/              # 默认 (Chairman + CEO + CTO + Secretary + Worker)
├── trading-desk/         # 交易团队 (Analyst + Trader + Data collector)
├── content-agency/       # 内容公司 (Writer + Editor + SEO + Designer)
├── dev-shop/             # 开发团队 (CTO + 3 Engineers + QA + DevOps)
├── research-lab/         # 研究所 (3 Researchers + Data scientist + Publisher)
├── customer-support/     # 客服 (Tier 1 + Tier 2 + Escalation manager)
└── solo-founder/         # 最精简 (CEO 一个人 + Worker)
```

## 八、对外接口总结

```
整体关系：

用户 ←→ CLI / UI Dashboard
              │
              ▼
        Config Manager
         (config.json)
              │
        ┌─────┴─────┐
        ▼            ▼
   Role Registry   Provider Registry
     (角色列表)       (API 列表)
        │            │
        ▼            ▼
     Task Router → Model Router → ClawAPI / Anthropic / DeepSeek / Ollama
        │
        ▼
   Agent Runtime
  (执行任务的引擎)


用户的三种操作路径：

路径 A: 零配置
  → init 时输入 ClawAPI key
  → 系统自动创建默认角色 + 映射
  → 开始工作

路径 B: 调整模型
  → role set cto --model deepseek-coder --provider deepseek
  → 角色不变，模型换了
  → 无需重启

路径 C: 自定义组织
  → role add "量化交易员" --model sonnet --reports-to cto
  → role add "数据采集员" --model flash-lite --reports-to custom_trader
  → role disable secretary (不需要秘书)
  → 全新组织架构，用户完全掌控
```
