# Local Test Runs

Use Docker Compose for the full local test workflow in this repository.

## Prerequisites

- Docker and Docker Compose must be installed.
- `.env` is optional at the repo root.
- If you need to override the default Compose database URL locally, define `TEST_DATABASE_URL` in `.env`:

```bash
TEST_DATABASE_URL=postgresql://dr_stone:dr_stone@postgres:5432/dr_stone_test
```

## Run The Full Test Suite

```bash
docker compose run --build --rm tests
```

What this does:

- starts the `postgres` service defined in [docker-compose.yml](/home/leonardo-silva/workspace/personal/dr-stone/docker-compose.yml)
- builds the Python 3.12 test image from [docker/test.Dockerfile](/home/leonardo-silva/workspace/personal/dr-stone/docker/test.Dockerfile)
- runs `python -m pytest` inside the container

## Run A Specific Test File

```bash
docker compose run --build --rm tests tests/test_api.py
```

## Run A Filtered Test Selection

```bash
docker compose run --build --rm tests tests/test_api.py -k price_history_minimums
```

## Useful Cleanup

Stop Compose services:

```bash
docker compose down
```

Remove containers, networks, and volumes if you want a clean database state:

```bash
docker compose down -v
```

## Notes For New API Endpoints

- If a test depends on Postgres fixtures, run it through Docker Compose instead of the incomplete local `.venv`.
- Prefer adding a focused `tests/test_api.py -k ...` command while iterating, then finish with the full suite.
