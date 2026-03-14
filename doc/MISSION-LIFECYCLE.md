# ClawCompany — 使命执行生命周期 & 开放供给层

## 一、使命执行生命周期（Mission Lifecycle）

### 核心流程：6 个阶段

```
Phase 1: MISSION IN
  Human → Chairman
  "人类设定使命，Chairman 接收"

Phase 2: DECOMPOSE
  Chairman 独立思考
  "拆解成多个工作流（Work Streams）"

Phase 3: DELEGATE
  Chairman → CEO / Secretary / Workers
  "根据工作流性质分发给合适的角色"

Phase 4: EXECUTE
  各角色并行/串行执行
  "自主完成，遇到需要跨部门的子任务可以内部再委派"

Phase 5: REPORT UP
  Workers → CEO → Chairman
  "结果逐级上报，每一级做自己的审核和整合"

Phase 6: DELIVER
  Chairman → Human
  "最终结果交付给董事会，等待批准/修改/否决"
```

### 详细设计

#### Phase 1: Mission In — 人类只说目标

```typescript
interface Mission {
  id: string;
  content: string;              // "Analyze top 10 DeFi protocols..."
  fromHuman: true;              // 标记来自人类
  priority: 'critical' | 'high' | 'normal' | 'low';
  deadline?: Date;              // 可选截止日期
  budget?: number;              // 可选预算上限
  approvalRequired: boolean;    // 是否需要人类最终批准
}
```

人类唯一要做的就是：
- 说出目标（自然语言）
- 可选：设优先级、截止日期、预算上限
- 可选：标记是否需要最终审批

**其他一切——拆解、分工、执行、协调——全部由 Claws 自治完成。**

#### Phase 2: Decompose — 董事长拆解

这是整个系统最关键的一步。Chairman（Opus）收到使命后，进行"战略思考"：

```typescript
interface DecompositionResult {
  missionId: string;
  workStreams: WorkStream[];
  estimatedCost: number;
  estimatedTime: string;
  strategy: string;             // Chairman 的战略分析
}

interface WorkStream {
  id: string;
  title: string;
  description: string;
  assignTo: string;             // 角色 ID
  dependencies: string[];       // 依赖的其他工作流
  estimatedComplexity: 'low' | 'medium' | 'high';
  requiredTools: string[];
}
```

**Chairman 的拆解逻辑：**

```
Chairman 收到: "分析 DeFi 市场并出投资报告"

Chairman 思考:
  1. 这个使命需要哪些类型的工作？
     → 数据收集（低复杂度，适合 Worker）
     → 技术分析（高复杂度，适合 CTO 或 CEO）
     → 财务分析（高复杂度，适合 CEO）
     → 报告编写（中复杂度，适合 Secretary）
     → 最终决策（需要我亲自来）

  2. 这些工作之间的依赖关系？
     → 数据收集 → 技术分析 + 财务分析 → 报告编写 → 最终审核
     → 数据收集必须先完成，技术和财务分析可以并行

  3. 分配给谁？
     → WS-1 数据收集 → Worker（Flash-Lite，便宜快速）
     → WS-2 技术分析 → CTO（GPT-5.4，擅长技术）
     → WS-3 财务分析 → CEO（Sonnet，擅长综合判断）
     → WS-4 报告编写 → Secretary（GPT-5 mini，整理能力强）
     → WS-5 最终决策 → 我自己（Opus，最终判断）

  4. 预估成本？
     → ~$0.003 + $0.08 + $0.15 + $0.02 + $0.10 = ~$0.46
```

#### Phase 3: Delegate — 分发给角色

Chairman 不是一股脑甩任务，而是**有序分发**：

```
分发规则：

1. 按依赖关系分发
   → 先发没有依赖的工作流（WS-1 数据收集）
   → 等依赖完成后再发后续工作流

2. 可以并行的就并行
   → WS-2 技术分析 和 WS-3 财务分析 可以同时启动
   （只要 WS-1 数据收集完成了）

3. Chairman 可以直接分给任何角色
   → 不一定要经过 CEO
   → 但复杂的跨部门协调通常委托给 CEO 统筹

4. 每个工作流附带完整上下文
   → 使命背景
   → 具体要求
   → 输出格式
   → 截止时间
   → 完成后向谁汇报
```

```typescript
// Chairman 分发任务的内部实现
class ChairmanAgent {
  async decompose(mission: Mission): Promise<void> {
    // 1. 思考并拆解
    const result = await this.modelRouter.chatAsRole('chairman', [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: `
        New mission from the Board:
        "${mission.content}"

        Your team:
        ${this.listAvailableRoles()}

        Decompose this into work streams.
        For each: title, description, assign to which role, dependencies, complexity.
        Think about cost efficiency: delegate grunt work to cheap models.
      `}
    ]);

    // 2. 按依赖关系排序
    const ordered = this.topologicalSort(result.workStreams);

    // 3. 分发无依赖的工作流（立即启动）
    const ready = ordered.filter(ws => ws.dependencies.length === 0);
    for (const ws of ready) {
      await this.delegate(ws);
    }

    // 4. 注册依赖监听（等上游完成后自动分发下游）
    this.registerDependencyWatchers(ordered);
  }

  async delegate(workStream: WorkStream): Promise<void> {
    const targetRole = this.roles.get(workStream.assignTo);

    await this.taskOrchestrator.createTask({
      title: workStream.title,
      description: workStream.description,
      assignedTo: targetRole.id,
      createdBy: this.id,  // Chairman
      context: {
        mission: this.currentMission,
        relatedWorkStreams: workStream.dependencies,
      },
      reportTo: this.id,   // 完成后向 Chairman 汇报
    });
  }
}
```

#### Phase 4: Execute — 自主执行

每个角色收到任务后自主执行，**内部还可以再委派**：

```
CEO 收到 WS-3（财务分析）：
  → 自己分析大部分
  → 发现需要检查 Eigenlayer 合约细节
  → 内部委派给 CTO: "帮我看下 Eigenlayer restaking 合约的风险"
  → CTO 分析完汇报给 CEO
  → CEO 整合进自己的分析结果

这就形成了多层委派链：
  Human → Chairman → CEO → CTO
                   → Worker
```

**执行期间的自治决策：**

```
角色在执行中可以自主决定：
  ✓ 使用哪些工具（HTTP 获取数据、Shell 跑分析脚本）
  ✓ 内部再委派子任务给下级
  ✓ 遇到 API 限流时自动重试
  ✓ 发现数据不完整时主动补充

角色不能自主决定（需要上报）：
  ✗ 超出预算的操作
  ✗ 使命范围之外的工作
  ✗ 需要人类授权的敏感操作
  ✗ 改变其他角色的工作
```

#### Phase 5: Report Up — 逐级汇报

汇报是**自下而上**的，每一级负责整合和审核：

```
Worker 完成数据收集
  → 汇报给 CEO: "10 个协议的数据已提取，47 个指标/协议"
  → CEO 审核数据质量，发现缺少 Pendle 的 7 天费用数据
  → CEO 让 Worker 补充: "Pendle 7d fees 数据缺失，请从 Token Terminal 补充"
  → Worker 补充完毕，再次汇报

CTO 完成技术分析
  → 汇报给 CEO: "审计报告分析完毕，Eigenlayer 中等风险，Ethena 高风险"
  → CEO 满意，整合进总分析

CEO 完成综合分析
  → 汇报给 Chairman: "全部分析完成，以下是 10 个协议的评估..."
  → 同时通知 Secretary 开始格式化报告

Secretary 完成报告格式化
  → 汇报给 Chairman: "12 页报告已格式化，含摘要、详情、风险矩阵"

Chairman 汇总所有汇报
  → 审核 CEO 的分析逻辑
  → 审核 Secretary 的报告质量
  → 加入自己的最终投资建议
  → 交付给 Human
```

```typescript
interface Report {
  taskId: string;
  from: string;           // 汇报人角色 ID
  to: string;             // 汇报对象角色 ID
  status: 'completed' | 'blocked' | 'needs_revision';
  summary: string;        // 简要汇报
  output: any;            // 工作产出
  cost: number;           // 本次工作花费
  tokenUsage: number;
  issues?: string[];      // 遇到的问题
}

// 汇报链处理逻辑
class ReportChain {
  async handleReport(report: Report): Promise<void> {
    const receiver = this.roles.get(report.to);

    // 接收者审核汇报
    const review = await this.modelRouter.chatAsRole(receiver.role, [
      { role: 'system', content: receiver.systemPrompt },
      { role: 'user', content: `
        You received a work report from ${report.from}:
        Task: ${report.summary}
        Output: ${JSON.stringify(report.output)}

        Review this output:
        - Is it complete and meets requirements?
        - Any quality issues?
        - Should this be sent back for revision?
        - Or approved and forwarded up?
      `}
    ]);

    if (review.decision === 'revision_needed') {
      // 打回重做
      await this.requestRevision(report.from, review.feedback);
    } else if (review.decision === 'approved') {
      // 如果这个接收者也有上级，继续上报
      if (receiver.reportsTo) {
        await this.escalateReport(receiver, review.integratedOutput);
      } else {
        // 到顶了（Chairman），准备交付给 Human
        await this.deliverToHuman(review.integratedOutput);
      }
    }
  }
}
```

#### Phase 6: Deliver — 交付给董事会

Chairman 把最终结果交给 Human，Human 有三种响应：

```
Human 的三种响应：

1. ✅ Approved
   → 使命完成，结果存档
   → 所有 agent 释放，回到待命状态

2. 🔄 Revise
   → "加入链上活跃度分析"
   → Chairman 不需要从头来，只追加一个新的工作流
   → 只有受影响的角色重新工作

3. ❌ Override
   → "不同意把 Pendle 放在 Buy 列表"
   → Chairman 接受 override，调整报告
   → 只修改最终结论，不需要重新分析
```

### 生命周期状态机

```
mission_created → chairman_decomposing → tasks_delegated →
  ┌→ tasks_executing (并行)
  │   ├→ subtask_delegated (内部再委派)
  │   ├→ subtask_completed
  │   └→ task_reporting
  └→ all_tasks_reported → chairman_reviewing →
     chairman_delivering → awaiting_human_approval →
       ├→ approved → mission_complete ✓
       ├→ revision_requested → chairman_decomposing (部分重做)
       └→ overridden → chairman_adjusting → mission_complete ✓
```

---

## 二、开放供给层（Open Model Supply Layer）

### 设计原则

```
Model Supply Layer 不是 ClawAPI 的专属层。
它是一个开放的、可插拔的多供应商层。

ClawAPI 是默认供应商（default supplier）——
就像手机出厂预装了系统浏览器，但你可以装 Chrome、Firefox、Safari。

关键区别：
  ❌ "ClawAPI 是唯一的模型来源"
  ✓ "ClawAPI 是开箱即用的默认来源，你可以添加任意多个来源"
```

### 架构表达

```
┌─────────────────────────────────────────────────────────┐
│              Model Supply Layer (开放)                    │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   ClawAPI     │  │  Anthropic   │  │   OpenAI     │   │
│  │  (default)    │  │  (user-added)│  │  (user-added)│   │
│  │  8 models     │  │  direct API  │  │  direct API  │   │
│  │  1 key        │  │              │  │              │   │
│  │  crypto-pay   │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  DeepSeek    │  │ Ollama(local)│  │  + Any       │   │
│  │  (user-added)│  │ (user-added) │  │  OpenAI-     │   │
│  │  cost-code   │  │ zero-cost    │  │  compatible  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│  统一接口: ProviderRegistry                               │
│  任何 OpenAI-compatible endpoint 都可以接入                │
└─────────────────────────────────────────────────────────┘
```

### 为什么是开放的

```
理由 1: 用户可能已经有其他 provider 的 API key 和配额
  → 不应该强迫他们全部走 ClawAPI

理由 2: 某些模型可能 ClawAPI 还没有
  → DeepSeek、Qwen、Mistral 等中国/欧洲模型
  → 新发布的模型还没来得及接入

理由 3: 本地模型零成本
  → Ollama 跑 Qwen3-Coder 做 Worker，完全不花钱
  → 对于在中国的用户特别有价值

理由 4: 企业用户可能有私有部署
  → 内部的 vLLM 或 TGI 服务
  → 只要是 OpenAI-compatible 接口就能接入
```

### ClawAPI 作为 Default Supplier 的优势

虽然层是开放的，但 ClawAPI 仍然有天然优势：

```
1. 一个 key 覆盖所有角色
   → Anthropic key 只能用 Claude
   → OpenAI key 只能用 GPT
   → ClawAPI key 能用 Claude + GPT + Gemini + OSS

2. Crypto-native 支付
   → USDC/USDT，无需信用卡
   → 与 WEB4.0 理念一致

3. 自动 fallback
   → 其中一个底层 provider 挂了，ClawAPI 自动切换
   → 单一 provider 的 key 没有这个保障

4. 统一计费
   → 一个账单看所有模型的用量
   → 不用管理 5 个不同 provider 的账单

5. 中国友好
   → 统一出口，不用翻墙配多个 API
```

### 配置文件中的表达

```jsonc
{
  "providers": [
    // ★ 第一个 = 默认 supplier
    {
      "id": "clawapi",
      "name": "ClawAPI",
      "type": "openai-compatible",
      "baseUrl": "https://clawapi.org/api/v1",
      "apiKey": "${CLAWAPI_KEY}",
      "isDefault": true,      // ← 开箱即用的默认
      "features": {
        "cryptoPayment": true,
        "multiModel": true,
        "autoFallback": true
      }
    },

    // 以下全部是用户自主添加的
    { "id": "anthropic", "type": "anthropic", ... },
    { "id": "openai", "type": "openai", ... },
    { "id": "deepseek", "type": "openai-compatible", ... },
    { "id": "ollama", "type": "openai-compatible", "baseUrl": "http://localhost:11434/v1", ... },
    { "id": "my-vllm", "type": "openai-compatible", "baseUrl": "http://192.168.1.100:8000/v1", ... }
  ]
}
```

### CLI / UI 中的表达

```bash
$ clawcompany provider list

  Providers:
  ┌──────────────┬──────────────────────────────┬──────────┐
  │ Name         │ Endpoint                     │ Status   │
  ├──────────────┼──────────────────────────────┼──────────┤
  │ ClawAPI ★    │ clawapi.org/api/v1           │ default  │
  │ Anthropic    │ api.anthropic.com            │ active   │
  │ DeepSeek     │ api.deepseek.com/v1          │ active   │
  │ Ollama       │ localhost:11434/v1           │ active   │
  └──────────────┴──────────────────────────────┴──────────┘

  ★ = default supplier (used when no specific provider is set for a role)
  Any OpenAI-compatible endpoint can be added with:
    clawcompany provider add --type openai-compatible --url <endpoint>
```

### 文档和 README 中的措辞

```
不要说：
  ❌ "ClawCompany uses ClawAPI"
  ❌ "Powered by ClawAPI"

要说：
  ✓ "ClawAPI is the default model supplier — one key, 8 models, ready to go."
  ✓ "Add Anthropic, OpenAI, DeepSeek, Ollama, or any OpenAI-compatible provider."
  ✓ "Your supply chain, your choice. ClawAPI gets you started in 10 seconds."
```
