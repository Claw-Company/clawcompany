# ClawCompany — Execution Plan

> Goal: MVP in 4 weeks. GitHub launch + clawcompany.org live.

---

## Week 1: Foundation + core engine (Day 1-7)

- GitHub org + repo scaffold
- Shared types + DB schema (Drizzle + PGlite)
- **Provider System + Model Router** (core)
- **Agent Runtime + delegation chain** (core)

**Milestone:** Chairman can decompose a mission and delegate to Workers.

---

## Week 2: Server + CLI + docs (Day 8-14)

- Task Orchestrator + mission lifecycle state machine
- Express API server + WebSocket
- **CLI: `npx clawcompany`** interactive onboarding (core)
- README + doc/ + clawcompany.org website

**Milestone:** User can install, init with ClawAPI key, and run a mission from CLI.

---

## Week 3: Dashboard + templates (Day 15-21)

- React dashboard (org chart, mission board, cost analytics)
- Role manager UI (add/edit/remove roles in browser)
- Company templates: default, trading-desk, content-agency
- Integration tests

**Milestone:** Full experience — init, dashboard, manage roles, run missions, see costs.

---

## Week 4: Polish + launch (Day 22-28)

- Docker deployment (`docker compose up`)
- E2E test suite
- Bug fixes, edge cases, error handling
- **v0.1.0 release + npm publish**

**Milestone:** Public release on GitHub + npm.

---

## Git commit conventions

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Code restructuring
test:     Adding tests
chore:    Build/config changes
```

---

## GitHub org ecosystem

```
Claw-Company/clawcompany     — Main repo (server + CLI + UI + packages)
Claw-Company/website          — clawcompany.org website
Claw-Company/templates        — Company template marketplace (future)
```
