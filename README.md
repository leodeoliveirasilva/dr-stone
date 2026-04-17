# Dr. Stone

Dr. Stone is a TypeScript monorepo for collecting product prices, storing historical results in Postgres, and serving that data through a Fastify API.

Frontend work lives in the sibling repository `../dr-stone-frontend`.

## Packages

- `dr-stone-api`: Fastify API for tracked products, search runs, and price history
- `dr-stone-database`: Postgres access layer and migrations
- `dr-stone-scrapper`: scraping runtime and scheduled worker
- `tests`: Vitest coverage for API and worker behavior

## Requirements

- Node `24.14.0`
- `pnpm` via Corepack
- Docker and Docker Compose for the local Postgres instance

## Install

```bash
nvm use 24.14.0
corepack enable
pnpm install --frozen-lockfile
```

## Local Environment

The API and worker auto-load the repository root `.env` file via `dotenv`.

Recommended setup:

```bash
cp .env.example .env
```

Populate at least:

- `DATABASE_URL`

Proxy support (`PROXY_SERVER`, `PROXY_USER`, `PROXY_PASSWORD`) is currently
**disabled** to avoid the recurring infra cost. The proxy plumbing is still in
the codebase — set all three variables again to re-enable it for the
browser-backed sources (`amazon`, `pichau`, `mercadolivre`). When unset the
sources connect directly.

## Local Postgres

Start Postgres for local development and tests:

```bash
docker compose up -d postgres
```

The Compose service exposes Postgres on `127.0.0.1:15432`.

## Validate

```bash
export TEST_DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
pnpm lint
pnpm typecheck
pnpm test
```

## Run Locally

With `.env` populated, build the workspace first:

```bash
pnpm build
```

Start the API:

```bash
pnpm start:api
```

Run the worker once:

```bash
pnpm worker:once
```

Run the worker continuously:

```bash
pnpm start:worker
```

## Running a Single Scrapper Locally

Use `source:run` to exercise one source adapter end-to-end without the
database/queue pipeline. Output is the raw `SearchRunResult` JSON, preceded by
Pino log lines on stderr.

```bash
pnpm build
pnpm source:run kabum "rtx 4070"
pnpm source:run amazon "echo dot"
pnpm source:run pichau "rtx 4070"
pnpm source:run mercadolivre "echo dot"
```

Notes:

- Requires a working internet connection and (for non-`kabum` sources) the
  Playwright Chromium browser (installed by `pnpm install`).
- `DATABASE_URL` is not needed — the script uses a dummy connection string
  because no DB writes happen.
- To exercise the proxy path, set `PROXY_SERVER`, `PROXY_USER`, and
  `PROXY_PASSWORD` in the environment before running. Leave them unset (or
  empty) to connect directly.
- `kabum` uses plain HTTP; the other three launch Playwright Chromium.
- `mercadolivre` performs a homepage warm-up first — expect ~30s per run.

## API

- Reference: [docs/api.md](/home/leonardo-silva/workspace/personal/dr-stone/docs/api.md)
- `GET /` returns `{"name":"dr-stone-api","status":"ok"}`
- Swagger UI: `GET /docs`
- OpenAPI JSON: `GET /openapi.json`

## Deployment

GitHub Actions validates the workspace on Node `24.14.0`, then deploys:

- `Dockerfile` to Railway service `dr-stone-api`
- `Dockerfile.worker` to Railway service `dr-stone-worker`
