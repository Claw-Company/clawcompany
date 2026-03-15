# Guidance for AI and human contributors

ClawCompany is an autonomous AI company framework. Before making changes, read in this order:

1. `README.md` — Project overview and quick start
2. `doc/SPEC.md` — Full technical specification
3. `doc/MISSION-LIFECYCLE.md` — How missions flow through the system
4. `doc/PROVIDERS.md` — Multi-provider architecture
5. `doc/ROLES.md` — Role system design

## Architecture

```
packages/shared       → Types, constants, defaults (everything depends on this)
packages/providers    → Multi-provider abstraction layer
packages/model-router → Role → model selection + fallback chain
packages/agent-runtime → Agent execution engine (think → act → observe)
packages/task-orchestrator → Mission decomposition + lifecycle state machine
packages/tools        → Built-in tools (shell, http, filesystem)
packages/db           → Database (PGlite embedded / Postgres)
server/               → Express REST API
cli/                  → CLI tool (npx clawcompany)
ui/                   → React dashboard
```

## Key invariants

- **Human = Chairman.** There is no AI Chairman role. CEO (Opus) is the highest AI executive.
- **Every role maps to exactly one model via one provider.** The ModelRouter resolves this at call time.
- **ClawAPI is the default provider but never the only option.** The supply layer is open.
- **Builtin roles can be modified but not deleted.** Custom roles have no restrictions.
- **Tasks always have a `reportTo` field.** Results flow back up the org chart.
- **The fallback chain is global**, not per-role. When any provider returns 402, we walk the chain.

## Development

```bash
pnpm install
pnpm dev        # Start server in watch mode
pnpm typecheck  # Check all packages
pnpm test       # Run tests
```

Embedded PGlite requires no setup — leave `DATABASE_URL` unset for development.
