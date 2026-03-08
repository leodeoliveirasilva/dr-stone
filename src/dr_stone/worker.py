from __future__ import annotations

import argparse
import time

from dr_stone.config import Settings
from dr_stone.logging import configure_logging
from dr_stone.runtime import build_collection_service, build_postgres_storage


DEFAULT_RUNS_PER_DAY = 4
DEFAULT_INTERVAL_SECONDS = int(86400 / DEFAULT_RUNS_PER_DAY)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Dr. Stone scheduled collection worker.")
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="Run one collection cycle immediately and exit.",
    )
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=DEFAULT_INTERVAL_SECONDS,
        help="Seconds between collection cycles. Defaults to 21600 (4 times per day).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.interval_seconds <= 0:
        raise SystemExit("interval-seconds must be a positive integer")

    settings = Settings.from_env()
    logger = configure_logging(settings.log_level)
    storage = build_postgres_storage(logger)
    service = build_collection_service(settings, logger, storage)

    try:
        run_worker_loop(
            service=service,
            logger=logger,
            interval_seconds=args.interval_seconds,
            run_once=args.run_once,
        )
    finally:
        service.close()
    return 0


def run_worker_loop(
    *,
    service,
    logger,
    interval_seconds: int,
    run_once: bool = False,
    sleep_func=time.sleep,
    monotonic_func=time.monotonic,
) -> None:
    while True:
        cycle_started = monotonic_func()
        results = service.collect_all_active()
        logger.info(
            "worker_cycle_completed",
            extra={
                "event_data": {
                    "interval_seconds": interval_seconds,
                    "collected_count": len(results),
                }
            },
        )

        if run_once:
            return

        elapsed_seconds = monotonic_func() - cycle_started
        sleep_seconds = max(0.0, interval_seconds - elapsed_seconds)
        logger.info(
            "worker_sleep_scheduled",
            extra={
                "event_data": {
                    "interval_seconds": interval_seconds,
                    "sleep_seconds": sleep_seconds,
                }
            },
        )
        sleep_func(sleep_seconds)
