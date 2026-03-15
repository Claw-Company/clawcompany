# ClawCompany — Installation Experience Design

> Core principle: if a user needs to open a text editor to get started, we failed.

---

## Target

| Metric | Target |
|--------|--------|
| Install time | < 60 seconds |
| Commands to type | 1 |
| Config files to edit | 0 |
| API keys needed | 1 |
| Prior knowledge | 0 |

---

## The ideal flow

```bash
npx clawcompany
```

```
  🦞 ClawCompany v0.1.0
  Build for OPC. Every human being is a chairman.

  ? Enter your ClawAPI key: sk-claw-████
  ✓ Key verified — Balance: $12.50

  ? Company name: My AI Company
  ? Template: Default (CEO + CTO + CFO + CMO + ...)

  ✓ Company created, 9 agents hired
  ✓ Server running at http://localhost:3200

  You are the Chairman. Try:
    clawcompany mission "Analyze the DeFi market"
```

**Total user actions:** 1 command, 1 key, 1 name, 1 template selection. Done.

---

## Error messages always include fix commands

```
BAD:  Error: ENOENT: no such file or directory
GOOD: ✗ Config not found. Fix: Run `npx clawcompany` to set up.

BAD:  Error: 401 Unauthorized
GOOD: ✗ API key invalid. Fix: Get a new key at https://clawapi.org

BAD:  TypeError: Cannot read properties of undefined
GOOD: ✗ CEO returned empty response. Fix: `clawcompany mission retry`
```

Rule: every catch block must have a "Fix:" suggestion. No exceptions.

---

## China-friendly by default

ClawCompany connects only to `clawapi.org` — one endpoint, all models. No VPN needed.

---

## Single-process architecture

One Node.js process = everything. Embedded database, built-in agent runtime, HTTP server. Start one thing, everything runs. Stop one thing, everything stops.
