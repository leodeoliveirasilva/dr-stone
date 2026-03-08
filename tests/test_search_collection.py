from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import Decimal

from dr_stone.models import SearchResultItem, SearchRunResult
from dr_stone.services.search_collection import SearchCollectionService
from dr_stone.storage import PostgresStorage


class StubSearchScraper:
    def __init__(self, source_name: str, items: list[SearchResultItem]) -> None:
        self.source_name = source_name
        self._items = items

    def build_search_url(self, search_term: str) -> str:
        slug = search_term.lower().replace(" ", "-")
        return f"https://www.example.com/{self.source_name}/busca/{slug}"

    def search(self, search_term: str) -> SearchRunResult:
        return SearchRunResult(
            source=self.source_name,
            search_term=search_term,
            resolved_url=self.build_search_url(search_term),
            total_results=len(self._items),
            page_count=1,
            items=self._items,
            fetched_at=datetime(2026, 3, 4, tzinfo=UTC),
        )

    def close(self) -> None:
        return None


def test_collect_tracked_product_keeps_only_four_lowest_matching_prices(postgres_storage: PostgresStorage) -> None:
    tracked_product = postgres_storage.create_tracked_product(
        product_title="RX 9070 XT",
        search_terms=["RX 9070 XT"],
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
        storage=postgres_storage,
        search_scrapers=[StubSearchScraper("kabum", items)],
        logger=logging.getLogger("test"),
    )

    result = service.collect_tracked_product(tracked_product)

    assert result.total_results == 6
    assert result.matched_results == 4
    assert result.successful_runs == 1
    assert result.failed_runs == 0
    assert len(result.search_run_ids) == 1

    with postgres_storage.connect() as connection:
        saved_rows = connection.execute(
            "SELECT product_title, price_value FROM search_run_items ORDER BY CAST(price_value AS NUMERIC) ASC"
        ).fetchall()
        search_run = connection.execute(
            "SELECT status, total_results, matched_results, source_name FROM search_runs"
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
        "source_name": "kabum",
    }


def test_collect_tracked_product_searches_all_registered_sources(postgres_storage: PostgresStorage) -> None:
    tracked_product = postgres_storage.create_tracked_product(
        product_title="RX 9070 XT Sapphire",
        search_terms=["RX 9070 XT", "Sapphire"],
    )

    kabum_items = [
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
    ]
    pichau_items = [
        SearchResultItem(
            source="pichau",
            title="Placa de Video Sapphire Nitro Radeon RX 9070 XT 16GB",
            canonical_url="https://www.pichau.com.br/produto/3/rx-9070-xt",
            price=Decimal("5399.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=1,
            metadata={"source_product_key": "3", "seller_name": "Pichau"},
        ),
        SearchResultItem(
            source="pichau",
            title="Placa de Video GeForce RTX 5070 12GB",
            canonical_url="https://www.pichau.com.br/produto/4/rtx-5070",
            price=Decimal("4999.99"),
            currency="BRL",
            availability="in_stock",
            is_available=True,
            position=2,
            metadata={"source_product_key": "4", "seller_name": "Pichau"},
        ),
    ]

    service = SearchCollectionService(
        storage=postgres_storage,
        search_scrapers=[
            StubSearchScraper("kabum", kabum_items),
            StubSearchScraper("pichau", pichau_items),
        ],
        logger=logging.getLogger("test"),
    )

    result = service.collect_tracked_product(tracked_product)

    assert result.total_results == 4
    assert result.matched_results == 2
    assert result.successful_runs == 2
    assert result.failed_runs == 0
    assert len(result.search_run_ids) == 2

    with postgres_storage.connect() as connection:
        run_rows = connection.execute(
            "SELECT source_name, search_term, matched_results FROM search_runs ORDER BY source_name ASC"
        ).fetchall()
        item_rows = connection.execute(
            "SELECT source_name, product_title FROM search_run_items ORDER BY source_name ASC, product_title ASC"
        ).fetchall()

    assert [dict(row) for row in run_rows] == [
        {"source_name": "kabum", "search_term": "RX 9070 XT Sapphire", "matched_results": 1},
        {"source_name": "pichau", "search_term": "RX 9070 XT Sapphire", "matched_results": 1},
    ]
    assert [dict(row) for row in item_rows] == [
        {
            "source_name": "kabum",
            "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
        },
        {
            "source_name": "pichau",
            "product_title": "Placa de Video Sapphire Nitro Radeon RX 9070 XT 16GB",
        },
    ]
