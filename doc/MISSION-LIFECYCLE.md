# ClawCompany — Mission Lifecycle

> Human (Chairman) gives goal → CEO decomposes → team executes → CEO delivers result.

---

## The 6-phase lifecycle

```
Phase 1: MISSION IN       — Human (Chairman) states the goal
Phase 2: DECOMPOSE        — CEO breaks it into work streams
Phase 3: DELEGATE         — Work streams assigned to roles
Phase 4: EXECUTE          — Agents work autonomously
Phase 5: REPORT UP        — Results flow back up, reviewed at each level
Phase 6: DELIVER          — CEO presents result; human approves/revises
```

---

## Phase 1: Mission in

The human (Chairman) provides:
- A goal in natural language
- Optionally: priority, deadline, budget limit
- Everything else is fully autonomous

---

## Phase 2: Decompose

CEO (Opus) performs strategic thinking:
- What types of work does this require?
- Which roles are best suited?
- What are the dependencies?
- What can run in parallel?
- Estimated cost?

Delegation rules: grunt work → Worker. Technical → CTO/Engineer. Financial → CFO/Analyst. Marketing → CMO. Research → Researcher. Formatting → Secretary.

---

## Phase 3-4: Delegate + Execute

Work streams execute in dependency order. Roles can sub-delegate:
```
CEO delegates "financial analysis" to CFO
  → CFO delegates "data gathering" to Analyst
  → Analyst delegates "raw data collection" to Worker
  → Results flow back: Worker → Analyst → CFO → CEO
```

---

## Phase 5-6: Report + Deliver

Results flow bottom-up. Each level reviews before passing up. CEO integrates all outputs and presents the final result to the human.

Human has three options:
- **Approve** — mission complete
- **Revise** — "add more detail on X" → partial re-run
- **Override** — direct change, no re-analysis

---

## State machine

```
created → decomposing → delegated → executing → reporting →
reviewing → awaiting_approval →
  ├→ approved → completed
  ├→ revision_requested → decomposing (partial)
  └→ overridden → completed
```
