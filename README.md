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

Build the workspace first:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
pnpm build
```

Start the API:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
pnpm start:api
```

Run the worker once:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
pnpm worker:once
```

Run the worker continuously:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
pnpm start:worker
```

## API

- Reference: [docs/api.md](/home/leonardo-silva/workspace/personal/dr-stone/docs/api.md)
- `GET /` returns `{"name":"dr-stone-api","status":"ok"}`

## Deployment

GitHub Actions validates the workspace on Node `24.14.0`, then deploys:

- `Dockerfile` to Railway service `dr-stone-api`
- `Dockerfile.worker` to Railway service `dr-stone-worker`
