from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

from dr_stone.exceptions import ParseError
from dr_stone.http import HttpFetcher
from dr_stone.models import ScrapeResult
from dr_stone.normalizers import (
    normalize_availability,
    normalize_currency,
    normalize_price,
)
from dr_stone.parsing import (
    canonical_url,
    extract_next_data,
    extract_product_json_ld,
    first_text,
    make_soup,
)
from dr_stone.scrapers.base import BaseScraper


class KabumScraper(BaseScraper):
    source_name = "kabum"

    def __init__(self, fetcher: HttpFetcher, logger: logging.Logger) -> None:
        self.fetcher = fetcher
        self.logger = logger

    def can_handle(self, url: str) -> bool:
        host = urlparse(url).netloc.lower()
        return host.endswith("kabum.com.br")

    def scrape(self, url: str) -> ScrapeResult:
        if not self.can_handle(url):
            raise ParseError(f"URL is not supported by {self.source_name}: {url}")

        response = self.fetcher.get(url)
        result = self.parse_html(response.text, str(response.url))
        self.logger.info(
            "scrape_succeeded",
            extra={
                "event_data": {
                    "source": self.source_name,
                    "canonical_url": result.canonical_url,
                    "price": str(result.price),
                    "currency": result.currency,
                }
            },
        )
        return result

    def parse_html(self, html: str, page_url: str) -> ScrapeResult:
        soup = make_soup(html)
        json_ld = extract_product_json_ld(soup) or {}
        next_data = extract_next_data(soup) or {}
        next_product = self._extract_next_product(next_data)
        capture_method = "json_ld" if json_ld else "next_data"

        title = (
            self._coerce_text(json_ld.get("name"))
            or self._coerce_text(next_product.get("name"))
            or self._coerce_text(next_product.get("title"))
            or first_text(soup, ["meta[name='title']", "h1", "title"])
        )
        if not title:
            raise ParseError("KaBuM page is missing a product title")

        offers = json_ld.get("offers") if isinstance(json_ld.get("offers"), dict) else {}
        raw_price = offers.get("price") or next_product.get("price") or next_product.get(
            "priceWithDiscount"
        )
        if raw_price is None:
            raise ParseError("KaBuM page is missing a product price")

        currency = normalize_currency(
            self._coerce_text(offers.get("priceCurrency"))
            or self._coerce_text(next_product.get("currency"))
            or "BRL"
        )
        availability, is_available = normalize_availability(
            self._coerce_text(offers.get("availability"))
            or self._coerce_text(next_product.get("available"))
        )

        result = ScrapeResult(
            source=self.source_name,
            canonical_url=canonical_url(soup, page_url),
            title=title,
            price=normalize_price(raw_price),
            currency=currency,
            availability=availability,
            is_available=is_available,
            metadata={
                "capture_method": capture_method,
                "sku": self._coerce_text(json_ld.get("sku"))
                or self._coerce_text(next_product.get("code")),
                "brand": self._extract_brand(json_ld, next_product),
                "seller_name": self._coerce_text(next_product.get("sellerName")),
            },
        )
        return result

    def _extract_next_product(self, next_data: dict[str, Any]) -> dict[str, Any]:
        page_props = next_data.get("props", {}).get("pageProps", {})
        merged: dict[str, Any] = {}

        page_product = page_props.get("product")
        if isinstance(page_product, dict):
            merged.update(page_product)

        payload = page_props.get("data", {})
        for key in ("catalogProduct", "product"):
            candidate = payload.get(key)
            if isinstance(candidate, dict):
                merged.update(candidate)
        return merged

    def _extract_brand(
        self, json_ld: dict[str, Any], next_product: dict[str, Any]
    ) -> str | None:
        brand = json_ld.get("brand")
        if isinstance(brand, dict):
            return self._coerce_text(brand.get("name"))
        if isinstance(brand, str):
            return brand

        manufacturer = next_product.get("manufacturer")
        if isinstance(manufacturer, dict):
            return self._coerce_text(manufacturer.get("name"))
        return None

    def _coerce_text(self, value: Any) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        if isinstance(value, bool):
            return "in_stock" if value else "out_of_stock"
        if value is None:
            return None
        return str(value)
