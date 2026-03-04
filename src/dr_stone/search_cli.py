from __future__ import annotations

import argparse
import json
from pathlib import Path

from dr_stone.config import Settings
from dr_stone.http import HttpFetcher
from dr_stone.logging import configure_logging
from dr_stone.scrapers.kabum_search import KabumSearchScraper
from dr_stone.services.search_collection import SearchCollectionService
from dr_stone.storage import SQLiteStorage


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage tracked search scraping.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add = subparsers.add_parser("add", help="Add a tracked product search")
    add.add_argument("--db-path", required=True)
    add.add_argument("--title", required=True, help="Expected product title in the result list")
    add.add_argument("--search-term", required=True, help="Search term used on KaBuM")
    add.add_argument("--source", default="kabum")
    add.add_argument("--scrapes-per-day", type=int, default=4)

    collect = subparsers.add_parser("collect", help="Collect results for tracked searches")
    collect.add_argument("--db-path", required=True)
    collect.add_argument("--source", default="kabum")
    collect.add_argument("--tracked-product-id")

    collect_due = subparsers.add_parser(
        "collect-due",
        help="Collect only tracked searches that are due based on scrapes_per_day",
    )
    collect_due.add_argument("--db-path", required=True)
    collect_due.add_argument("--source", default="kabum")

    list_cmd = subparsers.add_parser("list", help="List tracked searches")
    list_cmd.add_argument("--db-path", required=True)
    list_cmd.add_argument("--source", default="kabum")
    list_cmd.add_argument("--all", action="store_true", help="Include inactive tracked searches")

    history = subparsers.add_parser("history", help="Show saved lowest-price history")
    history.add_argument("--db-path", required=True)
    history.add_argument("--tracked-product-id", required=True)
    history.add_argument("--limit", type=int, default=100)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    settings = Settings.from_env()
    logger = configure_logging(settings.log_level)
    storage = SQLiteStorage(args.db_path, logger)
    migrations_dir = Path(__file__).resolve().parents[2] / "migrations"
    storage.apply_migrations(migrations_dir)

    if args.command == "add":
        tracked_product = storage.create_tracked_product(
            product_title=args.title,
            search_term=args.search_term,
            source=args.source,
            scrapes_per_day=args.scrapes_per_day,
        )
        print(json.dumps(tracked_product.to_dict(), ensure_ascii=False, indent=2))
        return 0

    if args.command == "list":
        tracked_products = storage.list_tracked_products(
            active_only=not args.all,
            source=args.source,
        )
        print(
            json.dumps(
                [tracked_product.to_dict() for tracked_product in tracked_products],
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    if args.command == "history":
        history_rows = storage.list_price_history(args.tracked_product_id, limit=args.limit)
        print(
            json.dumps(
                [history_row.to_dict() for history_row in history_rows],
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    fetcher = HttpFetcher(settings, logger)
    try:
        service = SearchCollectionService(
            storage=storage,
            search_scraper=KabumSearchScraper(fetcher, logger),
            logger=logger,
        )
        if args.tracked_product_id:
            tracked_product = storage.get_tracked_product(args.tracked_product_id)
            if tracked_product is None:
                raise SystemExit(f"Tracked product not found: {args.tracked_product_id}")
            results = [service.collect_tracked_product(tracked_product)]
        elif args.command == "collect-due":
            results = service.collect_due(source=args.source)
        else:
            results = service.collect_all_active(source=args.source)
        print(json.dumps([result.to_dict() for result in results], ensure_ascii=False, indent=2))
        return 0
    finally:
        fetcher.close()
