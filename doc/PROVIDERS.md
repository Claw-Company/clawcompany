# ClawCompany Provider System — 多 Provider 架构设计

## 一、配置文件设计

### 1.1 默认配置（开箱即用，零配置）

运行 `npx clawcompany init` 时，只需输入 ClawAPI key，系统自动生成以下配置：

```jsonc
// ~/.clawcompany/config.json
{
  "version": "1.0",

  // ========== Provider 列表 ==========
  // 第一个 provider 是默认的，类似 OpenClaw 的设计
  "providers": [
    {
      "id": "clawapi",
      "name": "ClawAPI",
      "type": "openai-compatible",
      "baseUrl": "https://clawapi.org/api/v1",
      "apiKey": "${CLAWAPI_KEY}",        // 引用 .env
      "isDefault": true,
      "models": "auto"                    // 自动从 /models 端点拉取
    }
  ],

  // ========== 角色 → 模型映射 ==========
  "roles": {
    "chairman": {
      "model": "claude-opus-4-6",
      "provider": "clawapi",             // 可省略，默认用 default provider
      "description": "Strategic decisions, high-value tasks",
      "budgetTier": "earn"
    },
    "ceo": {
      "model": "claude-sonnet-4-6",
      "provider": "clawapi",
      "description": "Daily management, planning, quality work",
      "budgetTier": "earn"
    },
    "cto": {
      "model": "gpt-5.4",
      "provider": "clawapi",
      "description": "Technical architecture, coding, debugging",
      "budgetTier": "earn"
    },
    "researcher": {
      "model": "gemini-3.1-pro",
      "provider": "clawapi",
      "description": "Deep research, data analysis, 1M context",
      "budgetTier": "save"
    },
    "secretary": {
      "model": "gpt-5-mini",
      "provider": "clawapi",
      "description": "Summaries, translations, everyday tasks",
      "budgetTier": "save"
    },
    "worker": {
      "model": "gemini-3.1-flash-lite",
      "provider": "clawapi",
      "description": "Fast routine tasks, formatting, extraction",
      "budgetTier": "save"
    },
    "fallback_a": {
      "model": "gpt-oss-120b",
      "provider": "clawapi",
      "description": "Low-balance fallback, bulk processing",
      "budgetTier": "survive"
    },
    "fallback_b": {
      "model": "gpt-oss-20b",
      "provider": "clawapi",
      "description": "Minimum cost, classification, tagging",
      "budgetTier": "survive"
    }
  },

  // ========== 降级链（余额不足时自动切换）==========
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

### 1.2 用户自定义配置（混合多 Provider）

用户通过 CLI 或 UI 添加外部 provider 后：

```jsonc
// ~/.clawcompany/config.json （用户自定义后）
{
  "version": "1.0",

  "providers": [
    // ★ ClawAPI 始终是第一个（默认）
    {
      "id": "clawapi",
      "name": "ClawAPI",
      "type": "openai-compatible",
      "baseUrl": "https://clawapi.org/api/v1",
      "apiKey": "${CLAWAPI_KEY}",
      "isDefault": true,
      "models": "auto"
    },

    // 用户添加的 Anthropic 直连
    {
      "id": "anthropic",
      "name": "Anthropic",
      "type": "anthropic",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "models": [
        "claude-opus-4-6",
        "claude-sonnet-4-6",
        "claude-haiku-4-5"
      ]
    },

    // 用户添加的 DeepSeek
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "type": "openai-compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "${DEEPSEEK_API_KEY}",
      "models": [
        "deepseek-chat",
        "deepseek-coder",
        "deepseek-reasoner"
      ]
    },

    // 用户添加的本地 Ollama
    {
      "id": "ollama",
      "name": "Ollama (Local)",
      "type": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "models": "auto"    // 自动发现本地模型
    },

    // 用户添加的 OpenAI
    {
      "id": "openai",
      "name": "OpenAI",
      "type": "openai",
      "apiKey": "${OPENAI_API_KEY}",
      "models": "auto"
    },

    // 用户添加的 Google
    {
      "id": "google",
      "name": "Google AI",
      "type": "google-genai",
      "apiKey": "${GOOGLE_API_KEY}",
      "models": "auto"
    }
  ],

  "roles": {
    // ★ 用户改了 CTO 用 DeepSeek Coder
    "cto": {
      "model": "deepseek-coder",
      "provider": "deepseek",
      "description": "Technical architecture, coding",
      "budgetTier": "earn"
    },

    // ★ 用户改了 Worker 用本地 Ollama
    "worker": {
      "model": "qwen3-coder:32b",
      "provider": "ollama",
      "description": "Local model, zero API cost",
      "budgetTier": "save"
    },

    // ★ 其他角色保持 ClawAPI 默认
    "chairman": {
      "model": "claude-opus-4-6",
      "provider": "clawapi"
    },
    "ceo": {
      "model": "claude-sonnet-4-6",
      "provider": "clawapi"
    },
    // ...
  }
}
```

### 1.3 环境变量文件

```bash
# ~/.clawcompany/.env

# ★ 必填：ClawAPI (默认 provider)
CLAWAPI_KEY=sk-claw-your_key_here

# 可选：用户添加的其他 provider
ANTHROPIC_API_KEY=sk-ant-xxxxx
DEEPSEEK_API_KEY=sk-deep-xxxxx
OPENAI_API_KEY=sk-xxxxx
GOOGLE_API_KEY=AIzaSy-xxxxx
```

---

## 二、CLI 交互流程

### 2.1 首次安装 `npx clawcompany init`

```
🏢 Welcome to ClawCompany — Build your AI company

Step 1/3: API Configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━

? Enter your ClawAPI key: sk-claw-a1b2c3d4e5f6...
  ✓ Key verified. Balance: $12.50
  ✓ 8 models available via ClawAPI

  Default role mapping:
  ┌──────────────┬──────────────────────┬──────────────┐
  │ Role         │ Model                │ Cost (in/out)│
  ├──────────────┼──────────────────────┼──────────────┤
  │ Chairman     │ claude-opus-4-6      │ $5 / $25     │
  │ CEO          │ claude-sonnet-4-6    │ $3 / $15     │
  │ CTO          │ gpt-5.4              │ $2.50 / $15  │
  │ Researcher   │ gemini-3.1-pro       │ $2 / $12     │
  │ Secretary    │ gpt-5-mini           │ $0.25 / $2   │
  │ Worker       │ gemini-3.1-flash-lite│ $0.25 / $1.50│
  │ Fallback A   │ gpt-oss-120b         │ $0.05 / $0.45│
  │ Fallback B   │ gpt-oss-20b          │ $0.04 / $0.18│
  └──────────────┴──────────────────────┴──────────────┘

? Add another API provider? (you can do this later)
  ❯ No, use ClawAPI for everything (recommended)
    Yes, add Anthropic
    Yes, add OpenAI
    Yes, add DeepSeek
    Yes, add Google AI
    Yes, add Ollama (local)
    Yes, add custom OpenAI-compatible

Step 2/3: Company Setup
━━━━━━━━━━━━━━━━━━━━━━

? Company name: My AI Startup
? Company mission: Build the best DeFi analytics platform

? Choose a template:
  ❯ Default (Chairman + CEO + CTO + Worker)
    Trading Desk (Researcher-heavy, real-time data focus)
    Content Agency (Writer + Editor + SEO specialist)
    Dev Shop (CTO + 3 Engineers + QA)
    Custom (build your own org chart)

Step 3/3: Ready!
━━━━━━━━━━━━━━━

  ✓ Company "My AI Startup" created
  ✓ 4 agents hired (Chairman, CEO, CTO, Worker)
  ✓ Server running at http://localhost:3200
  ✓ Dashboard: http://localhost:3200/dashboard

  Try: clawcompany task "Research top DeFi protocols by TVL"
```

### 2.2 后续添加 Provider `clawcompany provider add`

```
$ clawcompany provider add

? Select provider type:
  ❯ Anthropic
    OpenAI
    DeepSeek
    Google AI
    Ollama (local)
    SiliconFlow
    OpenRouter
    Custom (OpenAI-compatible endpoint)

? Enter your Anthropic API key: sk-ant-xxxxx
  ✓ Key verified. Models available:
    claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5

  ✓ Provider "Anthropic" added

? Remap any roles to use this provider?
  ❯ No, keep current mapping
    Yes, remap roles now

# 如果选 Yes:
? Which role to remap?
  ❯ CEO (currently: claude-sonnet-4-6 via ClawAPI)

? Select model for CEO:
  ❯ claude-sonnet-4-6 (via Anthropic)
    claude-opus-4-6 (via Anthropic)
    claude-haiku-4-5 (via Anthropic)

  ✓ CEO remapped: claude-sonnet-4-6 via Anthropic (direct)
```

### 2.3 修改角色模型 `clawcompany role set`

```bash
# 直接命令行改
$ clawcompany role set cto --model deepseek-coder --provider deepseek
  ✓ CTO remapped: deepseek-coder via DeepSeek

# 查看当前映射
$ clawcompany role list
  ┌──────────────┬──────────────────────┬──────────────┐
  │ Role         │ Model                │ Provider     │
  ├──────────────┼──────────────────────┼──────────────┤
  │ Chairman     │ claude-opus-4-6      │ ClawAPI      │
  │ CEO          │ claude-sonnet-4-6    │ Anthropic    │
  │ CTO          │ deepseek-coder       │ DeepSeek     │
  │ Worker       │ qwen3-coder:32b      │ Ollama       │
  │ ...          │                      │              │
  └──────────────┴──────────────────────┴──────────────┘

# 重置为默认
$ clawcompany role reset --all
  ✓ All roles reset to ClawAPI defaults
```

---

## 三、Provider System 代码架构

```typescript
// packages/providers/src/types.ts

// ========== Provider 接口 ==========
interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey: string;
  isDefault?: boolean;
  models: string[] | 'auto';
}

type ProviderType =
  | 'openai-compatible'   // ClawAPI, DeepSeek, Ollama, OpenRouter, SiliconFlow
  | 'openai'              // OpenAI 官方
  | 'anthropic'           // Anthropic 官方
  | 'google-genai';       // Google AI

// ========== Provider 抽象层 ==========
interface LLMProvider {
  id: string;
  name: string;

  // 列出可用模型
  listModels(): Promise<ModelInfo[]>;

  // 统一的 chat 接口
  chat(params: ChatParams): Promise<ChatResponse>;

  // 检查连通性和余额
  healthCheck(): Promise<HealthStatus>;
}

interface ChatParams {
  model: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;           // 自动计算
  };
  toolCalls?: ToolCall[];
}
```

```typescript
// packages/providers/src/registry.ts

// ========== Provider 注册中心 ==========
class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string;

  // 从 config.json 加载所有 provider
  async loadFromConfig(config: Config): Promise<void> {
    for (const provConfig of config.providers) {
      const provider = this.createProvider(provConfig);
      await provider.healthCheck();
      this.providers.set(provConfig.id, provider);

      if (provConfig.isDefault) {
        this.defaultProvider = provConfig.id;
      }
    }
  }

  // 工厂方法：根据 type 创建对应的 provider
  private createProvider(config: ProviderConfig): LLMProvider {
    switch (config.type) {
      case 'openai-compatible':
        return new OpenAICompatibleProvider(config);  // ClawAPI, DeepSeek, Ollama 都走这个
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'google-genai':
        return new GoogleProvider(config);
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }

  // 获取指定 provider
  get(id: string): LLMProvider {
    return this.providers.get(id) ?? this.providers.get(this.defaultProvider)!;
  }

  // 列出所有已配置的 provider
  list(): ProviderInfo[] { ... }

  // 添加新 provider（热加载，不需重启）
  async add(config: ProviderConfig): Promise<void> { ... }

  // 删除 provider
  remove(id: string): void { ... }
}
```

```typescript
// packages/providers/src/openai-compatible.ts

// ========== OpenAI-Compatible Provider ==========
// ClawAPI, DeepSeek, Ollama, OpenRouter, SiliconFlow 都走这个
class OpenAICompatibleProvider implements LLMProvider {
  constructor(private config: ProviderConfig) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        tools: params.tools,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: params.stream,
      }),
    });

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      model: params.model,
      provider: this.config.id,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        cost: this.calculateCost(params.model, data.usage),
      },
      toolCalls: data.choices[0].message.tool_calls,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    if (this.config.models === 'auto') {
      const resp = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
      });
      const data = await resp.json();
      return data.data.map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: this.config.id,
      }));
    }
    return this.config.models.map(id => ({
      id, name: id, provider: this.config.id,
    }));
  }
}
```

```typescript
// packages/model-router/src/router.ts

// ========== Model Router ==========
// 核心：角色 → Provider + Model 的映射和调度
class ModelRouter {
  constructor(
    private registry: ProviderRegistry,
    private config: Config,
  ) {}

  // 给一个角色发消息
  async chatAsRole(role: AgentRole, messages: Message[], tools?: Tool[]): Promise<ChatResponse> {
    const roleConfig = this.config.roles[role];
    const providerId = roleConfig.provider ?? this.config.providers[0].id;
    const provider = this.registry.get(providerId);

    try {
      return await provider.chat({
        model: roleConfig.model,
        messages,
        tools,
      });
    } catch (error) {
      // 402 余额不足 → 自动降级
      if (error.status === 402) {
        return this.fallback(role, messages, tools);
      }
      // 429 限流 → 重试
      if (error.status === 429) {
        await sleep(2000);
        return provider.chat({ model: roleConfig.model, messages, tools });
      }
      throw error;
    }
  }

  // 降级链：按 fallbackChain 依次尝试
  private async fallback(
    role: AgentRole,
    messages: Message[],
    tools?: Tool[],
  ): Promise<ChatResponse> {
    for (const modelId of this.config.fallbackChain) {
      // 找到提供这个模型的 provider
      const provider = this.findProviderForModel(modelId);
      if (!provider) continue;

      try {
        const result = await provider.chat({ model: modelId, messages, tools });
        console.log(`[ModelRouter] ${role} fell back to ${modelId}`);
        return result;
      } catch {
        continue; // 下一个
      }
    }
    throw new Error('All models exhausted. Please top up at clawapi.org');
  }

  // 查找哪个 provider 提供某个模型
  private findProviderForModel(modelId: string): LLMProvider | null {
    for (const [id, provider] of this.registry.entries()) {
      // 检查 provider 的模型列表
      if (provider.hasModel(modelId)) return provider;
    }
    return null;
  }

  // 动态切换角色的模型（不需要重启）
  setRoleModel(role: AgentRole, model: string, provider?: string): void {
    this.config.roles[role] = {
      ...this.config.roles[role],
      model,
      provider: provider ?? this.config.roles[role].provider,
    };
    this.saveConfig();
  }

  // 重置所有角色为 ClawAPI 默认
  resetToDefaults(): void {
    this.config.roles = getDefaultRoleMapping();
    this.saveConfig();
  }
}
```

---

## 四、Provider 优先级和解析规则

```
解析顺序：

1. 角色配置中指定了 provider
   → roles.cto.provider = "deepseek"
   → 直接用 DeepSeek

2. 角色配置未指定 provider，但指定了 model
   → roles.cto.model = "deepseek-coder" (无 provider 字段)
   → 遍历所有 provider，找到第一个有 deepseek-coder 的
   → 如果多个 provider 都有，用 default provider（ClawAPI）优先

3. 都没指定
   → 用 default provider 的默认模型
```

```typescript
// 解析逻辑
function resolveModelForRole(
  role: AgentRole,
  config: Config,
  registry: ProviderRegistry,
): { provider: LLMProvider; model: string } {

  const roleConfig = config.roles[role];

  // Case 1: 明确指定了 provider
  if (roleConfig.provider) {
    return {
      provider: registry.get(roleConfig.provider),
      model: roleConfig.model,
    };
  }

  // Case 2: 只指定了 model，自动匹配 provider
  // 优先 default provider
  const defaultProv = registry.getDefault();
  if (defaultProv.hasModel(roleConfig.model)) {
    return { provider: defaultProv, model: roleConfig.model };
  }

  // 遍历其他 provider
  for (const prov of registry.list()) {
    if (prov.hasModel(roleConfig.model)) {
      return { provider: prov, model: roleConfig.model };
    }
  }

  throw new Error(`Model ${roleConfig.model} not found in any provider`);
}
```

---

## 五、与 OpenClaw 配置的对比和兼容

### OpenClaw 的 Provider 配置方式：

```jsonc
// openclaw.json
{
  "models": {
    "providers": {
      "clawapi": {
        "baseUrl": "https://clawapi.org/api/v1",
        "apiKey": "${CLAWAPI_KEY}",
        "models": [...]
      },
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

### ClawCompany 的设计思路：

```
OpenClaw: providers → 模型列表 → 用户手动选模型
          (平坦结构，每次切模型要改配置)

ClawCompany: providers → roles → 自动路由
             (层级结构，角色绑模型，自动降级)

关键区别：
- OpenClaw 是 "哪个模型" → 你用哪个模型
- ClawCompany 是 "哪个角色" → 系统自动选模型
```

### 兼容性设计

ClawCompany 可以读取 OpenClaw 的 provider 配置并导入：

```bash
$ clawcompany import-providers --from-openclaw
  ✓ Found OpenClaw config at ~/.openclaw/openclaw.json
  ✓ Imported 2 providers: clawapi, anthropic
  ✓ Imported 10 models
  ? Map imported models to roles? (Y/n)
```

---

## 六、默认角色调整说明

根据你的最新想法，更新后的默认映射：

```
角色         模型                    定位
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Chairman     claude-opus-4-6         最终决策，战略思考
CEO          claude-sonnet-4-6       日常管理，规划，高质量输出
CTO          gpt-5.4                 技术架构，编码，agent 协调
Secretary    gpt-5-mini              董事长秘书，整理简报，快速任务
Worker       gemini-3.1-flash-lite   日常执行，翻译，格式化
Fallback A   gpt-oss-120b            余额低时的备选
Fallback B   gpt-oss-20b             最低成本维持运转
```

变化说明：
- **Secretary 改为 gpt-5-mini**：作为董事长的直属秘书，负责为 Chairman 整理信息、准备简报，400K 上下文适合处理长文档，$0.25/$2 的价格很划算
- **Worker 改为 gemini-flash-lite**：纯执行角色，做翻译、格式化、数据提取等日常工作，速度快成本低
- **去掉 Researcher 和 Analyst**：简化默认组织，用户可以通过模板（如 Research Lab）或手动添加
- **保留两个 Fallback 层级**：OSS-120B 质量还行，OSS-20B 是最低成本兜底

这个精简后的默认组织只有 5 个活跃角色 + 2 个 fallback，更容易理解，用户一眼就知道谁干什么。
