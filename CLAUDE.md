# CLAUDE.md

This file provides context for Claude Code sessions working on the dr-stone project.

## Project Overview

Dr. Stone is a TypeScript monorepo that collects product prices from Brazilian e-commerce retailers, stores price history in PostgreSQL, and serves that data through a REST API. The frontend lives in the sibling repo `../dr-stone-frontend`.

## Quick Reference

```bash
# Install
nvm use 24.14.0
corepack enable
pnpm install --frozen-lockfile

# Build (required before running)
pnpm build

# Validate
pnpm lint
pnpm typecheck
pnpm test

# Run locally (needs .env and local Postgres)
docker compose up -d postgres
pnpm start:api          # API on default port
pnpm start:worker       # Worker continuous loop
pnpm worker:once        # Worker single run

# Exercise a single scrapper without DB/queue
pnpm source:run kabum "rtx 4070"
pnpm source:run amazon "echo dot"
pnpm source:run pichau "rtx 4070"
pnpm source:run mercadolivre "echo dot"

# Run migrations
pnpm migrate
```

## Monorepo Structure

Three workspace packages managed by pnpm + Turbo:

- **`dr-stone-api/`** (`@dr-stone/api`) - Fastify REST API for tracked products, search runs, and price history
- **`dr-stone-scrapper/`** (`@dr-stone/scrapper`) - Scraping worker with source adapters and pg-boss job queue
- **`dr-stone-database/`** (`@dr-stone/database`) - Shared Drizzle ORM schema, migrations, and repositories

Tests live in the root `tests/` directory and use Vitest with path aliases defined in `vitest.config.ts`.

## Tech Stack

- **Runtime**: Node.js 24.14.0, pnpm 10.7.1 (via Corepack)
- **Language**: TypeScript 5.8
- **API**: Fastify 5 with Swagger/OpenAPI
- **Database**: PostgreSQL 16, Drizzle ORM, pg driver
- **Scraping**: Playwright (browser-backed sources), Cheerio (HTML parsing), pg-boss (job queue)
- **Validation**: Zod
- **Logging**: Pino
- **Testing**: Vitest
- **Build**: Turbo for task orchestration
- **CI/CD**: GitHub Actions -> Railway deployment

## Architecture Conventions

### Source Adapters

Sources implement the `SearchSource` interface (`dr-stone-scrapper/src/types.ts`). Each source has its own directory under `dr-stone-scrapper/src/sources/`:

- **KaBuM** - HTTP-first, parses `__NEXT_DATA__` JSON
- **Amazon** - Browser-backed via Playwright with proxy
- **Pichau** - Browser-backed via Playwright with proxy

New sources must follow `docs/sources/implementation-guide.md` and register in `dr-stone-database/src/sources.ts`.

### Database Layer

- All SQL access goes through repositories in `dr-stone-database/src/repositories/`
- Migrations live in `dr-stone-database/migrations/` (sequential SQL files)
- Both API and worker import from `@dr-stone/database` - no direct SQL in service packages

### Key Domain Rules (see CRAWLING.md for full spec)

- Search terms normalized: 1-5 terms, trimmed, deduplicated case-insensitively
- Title matching: case-insensitive, substring-based, NFKC normalized, all terms required
- Only the 4 lowest-priced matching items persisted per source run
- HTTP-first by default; escalate to browser only when needed
- UTC timestamps throughout

### API Patterns

- Route definitions in `dr-stone-api/src/routes/`
- Controllers in `dr-stone-api/src/controllers/`
- Services in `dr-stone-api/src/services/`
- OpenAPI spec at `dr-stone-api/src/openapi.json`
- Full endpoint reference in `docs/api.md`

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm exec vitest run tests/api.test.ts

# Run filtered tests
pnpm exec vitest run tests/api.test.ts -t "price_history"
```

Tests require a running Postgres instance. For local development:

```bash
docker compose up -d postgres
export TEST_DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
pnpm test
```

CI uses a GitHub Actions Postgres service container.

## Environment Variables

Copy `.env.example` to `.env` and populate. Key required variables:

- `DATABASE_URL` - Production Postgres connection string
- `PROXY_SERVER`, `PROXY_USER`, `PROXY_PASSWORD` - Optional; currently disabled.
  Setting all three re-enables proxy routing for browser-backed sources
  (`amazon`, `pichau`, `mercadolivre`). When any is empty/unset the sources
  connect directly (see `dr-stone-scrapper/src/browser/playwright.ts`).
- `DR_STONE_PROXY_DISABLED_SOURCES` - Comma-separated list of source names
  that route directly even when the global proxy is configured. Sources
  without proxy support ignore this. Default (when unset): all known
  sources are disabled. Set to an empty string to opt every source back
  into the proxy.
- `TEST_DATABASE_URL` - Test database (local: `postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test`)
- `DR_STONE_ENABLED_SOURCES` - Comma-separated source list (default: `kabum,amazon,pichau,mercadolivre`)

## Deployment

- GitHub Actions validates on all branches/PRs, deploys to Railway on master push
- Deploy order: API first (`Dockerfile`), then worker (`Dockerfile.worker`)
- Both services share one Railway Postgres instance
- Migrations run from `dr-stone-database`

## Key Documentation

- `CRAWLING.md` - Crawling contract and cross-source rules
- `docs/api.md` - Complete API endpoint reference
- `docs/sources/implementation-guide.md` - How to add new source adapters
- `docs/sources/*.md` - Per-source investigation notes
- `PLAN.md` - Historical: original Python-to-TypeScript migration plan (completed)
- `TASKS.md` - Backend task breakdown and milestones
- `LEONARDO-SKILL.md` - Code style preferences

## Code Style

- Follow existing patterns in the codebase (see `LEONARDO-SKILL.md`)
- Prefer functional style: pure functions, immutability, explicit data transformations
- Keep changes minimal and scoped - no unrelated refactors
- Prefer integration tests over unit tests for observable behavior
- Update tests and docs when changing behavior
