"""Idempotent database schema bootstrap for RBAC and managed data imports."""

from __future__ import annotations

import re
from pathlib import Path


SCHEMA_PATH = Path(__file__).parent / "sql" / "management_data.sql"
DO_BLOCK_PATTERN = re.compile(
    r"DO\s+(?P<delimiter>\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$).*?(?P=delimiter)\s*;",
    re.IGNORECASE | re.DOTALL,
)


def _plain_statements(source: str) -> list[str]:
    return [statement.strip() for statement in source.split(";") if statement.strip()]


def management_schema_statements() -> tuple[str, ...]:
    """Return simple DDL statements in dependency order."""
    source = SCHEMA_PATH.read_text(encoding="utf-8")
    statements: list[str] = []
    position = 0
    for match in DO_BLOCK_PATTERN.finditer(source):
        statements.extend(_plain_statements(source[position:match.start()]))
        statements.append(match.group(0).strip().removesuffix(";").strip())
        position = match.end()
    statements.extend(_plain_statements(source[position:]))
    return tuple(statements)
