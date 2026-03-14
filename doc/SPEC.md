# ClawCompany — Architecture Specification

## Overview

**ClawCompany = Paperclip's company orchestration + built-in agent runtime + deep ClawAPI multi-model routing**

| Dimension | Paperclip | ClawCompany |
|-----------|-----------|-------------|
| Agent source | External (OpenClaw, Codex) | **Built-in runtime** with agent execution engine |
| Model selection | Each agent binds one provider | **Each role binds a different model** via ClawAPI |
| Core positioning | Control plane only | **Control + execution integrated** |
| Cost optimization | Track external agent spend | **Architectural** — tasks cascade to cheaper models |
| Setup barrier | Configure OpenClaw/Codex externally | **Out of the box** — one API key runs the company |
| China-friendly | Requires VPN for multiple APIs | **ClawAPI single endpoint**, works natively |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ClawCompany UI                     │
│              (React + Vite dashboard)                │
│  Org Chart │ Mission Board │ Budget │ Audit Log      │
└───────────────────────┬─────────────────────────────┘
                        │ REST / WebSocket
┌───────────────────────┴─────────────────────────────┐
│               ClawCompany Server                     │
│                (Node.js + Express)                    │
│                                                      │
│  Company Manager │ Task Orchestrator │ Agent Runtime  │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │            Model Router (core)                   │ │
│  │    role → ClawAPI model selection                │ │
│  │    Chairman → Opus | CEO → Sonnet | ...          │ │
│  └──────────────────────┬──────────────────────────┘ │
│                         │                            │
│  Tool System (MCP-compatible)                        │
│  Database (PGlite embedded / Postgres)               │
└──────────────────────────┬──────────────────────────┘
                           │ OpenAI-compatible API
                    ┌──────┴──────┐
                    │   ClawAPI   │  (default, open supply layer)
                    │  + any provider (Anthropic, OpenAI, DeepSeek, Ollama...)
                    └─────────────┘
```

---

## Core modules

### Model Router (key differentiator)

Maps roles to models automatically. The user never chooses a model — they define roles.

```typescript
interface ModelRouter {
  chatAsRole(role: string, messages: Message[]): Promise<ChatResponse>;
  // Automatic system prompt injection
  // Automatic fallback on 402 (no balance)
  // Automatic retry on 429 (rate limit)
}
```

**Three-tier strategy engine:**
- **EARN** (balance > $5) — Chairman/CEO at full power
- **SAVE** ($1 < balance < $5) — Secretary for routine, CEO for important decisions only
- **SURVIVE** (balance < $1) — Worker/Intern keep basic operations running

### Agent Runtime

Built-in execution engine. Think → Act → Observe loop with tool support.

```typescript
interface AgentExecutor {
  execute(role: Role, task: Task): Promise<ExecutionResult>;
  // Supports: filesystem, shell, http, code_interpreter
  // Max 10 turns per task
  // Automatic cost tracking
}
```

### Task Orchestrator

Mission decomposition and lifecycle management.

```typescript
interface TaskOrchestrator {
  decompose(mission: Mission): Promise<WorkStream[]>;
  executeTask(task: Task): Promise<TaskResult>;
  // Chairman decomposes → delegates → collects reports → delivers
}
```

**Task cascade example:**
```
Mission: "Analyze this contract and decide whether to sign"

Worker (OSS-120B):    Extract key clauses, structure data     → $0.001
Secretary (Flash-Lite): Summarize into briefing report        → $0.005
CEO (Sonnet):         Analyze risks and benefits              → $0.05
Chairman (Opus):      Make final decision                     → $0.08
                                                    Total: ~$0.14

If Chairman did everything alone: ~$0.30. Task cascade saves 50%+.
```

---

## Default role mapping

| Role | Model | Cost (in/out per 1M) | Purpose |
|------|-------|---------------------|---------|
| Chairman | `claude-opus-4-6` | $5 / $25 | Strategic decisions, mission decomposition |
| CEO | `claude-sonnet-4-6` | $3 / $15 | Daily management, planning, quality review |
| CTO | `gpt-5.4` | $2.50 / $15 | Technical architecture, coding |
| Secretary | `gpt-5-mini` | $0.25 / $2 | Briefings, summaries, formatting |
| Worker | `gemini-3.1-flash-lite` | $0.25 / $1.50 | Routine tasks, data extraction |
| Fallback A | `gpt-oss-120b` | $0.05 / $0.45 | Low-balance fallback |
| Fallback B | `gpt-oss-20b` | $0.04 / $0.18 | Survival mode |

Every role is fully customizable — rename, swap models, change providers, add custom roles.

---

## Project structure

```
clawcompany/
├── packages/
│   ├── shared/             # Core types, defaults, constants
│   ├── db/                 # Database (PGlite embedded / Postgres)
│   ├── providers/          # Multi-provider abstraction layer
│   ├── model-router/       # Role → model selection + fallback
│   ├── agent-runtime/      # Agent execution engine
│   ├── task-orchestrator/  # Mission decomposition + lifecycle
│   └── tools/              # Built-in tools (shell, http, fs)
├── server/                 # Express API + WebSocket
├── ui/                     # React dashboard
├── cli/                    # CLI tool (npx clawcompany)
├── templates/              # Company templates
└── doc/                    # Documentation
```

---

## Technology choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | Unified frontend/backend, Paperclip ecosystem alignment |
| Package manager | pnpm workspace | Monorepo, modular |
| Server | Express | Simple, proven |
| Database | Drizzle ORM + PGlite | Embedded Postgres, zero config |
| UI | React + Vite + Tailwind | Fast development |
| AI API | OpenAI-compatible | ClawAPI native compatibility |
| Testing | Vitest | Fast, TypeScript native |
| CLI | Commander.js + Inquirer | Interactive onboarding |
