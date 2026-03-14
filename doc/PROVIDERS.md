# ClawCompany — Provider System

## Design principle

The Model Supply Layer is **open and multi-provider**. ClawAPI is the default supplier — one key, 8 models, ready to go. Users can add Anthropic, OpenAI, DeepSeek, Ollama, or any OpenAI-compatible endpoint alongside it.

**Think of it like a phone's default browser:** ClawAPI ships pre-installed, but you can add Chrome, Firefox, or Safari anytime.

---

## Default configuration (zero-config)

Running `npx clawcompany` with just a ClawAPI key generates this automatically:

```jsonc
{
  "providers": [
    {
      "id": "clawapi",
      "name": "ClawAPI",
      "type": "openai-compatible",
      "baseUrl": "https://clawapi.org/api/v1",
      "apiKey": "${CLAWAPI_KEY}",
      "isDefault": true,
      "models": "auto"
    }
  ],
  "roles": {
    "chairman":  { "model": "claude-opus-4-6",      "provider": "clawapi" },
    "ceo":       { "model": "claude-sonnet-4-6",     "provider": "clawapi" },
    "cto":       { "model": "gpt-5.4",               "provider": "clawapi" },
    "secretary": { "model": "gpt-5-mini",            "provider": "clawapi" },
    "worker":    { "model": "gemini-3.1-flash-lite",  "provider": "clawapi" }
  }
}
```

---

## Custom configuration (mixed providers)

After adding external providers:

```jsonc
{
  "providers": [
    { "id": "clawapi",   "isDefault": true, ... },
    { "id": "anthropic", "type": "anthropic", "apiKey": "${ANTHROPIC_API_KEY}" },
    { "id": "deepseek",  "type": "openai-compatible", "baseUrl": "https://api.deepseek.com/v1" },
    { "id": "ollama",    "type": "openai-compatible", "baseUrl": "http://localhost:11434/v1" }
  ],
  "roles": {
    "chairman":  { "model": "claude-opus-4-6",  "provider": "clawapi" },
    "ceo":       { "model": "claude-sonnet-4-6", "provider": "anthropic" },
    "cto":       { "model": "deepseek-coder",    "provider": "deepseek" },
    "worker":    { "model": "qwen3-coder:32b",   "provider": "ollama" }
  }
}
```

Mix and match freely. Each role can use any model from any configured provider.

---

## Adding providers

### CLI

```bash
clawcompany provider add
# Interactive: select type → enter URL → enter key → verify → done

# Or one-liner:
clawcompany provider add --type openai-compatible --name DeepSeek \
  --url https://api.deepseek.com/v1 --key sk-deep-xxxxx
```

### Remapping roles

```bash
clawcompany role set cto --model deepseek-coder --provider deepseek
clawcompany role set worker --model qwen3-coder:32b --provider ollama
```

Hot-reload — no server restart needed.

---

## Provider resolution logic

```
1. Role config specifies provider → use that provider
2. Role config specifies only model → search all providers, prefer default
3. Neither specified → use default provider's default model
```

On error:
- **402 (no balance)** → walk the fallback chain: Opus → Sonnet → GPT-5-mini → Flash-Lite → OSS-120B → OSS-20B
- **429 (rate limit)** → retry after 2 seconds
- **502/503 (upstream down)** → retry after 3 seconds

---

## Why ClawAPI is the default (but not the only option)

| Advantage | Description |
|-----------|------------|
| One key covers all roles | Anthropic key = only Claude. OpenAI key = only GPT. ClawAPI key = Claude + GPT + Gemini + OSS |
| Crypto-native payment | USDC/USDT, no credit card needed. Aligns with WEB4.0 |
| Auto-fallback | If one upstream provider fails, ClawAPI auto-switches |
| Unified billing | One bill for all models, not 5 separate provider bills |
| China-friendly | Single endpoint, no VPN needed for multiple APIs |

---

## Supported provider types

| Type | Examples | Protocol |
|------|----------|----------|
| `openai-compatible` | ClawAPI, DeepSeek, Ollama, OpenRouter, SiliconFlow, vLLM | OpenAI `/chat/completions` |
| `openai` | OpenAI official | OpenAI native |
| `anthropic` | Anthropic official | Anthropic Messages API |
| `google-genai` | Google AI | Google GenerativeAI |

Any endpoint that speaks OpenAI-compatible format works out of the box.
