# Dr. Stone Backend Task Breakdown

This file tracks backend-only execution tasks for `dr-stone`.

Frontend scope moved to:
`../dr-stone-frontend`

Priority order for backend MVP:

1. Build local scraping flow
2. Persist history reliably
3. Expose data through backend API
4. Automate collection with schedule
5. Deploy and harden backend operations

## Milestone 1: Python Scraping Foundation

Goal: get one scraper working locally before adding platform complexity.

- [x] Create the Python project structure (`src/`, `tests/`, `migrations/`, `docs/`)
- [x] Set up Python `3.12+` tooling and dependency management
- [x] Add base dependencies for HTTP-first scraping (`httpx`, parser library, test tools)
- [x] Define environment/config loading for timeouts, user agent, retries, and log level
- [x] Create a shared scraper result model for title, URL, price, currency, availability, and raw metadata
- [x] Define a scraper interface for store-specific adapters
- [x] Implement a first HTTP client with headers, timeout, and retry policy
- [x] Implement HTML parsing helpers for text cleanup and selector lookup
- [x] Implement price normalization helpers for numeric and currency parsing
- [x] Add structured logging for fetch success, parse success, and failures

Definition of done:

- one command can run a local scrape against a single URL
- the result is returned in a normalized Python object

## Milestone 2: First Store Adapter

Goal: support one real source end to end with HTTP-first search extraction.

- [x] Choose first target store and document product listing structure
- [x] Capture sample HTML fixtures for parser development
- [x] Implement first source adapter with search-result extraction
- [x] Add parser validation rules so empty or invalid values fail clearly
- [x] Store raw extraction context useful for debugging
- [x] Create CLI or script entrypoint to run adapter against a URL
- [x] Verify adapter against fixture data and a live page

Definition of done:

- one supported store can be scraped repeatedly with stable output
- failures include enough context to debug selector or response issues

## Milestone 3: Database and History Storage

Goal: persist tracked searches, query runs, and lowest-price history.

- [x] Define schema for `tracked_products`
- [x] Define schema for `search_runs`
- [x] Define schema for `search_run_items`
- [x] Define schema for `scrape_failures`
- [x] Create first database migration files
- [x] Define append-only rules for historical search results
- [x] Implement write flow from search run to persisted lowest prices
- [x] Persist only the 4 minimum matching prices from each run
- [x] Store timestamps consistently in UTC

Definition of done:

- a successful search run creates tracked history rows
- lowest-price history is saved for each scheduled run

## Milestone 4: Backend API

Goal: expose scraping and history data through a Railway-hosted backend.

- [x] Create backend API layer
- [x] Add health check endpoint
- [x] Add endpoint to list tracked products
- [x] Add endpoint to fetch product price history
- [x] Add endpoint to query search runs by date
- [x] Add explicit API schema docs maintained with backend changes

Definition of done:

- backend can serve tracked products and history data
- response contracts are stable and documented

## Milestone 5: Scheduling and Automation

Goal: run collection without manual commands.

- [ ] Define scrape frequency rules by tracked search term (schema field exists but scheduler uses global interval only)
- [x] Run each tracked search every 12 hours by default
- [x] Add scheduled trigger support for scraping
- [x] Prevent overlapping or duplicate scheduled runs
- [x] Retry transient failures with explicit limits
- [x] Track run counts, durations, and failure rates
- [ ] Add operational view of latest scrape status per source (/search-runs exists but no per-source status summary)

Definition of done:

- scheduled runs execute safely on fixed cadence
- duplicate and runaway jobs are controlled

## Milestone 6: Deployment and Operations

Goal: run backend MVP on Railway with clear operating limits.

- [x] Configure Railway deployment pipeline
- [x] Bind Postgres database to API environment
- [x] Configure development and production environments explicitly
- [x] Configure scheduled scraping in production
- [ ] Monitor request volume and database usage
- [ ] Document hosting and scrape-rate limits affecting collection frequency

Definition of done:

- backend is deployed and scheduled in production
- usage is visible enough to stay within free-tier constraints

## Milestone 7: Hardening

Goal: make backend stable enough for continuous use.

- [ ] Expand automated tests for services, adapters, and API responses (API + scheduler + pichau + worker covered; kabum/amazon adapters lack dedicated tests)
- [x] Add structured logs across scrape, persistence, and API layers
- [x] Add polite delays and rate limits per source (global REQUEST_DELAY_SECONDS; per-source limits not yet implemented)
- [x] Review robots.txt and terms before enabling each source
- [ ] Add operational docs for debugging failed scrapes (partial coverage in CRAWLING.md and source docs)
- [x] Define clear criteria to escalate from HTTP-first scraping to browser rendering

Definition of done:

- backend is safer to operate continuously
- scraping decisions and operational limits are documented
