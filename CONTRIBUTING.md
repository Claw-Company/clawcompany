# Contributing to ClawCompany

We welcome contributions of all kinds — bug fixes, features, documentation, templates, and ideas.

## Development setup

```bash
git clone https://github.com/Claw-Company/clawcompany.git
cd clawcompany
pnpm install
pnpm dev
```

## Project structure

This is a pnpm monorepo. Key packages:

- `packages/shared` — Types, constants, defaults (everything depends on this)
- `packages/providers` — Multi-provider abstraction (ClawAPI, OpenAI, DeepSeek, Ollama...)
- `packages/model-router` — Role → model selection with fallback
- `packages/agent-runtime` — Agent execution engine (think → act → observe loop)
- `packages/task-orchestrator` — Mission decomposition and lifecycle
- `packages/tools` — Built-in tools (shell, http, filesystem)
- `packages/db` — Database layer (PGlite embedded / Postgres)
- `server` — Express API server
- `cli` — CLI tool
- `ui` — React dashboard

## Commit conventions

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Code restructuring
test:     Adding tests
chore:    Build/config changes
```

## Pull requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `pnpm typecheck && pnpm test`
5. Submit a PR with a clear description

## Adding a new provider

1. Add adapter in `packages/providers/src/`
2. Register it in `ProviderRegistry.createProvider()`
3. Add to CLI's provider list in `cli/src/commands/provider.ts`
4. Document in `doc/PROVIDERS.md`

## Adding a company template

1. Create `templates/your-template/template.json`
2. Define roles, org chart, and prompts
3. Add to template list in CLI
4. Document in `doc/TEMPLATES.md`

## Code of conduct

Be respectful. Build for WEB4.0 together.
