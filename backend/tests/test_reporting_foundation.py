from pathlib import Path
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _Mappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return _Mappings(self._rows)


class FakeTargetSession:
    def __init__(self, rows):
        self.rows = rows
        self.params = None

    async def execute(self, _query, params):
        self.params = params
        return _Result(self.rows)


def test_canonical_nop_removes_optional_prefix_and_regional_scope():
    from queries.reporting_foundation import canonical_nop

    assert canonical_nop(" NOP Sidoarjo ") == "SIDOARJO"
    assert canonical_nop("sidoarjo") == "SIDOARJO"
    assert canonical_nop("Regional Jatim") is None
    assert canonical_nop(None) is None


@pytest.mark.asyncio
async def test_target_range_reports_missing_months_instead_of_inventing_a_target():
    from queries.reporting_foundation import load_revenue_target

    session = FakeTargetSession(
        [
            {
                "trx_month": "2026-06",
                "target_revenue": 90_000_000_000,
                "updated_at": "2026-08-31T00:00:00+00:00",
            }
        ]
    )

    result = await load_revenue_target(
        session,
        nop="NOP SIDOARJO",
        period_start="2026-06",
        period_end="2026-07",
    )

    assert session.params == {
        "nop_key": "SIDOARJO",
        "period_start": "2026-06",
        "period_end": "2026-07",
    }
    assert result.target_revenue == 90_000_000_000
    assert result.selected_months == 2
    assert result.configured_months == 1
    assert result.missing_months == ["2026-07"]
    assert result.complete is False
    assert result.version != "unconfigured"


@pytest.mark.asyncio
async def test_regional_scope_never_inherits_an_nop_target():
    from queries.reporting_foundation import load_revenue_target

    session = FakeTargetSession([])
    result = await load_revenue_target(
        session,
        nop="Regional Jatim",
        period_start="2026-07",
        period_end="2026-07",
    )

    assert session.params is None
    assert result.target_revenue == 0
    assert result.selected_months == 1
    assert result.configured_months == 0
    assert result.missing_months == ["2026-07"]
    assert result.complete is False
    assert result.version == "regional"


def test_foundation_sql_has_monthly_target_and_statement_refresh_tracking():
    sql_path = Path(__file__).resolve().parents[1] / "sql" / "reporting_foundation.sql"
    statements = sql_path.read_text(encoding="utf-8").split("\n-- statement-breakpoint\n")
    normalized = " ".join(sql_path.read_text(encoding="utf-8").lower().split())

    assert len([statement for statement in statements if statement.strip()]) >= 6
    assert "primary key (nop_key, trx_month)" in normalized
    assert "for each statement" in normalized
    assert "truncate" in normalized
    assert "reporting_source_refresh" in normalized


def test_target_foundation_failure_is_fatal_during_startup():
    main_source = (Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")

    assert "reporting_foundation_error" in main_source
    assert "Reporting target foundation failed" in main_source
    assert "raise RuntimeError" in main_source
