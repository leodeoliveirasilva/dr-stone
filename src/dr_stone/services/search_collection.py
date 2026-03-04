from __future__ import annotations

import logging

from dr_stone.exceptions import DrStoneError
from dr_stone.failures import build_scrape_failure
from dr_stone.matching import title_contains_expected
from dr_stone.models import SearchCollectionResult, TrackedProduct
from dr_stone.scrapers.kabum_search import KabumSearchScraper
from dr_stone.storage import SQLiteStorage


class SearchCollectionService:
    max_results_per_run = 4

    def __init__(
        self,
        storage: SQLiteStorage,
        search_scraper: KabumSearchScraper,
        logger: logging.Logger,
    ) -> None:
        self.storage = storage
        self.search_scraper = search_scraper
        self.logger = logger

    def collect_tracked_product(self, tracked_product: TrackedProduct) -> SearchCollectionResult:
        search_url = self.search_scraper.build_search_url(tracked_product.search_term)
        search_run_id = self.storage.create_search_run(tracked_product, search_url)

        try:
            run = self.search_scraper.search(tracked_product.search_term)
            matched_items = [
                item
                for item in run.items
                if title_contains_expected(tracked_product.product_title, item.title)
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
            result = SearchCollectionResult(
                tracked_product_id=tracked_product.id,
                search_run_id=search_run_id,
                total_results=run.total_results,
                matched_results=matched_count,
                page_count=run.page_count,
            )
            self.logger.info(
                "search_collection_succeeded",
                extra={"event_data": result.to_dict()},
            )
            return result
        except DrStoneError as exc:
            failure = build_scrape_failure(tracked_product.source, search_url, exc)
            self.storage.record_failure(failure, search_run_id=search_run_id)
            self.storage.finish_search_run(
                search_run_id,
                status="failed",
                message=str(exc),
            )
            raise

    def collect_all_active(self, source: str | None = None) -> list[SearchCollectionResult]:
        tracked_products = self.storage.list_tracked_products(
            active_only=True,
            source=source,
        )
        return [self.collect_tracked_product(product) for product in tracked_products]

    def collect_due(self, source: str | None = None) -> list[SearchCollectionResult]:
        tracked_products = self.storage.list_due_tracked_products(source=source)
        return [self.collect_tracked_product(product) for product in tracked_products]
