# Source Implementation Guide

This guide captures the current source-adapter workflow in this repository and the investigation steps that have already proven useful for KaBuM, Amazon, and Pichau.

Use it before writing production code for any new source.

## 1. Start With the Local Contract

Read these files first:

- `CRAWLING.md`
- `docs/sources/kabum.md`
- `docs/sources/amazon.md`
- `dr-stone-scrapper/src/types.ts`
- `dr-stone-scrapper/src/runtime.ts`
- `dr-stone-database/src/sources.ts`

Rules that must stay consistent unless intentionally changed:

- search terms are normalized before any source request
- title matching is local, deterministic, and requires all search terms
- only the 4 cheapest matched items are persisted per source run
- every source returns normalized `SearchResultItem` entries
- failures should be structured and debuggable

## 2. Classify the Source Before Coding

Do not start by copying selectors from another source.

First decide which of these classes the target belongs to:

### HTTP-first

Use the KaBuM model if the site reliably returns usable HTML or embedded JSON over normal HTTP requests.

Signals:

- `curl` or `HttpFetcher` returns real storefront HTML
- listing data is present in HTML, script tags, or JSON payloads
- pagination can be reached with deterministic URLs
- no WAF, captcha, or interstitial challenge appears on the normal path

### Browser-backed

Use the Amazon model if the site only becomes usable once a real browser session is established.

Signals:

- HTTP probes return challenge pages, errors, or empty shells
- the DOM becomes usable in Playwright after page load
- search/product data is visible in rendered cards or product pages
- anti-bot protection is part of the normal request path

### Blocked or unclear

Do not implement yet if both HTTP and browser probes are inconclusive.

Escalate the investigation first:

- test with a real browser session
- test with the configured proxy
- inspect browser network traffic for XHR or fetch payloads
- confirm whether the required paths are allowed or disallowed by `robots.txt`

## 3. Recommended Probe Sequence

Capture notes in a source-specific document under `docs/sources/`.

Suggested order:

1. Fetch `robots.txt`.
2. Probe homepage, likely search URLs, and one product URL with `curl`.
3. Retry with a realistic browser user agent.
4. Inspect the saved HTML for challenge markers, payloads, framework hints, and selectors.
5. If HTTP is blocked, run a Playwright inspection pass.
6. Record whether search pages, product pages, and pagination are reachable.
7. Record whether the source should be `http` or `browser`.

Useful questions:

- what is the real search URL shape?
- is pagination URL-driven or interaction-driven?
- where do title, price, availability, canonical URL, and product key come from?
- are prices visible on listing cards or only on product pages?
- is there an anti-bot challenge that requires proxy or browser state?
- are relevant paths disallowed by `robots.txt`?

## 4. Useful Technical Signals

When reading probe output, look for:

- embedded JSON payloads such as `__NEXT_DATA__`, `__NUXT__`, `application/ld+json`, or script-assigned globals
- storefront framework hints such as Magento, VTEX, Next.js, custom GraphQL, or private REST endpoints
- challenge markers such as Cloudflare scripts, AWS WAF bootstrap code, captcha forms, or generic error pages
- canonical product URLs
- stable product identifiers such as SKU, code, ASIN, or slug fragments

## 5. Repository Touch Points For Every New Source

Most source work is not only the adapter.

At minimum, review these places:

- `dr-stone-scrapper/src/sources/<source>/`
- `dr-stone-scrapper/src/runtime.ts`
- `dr-stone-scrapper/src/env.ts`
- `dr-stone-database/src/sources.ts`
- `dr-stone-api/src/services/runtime.ts`
- `dr-stone-api/src/app.ts`
- `dr-stone-api/src/openapi.json`
- `docs/api.md`
- `tests/runtime.test.ts`
- `tests/collection-job-scheduler.test.ts`
- `tests/api.test.ts`

Common missed items:

- adding the new source to the canonical source registry
- adding it to the default enabled source list in `DR_STONE_ENABLED_SOURCES`
- updating test helpers that hardcode source-name unions or source-specific URL builders
- updating `/sources` expectations in API tests and docs
- updating Swagger or OpenAPI only if the source catalog is hardcoded there

## 6. Testing Checklist

Before merging a new source, cover at least these layers:

### Probe notes

- save the transport findings in `docs/sources/<source>.md`
- document exact URLs tested and the probe date

### Source unit tests

- search URL building
- HTML or DOM parsing
- item normalization
- pagination handling
- parse failures for malformed payloads

### Runtime and wiring tests

- source registry includes the new source
- runtime builds the adapter when enabled
- scheduler creates one job per tracked product per source

### API tests

- `/sources` includes the new source with correct label and active state
- source-filtered endpoints accept the new `source_name`
- any test helpers with source-specific URLs or labels support the new source

### Smoke tests

- `vitest run`
- any source-specific parser tests
- if browser-backed, a one-off Playwright inspection before finalizing selectors

## 7. Anti-Bot Decision Rule

Use this rule to avoid premature complexity:

- prefer `HttpFetcher` first
- escalate to Playwright only when HTTP no longer returns usable storefront data
- add proxy support only when the browser path still needs it or when the site blocks direct access in the expected runtime environment

Do not assume a source matches KaBuM just because it is an ecommerce site.

## 8. Suggested Source Note Template

Create `docs/sources/<source>.md` with these sections:

- probe date
- summary
- URLs probed
- HTTP probe results
- browser probe results
- robots.txt observations
- extraction candidates
- pagination candidates
- recommended adapter shape
- open questions
- implementation plan

## 9. Current Examples

- KaBuM is the reference HTTP-first implementation.
- Amazon is the reference browser-backed implementation with proxy support already wired into settings.
- Pichau currently looks much closer to Amazon than KaBuM at the transport layer and should be treated that way unless a later browser probe proves otherwise.
