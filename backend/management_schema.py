"""Idempotent database schema bootstrap for RBAC and managed data imports."""

from __future__ import annotations

from pathlib import Path


SCHEMA_PATH = Path(__file__).parent / "sql" / "management_data.sql"


def management_schema_statements() -> tuple[str, ...]:
    """Return simple DDL statements in dependency order."""
    return tuple(
        statement.strip()
        for statement in SCHEMA_PATH.read_text(encoding="utf-8").split(";")
        if statement.strip()
    )
