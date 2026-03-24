# Local Test Runs

## Prerequisites

- Node.js 24.14.0 (via `nvm use`)
- pnpm via Corepack (`corepack enable`)
- Docker and Docker Compose for the test Postgres instance

## Start The Test Database

```bash
docker compose up -d postgres
```

This starts Postgres on `127.0.0.1:15432`.

## Set The Test Database URL

```bash
export TEST_DATABASE_URL=postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone_test
```

Or add it to your `.env` file at the repo root.

## Run The Full Test Suite

```bash
pnpm test
```

This runs `vitest run` against all test files in `tests/`.

## Run A Specific Test File

```bash
pnpm exec vitest run tests/api.test.ts
```

## Run A Filtered Test Selection

```bash
pnpm exec vitest run tests/api.test.ts -t "price_history_minimums"
```

## Useful Cleanup

Stop Compose services:

```bash
docker compose down
```

Remove containers, networks, and volumes for a clean database state:

```bash
docker compose down -v
```

## Notes

- Tests require a running Postgres instance. Always start the Docker Compose Postgres service before running tests.
- Prefer running a specific test file with `-t` filter while iterating, then finish with the full suite.
- CI uses a GitHub Actions Postgres service container instead of Docker Compose.
