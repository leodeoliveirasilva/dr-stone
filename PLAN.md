# Dr. Stone Backend Project Plan

This repository now contains only the backend/API and scraping pipeline.

Frontend specification and frontend implementation were moved to:
`../dr-stone-frontend`

## Stack Decision

### Recommended language

**Python** is the best language for this project.

Why:

- mature ecosystem for scraping, parsing, automation, and data processing
- strong libraries for extraction, normalization, and persistence
- good fit for data quality checks and history analysis

### Recommended scraping approach

For the initial version on **Railway**, use **HTTP-first extraction in Python**.

Why:

- free-tier browser time is limited
- many product pages can still be scraped via HTML or embedded JSON
- HTTP-first scraping is cheaper and easier to schedule

### Browser rendering strategy

Use browser rendering only when a source cannot be scraped reliably with regular HTTP requests.

### Initial technical direction

- Language: `Python 3.12+`
- Scraping engine: `httpx` + parser first
- HTML parsing: `BeautifulSoup` or `lxml`
- API/backend: `Flask` served with `gunicorn`
- Database: `Postgres` on Railway
- Scheduling: internal or external cron trigger hitting the API
- Queueing: optional future addition if needed later

### Railway deployment target

The deployment target for this backend is **Railway**.

Preferred backend architecture:

- run the API in a Dockerized Python service on Railway
- use `Postgres` as the primary database
- keep browser rendering optional and constrained

### Railway constraints

Important limits to design around:

- service memory and CPU limits on the selected Railway plan
- Postgres storage growth and connection limits
- scraper request volume and remote site rate limits

Because of these limits, the first version should optimize for:

- low scraping frequency
- a small number of monitored products
- selective scraping only for tracked products

## Product Goal

Build a backend platform that:

- stores tracked products
- scrapes source listings
- extracts current prices and links
- keeps historical snapshots of price changes
- serves API responses for frontend consumption

## Phase 1: Foundation

Goal: create a reliable base before scaling source coverage.

Tasks:

- define backend project structure
- create the Railway-compatible backend service
- configure Postgres
- create schema setup
- define core database schema

Deliverables:

- runnable backend skeleton
- database connected
- first schema created
- health check endpoint

## Phase 2: Data Model

Goal: design minimum entities required for tracking products and prices.

Initial entities:

- `tracked_products`
- `search_runs`
- `search_run_items`
- `scrape_failures`

Deliverables:

- normalized schema
- Postgres migration files
- clear historical record rules

## Phase 3: Scraping Core

Goal: implement the first working scraping flow.

Tasks:

- create fetch-and-parse scraping service
- implement a scraper interface for sources
- extract title, URL, price, currency, and availability
- persist historical snapshots
- log failures with enough context for debugging

Deliverables:

- one end-to-end scraping pipeline
- one supported source/store
- stored price history in Postgres

## Phase 4: Scheduling and Automation

Goal: make collection continuous and safe.

Tasks:

- schedule recurring scraping jobs
- define frequency per tracked product
- prevent duplicate runs
- retry transient failures
- track run duration and status

Deliverables:

- scheduled scraping execution
- job monitoring data
- retry policy

## Phase 5: API Layer

Goal: expose data for frontend and analytics use cases.

Tasks:

- create endpoints for tracked products CRUD
- expose search run history
- expose product history queries
- define response contracts with predictable schemas

Deliverables:

- stable backend API
- frontend-consumable response contracts

## Phase 6: Deployment and Operations

Goal: deploy backend safely on Railway and observe usage.

Tasks:

- configure Docker-based Railway deployment and environment bindings
- bind Postgres to the API service
- configure scheduled scraping entrypoints
- define development and production environments
- monitor deploy health, runtime logs, and database usage

Deliverables:

- deployed Railway API
- scheduled scrape execution in production
- basic usage monitoring

## Phase 7: Hardening

Goal: keep backend stable for continuous operation.

Tasks:

- add automated tests for parsers, services, and API responses
- add structured logs
- add rate limiting and polite delays
- document scraping assumptions per source
- review robots.txt and terms per source before enabling scraping

Deliverables:

- safer and more maintainable scraping workflow
- better observability

## Final Recommendation

Keep this repository backend-only: Python API + Postgres on Railway, HTTP-first scraping, and stable API contracts.

Use `../dr-stone-frontend` for frontend specs, UI implementation, and frontend deployment pipeline.
