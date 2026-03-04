# Dr. Stone Task Breakdown

This file turns `PLAN.md` into a smaller, execution-oriented backlog.

Priority order for the MVP:

1. Build a local Python scraping flow first
2. Persist scraped history reliably
3. Expose the data through a backend API
4. Build the dashboard on top of that API
5. Deploy and harden the system

## Milestone 1: Python Scraping Foundation

Goal: get one scraper working locally before adding platform complexity.

- [x] Create the Python project structure (`src/`, `tests/`, `scripts/`, `fixtures/`)
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

Goal: support one real source end to end with HTTP-first extraction.

- [x] Choose the first target store and document its product page structure
- [x] Capture one or more sample HTML fixtures for parser development
- [x] Implement the first source adapter with selectors for title, price, currency, URL, and availability
- [x] Add parser validation rules so empty or invalid values fail clearly
- [x] Store raw extraction context useful for debugging
- [x] Create a CLI or script entrypoint to run the adapter against a URL
- [x] Verify the adapter works against fixture data and a live page

Definition of done:

- one supported store can be scraped repeatedly with stable output
- failures include enough context to debug selector or response issues

## Milestone 3: Scraping Quality Guardrails

Goal: make the first scraper safe to extend.

- [x] Add unit tests for price normalization
- [x] Add fixture-based parser tests for the first adapter
- [ ] Add HTTP error handling for redirects, `4xx`, `5xx`, and empty bodies
- [ ] Add anti-block basics: realistic headers, pacing, and explicit retry limits
- [ ] Define when browser rendering is allowed instead of plain HTTP
- [ ] Add a failure record format for fetch errors, parse errors, and validation errors
- [ ] Document assumptions and limitations for the first store

Definition of done:

- the first adapter has repeatable tests
- scraper behavior is explicit for the most common failure modes

## Milestone 4: Database and History Storage

Goal: persist product metadata and historical snapshots.

- [ ] Define the initial schema for `products`
- [ ] Define the initial schema for `product_sources`
- [ ] Define the initial schema for `price_snapshots`
- [ ] Define the initial schema for `scrape_jobs`
- [ ] Define the initial schema for `scrape_failures`
- [ ] Create the first D1 migration files
- [ ] Define append-only rules for historical snapshots
- [ ] Implement the write flow from scraper result to `price_snapshots`
- [ ] Prevent duplicate snapshots when nothing changed
- [ ] Store timestamps consistently in UTC

Definition of done:

- a successful scrape creates or updates product/source records
- price history is saved as normalized snapshots

## Milestone 5: End-to-End Scraping Pipeline

Goal: connect scraping and persistence in one runnable workflow.

- [ ] Create an application service that loads a tracked product source and runs the correct adapter
- [ ] Persist successful scrapes and failed scrapes through one pipeline
- [ ] Record scrape start, finish, duration, and status in `scrape_jobs`
- [ ] Add an idempotent command to scrape one tracked product
- [ ] Add an idempotent command to scrape all tracked products
- [ ] Validate that one full run produces job records, snapshots, and failures correctly

Definition of done:

- one command runs the full scrape pipeline for tracked products
- each run leaves a complete audit trail in the database

## Milestone 6: Backend Service

Goal: expose scraping and history data through a Cloudflare-compatible backend.

- [ ] Create the backend project structure for the Worker layer
- [ ] Add a health check endpoint
- [ ] Add an endpoint to list tracked products
- [ ] Add an endpoint to fetch product price history
- [ ] Add chart-friendly response formatting by date and source
- [ ] Keep aggregation logic in backend responses, not in the UI
- [ ] Define environment bindings for D1 and other runtime config

Definition of done:

- the backend can serve tracked products and history data
- the history endpoint is usable by the future frontend without reshaping on the client

## Milestone 7: Scheduling and Automation

Goal: run collection without manual commands.

- [ ] Define scrape frequency rules by product or source
- [ ] Add Cron Trigger support for scheduled scraping
- [ ] Prevent overlapping or duplicate scheduled runs
- [ ] Retry transient failures with explicit limits
- [ ] Track run counts, durations, and failure rates
- [ ] Add a simple operational view of the last scrape status per source

Definition of done:

- scheduled runs can execute safely on a fixed cadence
- duplicate and runaway jobs are controlled

## Milestone 8: Additional Source Adapters

Goal: expand source coverage without coupling the system to one store.

- [ ] Extract reusable adapter base utilities from the first store implementation
- [ ] Add a second store adapter
- [ ] Add a third store adapter if still inside MVP scope
- [ ] Support fallback selectors per store
- [ ] Reuse normalization and validation rules across adapters
- [ ] Document source-specific assumptions, blockers, and escalation paths

Definition of done:

- at least two stores share the same adapter contract
- new sources can be added without changing core pipeline logic

## Milestone 9: Frontend Dashboard

Goal: visualize tracked products and history.

- [ ] Create the Nuxt frontend structure
- [ ] Set up TypeScript, Tailwind, and Pinia
- [ ] Create the main dashboard layout and navigation
- [ ] Implement a product list view
- [ ] Implement a product detail view
- [ ] Add filters by product, source, and time range
- [ ] Render price history charts with Apache ECharts
- [ ] Connect frontend data fetching to backend endpoints

Definition of done:

- users can browse products and inspect price history visually
- charts work from real backend data

## Milestone 10: Deployment and Operations

Goal: run the MVP on Cloudflare Free with clear limits.

- [ ] Configure Pages deployment for the frontend
- [ ] Configure Worker deployment for the backend
- [ ] Bind the D1 database to the Worker environment
- [ ] Configure development and production environments
- [ ] Configure Cron Triggers in production
- [ ] Monitor request volume, D1 usage, and browser-rendering usage
- [ ] Document the free-tier limits that affect scrape frequency and source count

Definition of done:

- the MVP is deployed and scheduled in production
- usage is visible enough to stay within free-tier constraints

## Milestone 11: Hardening

Goal: make the system stable enough for continuous use.

- [ ] Expand automated tests for services, adapters, and API responses
- [ ] Add structured logs across scrape, persistence, and API layers
- [ ] Add polite delays and rate limits per source
- [ ] Review robots.txt and terms before enabling each source
- [ ] Add operational docs for debugging failed scrapes
- [ ] Define when to escalate from HTTP-first scraping to browser rendering
- [ ] Review whether Cloudflare Python Workers remain a good fit or whether parts should move to TypeScript

Definition of done:

- the system is safer to operate continuously
- scraping decisions and operational limits are documented

## Suggested First Execution Slice

If you want to start immediately, do these first:

1. Create the Python project skeleton and dependencies
2. Implement the shared scraper result model and scraper interface
3. Build one HTTP-first adapter for a single store
4. Add fixture-based tests for parsing and normalization
5. Save the first successful scrape into D1
