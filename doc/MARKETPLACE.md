# ClawMarket — Marketplace Design

> Download a company. One click. It runs.

---

## Overview

ClawMarket is ClawCompany's marketplace — a catalog of company templates, skills, tools, and service integrations. Unlike Paperclip's Cliphub (which requires users to configure their own agents), ClawMarket items work out of the box because ClawCompany has built-in agents.

**Core UX promise:** Browse → Install → Run. No configuration needed.

---

## 4 categories

### 1. Company templates

Pre-built org structures with roles, prompts, and workflows optimized for specific industries.

| Template | Roles | Target user |
|----------|-------|-------------|
| Default | 9 roles (full team) | General purpose |
| Trading Desk | + Trader, Data Collector | Crypto / DeFi traders |
| Content Agency | + Writer, Editor, SEO | Content creators, bloggers |
| Dev Shop | + QA, DevOps | Software teams |
| Solo Founder | CEO + Worker only | Bootstrappers |
| Legal Firm | + Paralegal, Contract Analyst | Solo lawyers |
| E-commerce | + Listing Manager, Support Agent | Online sellers |
| Consulting | + Consultant, Proposal Writer | Freelance consultants |
| Real Estate | + Lead Scout, Property Analyst | Agents and investors |

**Format:** Each template is a directory containing:
```
templates/trading-desk/
├── template.json       # Metadata + role overrides
├── README.md           # Description, use cases, screenshots
└── skills/             # Template-specific skills (optional)
```

**template.json schema:**
```json
{
  "name": "Trading Desk",
  "version": "1.0.0",
  "description": "AI-powered trading company with market analysis and execution.",
  "author": "clawcompany",
  "category": "template",
  "tags": ["crypto", "defi", "trading", "finance"],
  "license": "MIT",
  "roles": {
    "ceo": {},
    "cto": {},
    "cfo": {},
    "analyst": {},
    "researcher": {},
    "secretary": {},
    "worker": {},
    "custom_trader": {
      "name": "Trader",
      "description": "Execute trades, manage positions, risk control",
      "model": "claude-sonnet-4-6",
      "systemPrompt": "You are a Trader...",
      "reportsTo": "cto",
      "tools": ["http", "shell"]
    },
    "custom_data_collector": {
      "name": "Data Collector",
      "description": "Fetch on-chain data, aggregate feeds",
      "model": "gemini-3.1-flash-lite",
      "reportsTo": "analyst",
      "tools": ["http", "filesystem"]
    }
  },
  "skills": ["web-scraper", "price-feed"],
  "estimatedCostPerMission": "$0.05-0.15"
}
```

### 2. Skills (agent capabilities)

Pluggable capabilities that agents can use during execution.

```
skills/web-scraper/
├── skill.json          # Metadata
├── SKILL.md            # Instructions for the agent
└── index.ts            # Implementation (optional)
```

**skill.json schema:**
```json
{
  "name": "Web Scraper",
  "version": "1.0.0",
  "description": "Extract structured data from web pages",
  "author": "clawcompany",
  "category": "skill",
  "tags": ["web", "scraping", "data"],
  "license": "MIT",
  "compatibleRoles": ["worker", "researcher"],
  "requiredTools": ["http"]
}
```

### 3. Tools (agent tools)

Low-level capabilities: HTTP requests, file I/O, code execution, browser automation.

Built-in tools ship with ClawCompany. Third-party tools install from ClawMarket.

### 4. Service integrations

Connectors to external services: Slack, HubSpot, Stripe, Xero, GitHub, etc.

**Commercial model:** Service providers pay for listing. Integration = built-in skill + tool + documentation.

---

## Installation UX

### CLI
```bash
# Browse
clawcompany market search "trading"
clawcompany market list --category template

# Install
clawcompany market install trading-desk
clawcompany market install skill:web-scraper

# Apply template
clawcompany market apply trading-desk
```

### Dashboard
- Browse → click "Install" → company reconfigures → new roles appear
- No restart needed (hot reload)

---

## Registry architecture

**Phase 1 (now):** Built-in registry. Templates and skills ship with the npm package. No network calls.

**Phase 2 (later):** Remote registry at `market.clawcompany.org`. Community submissions via GitHub PR. Automated quality checks.

**Phase 3 (future):** Full marketplace with ratings, downloads count, paid listings, partner integrations.

```
Phase 1: Built-in registry (JSON catalog in npm package)
    ↓
Phase 2: Remote registry (market.clawcompany.org API)
    ↓
Phase 3: Full marketplace (web UI, payments, partner program)
```

---

## Commercial model

| Category | Free tier | Paid tier |
|----------|-----------|-----------|
| Templates | Community-contributed | Premium industry templates |
| Skills | Open source | Advanced skills (e.g. browser automation) |
| Tools | Built-in basics | Pro tools (code execution, database) |
| Services | - | Partners pay for listing |

**Revenue streams:**
1. ClawAPI usage from marketplace items (every template drives API calls)
2. Premium template/skill sales (revenue share with creators)
3. Service integration listings (partners pay for placement)
4. Featured placement in marketplace (like provider catalog "shelf position")

---

## Competitive advantage over Paperclip Cliphub

| Dimension | Paperclip Cliphub | ClawMarket |
|-----------|-------------------|------------|
| Install experience | Download config, configure agents yourself | One click, runs immediately |
| Agent source | BYOA (bring your own) | Built-in, zero config |
| Categories | Templates only | Templates + Skills + Tools + Services |
| Commercial model | Community only | Community + commercial partners |
| Offline support | N/A | Phase 1 works fully offline (built-in) |
| Status | Roadmap | **Shipping now** |
