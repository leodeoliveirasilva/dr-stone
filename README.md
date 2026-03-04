# Dr. Stone

Dr. Stone is a price-tracking project focused on collecting product data from the web and storing its history over time.

The current implementation covers the first scraping foundation:

- Python 3.12 package structure
- HTTP-first fetcher with retries and configurable headers
- configurable pacing, explicit empty-body handling, and structured scrape failures
- normalization helpers for price, currency, and availability
- structured JSON logging
- a KaBuM search collector for tracked search terms
- case-insensitive matching between the tracked product title and the scraped result title
- persistence of only the 4 lowest matching prices for each search run
- due-run selection based on `scrapes_per_day`, with `4` runs per day as the default
- D1-compatible SQLite migrations and persistence for tracked searches, runs, matched items, and failures

The tracked search flow works like this:

- store a product title and a search term in the database
- scrape KaBuM search results for that term
- keep only results whose title contains the stored product title, ignoring case
- persist only the 4 cheapest matching results for each run
- schedule each tracked search to run 4 times per day

## Current KaBuM Strategy

The search collector is HTTP-first and reads server-rendered listing data:

- fetch the KaBuM search/listing page with regular HTTP
- parse the embedded `__NEXT_DATA__` payload
- iterate listing pages when the result set spans multiple pages
- avoid browser rendering unless KaBuM stops returning usable listing JSON

## Project Layout

- `src/dr_stone/`: scraping package
- `src/dr_stone/scrapers/`: source adapters
- `migrations/`: D1-compatible schema files
- `docs/sources/`: source-specific scraping assumptions
- `tests/`: pytest suite

## Quick Start

Install dependencies into a local target directory:

```bash
python3 -m pip install --target .deps beautifulsoup4 httpx pytest
```

Run tests:

```bash
PYTHONPATH=src:.deps python3 -m pytest
```

Run tests with Docker Compose:

```bash
docker compose run --rm tests
```

The Docker test runner builds from Cloudflare's official Python sandbox image and then installs Python 3.12 inside the container so it stays aligned with this project's runtime requirement.

Run the Worker locally with Cloudflare's Python runtime:

```bash
uv sync --group dev
uv run pywrangler dev
```

Add a tracked search:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli add --db-path .data/dr_stone.sqlite3 --title "RX 9070 XT" --search-term "RX 9070 XT"
```

Collect tracked searches:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli collect --db-path .data/dr_stone.sqlite3
```

Collect only searches that are due now:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli collect-due --db-path .data/dr_stone.sqlite3
```

List tracked searches:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli list --db-path .data/dr_stone.sqlite3
```

Show price history for one tracked search:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.search_cli history --db-path .data/dr_stone.sqlite3 --tracked-product-id YOUR_TRACKED_PRODUCT_ID
```

Environment variables are documented in `.env.example`.

## Cloudflare Deployment

This repository is set up to deploy a Python Worker to Cloudflare on every push to `master`, which is the branch event produced by a merged pull request.

Before the workflow can deploy, create the Worker/D1 resources in Cloudflare and update [wrangler.jsonc](/home/leonardo-silva/workspace/personal/dr-stone/wrangler.jsonc):

- set `database_id` to the real D1 database ID
- set `preview_database_id` to the preview/local D1 database ID you want to use
- keep the `DB` binding name aligned with the Worker code

Add these GitHub repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The deploy workflow is [deploy.yml](/home/leonardo-silva/workspace/personal/dr-stone/.github/workflows/deploy.yml). It:

- installs the Python Worker toolchain with `uv`
- runs `compileall` and `pytest`
- applies remote D1 migrations from `migrations/`
- deploys the Worker with `pywrangler`

The Worker is configured with a cron trigger of `0 */6 * * *`, which runs 4 times per day on the Cloudflare free plan.
