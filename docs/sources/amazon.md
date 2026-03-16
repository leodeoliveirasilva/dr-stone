# Amazon.com.br Source Notes

## Probe date

These notes were mapped from direct `curl` probes on `2026-03-13` and `2026-03-14` in the `America/Sao_Paulo` timezone.

## Summary

Amazon.com.br does not currently behave like KaBuM for anonymous HTTP crawling.

There are two distinct behaviors:

- plain `curl` and stateless HTTP requests hit WAF or generic error pages
- a real browser session driven by Playwright can reach search and product pages and extract useful data

Because of that, Amazon.com.br is not a good HTTP-first source, but it is a plausible browser-backed source.

## URLs probed

### Homepage

Probed URL:

- `https://www.amazon.com.br/`

Observed response:

- HTTP `202`
- header `x-amzn-waf-action: challenge`
- body contains:
  - `AwsWafIntegration.getToken()`
  - `challenge.js`
  - a `noscript` block saying JavaScript is required to verify the client is not a robot

Interpretation:

- plain HTTP gets challenged before usable storefront HTML is returned
- a future crawler should assume session/bootstrap logic is required

### Search pages

Probed URLs:

- `https://www.amazon.com.br/s?k=rx+9070+xt`
- `https://www.amazon.com.br/s?field-keywords=rx+9070+xt`

Observed response:

- HTTP `503`
- generic Amazon error page titled `Amazon.com.br Algo deu errado`
- no listing cards or product payloads were returned

Useful mapping detail:

- the error page search form submits to `/s`
- the search input name is `field-keywords`

Interpretation:

- `/s` is still the relevant search route
- both `k` and `field-keywords` reached the search surface, but neither returned usable search results over anonymous HTTP

### Product pages

Probed URLs:

- `https://www.amazon.com.br/dp/B0DZY3G4V4`
- `https://www.amazon.com.br/gp/product/B0DZY3G4V4`

Observed response:

- HTTP `500` with an HTML page titled `503 - Erro de serviço indisponível`
- no product title, price, seller, or offer markup was returned
- the page contains this comment:
  - `Para discutir o acesso automatizado aos dados da Amazon, entre em contato com api-services-support@amazon.com.`

Useful mapping detail:

- `/dp/<ASIN>` and `/gp/product/<ASIN>` are both valid product path shapes
- the tested ASIN path structure is stable enough to use for canonical URL generation if access is later solved

## Browser-based inspection

### Probe setup

Browser probes were run with:

- Playwright
- Chromium
- locale `pt-BR`
- `Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7`

The Playwright inspection harness lives at:

- [tools/amazon-inspector/README.md](/home/leonardo-silva/workspace/personal/dr-stone/tools/amazon-inspector/README.md)

### Search page result

Probed URL:

- `https://www.amazon.com.br/s?k=rx+9070+xt`

Observed response in browser:

- HTTP `200`
- page title `Amazon.com.br : rx 9070 xt`
- no WAF challenge markers remained in the final DOM
- `48` search-result containers were present
- the first extracted results included:
  - title
  - ASIN
  - product href
  - displayed listing price
  - badge text such as `Escolha da Amazon`

Example extracted result:

- ASIN: `B0DRPPXB5X`
- title: `Placa de Vídeo Sapphire Nitro+ AMD Radeon RX 9070 XT 16GB GDDR6 AMD RDNA 4 16GB 11348-01-20G`
- price text: `R$5.899,99`

Interpretation:

- Amazon search pages are accessible through a real browser session
- search-card extraction is feasible with DOM selectors
- ASINs and product URLs can be collected from search results

### Product page result

Probed URL:

- `https://www.amazon.com.br/dp/B0DRPPXB5X`

Observed response in browser:

- HTTP `200`
- page title matched the product title
- canonical URL was present
- product title was present
- product price was present as `R$5.899,99`
- seller / fulfillment area indicated `Amazon.com.br`
- no WAF challenge markers remained in the final DOM

Interpretation:

- product-page extraction is feasible with a browser-backed flow
- canonical URL, title, visible price, and seller-related text are available in the DOM
- the hard blocker is transport/session establishment, not the absence of product data once loaded

## robots.txt observations

`https://www.amazon.com.br/robots.txt` was reachable.

Relevant allow rules include:

- `/s/`
- `/s?`
- `/*/s/`
- `/*/s?`
- `/*/dp/`
- `/gp/product/`

Interpretation:

- Amazon's robots file does not by itself prohibit the search and product paths we care about
- the real blocker is the runtime protection layer in front of those pages

## Implementation guidance

### What not to do

Do not model Amazon.com.br after the current KaBuM adapter:

- do not assume plain HTTP returns stable server-rendered listings
- do not assume there is a `__NEXT_DATA__`-style payload available to `curl`
- do not start with a pure requests/httpx crawler as the primary strategy

### What to assume instead

A future Amazon.com.br adapter should assume:

- anti-bot protection is part of the normal request path
- browser execution or an approved API is likely required
- anonymous stateless HTTP is unlikely to provide reliable search or product data
- once a browser session is established, both search and product DOMs expose useful extraction targets

### Recommended starting strategy

Priority order for a future implementation:

1. Prefer an official Amazon API or approved partner integration if one is available for the needed data.
2. If no suitable API exists, use a browser-based flow that can establish and maintain a valid session.
3. Extract search results from DOM cards under the search results page.
4. Follow product pages for canonical URL, title, price, and seller/offer details.
5. Inspect XHR traffic only as a secondary optimization path after the DOM flow is stable.

### Current source decision

As of the probe date above:

- Amazon.com.br should not be added as an HTTP-first source
- adding it with the current shared fetcher would likely produce only challenge/error pages and noisy failures
- a browser-backed adapter is now technically plausible
- the next practical step is converting the Playwright inspection flow into a normalized crawler prototype

## Implementation Follow-Up Notes

These notes are intended to shorten the path from investigation to a first real source adapter.

### Recommended adapter shape

Use a browser-backed search adapter, not the shared `HttpFetcher`.

Recommended flow:

1. Launch Chromium with Playwright.
2. Open the Amazon search URL for the joined search query.
3. Wait for the page DOM to stabilize.
4. Extract search result cards from the DOM.
5. Normalize those results into the project `SearchResultItem` shape.
6. Optionally open the top matching product pages for richer details or validation.
7. Reuse one browser context across a source run so search and product pages share session state.

### Search URL rule

Current working search URL shape:

- `https://www.amazon.com.br/s?k=<urlencoded query>`

Observed alternate search parameter:

- `field-keywords`

Recommendation:

- use `k` as the primary search parameter for the adapter
- keep `field-keywords` only as a compatibility fallback if needed later

### Search result DOM anchors

Observed stable card root:

- `[data-component-type="s-search-result"]`

Useful fields from the card:

- ASIN: `data-asin`
- title: `h2 span`
- product href: `a[href*="/dp/"]`
- visible price text:
  - `.a-price .a-offscreen`
  - `.a-price-whole`
  - `.a-price-fraction`
- badge text:
  - `.a-badge-label-inner`

### Product page DOM anchors

Observed useful fields on the product page:

- canonical URL:
  - `link[rel="canonical"]`
- product title:
  - `#productTitle`
  - fallback `#title`
- product price:
  - `#corePrice_feature_div .a-offscreen`
  - fallback `.a-price .a-offscreen`
- seller / fulfillment area:
  - `#merchantInfoFeature_feature_div`
  - `#shipsFromSoldBy_feature_div`
  - fallback `#tabular-buybox`
- availability:
  - `#availability`

### First-pass field mapping to project models

For search results:

- `source`: `amazon`
- `title`: text from `h2 span`
- `canonical_url`: product href normalized to a canonical `/dp/<ASIN>` or canonical link if the product page is visited
- `price`: parse `.a-price .a-offscreen`
- `currency`: `BRL`
- `availability`: likely `unknown` on search results unless the card exposes explicit stock text
- `is_available`: likely `False` when availability is unknown, unless a better signal is found
- `position`: DOM order of the search result card
- `metadata`:
  - `asin`
  - `badge`
  - `raw_product_url`
  - optionally ratings/review count if later needed

For product-page enrichment:

- replace or confirm `canonical_url` using `link[rel="canonical"]`
- confirm `title`
- confirm `price`
- read `seller_name` from the seller / fulfillment section
- read `availability` from `#availability`

### Session handling notes

The main implementation risk is session establishment, not selector discovery.

Practical rules:

- keep one browser context alive across the whole source run
- avoid launching a fresh browser for every result
- prefer a realistic locale and `Accept-Language`
- treat a return to WAF, robot check, or generic error pages as a fetch failure

### Known open questions

These are still unresolved and should be validated during implementation:

- whether headless Chromium stays reliable across repeated runs over time
- whether Amazon rate-limits or blocks repeated browser sessions from the same environment
- how stable the search-result selectors are outside this initial probe
- whether pagination needs explicit navigation or lazy loading for deeper result pages
- whether seller/offer information should be collected from the search result only or always enriched from the product page
- whether we should persist only search-card prices or prefer product-page prices as the authoritative value

### Suggested implementation order

1. Build a Playwright-backed prototype scraper outside the production registry.
2. Implement search-page extraction only.
3. Normalize results into the existing `SearchResultItem` contract.
4. Verify the local all-terms matching and top-4 persistence rules against Amazon output.
5. Add optional product-page enrichment only for selected candidate items.
6. Only after that, decide whether the source is stable enough to register in production.

## Evidence snippets

Key markers observed in the probe responses:

- homepage header: `x-amzn-waf-action: challenge`
- homepage body: `AwsWafIntegration.getToken()`
- search page title: `Amazon.com.br Algo deu errado`
- product page title: `503 - Erro de serviço indisponível`
- product page comment references automated access via `api-services-support@amazon.com`
- Playwright search page title: `Amazon.com.br : rx 9070 xt`
- Playwright product page title matched the real product
