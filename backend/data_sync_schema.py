"""Idempotent startup schema for durable dashboard data-sync jobs."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


SCHEMA_PATH = Path(__file__).parent / "sql" / "data_sync_jobs.sql"


def data_sync_schema_statements() -> tuple[str, ...]:
    """Return the simple data-sync DDL statements in dependency order."""
    source = SCHEMA_PATH.read_text(encoding="utf-8")
    return tuple(
        statement.strip()
        for statement in source.split(";")
        if statement.strip()
    )


async def ensure_data_sync_schema(engine: AsyncEngine) -> None:
    """Create the coordination table and indexes before serving requests."""
    async with engine.begin() as connection:
        for statement in data_sync_schema_statements():
            await connection.execute(text(statement))
