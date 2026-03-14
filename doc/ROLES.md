# ClawCompany — Role System

## Design philosophy

```
Three degrees of freedom:
1. Model freedom  — any role can bind any model from any provider
2. Role freedom   — add/remove/edit roles, custom names and descriptions
3. Org freedom    — reporting lines freely adjustable: flat, hierarchical, or matrix
```

The only constraint: at least one role must exist. An empty company has no meaning.

---

## Builtin roles vs custom roles

### Builtin roles (pre-configured)

Created automatically on `npx clawcompany`. Users can modify everything except the `id` and `isBuiltin` flag. Builtin roles can be **disabled** but not **deleted** (prevents accidental fallback loss).

| Role | Model | Reports to | Tier | Purpose |
|------|-------|-----------|------|---------|
| Chairman | claude-opus-4-6 | — | earn | Strategic decisions, mission decomposition |
| CEO | claude-sonnet-4-6 | Chairman | earn | Daily management, planning, coordination |
| CTO | gpt-5.4 | CEO | earn | Technical architecture, coding, debugging |
| Secretary | gpt-5-mini | Chairman | save | Briefings, summaries, report formatting |
| Worker | gemini-3.1-flash-lite | CEO | save | Routine tasks, data extraction, formatting |
| Fallback A | gpt-oss-120b | — | survive | Low-balance fallback |
| Fallback B | gpt-oss-20b | — | survive | Minimum cost, last resort |

### What users CAN edit on builtin roles

Name, description, system prompt, model, provider, reporting line, budget tier, monthly budget, tools, active/disabled status.

### What users CANNOT edit on builtin roles

ID (always `chairman`, `ceo`, etc.), `isBuiltin` flag, delete (only disable).

### Custom roles (fully flexible)

Users create these. No restrictions — add, edit, delete freely.

```bash
# Add a custom role
clawcompany role add "Quant Trader" \
  --model claude-sonnet-4-6 \
  --reports-to cto \
  --tools http,shell,code_interpreter

# Add a local zero-cost role
clawcompany role add "Code Reviewer" \
  --model qwen3-coder:32b \
  --provider ollama \
  --reports-to cto
```

---

## CLI role management

```bash
# List all roles
clawcompany role list

# Show role details
clawcompany role show cto

# Rename a role
clawcompany role set chairman --name "President"

# Swap model
clawcompany role set cto --model deepseek-coder --provider deepseek

# Change reporting line
clawcompany role set custom_trader --reports-to chairman

# Set monthly budget
clawcompany role set ceo --budget 50

# Disable (not delete) a builtin role
clawcompany role disable secretary

# Delete a custom role
clawcompany role remove custom_trader

# Reset builtin role to defaults
clawcompany role reset chairman

# Reset everything
clawcompany role reset --all
```

---

## Company templates

Templates = a set of role configs + org structure + prompts.

| Template | Roles | Best for |
|----------|-------|----------|
| Default | Chairman + CEO + CTO + Secretary + Worker | General purpose |
| Trading Desk | + Analyst + Trader + Data Collector | Crypto / DeFi |
| Content Agency | + Writer + Editor + SEO + Publisher | Content production |
| Dev Shop | + Engineers + QA | Software development |
| Solo Founder | CEO + Worker only | Maximum efficiency |

```bash
npx clawcompany --template trading-desk
```

---

## Config merge strategy

User config overlays on top of builtin defaults using shallow merge:

```typescript
// Builtin role provides all defaults
const builtinCEO = { name: "CEO", model: "claude-sonnet-4-6", ... };

// User only specifies what they changed
const userOverride = { model: "deepseek-coder" };

// Result: all defaults preserved, model swapped
const resolved = { ...builtinCEO, ...userOverride };
```

Users only write the fields they want to change. Everything else uses sensible defaults.

---

## Task routing

When a task arrives, the router finds the best role:

1. **Explicit assignment** — user or Chairman specifies the role
2. **Keyword matching** — match task description against role descriptions
3. **Cost efficiency** — when multiple roles match equally, prefer cheaper ones
4. **Custom role bonus** — custom roles get priority (user created them for a reason)
