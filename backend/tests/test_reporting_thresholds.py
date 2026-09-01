from pathlib import Path
import sys

import pytest
from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def valid_threshold_payload():
    return {
        "availability": {
            "diamond": 99.87,
            "platinum": 99.73,
            "gold": 99.68,
            "silver": 99.67,
            "bronze": 99.73,
        },
        "revenue_u30_upper": 30_000_000,
        "revenue_u60_upper": 60_000_000,
        "payload_target_tb": 15,
    }


def test_threshold_input_accepts_the_approved_baseline():
    from models.reporting_thresholds import ThresholdVersionInput

    payload = ThresholdVersionInput(**valid_threshold_payload())

    assert payload.availability.diamond == pytest.approx(99.87)
    assert payload.revenue_u30_upper == 30_000_000
    assert payload.revenue_u60_upper == 60_000_000
    assert payload.payload_target_tb == pytest.approx(15)


@pytest.mark.parametrize("site_class", ["diamond", "platinum", "gold", "silver", "bronze"])
def test_threshold_input_requires_every_supported_site_class(site_class):
    from models.reporting_thresholds import ThresholdVersionInput

    payload = valid_threshold_payload()
    del payload["availability"][site_class]

    with pytest.raises(ValidationError):
        ThresholdVersionInput(**payload)


def test_threshold_input_rejects_invalid_percentage_and_inverted_revenue_bands():
    from models.reporting_thresholds import ThresholdVersionInput

    invalid_percentage = valid_threshold_payload()
    invalid_percentage["availability"]["diamond"] = 100.01
    with pytest.raises(ValidationError):
        ThresholdVersionInput(**invalid_percentage)

    inverted = valid_threshold_payload()
    inverted["revenue_u30_upper"] = 60_000_000
    inverted["revenue_u60_upper"] = 60_000_000
    with pytest.raises(ValidationError):
        ThresholdVersionInput(**inverted)


def test_revenue_threshold_boundaries_have_no_gap():
    from services.reporting_thresholds import classify_revenue

    assert classify_revenue(29_999_999, 30_000_000, 60_000_000) == "u30"
    assert classify_revenue(30_000_000, 30_000_000, 60_000_000) == "u60"
    assert classify_revenue(59_999_999, 30_000_000, 60_000_000) == "u60"
    assert classify_revenue(60_000_000, 30_000_000, 60_000_000) == "achieved"
    assert classify_revenue(None, 30_000_000, 60_000_000) == "unavailable"


def test_payload_threshold_uses_binary_terabytes():
    from services.reporting_thresholds import PAYLOAD_MB_PER_TB, achieved_payload

    target = 15 * PAYLOAD_MB_PER_TB
    assert achieved_payload(target - 1, 15) == "not_achieved"
    assert achieved_payload(target, 15) == "achieved"
    assert achieved_payload(None, 15) == "unavailable"


def test_availability_and_overall_status_respect_missing_data_precedence():
    from services.reporting_thresholds import achieved_availability, overall_target_status

    assert achieved_availability(99.87, 99.87) == "achieved"
    assert achieved_availability(99.869, 99.87) == "not_achieved"
    assert achieved_availability(None, 99.87) == "unavailable"
    assert achieved_availability(99.9, None) == "unavailable"
    assert overall_target_status("achieved", "achieved", "achieved") == "achieved"
    assert overall_target_status("achieved", "u60", "achieved") == "not_achieved"
    assert overall_target_status("unavailable", "achieved", "achieved") == "unavailable"


def threshold_rows():
    return [
        {"metric": "availability", "threshold_key": "target", "site_class": "DIAMOND", "threshold_value": 99.87, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "availability", "threshold_key": "target", "site_class": "PLATINUM", "threshold_value": 99.73, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "availability", "threshold_key": "target", "site_class": "GOLD", "threshold_value": 99.68, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "availability", "threshold_key": "target", "site_class": "SILVER", "threshold_value": 99.67, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "availability", "threshold_key": "target", "site_class": "BRONZE", "threshold_value": 99.73, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "revenue", "threshold_key": "u30_upper", "site_class": "*", "threshold_value": 30_000_000, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "revenue", "threshold_key": "u60_upper", "site_class": "*", "threshold_value": 60_000_000, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
        {"metric": "payload", "threshold_key": "target", "site_class": "*", "threshold_value": 15, "effective_month": "2026-08", "updated_by": "admin", "updated_at": "2026-08-01T00:00:00+00:00"},
    ]


def test_threshold_snapshot_is_complete_only_with_all_eight_values():
    from services.reporting_thresholds import build_threshold_snapshot

    complete = build_threshold_snapshot(threshold_rows(), "2026-09")
    missing = build_threshold_snapshot(threshold_rows()[:-1], "2026-09")

    assert complete.complete is True
    assert complete.effective_month == "2026-08"
    assert complete.availability["DIAMOND"] == pytest.approx(99.87)
    assert complete.revenue_u60_upper == 60_000_000
    assert complete.payload_target_tb == pytest.approx(15)
    assert complete.version.startswith("8:")
    assert missing.complete is False
    assert missing.payload_target_tb is None
    assert missing.missing_keys == ["payload:target:*"]


def test_threshold_write_rows_are_allowlisted_and_normalized():
    from models.reporting_thresholds import ThresholdVersionInput
    from services.reporting_thresholds import threshold_write_rows

    rows = threshold_write_rows(
        "2026-09",
        ThresholdVersionInput(**valid_threshold_payload()),
        "data-admin",
    )

    assert len(rows) == 8
    assert {row["metric"] for row in rows} == {"availability", "revenue", "payload"}
    assert {row["site_class"] for row in rows if row["metric"] == "availability"} == {
        "DIAMOND", "PLATINUM", "GOLD", "SILVER", "BRONZE"
    }
    assert {row["effective_month"] for row in rows} == {"2026-09"}
    assert {row["updated_by"] for row in rows} == {"data-admin"}


class _Mappings:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return _Mappings(self.rows)


class ThresholdSession:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.calls = []
        self.commits = 0

    async def execute(self, query, params=None):
        self.calls.append((str(query), params))
        return _Result(self.rows)

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_resolve_threshold_snapshot_uses_latest_values_at_requested_month():
    from services.reporting_thresholds import resolve_threshold_snapshot

    session = ThresholdSession(threshold_rows())
    snapshot = await resolve_threshold_snapshot(session, "2026-09")

    assert snapshot.complete is True
    assert snapshot.requested_month == "2026-09"
    assert session.calls[0][1] == {"requested_month": "2026-09"}
    assert "DISTINCT ON (metric, threshold_key, site_class)" in session.calls[0][0]
    assert "effective_month <= :requested_month" in session.calls[0][0]


@pytest.mark.asyncio
async def test_save_threshold_version_writes_all_rows_and_commits_once():
    from models.reporting_thresholds import ThresholdVersionInput
    from services.reporting_thresholds import save_threshold_version

    session = ThresholdSession()
    snapshot = await save_threshold_version(
        session,
        "2026-09",
        ThresholdVersionInput(**valid_threshold_payload()),
        "data-admin",
    )

    assert len(session.calls) == 1
    assert len(session.calls[0][1]) == 8
    assert "ON CONFLICT (metric, threshold_key, site_class, effective_month)" in session.calls[0][0]
    assert session.commits == 1
    assert snapshot.complete is True
    assert snapshot.effective_month == "2026-09"
    assert snapshot.updated_by == "data-admin"
