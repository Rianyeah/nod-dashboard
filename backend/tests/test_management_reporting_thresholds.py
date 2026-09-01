from pathlib import Path
import sys

import pytest
from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _Mappings:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows

    def one(self):
        return self.rows[0]


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return _Mappings(self.rows)


class RevenueTargetSession:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.calls = []
        self.commits = 0

    async def execute(self, query, params=None):
        self.calls.append((str(query), params))
        return _Result(self.rows)

    async def commit(self):
        self.commits += 1


def test_revenue_target_input_is_strict_and_non_negative():
    from models.reporting_thresholds import RevenueTargetInput

    payload = RevenueTargetInput(target_revenue=90_000_000_000, note="Target September")
    assert payload.target_revenue == 90_000_000_000

    with pytest.raises(ValidationError):
        RevenueTargetInput(target_revenue=-1)
    with pytest.raises(ValidationError):
        RevenueTargetInput(target_revenue=1, unknown="blocked")


@pytest.mark.asyncio
async def test_list_revenue_targets_uses_bounded_allowlisted_filters():
    from services.reporting_thresholds import list_revenue_targets

    session = RevenueTargetSession([
        {
            "nop_key": "SIDOARJO",
            "trx_month": "2026-09",
            "target_revenue": 90_000_000_000,
            "note": "Target September",
            "updated_by": "data-admin",
            "updated_at": "2026-09-01T00:00:00+00:00",
        }
    ])
    rows = await list_revenue_targets(
        session,
        nop="NOP Sidoarjo",
        month_from="2026-08",
        month_to="2026-09",
        limit=25,
    )

    assert rows[0]["nop_key"] == "SIDOARJO"
    assert session.calls[0][1] == {
        "nop_key": "SIDOARJO",
        "month_from": "2026-08",
        "month_to": "2026-09",
        "limit": 25,
    }
    assert "LIMIT :limit" in session.calls[0][0]


@pytest.mark.asyncio
async def test_upsert_revenue_target_normalizes_nop_and_records_actor():
    from models.reporting_thresholds import RevenueTargetInput
    from services.reporting_thresholds import upsert_revenue_target

    session = RevenueTargetSession([
        {
            "nop_key": "SIDOARJO",
            "trx_month": "2026-09",
            "target_revenue": 95_000_000_000,
            "note": "Revisi",
            "updated_by": "data-admin",
            "updated_at": "2026-09-01T00:00:00+00:00",
        }
    ])
    row = await upsert_revenue_target(
        session,
        nop="NOP Sidoarjo",
        trx_month="2026-09",
        payload=RevenueTargetInput(target_revenue=95_000_000_000, note="Revisi"),
        actor="data-admin",
    )

    assert row["target_revenue"] == 95_000_000_000
    assert session.calls[0][1]["nop_key"] == "SIDOARJO"
    assert session.calls[0][1]["updated_by"] == "data-admin"
    assert session.commits == 1


@pytest.mark.asyncio
async def test_upsert_revenue_target_rejects_regional_scope():
    from models.reporting_thresholds import RevenueTargetInput
    from services.reporting_thresholds import upsert_revenue_target

    with pytest.raises(ValueError, match="NOP wajib"):
        await upsert_revenue_target(
            RevenueTargetSession(),
            nop="Regional Jatim",
            trx_month="2026-09",
            payload=RevenueTargetInput(target_revenue=1),
            actor="data-admin",
        )


def test_revenue_target_schema_can_record_the_actor_idempotently():
    sql = (Path(__file__).resolve().parents[1] / "sql" / "reporting_foundation.sql").read_text(encoding="utf-8")

    assert "updated_by text" in sql.lower()
    assert "ADD COLUMN IF NOT EXISTS updated_by" in sql
