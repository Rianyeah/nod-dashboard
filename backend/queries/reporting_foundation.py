"""Shared normalized primitives and schema bootstrap for Network Reporting."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from periods import resolve_month_period


SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "reporting_foundation.sql"
STATEMENT_BREAKPOINT = "\n-- statement-breakpoint\n"
NORMALIZED_TRAKTOR_SITE_ID = "UPPER(TRIM(t.site_id))"
NORMALIZED_MASTER_SITE_ID = 'UPPER(TRIM(d."Siteid"))'
UNMAPPED_AREA_KEY = "__UNMAPPED__"
UNMAPPED_AREA_LABEL = "Belum Terpetakan"


@dataclass(frozen=True)
class RevenueTargetResult:
    target_revenue: int
    selected_months: int
    configured_months: int
    missing_months: list[str]
    version: str

    @property
    def complete(self) -> bool:
        return self.selected_months > 0 and self.configured_months == self.selected_months


def canonical_nop(value: str | None) -> str | None:
    """Return a canonical NOP key, or ``None`` for the Regional scope."""
    normalized = (value or "").strip().upper()
    if normalized in {"", "REGIONAL JATIM", "SEMUA NOP"}:
        return None
    return re.sub(r"^NOP\s+", "", normalized).strip() or None


def reporting_foundation_statements() -> tuple[str, ...]:
    sql = SQL_PATH.read_text(encoding="utf-8")
    return tuple(
        statement.strip()
        for statement in sql.split(STATEMENT_BREAKPOINT)
        if statement.strip()
    )


async def ensure_reporting_foundation(session: AsyncSession) -> None:
    """Create idempotent Reporting configuration and refresh tracking objects."""
    for statement in reporting_foundation_statements():
        await session.execute(text(statement))
    await session.commit()


def _target_version(rows: list[dict]) -> str:
    if not rows:
        return "unconfigured"
    updated_values = sorted(str(row.get("updated_at") or "") for row in rows)
    return f"{len(rows)}:{updated_values[-1]}"


async def load_revenue_target(
    session: AsyncSession,
    *,
    nop: str | None,
    period_start: str,
    period_end: str,
) -> RevenueTargetResult:
    """Load a NOP target range without filling absent configuration months."""
    period = resolve_month_period(period_start=period_start, period_end=period_end)
    nop_key = canonical_nop(nop)
    if nop_key is None:
        return RevenueTargetResult(
            target_revenue=0,
            selected_months=period.month_count,
            configured_months=0,
            missing_months=list(period.active_months),
            version="regional",
        )

    result = await session.execute(
        text(
            """
            SELECT trx_month, target_revenue, updated_at
            FROM public.reporting_revenue_targets
            WHERE nop_key = :nop_key
              AND trx_month BETWEEN :period_start AND :period_end
            ORDER BY trx_month
            """
        ),
        {
            "nop_key": nop_key,
            "period_start": period.period_start,
            "period_end": period.period_end,
        },
    )
    rows = [dict(row) for row in result.mappings().all()]
    configured = {str(row["trx_month"]): int(row["target_revenue"] or 0) for row in rows}
    missing = [month for month in period.active_months if month not in configured]
    return RevenueTargetResult(
        target_revenue=sum(configured.values()),
        selected_months=period.month_count,
        configured_months=len(configured),
        missing_months=missing,
        version=_target_version(rows),
    )


async def load_revenue_target_version(
    session: AsyncSession,
    *,
    nop: str | None,
) -> str:
    """Return a compact target configuration version for cache invalidation."""
    nop_key = canonical_nop(nop)
    if nop_key is None:
        return "regional"
    result = await session.execute(
        text(
            """
            SELECT COUNT(*) AS row_count, MAX(updated_at) AS updated_at
            FROM public.reporting_revenue_targets
            WHERE nop_key = :nop_key
            """
        ),
        {"nop_key": nop_key},
    )
    row = result.mappings().one()
    return f"{int(row['row_count'] or 0)}:{row['updated_at'] or ''}"
