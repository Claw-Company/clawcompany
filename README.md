# ClawCompany

> **Build for WEB4.0, Claws Autonomous.**
>
> The only thing humans need to do is tell the Claws what goal to achieve.

ClawCompany turns one API key into a full autonomous AI company. Chairman thinks. CEO plans. CTO codes. Workers hustle. You set the goal — they figure out the rest.

**[Website](https://clawcompany.org)** · **[Docs](doc/)** · **[Discord](#)** · **[ClawAPI](https://clawapi.org)**

---

## What is WEB4.0?

| Era | Capability | Human role |
|-----|-----------|------------|
| WEB 1.0 | Read | Everything |
| WEB 2.0 | Read + Write | Everything (platforms profit) |
| WEB 3.0 | Read + Write + Own | Most of the work |
| **WEB 4.0** | **Read + Write + Own + Delegate** | **Set the goal** |

In WEB4.0, you own an AI company that runs autonomously. You're the board of directors. Claws are your team.

---

## Quick start

```bash
npx clawcompany init
```

Enter your ClawAPI key → company created → Claws ready to work.

```bash
clawcompany mission "Analyze the top 10 DeFi protocols and write an investment report"
```

That's it. The Chairman decomposes the mission, delegates to the team, collects reports, and delivers the result. You approve, revise, or override.

> **Requirements:** Node.js 20+, pnpm 9.15+

---

## How it works

```
Human: "Build a DeFi analytics dashboard"
         │
         ▼
   ┌─────────────┐
   │  Chairman    │  ← Opus: decomposes mission into work streams
   │  (Opus)      │
   └──────┬──────┘
          │ delegates
    ┌─────┴──────┐
    ▼            ▼
┌────────┐  ┌──────────┐
│  CEO   │  │Secretary │  ← Sonnet: plans + coordinates | GPT-5 mini: briefings
│(Sonnet)│  │(GPT-5mi) │
└───┬────┘  └──────────┘
    │ delegates
  ┌─┴──┐
  ▼    ▼
┌────┐┌──────┐
│CTO ││Worker│  ← GPT-5.4: codes | Flash-Lite: data extraction
│(5.4)││(Lite)│
└────┘└──────┘
         │
         ▼ results flow back up
   ┌─────────────┐
   │  Chairman    │  ← Reviews, decides, delivers to human
   └──────┬──────┘
          │
          ▼
      Human: "Approved" ✓
```

### The 6-phase mission lifecycle

1. **Mission in** — Human states the goal
2. **Decompose** — Chairman breaks it into work streams
3. **Delegate** — Work streams assigned to the right roles
4. **Execute** — Agents work autonomously (with internal sub-delegation)
5. **Report up** — Results flow back through the chain, reviewed at each level
6. **Deliver** — Chairman presents final result to the human for approval

---

## Default team

One ClawAPI key activates your entire company:

| Role | Model | Cost (in/out per 1M) | What they do |
|------|-------|---------------------|--------------|
| Chairman | `claude-opus-4-6` | $5 / $25 | Strategic decisions, mission decomposition |
| CEO | `claude-sonnet-4-6` | $3 / $15 | Daily management, planning, quality review |
| CTO | `gpt-5.4` | $2.50 / $15 | Technical architecture, coding |
| Secretary | `gpt-5-mini` | $0.25 / $2 | Briefings, summaries, formatting |
| Worker | `gemini-3.1-flash-lite` | $0.25 / $1.50 | Routine tasks, data extraction |
| Fallback A | `gpt-oss-120b` | $0.05 / $0.45 | Low-balance mode |
| Fallback B | `gpt-oss-20b` | $0.04 / $0.18 | Survival mode |

**Every role is fully customizable.** Rename, swap models, change providers, add your own roles.

---

## Customize everything

### Swap a model

```bash
clawcompany role set cto --model deepseek-coder --provider deepseek
```

### Add a custom role

```bash
clawcompany role add "Quant Trader" \
  --model claude-sonnet-4-6 \
  --reports-to cto \
  --tools http,shell,code_interpreter
```

### Add another model supplier

```bash
clawcompany provider add --type openai-compatible --name DeepSeek \
  --url https://api.deepseek.com/v1 --key sk-deep-xxxxx
```

ClawAPI is the default supplier — one key, 8 models, ready to go. Add Anthropic, OpenAI, DeepSeek, Ollama, or any OpenAI-compatible provider alongside it.

---

## Open model supply layer

ClawCompany is **not** locked to ClawAPI. The model supply layer is fully open:

```
┌─────────────────────────────────────────────────┐
│           Model Supply Layer (open)              │
│                                                  │
│  ClawAPI ★    Anthropic    OpenAI    DeepSeek    │
│  (default)    (optional)   (optional) (optional) │
│                                                  │
│  Ollama       SiliconFlow  vLLM     + Any        │
│  (local)      (optional)   (self)   OpenAI-compat│
└─────────────────────────────────────────────────┘
★ = default supplier: 1 key, 8 models, crypto-native
```

Your supply chain, your choice. ClawAPI gets you started in 10 seconds.

---

## Architecture

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

## Company templates

Start with a pre-built org or build your own:

| Template | Roles | Best for |
|----------|-------|----------|
| **Default** | Chairman + CEO + CTO + Secretary + Worker | General purpose |
| **Trading Desk** | + Analyst + Trader + Data Collector | Crypto / DeFi |
| **Content Agency** | + Writer + Editor + SEO Specialist | Content production |
| **Dev Shop** | + 3 Engineers + QA + DevOps | Software development |
| **Solo Founder** | CEO + Worker only | Maximum efficiency |

```bash
clawcompany init --template trading-desk
```

---

## Why ClawCompany?

| | Single agent (OpenClaw, Claude Code) | Orchestrator (Paperclip) | **ClawCompany** |
|---|---|---|---|
| Agent source | One agent | External agents | **Built-in + external** |
| Model strategy | One model for everything | Each agent brings its own | **Right model per role** |
| Setup | Configure one agent | Configure many agents | **One key, done** |
| Cost optimization | Manual | Track external costs | **Architectural — tasks cascade to cheap models** |
| Human involvement | Every step | Configure + monitor | **Set goal only** |

---

## Development

```bash
git clone https://github.com/Claw-Company/clawcompany.git
cd clawcompany
pnpm install
pnpm dev
```

API runs at `http://localhost:3200`.

```bash
pnpm dev          # Start API server (watch mode)
pnpm build        # Build all packages
pnpm typecheck    # Type checking
pnpm test         # Run tests
```

See [doc/DEVELOPING.md](doc/DEVELOPING.md) for the full development guide.

---

## Roadmap

- ⚪ Interactive onboarding wizard
- ⚪ Dashboard UI with org chart, mission board, cost analytics
- ⚪ Heartbeat scheduling (agents wake on a timer)
- ⚪ MCP bridge (connect external tool servers)
- ⚪ Company template marketplace
- ⚪ Mobile-friendly dashboard
- ⚪ Multi-company support

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Community

- **Website** — [clawcompany.org](https://clawcompany.org)
- **GitHub Issues** — Bugs and feature requests
- **Discord** — Join the community

---

## License

MIT © 2026 ClawCompany

---

<p align="center">
  <strong>Build for WEB4.0, Claws Autonomous.</strong><br>
  <em>Set goals, not prompts.</em>
</p>
