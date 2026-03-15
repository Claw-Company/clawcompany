# ClawCompany — Role System

> Human = Chairman. AI roles execute under human direction.

---

## Role hierarchy

```
Human (Chairman / Board)
    │
    ├── CEO (Opus) ← highest AI role, decomposes missions
    │   ├── CTO (GPT-5.4) ← technical decisions
    │   │   ├── Engineer (GPT-5.4) ← implementation
    │   │   └── Worker ← data collection
    │   ├── CFO (GPT-5-mini) ← financial analysis
    │   │   └── Analyst (GPT-5-mini) ← data analysis
    │   ├── CMO (Sonnet) ← marketing, content
    │   │   └── Researcher (Sonnet) ← deep research
    │   ├── Secretary (Flash-Lite) ← formatting, briefings
    │   └── Worker (Flash-Lite) ← routine tasks
    │
    └── Fallback A/B (OSS models) ← low-balance mode
```

---

## Default role-model mapping

| Tier | Role | Model | Cost (in/out per 1M) | Why this model |
|------|------|-------|---------------------|----------------|
| C-suite | CEO | claude-opus-4-6 | $5 / $25 | Deep strategic thinking |
| C-suite | CTO | gpt-5.4 | $2.50 / $15 | Strong technical reasoning |
| C-suite | CFO | gpt-5-mini | $0.25 / $2 | Reasoning model, step-by-step math |
| C-suite | CMO | claude-sonnet-4-6 | $3 / $15 | Creative, articulate |
| Mid-level | Researcher | claude-sonnet-4-6 | $3 / $15 | Depth + speed balance |
| Mid-level | Analyst | gpt-5-mini | $0.25 / $2 | Reasoning model, pattern detection |
| Mid-level | Engineer | gpt-5.4 | $2.50 / $15 | Strong code generation |
| Mid-level | Secretary | gemini-flash-lite | $0.25 / $1.50 | Fast, cheap text work |
| Operations | Worker | gemini-flash-lite | $0.25 / $1.50 | Cheapest, fastest |
| Fallback | Fallback A | gpt-oss-120b | $0.05 / $0.45 | Low-balance |
| Fallback | Fallback B | gpt-oss-20b | $0.04 / $0.18 | Survival mode |

**4 distinct models** across 9 active roles. Each model assigned to what it does best.

---

## Customization

Builtin roles can be modified (name, model, provider, prompt) but not deleted. Custom roles have no restrictions.

```bash
clawcompany role set cto --model deepseek-coder --provider deepseek
clawcompany role add "Quant Trader" --model claude-sonnet-4-6 --reports-to cto
clawcompany role disable cmo   # disable, not delete
```
