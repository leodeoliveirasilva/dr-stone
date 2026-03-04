from __future__ import annotations

import argparse
import json

from dr_stone.config import Settings
from dr_stone.http import HttpFetcher
from dr_stone.logging import configure_logging
from dr_stone.scrapers.kabum import KabumScraper


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scrape product data into a normalized shape.")
    parser.add_argument("url", help="Product URL to scrape")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    settings = Settings.from_env()
    logger = configure_logging(settings.log_level)
    fetcher = HttpFetcher(settings, logger)

    try:
        scraper = KabumScraper(fetcher, logger)
        result = scraper.scrape(args.url)
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        return 0
    finally:
        fetcher.close()
