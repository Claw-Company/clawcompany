# Example Mission: OpenAI vs Anthropic Competitive Analysis

> This document shows a complete mission lifecycle — from the human (Chairman) giving a goal to the final deliverable. It demonstrates how ClawCompany's AI team self-organizes to complete complex work.

---

## Step 1: You give the mission

You are the Chairman. You type one sentence:

```bash
curl -s http://localhost:3200/api/mission/run \
  -H "Content-Type: application/json" \
  -d '{"mission":"Write a one-page competitive analysis comparing OpenAI vs Anthropic, covering business model, product strategy, key strengths and weaknesses, and market positioning"}'
```

Or via CLI (coming soon):
```bash
clawcompany mission "Write a one-page competitive analysis comparing OpenAI vs Anthropic, covering business model, product strategy, key strengths and weaknesses, and market positioning"
```

That's it. You go get coffee. The company handles the rest.

---

## Step 2: CEO decomposes the mission

The CEO (claude-opus-4-6) receives your mission and thinks strategically:

- What work is needed? Data collection, research, marketing analysis, formatting.
- Who should do what? Match each work stream to the cheapest role that can handle it well.
- What depends on what? Research needs data first. Formatting needs everything else first.

The CEO produces 4 work streams:

```
ws_1: "Factual Data Collection"           → Worker (flash-lite, $0.25/M)
ws_2: "Deep Competitive Analysis"         → Researcher (sonnet, $3/M)     depends on ws_1
ws_3: "Market Positioning & Messaging"    → CMO (sonnet, $3/M)            depends on ws_1
ws_4: "Final Report Formatting"           → Secretary (flash-lite, $0.25/M) depends on ws_2, ws_3
```

Note how the CEO delegates intelligently:
- **Grunt work** (data collection) goes to Worker — cheapest role, $0.0008
- **Deep analysis** goes to Researcher — needs depth and nuance
- **Brand/marketing angle** goes to CMO — creative and strategic
- **Formatting** goes to Secretary — fast and cheap, runs last

---

## Step 3: Team executes

The server executes work streams in dependency order:

```
  📋 Executing 4 work streams...

  ⚡ ws_1: Factual Data Collection on OpenAI and Anthropic
     → Worker (gemini-3.1-flash-lite)
     ✅ Done (3.9s, $0.0008)

  ⚡ ws_2: Deep Competitive Analysis Research
     → Researcher (claude-sonnet-4-6)
     ✅ Done (46.9s, $0.0263)

  ⚡ ws_3: Market Positioning & Messaging Review
     → CMO (claude-sonnet-4-6)
     ✅ Done (19.1s, $0.0090)

  ⚡ ws_4: Final One-Page Report Formatting
     → Secretary (gemini-3.1-flash-lite)
     ✅ Done (5.8s, $0.0011)

  📊 All work streams complete: 75.8s, $0.0372 total
```

### What each role produced:

**Worker** (3.9 seconds, $0.0008) collected a structured comparison table:

```
| Feature        | OpenAI                           | Anthropic                    |
|----------------|----------------------------------|------------------------------|
| Founded        | December 2015                    | January 2021                 |
| Key Products   | GPT-4o, o1, ChatGPT, DALL-E, API| Claude Opus/Sonnet/Haiku, API|
| Funding        | $13B+ (Microsoft)                | $7.3B+ (Google, Spark)       |
| Revenue Model  | SaaS + API + Enterprise          | API + Enterprise             |
| ...            | ...                              | ...                          |
```

**Researcher** (46.9 seconds, $0.0263) wrote a detailed competitive analysis covering:
- Business model comparison (OpenAI's broad commercialization vs Anthropic's safety-first approach)
- Product strategy differences
- Key strengths and weaknesses of each company
- Market dynamics and competitive moats

**CMO** (19.1 seconds, $0.0090) added a marketing and brand positioning supplement:
- Brand identity analysis ("ChatGPT" as genericized verb vs Claude's technical reputation)
- Messaging architecture comparison
- Go-to-market strategy differences
- Developer ecosystem positioning

**Secretary** (5.8 seconds, $0.0011) compiled everything into a formatted executive memo:
- Clean one-page format with executive summary
- Key data points from Worker
- Strategic insights from Researcher and CMO
- Addressed to "CEO" for final review

---

## Step 4: Result delivered to you

The complete result is returned to you (the Chairman). You review it and decide:

| Your response | What happens |
|--------------|-------------|
| **Approve** | Mission complete. All agents return to standby. |
| **Revise** | "Add a section on China market strategy." → CEO adds one work stream, only affected roles re-run. |
| **Override** | "Change the conclusion to favor Anthropic." → Direct edit, no re-analysis. |

---

## Mission summary

```
Mission:    "Write a one-page competitive analysis comparing OpenAI vs Anthropic..."
Roles used: 5 (CEO decompose + Worker, Researcher, CMO, Secretary)
Models:     4 (opus, sonnet, flash-lite x2 roles)
Time:       75.8 seconds
Cost:       $0.064 (including CEO decompose $0.027)

Cost breakdown:
  Worker     (flash-lite)  $0.0008  (2.2%)   — data collection
  Researcher (sonnet)      $0.0263  (70.7%)  — deep analysis
  CMO        (sonnet)      $0.0090  (24.2%)  — marketing angle
  Secretary  (flash-lite)  $0.0011  (3.0%)   — formatting
```

The most expensive work (deep analysis) goes to the most capable model. Everything else goes to the cheapest model that can handle it. **Task cascading: $0.064 total (including CEO decompose) vs $1.73 if all-Opus. 96% savings, 27x cheaper.**

---

## Why multi-model matters: cost comparison

What if we ran the exact same mission using only Opus for everything?

| Step | Role | ClawCompany model | Actual cost | If all Opus |
|---|---|---|---|---|
| Decompose mission | CEO | opus-4-6 | $0.0266 | $0.0266 (same) |
| Data collection | Worker | flash-lite | $0.0008 | ~$0.40 |
| Deep analysis | Researcher | sonnet-4-6 | $0.0263 | ~$0.45 |
| Market positioning | CMO | sonnet-4-6 | $0.0090 | ~$0.45 |
| Report formatting | Secretary | flash-lite | $0.0011 | ~$0.40 |
| **Total** | | | **$0.064** | **~$1.73** |

Savings: 96% cheaper. 27x less cost with task cascading.

At scale:

| Missions per day | ClawCompany | All-Opus | Monthly savings |
|---|---|---|---|
| 10 | $0.64/day | $17.30/day | $499/month |
| 100 | $6.40/day | $173/day | $4,998/month |
| 1,000 | $64/day | $1,730/day | $49,980/month |

---

## What you did vs what the AI company did

| You (Chairman) | AI Company |
|---|---|
| Wrote one sentence | CEO decomposed into 4 work streams |
| Went to get coffee | Worker collected data in 3.9 seconds |
| | Researcher wrote deep analysis in 46.9 seconds |
| | CMO added marketing perspective in 19.1 seconds |
| | Secretary formatted the final report in 5.8 seconds |
| Read the report | |
| Said "Approved" | |

**Total human effort: ~30 seconds (write mission + read result).**
**Total AI effort: 75.8 seconds of autonomous work across 5 roles.**
**Total cost: 6.4 cents.**

This is what OPC (One Person Company) looks like. You are the Chairman. The Claws do the rest.
