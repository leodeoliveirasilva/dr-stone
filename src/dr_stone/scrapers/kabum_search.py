from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from urllib.parse import quote, urlencode, urlparse, urlunparse

from dr_stone.exceptions import ParseError
from dr_stone.http import HttpFetcher
from dr_stone.models import SearchResultItem, SearchRunResult
from dr_stone.normalizers import (
    normalize_availability,
    normalize_currency,
    normalize_price,
)
from dr_stone.parsing import canonical_url, coerce_json_object, extract_next_data, make_soup


@dataclass(frozen=True, slots=True)
class SearchPage:
    resolved_url: str
    total_results: int
    total_pages: int
    page_number: int
    items: list[SearchResultItem]


class KabumSearchScraper:
    source_name = "kabum"
    base_url = "https://www.kabum.com.br"

    def __init__(self, fetcher: HttpFetcher, logger: logging.Logger) -> None:
        self.fetcher = fetcher
        self.logger = logger

    def close(self) -> None:
        self.fetcher.close()

    def search(self, search_term: str) -> SearchRunResult:
        initial_url = self.build_search_url(search_term)
        first_response = self.fetcher.get(initial_url)
        first_page = self.parse_search_html(first_response.text, str(first_response.url))

        items = list(first_page.items)
        for page_number in range(2, first_page.total_pages + 1):
            page_url = self._with_page_number(first_page.resolved_url, page_number)
            response = self.fetcher.get(page_url)
            page = self.parse_search_html(response.text, str(response.url))
            items.extend(page.items)

        result = SearchRunResult(
            source=self.source_name,
            search_term=search_term,
            resolved_url=first_page.resolved_url,
            total_results=first_page.total_results,
            page_count=first_page.total_pages,
            items=items,
            metadata={"search_url": initial_url},
        )
        self.logger.info(
            "search_scrape_succeeded",
            extra={
                "event_data": {
                    "source": self.source_name,
                    "search_term": search_term,
                    "resolved_url": result.resolved_url,
                    "total_results": result.total_results,
                    "page_count": result.page_count,
                    "item_count": len(result.items),
                }
            },
        )
        return result

    def build_search_url(self, search_term: str) -> str:
        slug = re.sub(r"[^0-9a-z]+", "-", search_term.casefold()).strip("-")
        return f"{self.base_url}/busca/{quote(slug)}"

    def parse_search_html(self, html: str, page_url: str) -> SearchPage:
        soup = make_soup(html)
        next_data = extract_next_data(soup) or {}
        page_props = next_data.get("props", {}).get("pageProps", {})
        raw_data = page_props.get("data")
        data = coerce_json_object(raw_data)
        if not data:
            raise ParseError(
                "KaBuM search page is missing listing payload",
                code="missing_search_payload",
            )

        catalog = data.get("catalogServer")
        if not isinstance(catalog, dict):
            raise ParseError(
                "KaBuM search page is missing catalog data",
                code="missing_catalog_data",
            )

        meta = catalog.get("meta")
        items = catalog.get("data")
        if not isinstance(meta, dict) or not isinstance(items, list):
            raise ParseError(
                "KaBuM search page has invalid catalog structure",
                code="invalid_catalog_structure",
            )

        page = meta.get("page", {})
        total_results = int(meta.get("totalItemsCount", len(items)))
        total_pages = int(meta.get("totalPagesCount", 1))
        page_number = int(page.get("number", 1))
        resolved_url = canonical_url(soup, page_url)

        parsed_items: list[SearchResultItem] = []
        for position, raw_item in enumerate(items, start=1):
            if not isinstance(raw_item, dict):
                continue
            parsed_items.append(self._parse_item(raw_item, position))

        return SearchPage(
            resolved_url=resolved_url,
            total_results=total_results,
            total_pages=total_pages,
            page_number=page_number,
            items=parsed_items,
        )

    def _parse_item(self, item: dict[str, object], position: int) -> SearchResultItem:
        title = self._coerce_text(item.get("name"))
        if not title:
            raise ParseError(
                "KaBuM search result is missing product title",
                code="missing_search_item_title",
                details={"position": position},
            )

        raw_price = item.get("priceWithDiscount") or item.get("price")
        if raw_price is None:
            raise ParseError(
                "KaBuM search result is missing product price",
                code="missing_search_item_price",
                details={"position": position, "title": title},
            )

        availability, is_available = normalize_availability(
            self._coerce_text(item.get("available"))
        )
        canonical_product_url = self._build_product_url(item)

        manufacturer = item.get("manufacturer")
        manufacturer_name = None
        if isinstance(manufacturer, dict):
            manufacturer_name = self._coerce_text(manufacturer.get("name"))

        return SearchResultItem(
            source=self.source_name,
            title=title,
            canonical_url=canonical_product_url,
            price=normalize_price(raw_price),
            currency=normalize_currency("BRL"),
            availability=availability,
            is_available=is_available,
            position=position,
            metadata={
                "source_product_key": self._coerce_text(item.get("code")),
                "seller_name": self._coerce_text(item.get("sellerName")),
                "manufacturer": manufacturer_name,
                "price_raw": raw_price,
                "price_marketplace": item.get("priceMarketplace"),
            },
        )

    def _build_product_url(self, item: dict[str, object]) -> str:
        code = self._coerce_text(item.get("code"))
        friendly_name = self._coerce_text(item.get("friendlyName"))
        if code and friendly_name:
            return f"{self.base_url}/produto/{code}/{friendly_name}"
        if code:
            return f"{self.base_url}/produto/{code}"
        raise ParseError(
            "KaBuM search result is missing product URL components",
            code="missing_search_item_url",
        )

    def _with_page_number(self, resolved_url: str, page_number: int) -> str:
        parsed = urlparse(resolved_url)
        query = urlencode({"page_number": page_number})
        return urlunparse(parsed._replace(query=query))

    def _coerce_text(self, value: object) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        if isinstance(value, bool):
            return "in_stock" if value else "out_of_stock"
        if value is None:
            return None
        return str(value)
