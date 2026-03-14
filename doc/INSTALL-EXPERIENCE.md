# ClawCompany — Installation Experience Design

> Core principle: if a user needs to open a text editor to get started, we failed.

---

## Target metrics

| Metric | Target |
|--------|--------|
| Install time | < 60 seconds |
| Commands to type | 1 |
| Config files to edit | 0 |
| API keys needed | 1 |
| Prior knowledge required | 0 |

---

## The ideal install flow

### User types one command

```bash
npx clawcompany
```

Not `npx clawcompany init`. Not `npx clawcompany onboard --yes`. Just one word after npx. It downloads, runs, and guides you through setup interactively.

### What the user sees

```
  🦞 ClawCompany v0.1.0
  Build for WEB4.0, Claws Autonomous.

  ✓ Node.js v22.3.0

  ? Enter your ClawAPI key: sk-claw-████████████████
    Don't have one? Get it at https://clawapi.org

  ✓ Key verified — Balance: $12.50
  ✓ 8 models available

  ? Company name: My AI Company
  ? Choose template: Default (Chairman + CEO + CTO + Secretary + Worker)

  ✓ Company created, 5 agents hired
  ✓ Server running at http://localhost:3200

  Try: clawcompany mission "Research the best DeFi protocols"
```

### Total user actions

1. Typed one command: `npx clawcompany`
2. Pasted one key: `sk-claw-xxxxx`
3. Typed a company name
4. Selected a template with arrow keys

That's it. The company is running.

---

## Comparison with OpenClaw

### OpenClaw install (current reality)

```bash
node -v                              # Version check — maybe need nvm?
npm install -g @anthropics/openclaw  # npm or pnpm or yarn?
# Find API keys for Anthropic, OpenAI, Google...
nano ~/.openclaw/config.json         # Hand-edit JSON — miss a comma?
# In China? Configure proxy, Clash, TUN mode...
openclaw chat                        # Error? Check GitHub Issues...
# Time: 10-30 minutes for technical users
# Non-technical users: give up
```

### ClawCompany install (target)

```bash
npx clawcompany                      # Paste key, pick template, done.
# Time: 30-60 seconds for anyone
```

---

## Design decisions

### Error messages always include fix commands

```
BAD (OpenClaw-style):
  Error: ENOENT: no such file or directory, open '/Users/alex/.openclaw/config.json'

GOOD (ClawCompany-style):
  ✗ Config not found.
    Fix: Run `npx clawcompany` to set up your company.
```

**Rule: every catch block must have a "Fix:" suggestion. No exceptions.**

### Zero config files

OpenClaw requires hand-editing `~/.openclaw/config.json`. Paperclip needs `.env` + database config.

ClawCompany stores everything in an embedded database. All modifications happen through CLI commands or the Dashboard UI. Users never open a text editor.

```bash
clawcompany config set-key sk-claw-xxx     # Change key
clawcompany role set cto --model xxx       # Change model
clawcompany provider add                   # Add provider
# Or use http://localhost:3200 dashboard
```

### China-friendly by default

OpenClaw needs direct connections to `api.anthropic.com` (blocked), `api.openai.com` (blocked), Google API (blocked). Requires VPN/proxy setup.

ClawCompany connects only to `clawapi.org` — one endpoint, all models. Not blocked. Users don't need to know what Clash, TUN mode, or proxies are.

### Single-process architecture

OpenClaw: main process + child agent processes + MCP server processes.
Paperclip: Node server + Postgres + external agent processes.

ClawCompany: **one Node.js process = everything.** Embedded database (PGlite, in-process), built-in agent runtime (in-process), HTTP server (in-process). Start one thing, everything runs. Stop one thing, everything stops. No "forgot to start Postgres" or "agent process crashed."

---

## Progressive onboarding

After install, users should be able to do:

```
Level 0: clawcompany mission "..."     ← Immediately available
Level 1: clawcompany status            ← Check company status
Level 2: clawcompany role list         ← See role config
Level 3: http://localhost:3200         ← Open dashboard

Advanced (learn when needed):
Level 4: clawcompany role set ...      ← Swap models
Level 5: clawcompany role add ...      ← Add roles
Level 6: clawcompany provider add      ← Add providers
```

**Level 0 must work immediately after install. No "please configure first."**

---

## README install guide

The entire install section in the README should be this short:

```markdown
## Quick start

1. Get a ClawAPI key at [clawapi.org](https://clawapi.org)
2. Run: `npx clawcompany`
3. Give it a mission: `clawcompany mission "Analyze the DeFi market"`

Need help? `clawcompany help`
```

Four lines. If we need more, the product isn't simple enough.
