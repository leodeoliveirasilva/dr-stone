from __future__ import annotations

import logging
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from dr_stone.storage import PostgresStorage


@pytest.fixture
def migrations_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "migrations"


@pytest.fixture
def postgres_database_url() -> str:
    base_database_url = os.getenv("TEST_DATABASE_URL")
    if not base_database_url:
        pytest.skip("TEST_DATABASE_URL is not set; run the database-backed tests via docker compose.")

    database_name = f"dr_stone_test_{uuid4().hex}"
    admin_database_url = _replace_database_name(base_database_url, "postgres")
    test_database_url = _replace_database_name(base_database_url, database_name)

    with psycopg.connect(admin_database_url, autocommit=True) as admin_connection:
        admin_connection.execute(
            sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name))
        )

    try:
        yield test_database_url
    finally:
        with psycopg.connect(admin_database_url, autocommit=True) as admin_connection:
            admin_connection.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s AND pid <> pg_backend_pid()
                """,
                (database_name,),
            )
            admin_connection.execute(
                sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(database_name))
            )


@pytest.fixture
def postgres_storage(postgres_database_url: str, migrations_dir: Path) -> PostgresStorage:
    storage = PostgresStorage(postgres_database_url, logging.getLogger("test"))
    storage.apply_migrations(migrations_dir)
    return storage


def _replace_database_name(database_url: str, database_name: str) -> str:
    conninfo = conninfo_to_dict(database_url)
    conninfo["dbname"] = database_name
    return make_conninfo(**conninfo)
