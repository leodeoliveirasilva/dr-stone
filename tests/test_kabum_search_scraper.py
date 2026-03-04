from __future__ import annotations

import json
import logging
from decimal import Decimal

import httpx

from dr_stone.config import Settings
from dr_stone.http import HttpFetcher
from dr_stone.scrapers.kabum_search import KabumSearchScraper


def test_parse_search_html_extracts_listing_items() -> None:
    scraper = KabumSearchScraper(
        HttpFetcher(
            Settings(request_delay_seconds=0, retry_backoff_seconds=0),
            logging.getLogger("test"),
        ),
        logging.getLogger("test"),
    )

    page = scraper.parse_search_html(
        _search_html(
            items=[
                {
                    "code": 1,
                    "name": "Placa de Video RX 9070 XT Nitro+",
                    "friendlyName": "placa-rx-9070-xt",
                    "price": 5999.99,
                    "priceWithDiscount": 5499.99,
                    "available": True,
                    "sellerName": "KaBuM!",
                    "manufacturer": {"name": "Sapphire"},
                }
            ],
            total_pages=1,
            total_items=1,
        ),
        "https://www.kabum.com.br/busca/rx-9070-xt",
    )

    assert page.total_results == 1
    assert page.total_pages == 1
    assert len(page.items) == 1
    assert page.items[0].price == Decimal("5499.99")
    assert page.items[0].canonical_url.endswith("/produto/1/placa-rx-9070-xt")


def test_search_fetches_all_pages() -> None:
    page_one = _search_html(
        items=[
            {
                "code": 1,
                "name": "Placa RX 9070 XT Prime",
                "friendlyName": "rx-9070-xt-prime",
                "price": 5000,
                "priceWithDiscount": 4800,
                "available": True,
                "sellerName": "KaBuM!",
                "manufacturer": {"name": "ASUS"},
            }
        ],
        total_pages=2,
        total_items=2,
        canonical_href="https://www.kabum.com.br/hardware/placa-de-video-vga/placa-de-video-amd",
    )
    page_two = _search_html(
        items=[
            {
                "code": 2,
                "name": "Placa RX 9070 XT Steel Legend",
                "friendlyName": "rx-9070-xt-steel-legend",
                "price": 5100,
                "priceWithDiscount": 4900,
                "available": True,
                "sellerName": "KaBuM!",
                "manufacturer": {"name": "ASRock"},
            }
        ],
        total_pages=2,
        total_items=2,
        page_number=2,
        canonical_href="https://www.kabum.com.br/hardware/placa-de-video-vga/placa-de-video-amd",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("page_number") == "2":
            return httpx.Response(200, request=request, text=page_two)
        return httpx.Response(200, request=request, text=page_one)

    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)
    fetcher = HttpFetcher(
        Settings(request_delay_seconds=0, retry_backoff_seconds=0),
        logging.getLogger("test"),
        client=client,
        sleep_func=lambda _: None,
    )
    scraper = KabumSearchScraper(fetcher, logging.getLogger("test"))

    result = scraper.search("RX 9070 XT")

    assert result.total_results == 2
    assert result.page_count == 2
    assert len(result.items) == 2
    assert result.items[1].title == "Placa RX 9070 XT Steel Legend"
    fetcher.close()


def _search_html(
    *,
    items: list[dict[str, object]],
    total_pages: int,
    total_items: int,
    page_number: int = 1,
    canonical_href: str = "https://www.kabum.com.br/busca/rx-9070-xt",
) -> str:
    payload = {
        "catalogServer": {
            "meta": {
                "totalItemsCount": total_items,
                "totalPagesCount": total_pages,
                "page": {"number": page_number, "size": 20, "isCurrentPage": True},
            },
            "data": items,
        }
    }
    next_data = {
        "props": {
            "pageProps": {
                "data": json.dumps(payload, ensure_ascii=False),
            }
        }
    }
    return f"""
    <html>
      <head>
        <link rel="canonical" href="{canonical_href}" />
        <script id="__NEXT_DATA__" type="application/json">{json.dumps(next_data, ensure_ascii=False)}</script>
      </head>
      <body></body>
    </html>
    """
