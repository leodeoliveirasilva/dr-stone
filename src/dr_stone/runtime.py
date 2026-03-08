from __future__ import annotations

import os
from pathlib import Path

from dr_stone.config import Settings
from dr_stone.http import HttpFetcher
from dr_stone.scrapers.kabum_search import KabumSearchScraper
from dr_stone.services.search_collection import SearchCollectionService
from dr_stone.storage import PostgresStorage


def build_postgres_storage(logger) -> PostgresStorage:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    storage = PostgresStorage(database_url, logger)
    storage.apply_migrations(project_root() / "migrations")
    return storage


def build_collection_service(
    settings: Settings,
    logger,
    storage: PostgresStorage,
) -> SearchCollectionService:
    fetcher = HttpFetcher(settings, logger)
    scraper = KabumSearchScraper(fetcher, logger)
    return SearchCollectionService(storage=storage, search_scraper=scraper, logger=logger)


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]
