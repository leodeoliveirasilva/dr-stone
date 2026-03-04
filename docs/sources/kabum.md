# KaBuM Source Notes

## Current extraction strategy

The current `kabum.com.br` adapter is search-oriented and HTTP-first.

Extraction order:

1. fetch the KaBuM search page for the stored search term
2. parse `script#__NEXT_DATA__`
3. read `catalogServer.data` to collect listing items
4. keep only items whose title contains the stored product title, ignoring case
5. persist only the 4 lowest matching prices for that run

## Assumptions

- search/listing pages return usable HTML on the first request
- `__NEXT_DATA__` contains a serialized listing payload under `props.pageProps.data`
- `catalogServer.data` contains enough information to build product URLs, seller names, and prices
- listing titles are stable enough for case-insensitive containment matching against the stored product title

## Failure modes to watch

- empty HTML bodies after an apparently successful response
- `__NEXT_DATA__` shape changes under `props.pageProps.data`
- missing pagination data leading to incomplete collection
- titles changing enough that the case-insensitive containment rule no longer matches the intended product

## Escalation rule

Do not move KaBuM to browser rendering by default.

Escalate only if:

- HTTP responses stop containing the required listing JSON
- search results require client-side interaction before the real prices appear
- anti-bot measures make HTTP-first extraction unreliable for tracked searches
