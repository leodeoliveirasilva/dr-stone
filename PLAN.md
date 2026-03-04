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

For the initial version on **Cloudflare Free**, use **HTTP-first extraction in Python**.

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
- API/backend: `Python Workers` on Cloudflare Workers
- Database: `Cloudflare D1`
- Scheduling: `Cron Triggers`
- Queueing: `Cloudflare Queues` if needed later

### Cloudflare deployment target

The deployment target for this backend is **Cloudflare Free**.

Preferred backend architecture:

- run APIs and lightweight scraping jobs on `Cloudflare Workers`
- use `D1` as the initial database
- keep browser rendering optional and constrained

### Cloudflare Free constraints

Important limits to design around:

- Pages Functions and Workers Free plan share `100,000` requests per day
- D1 Free plan includes `5 million` rows read per day, `100,000` rows written per day, and `5 GB` storage
- Browser Rendering Free plan includes `10 minutes` of browser usage per day

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
- create the Cloudflare-compatible backend service
- configure D1
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
- D1 migration files
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
- stored price history in D1

## Phase 4: Scheduling and Automation

Goal: make collection continuous and safe.

Tasks:

- schedule recurring scraping jobs with Cron Triggers
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

Goal: deploy backend safely on Cloudflare Free and observe usage.

Tasks:

- configure Worker deployment and environment bindings
- bind D1 database to the Worker
- configure Cron Triggers for scheduled scraping
- define development and production environments
- monitor request counts and D1 usage

Deliverables:

- deployed Worker API
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

Keep this repository backend-only: Python Workers + D1, HTTP-first scraping, and stable API contracts.

Use `../dr-stone-frontend` for frontend specs, UI implementation, and frontend deployment pipeline.
