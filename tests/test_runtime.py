from __future__ import annotations

from pathlib import Path

import psycopg

from dr_stone import runtime
from dr_stone.logging import configure_logging


def test_migrations_dir_defaults_to_cwd(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)

    assert runtime.migrations_dir() == tmp_path / "migrations"


def test_migrations_dir_uses_env_override(monkeypatch, tmp_path: Path) -> None:
    custom_dir = tmp_path / "db" / "migrations"
    monkeypatch.setenv("DR_STONE_MIGRATIONS_DIR", str(custom_dir))

    assert runtime.migrations_dir() == custom_dir.resolve()


def test_build_postgres_storage_retries_operational_error(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://example")
    monkeypatch.setenv("DR_STONE_DB_CONNECT_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("DR_STONE_DB_CONNECT_RETRY_DELAY_SECONDS", "0")

    attempts = {"count": 0}

    class _StubStorage:
        def __init__(self, database_url: str, logger) -> None:
            self.database_url = database_url
            self.logger = logger

        def apply_migrations(self, _path) -> None:
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise psycopg.OperationalError("temporary failure")

    monkeypatch.setattr(runtime, "PostgresStorage", _StubStorage)

    storage = runtime.build_postgres_storage(configure_logging("INFO"))

    assert attempts["count"] == 3
    assert isinstance(storage, _StubStorage)
