from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from dr_stone.models import SearchResultItem
from dr_stone.scrapers.kabum_search import KabumSearchScraper
from dr_stone.services.search_collection import SearchCollectionService
from dr_stone.storage import SQLiteStorage


class StubKabumSearchScraper(KabumSearchScraper):
    def __init__(self, items: list[SearchResultItem]) -> None:  # type: ignore[super-init-not-called]
        self.source_name = "kabum"
        self._items = items

    def build_search_url(self, search_term: str) -> str:
        return f"https://www.kabum.com.br/busca/{search_term.lower().replace(' ', '-')}"

    def search(self, search_term: str):
        from dr_stone.models import SearchRunResult

        return SearchRunResult(
            source="kabum",
            search_term=search_term,
            resolved_url=self.build_search_url(search_term),
            total_results=len(self._items),
            page_count=1,
            items=self._items,
            fetched_at=datetime(2026, 3, 4, tzinfo=UTC),
        )


def test_collect_tracked_product_keeps_only_four_lowest_matching_prices(tmp_path: Path) -> None:
    storage = SQLiteStorage(tmp_path / "dr_stone.sqlite3", logging.getLogger("test"))
    storage.apply_migrations(Path(__file__).resolve().parents[1] / "migrations")
    tracked_product = storage.create_tracked_product(
        product_title="RX 9070 XT",
        search_term="RX 9070 XT",
    )

    items = [
        SearchResultItem(
            source="kabum",
            title="Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
            canonical_url="https://www.kabum.com.br/produto/1/rx-9070-xt",
            price=Decimal("5499.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=1,
            metadata={"source_product_key": "1", "seller_name": "KaBuM!"},
        ),
        SearchResultItem(
            source="kabum",
            title="Placa de Video PowerColor RX 9070 XT Hellhound 16GB",
            canonical_url="https://www.kabum.com.br/produto/2/rx-9070-xt-hellhound",
            price=Decimal("5299.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=2,
            metadata={"source_product_key": "2", "seller_name": "KaBuM!"},
        ),
        SearchResultItem(
            source="kabum",
            title="Placa de Video XFX RX 9070 XT Mercury 16GB",
            canonical_url="https://www.kabum.com.br/produto/3/rx-9070-xt-mercury",
            price=Decimal("5199.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=3,
            metadata={"source_product_key": "3", "seller_name": "KaBuM!"},
        ),
        SearchResultItem(
            source="kabum",
            title="Placa de Video ASRock RX 9070 XT Taichi 16GB",
            canonical_url="https://www.kabum.com.br/produto/4/rx-9070-xt-taichi",
            price=Decimal("5399.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=4,
            metadata={"source_product_key": "4", "seller_name": "KaBuM!"},
        ),
        SearchResultItem(
            source="kabum",
            title="Placa de Video ASUS TUF RX 9070 XT 16GB",
            canonical_url="https://www.kabum.com.br/produto/5/rx-9070-xt-tuf",
            price=Decimal("5599.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=5,
            metadata={"source_product_key": "5", "seller_name": "KaBuM!"},
        ),
        SearchResultItem(
            source="kabum",
            title="Placa de Video GeForce RTX 5070 12GB",
            canonical_url="https://www.kabum.com.br/produto/6/rtx-5070",
            price=Decimal("4999.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=6,
            metadata={"source_product_key": "6", "seller_name": "KaBuM!"},
        ),
    ]

    service = SearchCollectionService(
        storage=storage,
        search_scraper=StubKabumSearchScraper(items),
        logger=logging.getLogger("test"),
    )

    result = service.collect_tracked_product(tracked_product)

    assert result.total_results == 6
    assert result.matched_results == 4

    with storage.connect() as connection:
        saved_rows = connection.execute(
            "SELECT product_title, price_value FROM search_run_items ORDER BY CAST(price_value AS REAL) ASC"
        ).fetchall()
        search_run = connection.execute(
            "SELECT status, total_results, matched_results FROM search_runs"
        ).fetchone()

    assert len(saved_rows) == 4
    assert [row["price_value"] for row in saved_rows] == [
        "5199.99",
        "5299.99",
        "5399.99",
        "5499.99",
    ]
    assert dict(search_run) == {
        "status": "succeeded",
        "total_results": 6,
        "matched_results": 4,
    }
