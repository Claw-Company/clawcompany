# ClawCompany

> **Build for OPC (One Person Company). Every human being is a chairman.**
>
> Multiple roles, multiple agents, multiple suppliers.
> Your Claws company, one key to run them all.

ClawCompany is the infrastructure for OPC — One Person Companies powered by AI. You are the Chairman. Your AI team (CEO, CTO, CFO, CMO, Engineers, Researchers, Analysts) executes autonomously. You set the goal — they figure out the rest.

**[Website](https://clawcompany.org)** · **[Docs](doc/)** · **[ClawAPI](https://clawapi.org)**

---

## The OPC model

You don't need to hire anyone. You don't need to manage anyone. You give your company a mission, and it runs.

```
You (Chairman) → "Analyze the DeFi market and write an investment report"
    ↓
CEO (Opus) decomposes into work streams:
    → Worker collects data (3s, $0.001)
    → CTO does technical analysis (15s, $0.012)
    → Researcher does market analysis (20s, $0.017)
    → Secretary formats final report (5s, $0.001)
    ↓
You: read the report, approve or revise. Done.
```

**Total: 43 seconds, $0.031.** Your AI company just delivered a professional report.

---

## Quick start

```bash
npx clawcompany
```

Enter your ClawAPI key → company created → Claws ready to work.

```bash
clawcompany mission "Analyze the top 10 DeFi protocols and write an investment report"
```

> **Requirements:** Node.js 20+

---

## Your AI team

One ClawAPI key activates your entire company:

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
# Swap any role's model
clawcompany role set cto --model deepseek-coder --provider deepseek

# Add another supplier
clawcompany provider add --type openai-compatible --name DeepSeek \
  --url https://api.deepseek.com/v1 --key sk-deep-xxxxx
```

---

## Company templates

| Template | Roles | Best for |
|----------|-------|----------|
| **Default** | CEO + CTO + CFO + CMO + Researcher + Analyst + Engineer + Secretary + Worker | General purpose |
| **Trading Desk** | + Trader + Data Collector | Crypto / DeFi |
| **Content Agency** | + Writer + Editor + SEO | Content production |
| **Dev Shop** | + QA + DevOps | Software development |
| **Solo Founder** | CEO + Worker only | Maximum efficiency |

---

## Why ClawCompany?

| | Single agent (OpenClaw) | Orchestrator (Paperclip) | **ClawCompany** |
|---|---|---|---|
| Agent source | One agent | External agents | **Built-in** |
| Model strategy | One model | Agent brings own | **Right model per role** |
| Setup | Configure agent | Configure many agents | **One key, done** |
| For whom | Developers | Technical users | **Everyone** |
| Human role | Every step | Configure + monitor | **Set goal only** |

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
