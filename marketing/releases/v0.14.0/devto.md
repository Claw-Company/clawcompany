---
title: "I built an AI company framework in 11 days — 97 commits, 210 stars, and a lobster 🦞"
published: true
tags: ai, opensource, buildinpublic, webdev
---

## The Problem

You have Claude Code, Codex, Cursor, and a dozen AI tools. Each one is powerful alone. But running them together? That's 20 terminal tabs, zero organization, and costs spiraling before you notice.

Paperclip says "bring your own agents." DeerFlow gives you a Docker sandbox. OpenClaw is a personal assistant. But what if you just want a company — with roles, a team, a dashboard — that runs with one command?

That's why I built ClawCompany.

## What is ClawCompany?

ClawCompany is an open-source AI company framework for One Person Companies. You are the Chairman. Your AI team executes.
```bash
npx clawcompany
```

One command. That's it. No Docker. No PostgreSQL. No YAML files. You get:

- **9 AI roles** — CEO, CTO, CFO, CMO, Researcher, Analyst, Engineer, Secretary, Worker
- **4 AI providers** — ClawAPI, Anthropic, OpenAI, Google Gemini, Ollama
- **7 built-in tools** — web search, web fetch, browser automation, file system, shell, code interpreter, price feed
- **A full Dashboard** — missions, chat, roles, routines, code manager, settings

The CEO decomposes your mission. The CTO handles architecture. The Researcher scrapes the web. The CFO watches costs. Each role uses the right model for the job — Opus for strategy, GPT-5.4 for code, Flash for simple tasks.

## The 30x Cost Advantage

Most AI frameworks use one model for everything. That's like paying a CEO salary for data entry.

ClawCompany assigns the cheapest model that can handle each task:

| Role | Model | Cost (per 1M tokens) |
|------|-------|---------------------|
| CEO | Claude Opus 4.6 | $5 / $25 |
| Engineer | GPT-5.4 | $2.50 / $15 |
| Worker | Gemini Flash Lite | $0.25 / $1.50 |

A task a Worker can do for $0.003 should NOT be done by the CEO for $0.10. The right model for the right job.

## Company Templates — Switch Your Org in One Click

This is where it gets interesting. ClawCompany ships with 3 templates:

🦞 **Default** — 9 roles, general purpose AI company
🚀 **YC Startup** — 7 roles (Founder Coach, PM, Tech Lead, Designer, Engineer, QA, Growth Hacker). The Founder Coach is trained to rethink before building — inspired by YC methodology.
📈 **Trading Desk** — 7 roles (Fund Manager, Bull Analyst, Bear Analyst, Technical Analyst, Risk Manager, Sentiment Analyst, Trader). Bull vs Bear debate before every trade decision.

One click in Settings. Your entire org chart changes. API keys and custom roles — preserved.

## Code Manager — ∞ Terminals, One Dashboard

Run Claude Code, Codex, Cursor, and any CLI tool from browser tabs.

- Full PTY terminal with ANSI colors and interactive input
- Start all → green dots. Stop all → done.
- Process completes → phone buzzes (Telegram/Discord)
- Real terminal in your browser. Not a text viewer.

If you vibe code across multiple projects, you know the pain: 10 Claude Code tabs, zero organization. This is the fix.

## Built-in Browser Automation

Your AI agents can browse the web autonomously — open pages, click elements, fill forms, take screenshots, run JavaScript. The Researcher scrapes data. The Engineer runs E2E tests. The CMO checks marketing pages. Zero setup.

## Routines — Your AI Company Never Sleeps

Cron-powered schedules:
- Daily market report at 8am
- Competitor check every 6 hours
- Weekly summary on Friday

Set it. Forget it. Your team runs 24/7. Results go to Telegram or Discord.

## The Build Story

I built this in 11 days. Here's the timeline:

- **Day 1-3**: Core architecture — role system, model router, agent runtime, task orchestrator
- **Day 4-5**: Dashboard — 7 pages, dark theme, real-time SSE streaming
- **Day 6-7**: Channels — Telegram bot, Discord bot, cron scheduler
- **Day 8-9**: Code Manager — node-pty, xterm.js, WebSocket terminals
- **Day 10-11**: Templates, Browser Use, marketing workflow

97 commits. 210+ GitHub stars. 14 npm releases. v0.14.0 live.

Oh, and our #1 GitHub contributor? It's an AI. Claude Code made 11 commits yesterday. We practice what we preach.

## ClawCompany vs Paperclip

| | ClawCompany | Paperclip |
|---|---|---|
| Install | `npx clawcompany` | `npx paperclipai onboard` |
| Roles | 9 built-in | Bring your own |
| Models | Multi-model (4 providers) | Whatever you connect |
| Dashboard | Built-in | Built-in |
| Templates | 3 (Default, YC, Trading) | Coming soon (ClipMart) |
| Terminal management | ∞ terminals | None |
| Database | None needed | PostgreSQL required |
| Notifications | Telegram + Discord | None |

Both are great projects solving similar problems. Paperclip says "bring your own agents." We say "batteries included."

## Try It
```bash
npx clawcompany
```

Paste one API key. Click "Start mission." Watch your AI team work.

- 🦞 **Website**: [clawcompany.org](https://clawcompany.org)
- 💻 **GitHub**: [github.com/Claw-Company/clawcompany](https://github.com/Claw-Company/clawcompany)
- 🐦 **X/Twitter**: [@alexxu_claw](https://x.com/alexxu_claw)

Open source. MIT licensed. Runs on your machine. Your data stays with you.

Build for OPC. Every human being is a chairman. 🦞
