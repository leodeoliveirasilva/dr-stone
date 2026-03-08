# Dr. Stone

Dr. Stone is a price-tracking project focused on collecting product data from the web and storing its history over time.

This repository now contains only backend/API and scraping code.
Frontend planning and implementation live in the sibling directory `../dr-stone-frontend`.
Frontend onboarding docs are in:

- `../dr-stone-frontend/docs/API_SPEC.md`
- `../dr-stone-frontend/docs/TECHNOLOGY_SPEC.md`
- `../dr-stone-frontend/docs/FRONTEND_SKILLS.md`

The current implementation covers the first scraping foundation:

- Python 3.12 package structure
- HTTP-first fetcher with retries and configurable headers
- configurable pacing, explicit empty-body handling, and structured scrape failures
- normalization helpers for price, currency, and availability
- structured JSON logging
- a registry-based search collector that runs every tracked product against every registered source
- support for up to 5 tracked search terms per product
- case-insensitive matching that requires all tracked search terms to appear in the scraped result title
- persistence of only the 4 lowest matching prices for each source-specific search run
- one global collection cadence, with `4` runs per day as the default worker interval
- Postgres-backed persistence for tracked searches, runs, matched items, and failures

The tracked search flow works like this:

- store a product title and `1..5` search terms in the database
- build one source query by joining the tracked search terms with spaces
- run that query against every registered source adapter in the project
- keep only results whose title contains all tracked search terms, ignoring case
- persist only the 4 cheapest matching results for each source-specific run
- run the worker on one global schedule for all tracked searches

Tracked products are no longer pinned to one source. Search runs still record their concrete `source_name`, but the tracked product itself is source-agnostic.
Tracked products also no longer carry their own scrape frequency. The collection cadence is global and controlled by the worker interval.

## Current Source Strategy

All tracked products are collected from every registered scraper in `src/dr_stone/scrapers/`.

Today, the only registered source is KaBuM, and its collector is HTTP-first and reads server-rendered listing data:

- fetch the KaBuM search/listing page with regular HTTP
- parse the embedded `__NEXT_DATA__` payload
- iterate listing pages when the result set spans multiple pages
- avoid browser rendering unless KaBuM stops returning usable listing JSON

## Project Layout

- `src/dr_stone/`: scraping package
- `src/dr_stone/scrapers/`: source adapters
- `migrations/`: database schema files
- `docs/api.md`: HTTP API contract
- `docs/sources/`: source-specific scraping assumptions
- `tests/`: pytest suite

## API Docs

- API reference: [docs/api.md](/home/leonardo-silva/workspace/personal/dr-stone/docs/api.md)
- `GET /` returns `{"name":"dr-stone-api","status":"ok"}`

## Quick Start

Install dependencies into a local target directory:

```bash
python3 -m pip install --target .deps beautifulsoup4 httpx pytest
```

Run `pytest` directly if you only need the tests that do not require a Postgres service:

```bash
PYTHONPATH=src:.deps python3 -m pytest
```

Run the full Postgres-backed test suite with Docker Compose:

```bash
docker compose run --build --rm tests
```

The Docker test runner starts a Postgres container for the database-backed tests, then builds a Python 3.12 test image so the test environment stays aligned with this project's runtime requirement.

Run the API locally against Postgres:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@localhost:5432/dr_stone_test
python -m flask --app dr_stone.api:create_app run --debug --host 0.0.0.0 --port 8000
```

Run the scheduled worker once:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@localhost:5432/dr_stone_test
dr-stone-worker --run-once
```

Run the scheduled worker continuously:

```bash
export DATABASE_URL=postgresql://dr_stone:dr_stone@localhost:5432/dr_stone_test
dr-stone-worker
```

Add a tracked search:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli add --db-path .data/dr_stone.sqlite3 --title "RX 9070 XT Sapphire" --search-term "RX 9070 XT" --search-term "Sapphire"
```

Collect tracked searches:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli collect --db-path .data/dr_stone.sqlite3
```

Collect only searches that are due now:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli collect-due --db-path .data/dr_stone.sqlite3
```

`collect-due` is kept as a compatibility alias and follows the same global cadence as `collect`.

List tracked searches:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli list --db-path .data/dr_stone.sqlite3
```

Show price history for one tracked search:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli history --db-path .data/dr_stone.sqlite3 --tracked-product-id YOUR_TRACKED_PRODUCT_ID
```

Environment variables are documented in `.env.example`.

## Railway Deployment

This repository is set up to deploy the API to Railway from the repo `Dockerfile` on every push to `master`.

Add this GitHub repository secret:

- `RAILWAY_TOKEN`

The deploy workflow is [deploy.yml](/home/leonardo-silva/workspace/personal/dr-stone/.github/workflows/deploy.yml). It:

- runs the Postgres-backed test suite with Docker Compose
- links to the Railway project `dr-stone`
- deploys the `dr-stone-api` service using the repo `Dockerfile`

To run background collection on Railway, create a second service from this repo and point it at [Dockerfile.worker](/home/leonardo-silva/workspace/personal/dr-stone/Dockerfile.worker). The worker runs one collection cycle immediately on boot, then repeats every `21600` seconds by default, which is 4 times per day.
