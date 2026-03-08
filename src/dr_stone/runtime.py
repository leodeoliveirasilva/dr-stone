from __future__ import annotations

import os
import time
from pathlib import Path

import psycopg

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
    max_attempts = int(os.getenv("DR_STONE_DB_CONNECT_MAX_ATTEMPTS", "10"))
    retry_delay_seconds = float(os.getenv("DR_STONE_DB_CONNECT_RETRY_DELAY_SECONDS", "2"))

    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            storage.apply_migrations(migrations_dir())
            return storage
        except psycopg.OperationalError as exc:
            last_error = exc
            logger.warning(
                "db_startup_retry",
                extra={
                    "event_data": {
                        "attempt": attempt,
                        "max_attempts": max_attempts,
                        "retry_delay_seconds": retry_delay_seconds,
                        "error": str(exc),
                    }
                },
            )
            if attempt == max_attempts:
                break
            time.sleep(retry_delay_seconds)

    assert last_error is not None
    raise last_error


def build_collection_service(
    settings: Settings,
    logger,
    storage: PostgresStorage,
) -> SearchCollectionService:
    return SearchCollectionService(
        storage=storage,
        search_scrapers=build_search_scrapers(settings, logger),
        logger=logger,
    )


def build_search_scrapers(settings: Settings, logger) -> list[KabumSearchScraper]:
    return [KabumSearchScraper(HttpFetcher(settings, logger), logger)]


def project_root() -> Path:
    return Path.cwd().resolve()


def migrations_dir() -> Path:
    configured_dir = os.getenv("DR_STONE_MIGRATIONS_DIR")
    if configured_dir:
        return Path(configured_dir).resolve()
    return project_root() / "migrations"
