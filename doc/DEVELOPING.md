# Developing ClawCompany

## Prerequisites

- Node.js 20+
- pnpm 9.15+

## Setup

```bash
git clone https://github.com/clawcompany/clawcompany.git
cd clawcompany
pnpm install
cp .env.example .env
# Edit .env → add your CLAWAPI_KEY
pnpm dev
```

Server starts at `http://localhost:3200`.

## Database

**Development:** Leave `DATABASE_URL` unset — PGlite creates an embedded Postgres automatically.

**Production:** Set `DATABASE_URL=postgresql://...` to use a real Postgres instance.

## Package dependency graph

```
shared ← db
shared ← providers
shared + providers ← model-router
shared + model-router + tools ← agent-runtime
shared + agent-runtime ← task-orchestrator
all packages ← server
shared ← cli
```

Always edit `packages/shared` first if changing types — everything depends on it.

## Scripts

```bash
pnpm dev          # Start server (watch mode)
pnpm build        # Build all packages
pnpm typecheck    # Type-check everything
pnpm test         # Run tests
pnpm lint         # ESLint
```

## Adding a new package

1. Create `packages/your-package/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. Add to `pnpm-workspace.yaml` (already covered by `packages/*` glob)
3. Add to root `tsconfig.json` references
4. Run `pnpm install` to link
