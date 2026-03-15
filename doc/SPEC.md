# ClawCompany — Architecture Specification

> Infrastructure for OPC (One Person Company). Human = Chairman. AI team executes.

---

## Architecture

```
Human (Chairman)
    │ REST / CLI / Dashboard
┌───┴───────────────────────────────────┐
│         ClawCompany Server             │
│                                        │
│  TaskOrchestrator │ AgentRuntime       │
│  ModelRouter      │ ToolSystem         │
│  Database (PGlite)                     │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │   Model Router (core)            │  │
│  │   CEO → Opus | CTO → GPT-5.4    │  │
│  │   CFO → GPT-5-mini | CMO → Son. │  │
│  └──────────────┬───────────────────┘  │
└─────────────────┼──────────────────────┘
                  │ OpenAI-compatible API
           ┌──────┴──────┐
           │   ClawAPI   │  + any provider
           └─────────────┘
```

---

## Default team (9 AI roles, 4 models)

| Role | Model | Purpose |
|------|-------|---------|
| CEO | claude-opus-4-6 | Mission decomposition, coordination |
| CTO | gpt-5.4 | Technical architecture, code review |
| CFO | gpt-5-mini | Financial analysis (reasoning model) |
| CMO | claude-sonnet-4-6 | Marketing, content strategy |
| Researcher | claude-sonnet-4-6 | Deep research |
| Analyst | gpt-5-mini | Data analysis (reasoning model) |
| Engineer | gpt-5.4 | Code implementation |
| Secretary | gemini-flash-lite | Formatting, briefings |
| Worker | gemini-flash-lite | Data collection, routine tasks |

---

## Task cascade (cost optimization)

```
Mission: "Analyze this contract and decide whether to sign"

Worker (Flash-Lite):   Extract key clauses      → $0.001
Analyst (GPT-5-mini):  Financial risk analysis   → $0.003
CTO (GPT-5.4):        Technical risk assessment → $0.012
CFO (GPT-5-mini):     Cost-benefit analysis     → $0.003
CEO (Opus):           Final recommendation      → $0.015
                                         Total: ~$0.034
```

Grunt work cascades to cheap models. CEO only does what only it can do.

---

## Project structure

```
clawcompany/
├── packages/
│   ├── shared/             # Core types, defaults, constants
│   ├── db/                 # Database (PGlite / Postgres)
│   ├── providers/          # Multi-provider abstraction
│   ├── model-router/       # Role → model selection + fallback
│   ├── agent-runtime/      # Agent execution engine
│   ├── task-orchestrator/  # Mission decomposition + lifecycle
│   └── tools/              # Built-in tools
├── server/                 # Express API
├── ui/                     # React dashboard (PWA)
├── cli/                    # CLI tool (npx clawcompany)
└── templates/              # Company templates
```
