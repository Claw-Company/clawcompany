# ClawCompany

> **Build for OPC (One Person Company). Every human being is a chairman.**
>
> Multiple roles, multiple agents, multiple suppliers.
> Your Claws company, one key to run them all.

ClawCompany is the infrastructure for OPC — One Person Companies powered by AI. You are the Chairman. Your AI team (CEO, CTO, CFO, CMO, Engineers, Researchers, Analysts) executes autonomously. You set the goal — they figure out the rest.

**[Website](https://clawcompany.org)** · **[Docs](doc/)** · **[Example Mission](doc/EXAMPLE-MISSION.md)** · **[ClawAPI](https://clawapi.org)**

---

## The OPC model

You don't need to hire anyone. You don't need to manage anyone. You give your company a mission, and it runs.

```
You (Chairman) → "Write a competitive analysis comparing OpenAI vs Anthropic"
    ↓
CEO (Opus) decomposes into work streams ($0.027):
    → Worker collects data (4s, $0.001)
    → Researcher does deep analysis (47s, $0.026)
    → CMO does market positioning (19s, $0.009)
    → Secretary formats final report (6s, $0.001)
    ↓
You: read the report, approve or revise. Done.
```

**Total: 76 seconds, $0.064.** Your AI company just delivered a professional report.

If you ran the same mission using only Opus? **$1.73.** ClawCompany's multi-model architecture is **27x cheaper**.

→ [See the full example mission with cost breakdown](doc/EXAMPLE-MISSION.md)

---

## Quick start

```bash
npx clawcompany
```

Enter your ClawAPI key → company created → Claws ready to work.

```bash
clawcompany mission "Write a competitive analysis comparing OpenAI vs Anthropic"
```

> **Requirements:** Node.js 20+

---

## Your AI team

One ClawAPI key activates your entire company — 9 roles across 4 models:

| Role | Model | Cost (in/out per 1M) | What they do |
|------|-------|---------------------|--------------|
| **CEO** | `claude-opus-4-6` | $5 / $25 | Decomposes missions, coordinates departments, quality gate |
| **CTO** | `gpt-5.4` | $2.50 / $15 | Technical architecture, code review, system design |
| **CFO** | `gpt-5-mini` | $0.25 / $2 | Financial analysis, budgets, projections (reasoning model) |
| **CMO** | `claude-sonnet-4-6` | $3 / $15 | Marketing strategy, content creation, brand voice |
| **Researcher** | `claude-sonnet-4-6` | $3 / $15 | Deep research, competitive analysis |
| **Analyst** | `gpt-5-mini` | $0.25 / $2 | Data analysis, pattern detection (reasoning model) |
| **Engineer** | `gpt-5.4` | $2.50 / $15 | Code implementation, debugging, testing |
| **Secretary** | `gemini-flash-lite` | $0.25 / $1.50 | Briefings, summaries, formatting |
| **Worker** | `gemini-flash-lite` | $0.25 / $1.50 | Data collection, routine tasks |

**Every role is fully customizable.** Rename, swap models, change providers, add your own roles.

---

## Why multi-model? $0.064 vs $1.73

ClawCompany doesn't use one model for everything. Each role uses the model best suited to its job:

| Step | Role | Model | Cost | If all Opus |
|------|------|-------|------|-------------|
| Decompose mission | CEO | opus | $0.027 | $0.027 |
| Data collection | Worker | flash-lite | $0.001 | ~$0.40 |
| Deep analysis | Researcher | sonnet | $0.026 | ~$0.45 |
| Market positioning | CMO | sonnet | $0.009 | ~$0.45 |
| Report formatting | Secretary | flash-lite | $0.001 | ~$0.40 |
| **Total** | | | **$0.064** | **$1.73** |

**96% cheaper. 27x less cost.** Routine work (data collection, formatting) goes to flash-lite at $0.001 per call instead of Opus at $0.40+. The quality is identical because these tasks don't need deep reasoning.

At scale:

| Missions/day | ClawCompany | All-Opus | Monthly savings |
|---|---|---|---|
| 10 | $0.64/day | $17.30/day | **$499/month** |
| 100 | $6.40/day | $173/day | **$4,998/month** |
| 1,000 | $64/day | $1,730/day | **$49,980/month** |

---

## How it works

```
You (Chairman / Board of Directors)
         │
         │ gives mission
         ▼
   ┌─────────────┐
   │     CEO     │  ← Opus: decomposes, coordinates, delivers
   └──────┬──────┘
          │ delegates to department heads
    ┌─────┴──────────────────────────┐
    ▼          ▼         ▼           ▼
┌──────┐  ┌──────┐  ┌──────┐  ┌────────────┐
│ CTO  │  │ CFO  │  │ CMO  │  │ Researcher │
│(5.4) │  │(mini)│  │(Son.)│  │ (Sonnet)   │
└──┬───┘  └──┬───┘  └──────┘  └────────────┘
   ▼         ▼
┌──────┐  ┌───────┐
│ Eng. │  │Analyst│
│(5.4) │  │(mini) │
└──────┘  └───────┘
         ↓ results flow up
   ┌─────────────┐
   │     CEO     │  ← Reviews, integrates, delivers to you
   └──────┬──────┘
          ▼
      You: "Approved" ✓
```

---

## Open model supply layer

ClawCompany is **not** locked to ClawAPI. The model supply layer is fully open:

```
ClawAPI ★    Anthropic    OpenAI    DeepSeek    Ollama    + Any OpenAI-compat
(default)    (optional)   (optional) (optional)  (local)
```

★ = default supplier: 1 key, 8 models, crypto-native

```bash
clawcompany role set cto --model deepseek-coder --provider deepseek
clawcompany provider add --type openai-compatible --name DeepSeek \
  --url https://api.deepseek.com/v1 --key sk-deep-xxxxx
```

---

## Company templates

| Template | Roles | Best for |
|----------|-------|----------|
| **Default** | Full team (9 roles) | General purpose |
| **Trading Desk** | + Trader + Data Collector | Crypto / DeFi |
| **Content Agency** | + Writer + Editor + SEO | Content production |
| **Dev Shop** | + QA + DevOps | Software development |
| **Solo Founder** | CEO + Worker only | Maximum efficiency |

---

## Why ClawCompany?

| | Single agent (OpenClaw) | Orchestrator (Paperclip) | **ClawCompany** |
|---|---|---|---|
| For whom | Developers | Technical users | **Everyone** |
| Agent source | One agent | External agents | **Built-in team** |
| Model strategy | One model | Agent brings own | **Right model per role** |
| Setup | npm install + config JSON | Docker + Postgres | **npx + 1 key** |
| Human role | Every step | Configure + monitor | **Set goal only** |
| Cost per mission | $0.40-$0.50 (single Opus) | Varies | **$0.06 (multi-model)** |

---

## Development

```bash
git clone https://github.com/Claw-Company/clawcompany.git
cd clawcompany
pnpm install
pnpm dev
```

API runs at `http://localhost:3200`.

---

## License

MIT © 2026 ClawCompany

---

<p align="center">
  <strong>Build for OPC. Every human being is a chairman.</strong><br>
  <em>Your Claws company, one key to run them all.</em>
</p>
