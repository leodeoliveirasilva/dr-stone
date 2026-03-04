from __future__ import annotations

import json
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag


def make_soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def first_text(soup: BeautifulSoup, selectors: list[str]) -> str | None:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            if node.has_attr("content"):
                content = str(node["content"]).strip()
                if content:
                    return content
            text = node.get_text(" ", strip=True)
            if text:
                return text
    return None


def canonical_url(soup: BeautifulSoup, base_url: str) -> str:
    canonical = soup.select_one('link[rel="canonical"]')
    if canonical and canonical.get("href"):
        return urljoin(base_url, canonical["href"])
    return base_url


def parse_json(text: str) -> Any | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def coerce_json_object(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        payload = parse_json(value)
        if isinstance(payload, dict):
            return payload
    return None


def extract_product_json_ld(soup: BeautifulSoup) -> dict[str, Any] | None:
    for node in soup.select('script[type="application/ld+json"]'):
        payload = parse_json(node.get_text(strip=True))
        if isinstance(payload, dict) and payload.get("@type") == "Product":
            return payload
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict) and item.get("@type") == "Product":
                    return item
    return None


def extract_next_data(soup: BeautifulSoup) -> dict[str, Any] | None:
    node = soup.select_one("script#__NEXT_DATA__")
    if not isinstance(node, Tag):
        return None
    payload = parse_json(node.get_text(strip=True))
    return payload if isinstance(payload, dict) else None
