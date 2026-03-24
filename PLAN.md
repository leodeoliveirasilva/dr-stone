# Dr. Stone TypeScript Service Migration Plan

> **Status: COMPLETED** - This migration plan was fully executed. The repository is now 100% TypeScript with no Python code remaining. This document is kept as historical context for architectural decisions made during the migration.
>
> Notable deviations from the original plan:
> - **Drizzle ORM** was chosen instead of Kysely for database access
> - **Node.js 24.14.0** is used instead of the originally planned Node.js 22
> - **pg-boss** was added for job queue management in the worker
> - **Pichau** was added as a third source adapter (not in original plan)

## Goal

Migrate the current single-package Python application into a TypeScript monorepo with:

- `dr-stone-api/` for the HTTP API
- `dr-stone-scrapper/` for the scraping worker
- `dr-stone-database/` as the shared database package for migrations, schema, and repositories

The target state keeps only two deployable services, both in TypeScript, while the database layer remains reusable from a separate path.

## Current State Summary

The current repository already has two runtime responsibilities, but they are still coupled inside one Python package:

- API entrypoint: `src/dr_stone/api.py`
- Worker entrypoint: `src/dr_stone/worker.py`
- Shared storage and migrations bootstrap: `src/dr_stone/storage.py`, `src/dr_stone/runtime.py`, `migrations/`
- Source adapter pattern exists today in `src/dr_stone/scrapers/`
- Railway deploy already targets two services from one workflow:
  - `dr-stone-api`
  - `dr-stone-worker`

That means the migration should not start from zero. The correct approach is to preserve the current behavior, split ownership by service, and only then retire the Python code.

## Recommended Repository Structure

Keep the two service paths exactly as requested and add one shared database path:

```text
/
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .github/workflows/deploy.yml

  dr-stone-api/
    package.json
    tsconfig.json
    src/
      app.ts
      routes/
      controllers/
      services/
      env.ts
    Dockerfile

  dr-stone-scrapper/
    package.json
    tsconfig.json
    src/
      worker.ts
      sources/
        base/
        kabum/
        amazon/
      services/
      http/
      browser/
      normalizers/
      env.ts
    Dockerfile

  dr-stone-database/
    package.json
    tsconfig.json
    src/
      client/
      schema/
      repositories/
      queries/
      migrate.ts
      seed.ts
    migrations/

  tests/
    contract/
    integration/
```

Notes:

- Keep the folder name `dr-stone-scrapper/` to match the requested structure.
- Do not introduce more shared packages in the first migration unless there is a proven need.
- Move the current `migrations/` directory under `dr-stone-database/migrations/`.

## Stack Recommendation

Use a simple TypeScript monorepo instead of separate repositories.

- Workspace manager: `pnpm`
- Task orchestration: `turbo`
- Runtime: `Node.js 22`
- API framework: `Fastify`
- Validation: `zod`
- Logging: `pino`
- Database access: `pg` + `Kysely`
- Tests: `Vitest`
- Browser scraping for Amazon: `Playwright`
- HTTP-first scraping for KaBuM and similar sources: `undici` + `cheerio`

Why this stack:

- `pnpm` + `turbo` is enough for a small monorepo with 3 workspaces.
- `Fastify` is a clean replacement for the current Flask API.
- `Kysely` gives a typed database layer that both services can reuse without turning the repo into ORM-heavy codegen.
- The worker needs both HTTP-first and browser-based scraping, so the scraper design must support both strategies behind the same interface.

## Service Boundaries

### `dr-stone-api/`

Owns:

- public HTTP endpoints
- request validation
- response shaping
- health and readiness endpoints
- application services for tracked products and price history

Does not own:

- scraping source implementations
- worker scheduling loop
- migration files

### `dr-stone-scrapper/`

Owns:

- scheduled collection loop
- source adapter registry
- source-specific scraping logic
- result normalization and filtering
- scrape failure capture

Does not own:

- public CRUD HTTP API
- migration definitions

### `dr-stone-database/`

Owns:

- database connection factory
- typed schema
- repositories used by both services
- migration files and migration runner
- transaction helpers

Does not own:

- HTTP handlers
- source scraping logic

## Code Mapping From Python To TypeScript

Map the current Python modules into the new structure instead of redesigning the domain.

| Current Python module | Target TypeScript location |
|---|---|
| `src/dr_stone/api.py` | `dr-stone-api/src/routes/*`, `dr-stone-api/src/controllers/*` |
| `src/dr_stone/worker.py` | `dr-stone-scrapper/src/worker.ts` |
| `src/dr_stone/services/search_collection.py` | `dr-stone-scrapper/src/services/search-collection-service.ts` |
| `src/dr_stone/storage.py` | `dr-stone-database/src/repositories/*` |
| `src/dr_stone/repositories/price_history.py` | `dr-stone-database/src/repositories/price-history-repository.ts` |
| `src/dr_stone/config.py` | `dr-stone-api/src/env.ts`, `dr-stone-scrapper/src/env.ts` |
| `src/dr_stone/scrapers/kabum_search.py` | `dr-stone-scrapper/src/sources/kabum/kabum-source.ts` |
| `src/dr_stone/http.py`, `src/dr_stone/parsing.py` | `dr-stone-scrapper/src/http/*` |
| `src/dr_stone/normalizers.py`, `src/dr_stone/matching.py` | `dr-stone-scrapper/src/normalizers/*`, `dr-stone-scrapper/src/services/*` |

## Scraper Architecture

The worker should preserve the current source-adapter model, but make the execution strategy explicit.

Recommended interface:

```ts
export interface SearchSource {
  readonly sourceName: string;
  readonly strategy: "http" | "browser";
  buildSearchUrl(query: string): string;
  search(input: SearchInput, context: SourceContext): Promise<SearchRunResult>;
}
```

Recommended implementation rules:

- KaBuM stays `http` strategy first.
- Amazon starts as `browser` strategy using Playwright.
- Future sources must implement the same normalized `SearchRunResult` contract.
- Matching, selection of the lowest 4 prices, and persistence stay outside the source adapter.

This keeps the source logic reusable without forcing every source into the same transport.

## Database Package Design

`dr-stone-database/` should expose:

- `createDb(databaseUrl)`
- `runMigrations()`
- `TrackedProductsRepository`
- `SearchRunsRepository`
- `PriceHistoryRepository`
- `ScrapeFailuresRepository`

Recommended rules:

- Keep migrations in one place only: `dr-stone-database/migrations/`
- Both services import repository classes from `dr-stone-database`
- The API service and worker must not keep their own SQL copies
- Preserve the current schema shape first, then refactor schema only after parity is reached

## API Parity Requirements

The first TypeScript API version should preserve the current public contract from `docs/api.md`:

- `GET /`
- `GET /health`
- `GET /search-runs`
- `GET/POST /tracked-products`
- `GET/PUT/PATCH/DELETE /tracked-products/:id`
- `POST /tracked-products/:id?action=collect`
- `POST /collect-due`
- `GET /tracked-products/:id/history`
- `GET /price-history/minimums`

Do not redesign endpoint names during migration. The objective is language and service separation, not API churn.

## Deployment Model

The current Railway setup already deploys two services. Keep that model and change only the source paths and build commands.

Target Railway service mapping:

- Railway service `dr-stone-api` -> repo path `dr-stone-api/`
- Railway service `dr-stone-scrapper` -> repo path `dr-stone-scrapper/`

Operational recommendation:

- keep one shared Railway Postgres instance
- point both services to the same `DATABASE_URL`
- run migrations from `dr-stone-database`
- deploy API before worker when schema changes are possible

## GitHub Actions Plan

The deploy workflow should stop behaving like a single-root Python deployment and become a monorepo pipeline that always deploys both TypeScript services after validation.

### Target workflow shape

1. `validate`
2. `deploy-database` or `migrate-schema`
3. `deploy-api`
4. `smoke-api`
5. `deploy-scrapper`

### Validation job

Run on pushes to `master` and pull requests:

- checkout repo
- setup Node.js 22
- setup `pnpm`
- install workspace dependencies
- run `pnpm lint`
- run `pnpm typecheck`
- run `pnpm test`

### Migration job

Recommended behavior:

- run migrations from `dr-stone-database`
- execute once per deploy before the service deploys
- fail the pipeline if migration fails

Implementation note:

- if Railway service startup is the preferred place for migrations, keep the workflow step as a smoke check instead
- if migrations are run from GitHub Actions, add a dedicated production database secret for the migration command

### Deploy jobs

Deploy both services on every push to `master`, even if only one path changed, because that is the requested release model.

- `deploy-api`: deploy `dr-stone-api` Railway service
- `deploy-scrapper`: deploy `dr-stone-scrapper` Railway service

Recommended workflow changes:

- keep `concurrency: production-deploy`
- keep `RAILWAY_TOKEN` secret
- switch from Python/Docker root deployment to per-service deployment
- rename the worker deploy target from `dr-stone-worker` to `dr-stone-scrapper`

### Railway deployment options

Choose one and standardize it:

1. Configure each Railway service with its own `rootDirectory`, then deploy with `railway up --service ...`
2. Keep Railway service settings simple and run deploy commands from inside each subdirectory in GitHub Actions

Recommendation:

Use per-service `rootDirectory` on Railway and keep the workflow simple.

## Migration Phases

### Phase 1: Bootstrap the monorepo

- add root `package.json`
- add `pnpm-workspace.yaml`
- add `turbo.json`
- add base `tsconfig`
- create the three workspaces:
  - `dr-stone-api`
  - `dr-stone-scrapper`
  - `dr-stone-database`

Exit criteria:

- `pnpm install` works
- workspace scripts run from repo root

### Phase 2: Move the database layer first

- port the current Postgres schema and migrations into `dr-stone-database`
- implement typed repositories matching the current Python storage behavior
- create a migration runner CLI
- validate that migrations can bootstrap an empty database

Exit criteria:

- repository methods cover current API and worker needs
- migration runner works locally and in CI

### Phase 3: Build the TypeScript API

- reimplement the existing endpoints in `dr-stone-api`
- preserve request and response shapes from `docs/api.md`
- use the shared database package only
- add contract tests against the current documented API behavior

Exit criteria:

- TypeScript API passes API contract tests
- health endpoint and tracked-product flows work against Postgres

### Phase 4: Build the TypeScript worker

- port the collection loop from `src/dr_stone/worker.py`
- port the current matching and top-4-price persistence rules
- implement the source registry
- port the KaBuM source first

Exit criteria:

- worker can perform an end-to-end KaBuM collection and persist results
- failure logging and run tracking match current behavior

### Phase 5: Add Amazon as a browser-backed source

- convert the current Amazon investigation into a Playwright-based source adapter
- keep Amazon isolated behind the same `SearchSource` contract
- reuse the same normalized output shape used by KaBuM

Exit criteria:

- worker supports both KaBuM and Amazon without branching the orchestration layer

### Phase 6: Switch CI/CD and Railway services

- replace the current Python deploy workflow
- deploy the API from `dr-stone-api/`
- deploy the worker from `dr-stone-scrapper/`
- run smoke checks after API deploy

Exit criteria:

- GitHub Actions deploys both services on every push to `master`
- Railway production uses only TypeScript services

### Phase 7: Decommission Python

- remove Python Dockerfiles
- remove `pyproject.toml`
- remove `src/dr_stone/`
- remove Python test suite after TypeScript parity is confirmed

Exit criteria:

- no production path depends on Python
- docs reflect only the TypeScript architecture

## Testing Plan

Add tests at three levels:

- unit tests for normalizers, matching, and source parsing
- integration tests for repositories and migrations against Postgres
- contract tests for API response parity

Recommended additional coverage:

- KaBuM HTML fixture tests
- Amazon Playwright smoke tests with a narrow scope
- worker loop tests for retries and failure recording

## Risks

### 1. Schema drift during the migration

Risk:

- TypeScript services and Python code may write slightly different records during a partial rollout

Mitigation:

- move the database package first
- keep schema changes minimal until the Python services are retired

### 2. Amazon anti-bot instability

Risk:

- Amazon can become unreliable if treated like KaBuM

Mitigation:

- keep Amazon browser-only from day one
- isolate browser concerns inside the Amazon adapter

### 3. Deployment order issues

Risk:

- worker deploys against a schema that has not been migrated yet

Mitigation:

- run migrations before both deploys
- deploy API before worker

### 4. Over-sharing code too early

Risk:

- creating many shared packages too early slows down the migration

Mitigation:

- share only the database package at first
- add more packages only after duplication becomes real

## Recommended Order of Execution

1. Create the TypeScript monorepo scaffolding.
2. Move schema, migrations, and repositories into `dr-stone-database/`.
3. Port the API into `dr-stone-api/` with contract parity.
4. Port the worker into `dr-stone-scrapper/` with KaBuM support.
5. Add Amazon as a Playwright-backed adapter.
6. Update GitHub Actions to validate once and always deploy both services.
7. Point Railway services to the new paths and cut over production.
8. Remove Python after a stable production window.

## Definition of Done

The migration is complete when:

- the repository contains `dr-stone-api/`, `dr-stone-scrapper/`, and `dr-stone-database/`
- both deployable services run only TypeScript in production
- the shared database package is the only source of migrations and database access
- the GitHub Actions workflow validates the monorepo and deploys both Railway services on every push to `master`
- the public API contract remains compatible with the current documented endpoints
