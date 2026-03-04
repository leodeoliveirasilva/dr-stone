# Dr. Stone Project Plan

## Stack Decision

### Recommended language

**Python** is the best language for this project.

Why:

- mature ecosystem for scraping, parsing, automation, and data processing
- strong libraries for browser automation and HTML extraction
- easy integration with databases, schedulers, and analytics tools
- good long-term fit for price history analysis and chart generation

### Recommended scraping approach

For the initial version on **Cloudflare Free**, the best scraping approach is **HTTP-first extraction in Python**.

Why:

- free-tier browser time is limited, so full browser automation should not be the default
- many product pages can still be scraped from HTML or embedded JSON responses
- HTTP-first scraping is cheaper, simpler, and easier to run on a schedule
- parsing and normalization are still a strong fit for Python

### Browser rendering strategy

Use browser rendering only when a source cannot be scraped reliably with regular HTTP requests.

Use cases:

- pages that render price data only after JavaScript execution
- sites that hide product data inside client-side state
- flows that require interaction before the real price is visible

### Secondary scaling path

If the project later outgrows Cloudflare Free and needs larger crawl volume, evaluate:

- `Scrapy` for broader crawling orchestration
- external workers or a VM/container runtime for heavier browser automation

### Initial technical direction

- Language: `Python 3.12+`
- Scraping engine: `httpx` + parser first, `Browser Rendering` only when needed
- HTML parsing: `BeautifulSoup` or `lxml`
- API/backend: `Python Workers` on Cloudflare Workers
- Frontend framework: `Vue 3`
- Frontend app framework: `Nuxt 4`
- Frontend language: `TypeScript`
- State management: `Pinia`
- UI styling: `Tailwind CSS`
- Charts/dashboard: `Apache ECharts`
- Database: `Cloudflare D1`
- Object/file storage: `Cloudflare R2` if needed later
- Scheduling: `Cron Triggers`
- Queueing: `Cloudflare Queues` if needed later

### Cloudflare deployment target

The deployment target for this project is **Cloudflare Free**.

This changes the preferred architecture:

- deploy the Vue dashboard with `Nuxt` on `Cloudflare Pages`
- run APIs and lightweight scraping jobs on `Cloudflare Workers`
- use `D1` as the initial database to stay inside the Cloudflare platform
- use `Browser Rendering` only for pages that require JavaScript execution

### Cloudflare Free constraints

Important limits to design around:

- Pages Free plan: `500` builds per month
- Pages Functions and Workers Free plan share `100,000` requests per day
- D1 Free plan includes `5 million` rows read per day, `100,000` rows written per day, and `5 GB` storage
- Browser Rendering Free plan includes `10 minutes` of browser usage per day

Because of these limits, the first version should optimize for:

- low scraping frequency
- a small number of monitored products
- selective scraping only for tracked URLs
- browser rendering only when simple HTTP parsing is not enough

### Frontend recommendation

For the dashboard and historical data visualization, use **Vue 3 with Nuxt**.

Why:

- Vue is a strong fit for dashboard-style interfaces with filters, tables, and charts
- Nuxt adds routing, SSR/SPA flexibility, data fetching, and project structure on top of Vue
- TypeScript support is part of the standard Vue/Nuxt workflow
- Pinia is the natural store choice when shared dashboard state becomes necessary

### Frontend boundaries

- `Workers` should handle scraping jobs, product data, and history APIs
- `Nuxt` should consume those APIs and render the dashboard UI
- keep chart formatting logic in the frontend, but keep aggregation rules in backend endpoints when possible

### Backend recommendation under Cloudflare Free

For Cloudflare Free, the best backend path is:

- keep `Python` for parsing, normalization, and business rules
- run the backend as `Python Workers` when possible
- avoid assuming full server-style Python infrastructure such as a traditional VM-hosted `FastAPI + PostgreSQL` deployment
- keep a fallback option to move Worker handlers to `TypeScript` if Python Worker package/runtime constraints become a blocker

If a target website can be scraped with simple HTTP requests, prefer:

- `httpx` for fetches
- `BeautifulSoup` or `lxml` for parsing

If a target website requires JavaScript rendering, use `Cloudflare Browser Rendering` sparingly because the free plan is limited.

## Product Goal

Build a platform that:

- stores products registered in the database
- visits their source pages
- extracts current prices and product links
- keeps historical snapshots of price changes
- provides data for charts, reports, and research

## Phase 1: Foundation

Goal: create a reliable base before scraping many sites.

Tasks:

- define the project structure
- set up Python and frontend environments
- create the initial Cloudflare-compatible backend service
- configure D1
- create the initial schema setup
- define the core database schema

Deliverables:

- runnable project skeleton
- database connected
- first schema created
- health check endpoint or equivalent Worker endpoint

## Phase 2: Data Model

Goal: design the minimum entities required for tracking products and prices.

Initial entities:

- `products`
- `product_sources`
- `price_snapshots`
- `scrape_jobs`
- `scrape_failures`

Suggested fields:

- product name
- canonical product URL
- source/store name
- scraped URL
- price value
- currency
- availability
- captured at timestamp
- raw metadata useful for debugging

Deliverables:

- normalized schema
- D1 migration files
- clear rules for historical records

## Phase 3: Scraping Core

Goal: implement the first working scraping flow.

Tasks:

- create a fetch-and-parse scraping service
- implement a scraper interface for sources
- extract title, URL, price, currency, and availability
- persist the result as a historical snapshot
- log failures with enough context for debugging
- add browser-rendered scraping only for sources that require it

Deliverables:

- one end-to-end scraping pipeline
- one supported source/store
- stored price history in the database

## Phase 4: Source Adapters

Goal: support multiple stores without coupling the system to one page structure.

Tasks:

- create source-specific scraper modules
- isolate selectors and parsing rules per store
- support fallback selectors and parser validation
- define rules for price normalization

Deliverables:

- reusable adapter pattern
- support for at least 2 to 3 stores

## Phase 5: Scheduling and Automation

Goal: make collection continuous.

Tasks:

- schedule recurring scraping jobs with Cron Triggers
- define frequency per product or per source
- prevent duplicate runs
- retry transient failures
- track run duration and status

Deliverables:

- scheduled scraping execution
- job monitoring data
- retry policy

## Phase 6: Data Quality

Goal: ensure historical data is useful for analysis.

Tasks:

- normalize currencies and numeric formats
- detect invalid prices
- avoid duplicate snapshots when nothing changed
- store scrape timestamps consistently in UTC
- validate source data before saving

Deliverables:

- cleaner historical dataset
- fewer false price changes

## Phase 7: Research API

Goal: expose data for charts and research use cases.

Tasks:

- create endpoints for historical queries
- aggregate prices by product and date
- prepare chart-friendly responses
- define filtering by store, period, and product

Deliverables:

- price history API
- chart-ready data responses

## Phase 8: Frontend Dashboard

Goal: build a UI to inspect products, price history, and trends.

Tasks:

- create the Nuxt frontend project
- define the dashboard layout and navigation
- implement product list and product detail pages
- add filters by source, period, and product
- render historical charts and summary cards
- connect the UI to Worker API endpoints

Deliverables:

- working frontend application
- dashboard pages for historical analysis
- interactive charts for product prices

## Phase 9: Deployment and Operations

Goal: deploy the MVP safely on Cloudflare Free and observe usage.

Tasks:

- configure Pages deployment for Nuxt
- configure Worker deployment and environment bindings
- bind D1 database to the Worker
- configure Cron Triggers for scheduled scraping
- define separate development and production environments
- monitor request counts, D1 usage, and browser-rendering usage

Deliverables:

- deployed dashboard
- deployed Worker API
- scheduled scrape execution in production
- basic usage monitoring

## Phase 10: Hardening

Goal: make the system stable enough for continuous use.

Tasks:

- add automated tests for parsers and services
- add structured logging
- add rate limiting and polite delays
- document scraping assumptions per source
- review robots.txt and terms for each target site before enabling scraping

Deliverables:

- safer and more maintainable scraping workflow
- better observability

## Development Principles

- keep scraping logic separate from business logic
- treat each store as an independent adapter
- store historical data as append-only snapshots
- prefer normalized values over raw strings
- make retries explicit and limited
- keep enough raw context to debug extraction failures

## First Milestone

The first milestone for Dr. Stone should be:

1. create the Python project structure
2. create the Nuxt frontend structure for Cloudflare Pages
3. create the Worker backend and D1 schema
4. implement one HTTP-first source scraper
5. save the first product price history snapshot
6. expose one history endpoint for future frontend use

## Final Recommendation

For this project, use **Vue 3 + Nuxt** on **Cloudflare Pages** for the frontend and **Python Workers + D1** for the backend.

For scraping, start with **HTTP-first extraction** and only use **Cloudflare Browser Rendering** for pages that require JavaScript, because the free plan has strict browser-usage limits.

Keep the architecture small in the MVP: tracked products only, low scrape frequency, D1-backed history, and a dashboard focused on a few clear research views before expanding source coverage.
