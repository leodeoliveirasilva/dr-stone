from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Protocol

from dr_stone.exceptions import DrStoneError
from dr_stone.failures import build_scrape_failure
from dr_stone.matching import title_contains_all_terms
from dr_stone.models import SearchCollectionResult, TrackedProduct
from dr_stone.search_terms import build_search_query
from dr_stone.storage import SQLiteStorage


class SearchScraper(Protocol):
    source_name: str

    def build_search_url(self, search_term: str) -> str: ...

    def search(self, search_term: str): ...

    def close(self) -> None: ...


class SearchCollectionService:
    max_results_per_run = 4

    def __init__(
        self,
        storage: SQLiteStorage,
        search_scrapers: Sequence[SearchScraper],
        logger: logging.Logger,
    ) -> None:
        self.storage = storage
        self.search_scrapers = list(search_scrapers)
        self.logger = logger

    def close(self) -> None:
        for scraper in self.search_scrapers:
            scraper.close()

    def collect_tracked_product(self, tracked_product: TrackedProduct) -> SearchCollectionResult:
        search_query = build_search_query(tracked_product.search_terms)
        search_run_ids: list[str] = []
        total_results = 0
        matched_results = 0
        page_count = 0
        successful_runs = 0
        failed_runs = 0
        last_error: DrStoneError | None = None

        for scraper in self.search_scrapers:
            search_url = scraper.build_search_url(search_query)
            search_run_id = self.storage.create_search_run(
                tracked_product_id=tracked_product.id,
                source_name=scraper.source_name,
                search_term=search_query,
                search_url=search_url,
            )
            search_run_ids.append(search_run_id)

            try:
                run = scraper.search(search_query)
                matched_items = [
                    item
                    for item in run.items
                    if title_contains_all_terms(tracked_product.search_terms, item.title)
                ]
                matched_items.sort(key=lambda item: (item.price, item.position, item.title))
                selected_items = matched_items[: self.max_results_per_run]
                matched_count = self.storage.persist_search_run_items(
                    search_run_id=search_run_id,
                    tracked_product_id=tracked_product.id,
                    items=selected_items,
                    captured_at=run.fetched_at,
                )
                self.storage.finish_search_run(
                    search_run_id,
                    status="succeeded",
                    total_results=run.total_results,
                    matched_results=matched_count,
                    page_count=run.page_count,
                    message="lowest_prices_saved",
                )
                total_results += run.total_results
                matched_results += matched_count
                page_count += run.page_count
                successful_runs += 1
            except DrStoneError as exc:
                failure = build_scrape_failure(scraper.source_name, search_url, exc)
                self.storage.record_failure(failure, search_run_id=search_run_id)
                self.storage.finish_search_run(
                    search_run_id,
                    status="failed",
                    message=str(exc),
                )
                failed_runs += 1
                last_error = exc

        if successful_runs == 0 and last_error is not None:
            raise last_error

        result = SearchCollectionResult(
            tracked_product_id=tracked_product.id,
            search_run_ids=search_run_ids,
            successful_runs=successful_runs,
            failed_runs=failed_runs,
            total_results=total_results,
            matched_results=matched_results,
            page_count=page_count,
        )
        self.logger.info(
            "search_collection_succeeded",
            extra={"event_data": result.to_dict()},
        )
        return result

    def collect_all_active(self) -> list[SearchCollectionResult]:
        tracked_products = self.storage.list_tracked_products(active_only=True)
        return [self.collect_tracked_product(product) for product in tracked_products]

    def collect_due(self) -> list[SearchCollectionResult]:
        tracked_products = self.storage.list_due_tracked_products()
        return [self.collect_tracked_product(product) for product in tracked_products]
