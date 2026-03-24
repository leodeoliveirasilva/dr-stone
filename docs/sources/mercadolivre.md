# Mercado Livre Source Notes

## Probe date

These notes were mapped on `2026-03-24` in the `America/Sao_Paulo` timezone.

## Summary

Mercado Livre Brazil does not currently behave like a viable HTTP-first source in the runtime environment used by this project.

There are two distinct signals:

- stateless HTTP probes returned `403` responses from CloudFront for `robots.txt`, search, and product URLs
- browser-rendered product pages expose enough visible data to make a browser-backed adapter plausible

Because of that, Mercado Livre should be treated as a browser-backed candidate source, not as a `HttpFetcher`-based source.

## URLs probed

### robots.txt

Probed URL:

- `https://www.mercadolivre.com.br/robots.txt`

Observed response:

- local `curl -I` probe on `2026-03-24`: HTTP `403` via CloudFront
- browser-accessible content still exposed a `robots.txt` body

Relevant body observations:

- `User-agent: GPTBot` and `User-agent: ChatGPT-User` are disallowed from `/`
- generic `User-agent: *` rules disallow several internal paths and fragments
- the visible rules did not explicitly disallow the main public listing and product pages needed for this source

Interpretation:

- there is a transport-layer block for anonymous HTTP in the current environment
- policy/compliance should be reviewed explicitly before enabling this source in production

### Search pages

Probed URL:

- `https://lista.mercadolivre.com.br/rx-9070-xt`

Observed response:

- local `curl -I` probe on `2026-03-24`: HTTP `403` via CloudFront
- search engine indexed snippets still show a normal listing experience under `lista.mercadolivre.com.br`

Interpretation:

- anonymous HTTP is not a reliable transport for search collection
- search itself likely exists in a usable form once browser/session requirements are satisfied

### Product pages

Probed URL:

- `https://www.mercadolivre.com.br/placa-de-video-gigabyte-rx-9070-xt-gaming-oc-radeon-16gb/p/MLB46991395`

Observed response:

- local `curl -I` probe on `2026-03-24`: HTTP `403` via CloudFront
- browser-rendered page content exposed:
  - product title
  - current visible price
  - seller name
  - stock language
  - alternate offers section
  - stable product identifier in the path: `MLB46991395`

Example visible fields from the rendered product page:

- title: `Placa De Video Gigabyte Rx 9070 Xt Gaming Oc Radeon 16gb`
- visible price: `R$6.499`
- seller: `PCL TECH DIGITAL`
- alternate offer price: `R$6.399`

Interpretation:

- product extraction is feasible once the page is reached through a real browser flow
- the transport problem is the blocker, not the absence of product data in the rendered DOM

## Source classification

Mercado Livre should currently be classified as:

- `browser-backed`

It should not be modeled after [kabum.md](/home/leonardo-silva/workspace/personal/dr-stone/docs/sources/kabum.md).

It should be investigated and implemented closer to the Playwright-backed pattern already used by Amazon and Pichau.

## Recommended adapter shape

### First implementation target

Build a search-oriented source adapter that extracts items directly from listing pages and does not open every product page during the initial version.

Reasoning:

- the project contract already performs local title matching and top-4 selection after scraping
- a listing-only pass is cheaper and operationally safer than a product-page fan-out
- product-page hydration can be added later only if listing cards do not expose reliable title, URL, price, and seller data

### Transport strategy

Use Playwright with the existing stealth browser context helpers:

- [amazon-source.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/sources/amazon/amazon-source.ts)
- [pichau-source.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/sources/pichau/pichau-source.ts)
- [playwright.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/browser/playwright.ts)

Do not use:

- [http-fetcher.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/http/http-fetcher.ts) as the primary fetch path

### Result shape

The adapter still must emit normalized `SearchResultItem` entries matching the existing contract in:

- [types.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/types.ts)
- [CRAWLING.md](/home/leonardo-silva/workspace/personal/dr-stone/CRAWLING.md)

Minimum item fields:

- `source`
- `title`
- `canonicalUrl`
- `price`
- `currency`
- `availability`
- `isAvailable`
- `position`
- `metadata`

Suggested metadata fields:

- `source_product_key`
- `seller_name`
- `listing_type`
- `shipping_summary`
- `installments_text`
- `price_raw`

## Implementation plan

### Phase 1: probe and parser capture

1. Create a parser module at `dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-parsing.ts`.
2. Confirm the real search URL shape used by the browser flow.
3. Record stable selectors or DOM patterns for:
   - listing card container
   - title
   - canonical product link
   - price
   - seller text
   - availability or stock hints
   - next-page control or page-number controls
4. Prefer stable structural selectors, `data-*` attributes, and URL patterns over fragile class names.

### Phase 2: source adapter

1. Create `MercadoLivreSource` at `dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts`.
2. Implement `SearchSource` with:
   - `sourceName = "mercadolivre"`
   - `strategy = "browser"`
3. Reuse the shared browser launch and stealth context setup.
4. Navigate to the Mercado Livre search page for the joined search term.
5. Wait for listing cards to appear.
6. Extract and normalize all items from the first page.
7. Follow pagination until no further page remains.
8. Return a `SearchRunResult` with:
   - `resolvedUrl`
   - collected `items`
   - `pageCount`
   - diagnostics metadata for debugging blocked or partial runs

### Phase 3: diagnostics and failure handling

Add structured failure codes similar to Amazon and Pichau, for example:

- `mercadolivre_results_timeout`
- `mercadolivre_search_failed`
- `mercadolivre_challenge_detected`
- `mercadolivre_empty_page`

Diagnostics should capture:

- response status
- final URL
- page title
- detected card count
- challenge markers
- body text snippet
- whether a proxy was configured

### Phase 4: wiring

Update the repository touch points for a new canonical source:

- [dr-stone-scrapper/src/runtime.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/runtime.ts)
- [dr-stone-database/src/sources.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-database/src/sources.ts)
- [dr-stone-scrapper/src/env.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/env.ts)
- [dr-stone-api/src/services/runtime.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-api/src/services/runtime.ts)
- [dr-stone-api/src/openapi.json](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-api/src/openapi.json)
- [docs/api.md](/home/leonardo-silva/workspace/personal/dr-stone/docs/api.md)

Recommended rollout decision:

- register `mercadolivre` in the canonical source catalog
- enable it in the default source set
- keep browser diagnostics in place so challenge regressions remain visible

### Phase 5: tests

Add or update tests for:

- search URL building
- parser extraction from representative listing HTML/DOM fixtures
- pagination handling
- runtime source registration
- scheduler source fan-out
- `/sources` API response
- API source-filter acceptance

Files likely affected:

- [tests/runtime.test.ts](/home/leonardo-silva/workspace/personal/dr-stone/tests/runtime.test.ts)
- [tests/collection-job-scheduler.test.ts](/home/leonardo-silva/workspace/personal/dr-stone/tests/collection-job-scheduler.test.ts)
- [tests/api.test.ts](/home/leonardo-silva/workspace/personal/dr-stone/tests/api.test.ts)

## Important design decisions

### Do not fan out into product pages in v1

The first implementation should prefer extracting search cards only.

Escalate to product-page hydration only if one of these becomes true:

- listing cards do not expose a stable price
- listing cards do not expose a stable canonical URL
- seller identity is required and missing from the listing
- availability can only be determined from the product page

### Do not enable by default yet

The source should first land as an optional source behind explicit enablement.

Reasoning:

- the target currently shows strong anti-bot behavior on direct HTTP
- the browser path still needs a stability check in the real runtime environment
- adding it to the default source set too early would increase operational noise

### Refactor hardcoded source test lists

Several tests currently hardcode `kabum`, `amazon`, and `pichau`.

Before or during the Mercado Livre integration, refactor those tests to derive expected source sets from the canonical source registry when practical. That will reduce future maintenance when more sources are added.

## Open questions

- What is the most stable search URL shape after the browser session is established?
- Does the listing DOM expose seller name directly, or only on product pages?
- Is the best visible price on the search card or only inside the product detail page?
- Is pagination URL-driven, click-driven, or both?
- Does the current proxy configuration materially improve browser success rates?
- Are there Mercado Livre policy constraints beyond the visible `robots.txt` rules that should block implementation?

## Current source decision

As of `2026-03-24`:

- Mercado Livre should not be implemented as an HTTP-first source
- a browser-backed adapter is technically plausible
- the next practical step is a Playwright inspection pass focused on listing-page extraction
