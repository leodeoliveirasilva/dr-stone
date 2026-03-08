from __future__ import annotations

from types import SimpleNamespace

import pytest

from dr_stone import worker


class _StubService:
    def __init__(self, results_per_run):
        self._results_per_run = list(results_per_run)
        self.calls = 0
        self.search_scraper = SimpleNamespace(fetcher=SimpleNamespace(close=lambda: None))

    def collect_all_active(self):
        result = self._results_per_run[min(self.calls, len(self._results_per_run) - 1)]
        self.calls += 1
        return result


def test_run_worker_loop_collects_once_when_requested() -> None:
    service = _StubService([[{"tracked_product_id": "prod-1"}]])

    worker.run_worker_loop(
        service=service,
        logger=worker.configure_logging("INFO"),
        interval_seconds=21600,
        run_once=True,
    )

    assert service.calls == 1


def test_run_worker_loop_sleeps_remaining_interval() -> None:
    service = _StubService([[{"tracked_product_id": "prod-1"}], [{"tracked_product_id": "prod-2"}]])
    sleep_calls: list[float] = []
    monotonic_values = iter([100.0, 112.5, 112.5, 125.0])

    def fake_sleep(seconds: float) -> None:
        sleep_calls.append(seconds)
        raise RuntimeError("stop loop")

    with pytest.raises(RuntimeError, match="stop loop"):
        worker.run_worker_loop(
            service=service,
            logger=worker.configure_logging("INFO"),
            interval_seconds=30,
            sleep_func=fake_sleep,
            monotonic_func=lambda: next(monotonic_values),
        )

    assert service.calls == 1
    assert sleep_calls == [17.5]


def test_main_rejects_non_positive_interval(monkeypatch) -> None:
    with pytest.raises(SystemExit, match="interval-seconds must be a positive integer"):
        worker.main(["--interval-seconds", "0"])
