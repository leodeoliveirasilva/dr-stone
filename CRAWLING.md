# Crawling Rules

This document defines the crawling contract used by the project today.

It is based on the current KaBuM implementation plus the shared search collection pipeline, and it should guide future crawler implementations unless the product behavior is intentionally changed.

## Goals

- Keep source-specific extraction flexible.
- Keep matching, selection, and persistence behavior consistent across sources.
- Make crawler behavior explicit enough that new source adapters can be implemented without guessing hidden rules.

## Stable Cross-Source Rules

These rules apply to the full crawling flow, not only to KaBuM.

### 1. Search terms are normalized before crawling

- A tracked product must have at least `1` and at most `5` search terms.
- Search terms are normalized by trimming and collapsing whitespace.
- Empty terms are discarded.
- Duplicate terms are removed case-insensitively.
- The source query is built by joining the normalized terms with single spaces.

Example:

- Input terms: `["  RX 9070 XT  ", "Sapphire", "sapphire"]`
- Effective terms: `["RX 9070 XT", "Sapphire"]`
- Source query: `"RX 9070 XT Sapphire"`

### 2. Matching is local and deterministic

- The source crawler may return many raw results.
- The application must still apply its own local matching rules after scraping.
- A result matches only if its title contains all tracked search terms.
- Matching ignores case.
- Matching also normalizes Unicode with `NFKC` and collapses whitespace.
- Matching is substring-based, not fuzzy matching.

Example:

- Search terms: `["RX 9070 XT", "Sapphire"]`
- Matching title: `"Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB"`
- Non-matching title: `"Placa de Video PowerColor RX 9070 XT Hellhound 16GB"`

### 3. Only the 4 lowest matched prices are persisted per source run

- Matching happens per source-specific run.
- After matching, items are sorted by:
  - lowest `price`
  - then lowest `position`
  - then `title` alphabetically
- Only the first `4` items are persisted for that source run.
- `matched_results` means the number of items actually persisted.
- `total_results` means the total number of raw source results before local filtering.

This means a source can return `50` items, only `8` may match locally, and only the cheapest `4` of those are saved.

### 4. Every crawler must emit normalized result items

Each scraped item must provide the normalized fields below:

- `source`
- `title`
- `canonical_url`
- `price`
- `currency`
- `availability`
- `is_available`
- `position`
- `metadata`

Rules for these fields:

- `price` must be normalized to a decimal value with two fractional digits.
- `currency` defaults to `BRL` when the source does not provide a better value.
- `availability` should be normalized whenever possible to values like `in_stock`, `out_of_stock`, or `unknown`.
- `is_available` must be the boolean interpretation of availability.
- `position` must be deterministic and usable as a stable tiebreaker inside one run.
- `metadata` should keep useful source-specific fields that help with debugging, traceability, or future features.

### 5. Fetching is HTTP-first by default

- A new crawler should prefer regular HTTP fetching before introducing browser automation.
- Empty response bodies are treated as failures, even on successful HTTP status codes.
- Redirects are allowed and the final resolved URL should be preserved.
- Timeouts and network errors are retried.
- `4xx` responses are non-retriable.
- `5xx` responses are retriable.
- Parse failures should raise structured parse errors with stable error codes.

Current shared fetcher defaults:

- timeout: `15s`
- max retries: `2`
- retry backoff: `1.0 * attempt`
- request delay before the first request: `0.5s`

### 6. Pagination must be fully collected

- If a source reports multiple listing pages, the crawler should collect all pages for that search run.
- `page_count` should reflect the number of pages reported by the source for that run.
- Raw items from all collected pages are part of the same source run before local matching and top-4 selection are applied.

### 7. Source runs are independent

- The same tracked product is collected separately for each registered source.
- Matching and top-4 selection happen independently per source.
- Results from different sources must not be merged before persistence.

## KaBuM Rules

These rules describe the current KaBuM adapter specifically.

### Search URL construction

- KaBuM uses a slugified search path under `/busca/<slug>`.
- The slug is built from the joined search query.
- The query is case-folded.
- Any run of non-alphanumeric ASCII characters is replaced with `-`.
- Leading and trailing `-` are removed.
- The final slug is URL-encoded.

Example:

- Search query: `"RX 9070 XT Sapphire"`
- KaBuM URL: `https://www.kabum.com.br/busca/rx-9070-xt-sapphire`

### Extraction strategy

- Fetch the KaBuM search page with regular HTTP.
- Parse `script#__NEXT_DATA__`.
- Read `props.pageProps.data`.
- Coerce that payload into a JSON object.
- Read listing data from `catalogServer.data`.
- Read pagination metadata from `catalogServer.meta`.
- Use the page canonical link as the resolved search URL when available.

### Pagination strategy

- The first page is fetched from the slug URL.
- Additional pages are fetched by applying `?page_number=<n>` to the resolved URL.
- Pages `2..total_pages` are fetched sequentially.

### KaBuM item mapping rules

- `title` comes from `name`.
- `price` prefers `priceWithDiscount`, then falls back to `price`.
- `availability` is derived from `available`.
- `canonical_url` is built from:
  - `code` + `friendlyName` as `/produto/<code>/<friendlyName>`
  - fallback: `/produto/<code>`
- `metadata.source_product_key` comes from `code`.
- `metadata.seller_name` comes from `sellerName`.
- `metadata.manufacturer` comes from `manufacturer.name`.
- `metadata.price_raw` stores the original chosen price field.
- `metadata.price_marketplace` stores `priceMarketplace`.

### KaBuM parse failures

The KaBuM crawler fails fast when required listing data is missing or malformed.

It raises parse errors for at least these cases:

- missing listing payload
- missing catalog data
- invalid catalog structure
- missing product title
- missing product price
- missing product URL components

### KaBuM escalation rule

Do not move KaBuM to browser rendering by default.

Escalate only if one of these becomes true:

- the HTTP response no longer contains the listing JSON needed by the crawler
- the real prices only appear after client-side rendering or interaction
- anti-bot behavior makes HTTP-first collection unreliable

## Future Implementation Rule

Any new source adapter may use a different extraction method, selectors, payload shape, or pagination mechanism.

What should stay the same by default:

- normalized search term handling
- case-insensitive all-terms title matching
- per-source matching
- selection of only the 4 cheapest matched items
- normalized item output
- structured failure reporting

If a future crawler needs different behavior, update this document and the relevant tests before changing production code.
