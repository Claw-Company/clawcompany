# ClawCompany — Mission Lifecycle

## The 6-phase lifecycle

```
Phase 1: MISSION IN       — Human states the goal
Phase 2: DECOMPOSE        — Chairman breaks it into work streams
Phase 3: DELEGATE         — Work streams assigned to roles
Phase 4: EXECUTE          — Agents work autonomously (with sub-delegation)
Phase 5: REPORT UP        — Results flow back up, reviewed at each level
Phase 6: DELIVER          — Chairman presents result; human approves/revises/overrides
```

---

## Phase 1: Mission in

The human provides exactly:
- A goal in natural language
- Optionally: priority, deadline, budget limit
- Optionally: whether final approval is required

**Everything else — decomposition, delegation, execution, coordination — is fully autonomous.**

---

## Phase 2: Decompose

Chairman (Opus) performs strategic thinking:

1. What types of work does this mission require?
2. Which roles are best suited for each work stream?
3. What are the dependencies between work streams?
4. What can be done in parallel?
5. What is the estimated cost?

**Delegation rules:** grunt work (data collection, formatting) goes to Workers (cheap, fast). Technical work goes to CTO. Planning and coordination goes to CEO. Briefings go to Secretary. Only final judgment stays with Chairman.

---

## Phase 3: Delegate

Chairman distributes work streams **in dependency order:**

- Tasks with no dependencies start immediately
- Parallel tasks launch simultaneously
- Dependent tasks wait for upstream completion
- Each work stream includes: full context, requirements, output format, deadline, and who to report to

---

## Phase 4: Execute

Each role executes autonomously. Roles can **sub-delegate** internally:

```
CEO receives financial analysis task
  → Does most of the analysis herself
  → Discovers she needs Eigenlayer contract details
  → Sub-delegates to CTO: "Review the Eigenlayer restaking contract risk"
  → CTO completes and reports back to CEO
  → CEO integrates into her analysis

This forms multi-level delegation chains:
  Human → Chairman → CEO → CTO
                   → Worker
```

**What agents CAN decide autonomously:**
- Which tools to use
- Sub-delegate to subordinates
- Retry on API failures
- Supplement missing data proactively

**What agents CANNOT decide (must escalate):**
- Operations exceeding budget
- Work outside mission scope
- Sensitive operations requiring human authorization
- Modifying other agents' work

---

## Phase 5: Report up

Results flow **bottom-up**, with review at each level:

```
Worker completes data collection
  → Reports to CEO: "10 protocols extracted, 47 metrics each"
  → CEO reviews quality, finds missing Pendle 7-day fee data
  → CEO sends Worker back: "Supplement Pendle 7d fees from Token Terminal"
  → Worker supplements, reports again

CTO completes technical analysis
  → Reports to CEO: "Audit review done. Eigenlayer: medium risk. Ethena: high risk."

CEO integrates all inputs
  → Reports to Chairman: "Full analysis complete. Key findings: Lido and Aave strongest."
  → Notifies Secretary to begin report formatting

Secretary completes formatting
  → Reports to Chairman: "12-page report ready."

Chairman reviews everything
  → Reviews CEO's analysis logic
  → Reviews Secretary's report quality
  → Adds final investment recommendations
  → Delivers to Human
```

**Key insight:** Chairman doesn't see raw Worker output. Each level filters and integrates before passing up — just like a real company.

---

## Phase 6: Deliver

Chairman presents the final result. The human has three options:

| Response | What happens |
|----------|-------------|
| **Approve** | Mission complete. All agents return to standby. |
| **Revise** | "Add on-chain activity analysis." Chairman adds a new work stream — only affected roles re-run, not the entire mission. |
| **Override** | "Remove Pendle from Buy list." Chairman adjusts the conclusion — no re-analysis needed. |

---

## State machine

```
created → decomposing → delegated → executing → reporting →
reviewing → awaiting_approval →
  ├→ approved → completed
  ├→ revision_requested → decomposing (partial re-run)
  └→ overridden → completed
```

---

## Open Model Supply Layer

The supply layer is **open and pluggable**. ClawAPI is the default — not the only option.

```
┌─────────────────────────────────────────────────┐
│           Model Supply Layer (open)              │
│                                                  │
│  ClawAPI ★    Anthropic    OpenAI    DeepSeek    │
│  (default)    (optional)   (optional) (optional) │
│                                                  │
│  Ollama       SiliconFlow  vLLM     + Any        │
│  (local)      (optional)   (self)   OpenAI-compat│
└─────────────────────────────────────────────────┘
★ = default supplier: 1 key, 8 models, crypto-native
```

**Why open:** Users may have existing API keys. Some models aren't on ClawAPI yet. Local models via Ollama cost nothing. Enterprise users may have private deployments.

**Why ClawAPI is still the best default:** One key covers all roles. Crypto-native payment. Auto-fallback across upstream providers. Unified billing. Works from China without VPN.
