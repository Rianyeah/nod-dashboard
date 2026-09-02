from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_additive_driver_uses_nominal_delta_not_extreme_percentage():
    from services.reporting_insights import select_additive_driver

    driver = select_additive_driver(
        [
            {"site_id": "BIG001", "site_name": "Big", "revenue": 150, "previous_revenue": 100},
            {"site_id": "TINY01", "site_name": "Tiny", "revenue": 2, "previous_revenue": 1},
        ],
        metric="revenue",
        aggregate_delta=51,
    )

    assert driver is not None
    assert driver.site_id == "BIG001"
    assert driver.delta_value == 50
    assert driver.delta_pct == pytest.approx(50)
    assert driver.contribution_pct == pytest.approx(50 / 51 * 100)


def test_additive_driver_follows_negative_scope_direction():
    from services.reporting_insights import select_additive_driver

    driver = select_additive_driver(
        [
            {"site_id": "DOWN01", "payload": 60, "previous_payload": 100},
            {"site_id": "UP0001", "payload": 120, "previous_payload": 100},
        ],
        metric="payload",
        aggregate_delta=-20,
    )

    assert driver is not None
    assert driver.site_id == "DOWN01"
    assert driver.delta_value == -40
    assert driver.contribution_pct == pytest.approx(200)


def test_zero_previous_value_keeps_a_valid_nominal_driver():
    from services.reporting_insights import select_additive_driver

    driver = select_additive_driver(
        [{"site_id": "NEW001", "revenue": 10, "previous_revenue": 0}],
        metric="revenue",
        aggregate_delta=10,
    )

    assert driver is not None
    assert driver.site_id == "NEW001"
    assert driver.delta_value == 10
    assert driver.delta_pct is None


def test_availability_driver_ranks_same_direction_outage_impact():
    from services.reporting_insights import select_availability_driver

    driver = select_availability_driver(
        [
            {
                "site_id": "AAA001",
                "availability": 99.8,
                "previous_availability": 99.6,
                "outage_minutes": 2,
                "previous_outage_minutes": 4,
            },
            {
                "site_id": "BBB001",
                "availability": 99.7,
                "previous_availability": 99.0,
                "outage_minutes": 1,
                "previous_outage_minutes": 10,
            },
        ],
        aggregate_availability_delta=0.25,
        aggregate_outage_delta=-11,
    )

    assert driver is not None
    assert driver.site_id == "BBB001"
    assert driver.delta_pct == pytest.approx(0.7)
    assert driver.outage_delta_minutes == pytest.approx(-9)
    assert driver.contribution_pct == pytest.approx(9 / 11 * 100)


def test_missing_comparison_has_no_direction_driver_or_false_recommendation():
    from services.reporting_insights import (
        build_metric_recommendation,
        metric_direction,
        select_additive_driver,
    )

    direction = metric_direction(None)
    assert direction == "unavailable"
    assert select_additive_driver([], metric="revenue", aggregate_delta=None) is None
    assert build_metric_recommendation(
        "revenue",
        direction=direction,
        driver=None,
        comparison_available=False,
    ) == "Lengkapi data periode pembanding sebelum menentukan prioritas site."


def test_recommendation_does_not_claim_root_cause_from_correlation():
    from models.reporting import ReportingMetricDriver
    from services.reporting_insights import build_metric_recommendation

    recommendation = build_metric_recommendation(
        "revenue",
        direction="negative",
        driver=ReportingMetricDriver(site_id="REV001"),
        comparison_available=True,
        related_directions={"availability": "negative"},
    )

    assert recommendation == (
        "Korelasikan REV001 dengan histori outage dan tiket sebelum menentukan tindakan korektif."
    )

