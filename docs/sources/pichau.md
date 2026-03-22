# Pichau Source Notes

## Probe date

These notes were mapped on `2026-03-22` in the `America/Sao_Paulo` timezone.

## Summary

Pichau should not be approached as a KaBuM-style HTTP-first source.

Direct HTTP probes to homepage, product pages, and likely search URLs returned Cloudflare-backed `403` responses instead of storefront HTML.

The challenge body presented a maintenance-style page with Cloudflare challenge bootstrap code, which indicates that normal stateless HTTP is blocked in the current environment.

Because of that, the starting assumption for implementation should be:

- not KaBuM-style HTTP-first
- likely browser-backed
- may require proxy support like Amazon if direct Playwright access is also blocked

## URLs probed

### Homepage

Probed URL:

- `https://www.pichau.com.br/`

Observed response:

- HTTP `403`
- `server: cloudflare`
- challenge HTML title: `Site em Manutenção - Pru Pru`
- body contains Cloudflare challenge bootstrap under `/cdn-cgi/challenge-platform/scripts/jsd/main.js`

Interpretation:

- plain HTTP does not reach usable storefront HTML
- a normal server-rendered listing flow cannot be assumed

### Product page

Probed URL:

- `https://www.pichau.com.br/placa-de-video-sapphire-radeon-rx-9070-xt-pulse-16gb-gddr6-256-bit-11348-03-20g`

Observed response:

- HTTP `403`
- `server: cloudflare`
- same challenge behavior as homepage

Interpretation:

- product pages are also blocked for stateless HTTP
- canonical product extraction cannot start from `HttpFetcher`

### Search-like URLs

Probed URLs:

- `https://www.pichau.com.br/search?q=rx%209070%20xt`
- `https://www.pichau.com.br/busca?q=rx%209070%20xt`
- `https://www.pichau.com.br/catalogsearch/result/?q=rx%209070%20xt`

Observed response:

- all returned HTTP `403`
- all were served by Cloudflare

Interpretation:

- multiple likely search surfaces are blocked before any listing HTML is returned
- the final search route still needs confirmation from a browser probe

## robots.txt observations

`https://www.pichau.com.br/robots.txt` was reachable.

Important disallow rules:

- `/api/`
- `/graphql/`
- `/catalogsearch/`
- `/search`
- `/search?`
- `/busca`
- `/busca?`
- `/*?q=`

Other useful signal:

- the file shape strongly suggests a Magento-style storefront

Interpretation:

- even if a search route is technically reachable in a browser, the main search surfaces are disallowed in `robots.txt`
- implementation should not blindly rely on search endpoints without an explicit decision on that constraint
- category or product-page driven collection may need investigation if search disallow matters for this project

## Browser-rendered content signal

A browser-rendered fetch outside the local `curl` probes was able to read product-page content with fields such as:

- product title
- SKU
- brand
- PIX price
- card price
- descriptive content

That suggests the storefront does expose useful product data once the request path gets past the challenge layer.

What is still unconfirmed locally:

- whether Playwright in this runtime can consistently solve or bypass the challenge
- whether search result pages are reachable in a browser session
- whether listing pages expose prices directly or require product-page follow-up

## Recommended starting strategy

Priority order for a later implementation:

1. Build a Pichau Playwright inspection harness first.
2. Run it with and without the existing proxy settings.
3. Confirm the real search route and pagination behavior in the browser.
4. Confirm whether listing cards contain enough data for `SearchResultItem`.
5. Only after that, implement a production adapter.

Do not start with `HttpFetcher`.

## Recommended adapter shape

Assuming the browser probe succeeds, the first production shape should be:

- source name: `pichau`
- strategy: `browser`
- transport: Playwright
- proxy: reuse the same proxy settings pattern already used by Amazon

Preferred flow:

1. open the real Pichau search URL in Playwright
2. wait for listing DOM stability
3. extract listing cards and pagination data
4. normalize search results
5. if listing cards do not expose full price or availability, open a bounded number of product pages
6. reuse one browser context per source run

## Implementation plan

### 1. Investigation and probe tooling

- copy the Amazon inspection pattern into a Pichau-specific inspector under `tools/`
- capture DOM selectors, final URLs, response statuses, challenge markers, and useful XHR requests
- decide whether proxy is mandatory or optional

### 2. Scraper implementation

- add `dr-stone-scrapper/src/sources/pichau/pichau-source.ts`
- implement a browser-backed `SearchSource`
- normalize:
  - `source`
  - `title`
  - `canonicalUrl`
  - `price`
  - `currency`
  - `availability`
  - `isAvailable`
  - `position`
  - `metadata`
- define stable parse and fetch failure codes for:
  - challenge still present
  - results timeout
  - missing listing cards
  - missing title
  - missing price
  - missing canonical URL

### 3. Runtime and source registration

- add `pichau` to `dr-stone-database/src/sources.ts`
- wire `PichauSource` into `dr-stone-scrapper/src/runtime.ts`
- decide whether `dr-stone-scrapper/src/env.ts` should enable `pichau` by default now or only after production validation

### 4. Tests to add or update

- add source-specific tests for URL building and DOM parsing
- update `tests/runtime.test.ts`
- update `tests/collection-job-scheduler.test.ts`
- update `tests/api.test.ts`

Important `tests/api.test.ts` follow-up:

- expand the hardcoded source union currently limited to `kabum | amazon`
- add a `pichau` fixture branch for canonical URL, search URL, and seller defaults
- add `/sources` assertions that include the new source
- add source-filter coverage where the source list is asserted explicitly

### 5. API and docs wiring

- confirm `/sources` exposes `pichau` with the correct label
- review `docs/api.md`
- review `dr-stone-api/src/openapi.json`
- regenerate or edit Swagger only if the source catalog or examples are hardcoded there

## Current decision

As of `2026-03-22`:

- Pichau should not be implemented as an HTTP-first source
- the next safe step is a Playwright inspection harness
- proxy support should be assumed available from day one
- the actual production implementation should wait until browser probes confirm search-page access and selectors
