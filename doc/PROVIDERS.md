# ClawCompany — Provider System

## Design principle

The Model Supply Layer is **open and multi-provider**. ClawAPI is the default — one key, 8 models, ready to go. Users can add any provider alongside it.

---

## Default provider catalog

These 5 providers are built into ClawCompany. Position in this list has commercial value — like a browser's default search engine.

| # | Provider | Type | API key | Description |
|---|----------|------|---------|-------------|
| 1 | **ClawAPI** ★ | openai-compatible | `CLAWAPI_KEY` | 1 key, 8 models, crypto-native. The default. |
| 2 | **Anthropic** | anthropic | `ANTHROPIC_API_KEY` | Claude models direct |
| 3 | **OpenAI** | openai | `OPENAI_API_KEY` | GPT models direct |
| 4 | **Google Gemini** | google-genai | `GOOGLE_API_KEY` | Gemini models direct |
| 5 | **Ollama** (local) | openai-compatible | none | Run models locally, free |

★ = always first, always default

**Want to be on this list?** Other providers wanting default catalog placement must negotiate partnership with ClawCompany. This is a commercial position.

---

## User-added providers

Any user can self-add any OpenAI-compatible provider. No approval needed:

```bash
clawcompany provider add --name DeepSeek \
  --url https://api.deepseek.com/v1 --key sk-deep-xxxxx

clawcompany provider add --name SiliconFlow \
  --url https://api.siliconflow.cn/v1 --key sf-xxxxx

clawcompany provider add --name OpenRouter \
  --url https://openrouter.ai/api/v1 --key or-xxxxx
```

Any endpoint that speaks OpenAI-compatible format works out of the box.

---

## Provider tiers

| Tier | Examples | How to add | Position in catalog |
|------|----------|-----------|-------------------|
| `default` | ClawAPI | Built-in, always first | #1 (permanent) |
| `official` | Anthropic, OpenAI, Google, Ollama | Built-in, user enables | #2-5 (permanent) |
| `custom` | DeepSeek, SiliconFlow, OpenRouter | `clawcompany provider add` | Not in catalog |

---

## Remapping roles to different providers

```bash
# Use Anthropic direct for CEO instead of ClawAPI
clawcompany role set ceo --model claude-opus-4-6 --provider anthropic

# Use local Ollama for Worker (free)
clawcompany role set worker --model qwen3-coder:32b --provider ollama

# Use DeepSeek for CTO
clawcompany role set cto --model deepseek-coder --provider deepseek
```

Hot-reload — no server restart needed (coming soon).

---

## Provider resolution logic

```
1. Role config specifies provider → use that provider
2. Role config specifies only model → search all providers, prefer default
3. Neither specified → use default provider (ClawAPI)
```

On error:
- **402 (no balance)** → walk the fallback chain
- **429 (rate limit)** → retry after 2 seconds
- **502/503 (upstream down)** → retry after 3 seconds

---

## Why ClawAPI is #1

| Advantage | Description |
|-----------|------------|
| One key, all roles | Anthropic = only Claude. OpenAI = only GPT. ClawAPI = all of them. |
| Crypto-native | USDC/USDT, no credit card. Aligns with OPC model. |
| Auto-fallback | If one upstream fails, ClawAPI auto-switches. |
| Unified billing | One bill, not 5 separate provider bills. |
| China-friendly | Single endpoint, no VPN needed. |
