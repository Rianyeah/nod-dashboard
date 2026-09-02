"""Pure rules for evidence-backed Reporting insight drivers."""

from collections.abc import Mapping
from typing import Literal

from models.reporting import ReportingMetricDriver


MetricDirection = Literal["positive", "negative", "stable", "unavailable"]


def metric_direction(delta: int | float | None) -> MetricDirection:
    if delta is None:
        return "unavailable"
    if float(delta) > 0:
        return "positive"
    if float(delta) < 0:
        return "negative"
    return "stable"


def select_additive_driver(
    rows: list[dict],
    *,
    metric: Literal["revenue", "payload"],
    aggregate_delta: int | float | None,
) -> ReportingMetricDriver | None:
    direction = metric_direction(aggregate_delta)
    if direction not in {"positive", "negative"}:
        return None

    previous_key = f"previous_{metric}"
    candidates: list[tuple[float, dict, float, float]] = []
    for row in rows:
        if row.get(metric) is None and row.get(previous_key) is None:
            continue
        current = float(row.get(metric) or 0)
        previous = float(row.get(previous_key) or 0)
        delta = current - previous
        if direction == "positive" and delta <= 0:
            continue
        if direction == "negative" and delta >= 0:
            continue
        candidates.append((delta, row, current, previous))

    if not candidates:
        return None

    delta, row, current, previous = (
        max(candidates, key=lambda item: item[0])
        if direction == "positive"
        else min(candidates, key=lambda item: item[0])
    )
    return ReportingMetricDriver(
        site_id=str(row["site_id"]),
        site_name=row.get("site_name"),
        current_value=current,
        previous_value=previous,
        delta_value=delta,
        delta_pct=(delta / previous * 100.0) if previous else None,
        contribution_pct=abs(delta) / abs(float(aggregate_delta)) * 100.0,
    )


def select_availability_driver(
    rows: list[dict],
    *,
    aggregate_availability_delta: int | float | None,
    aggregate_outage_delta: int | float | None,
) -> ReportingMetricDriver | None:
    direction = metric_direction(aggregate_availability_delta)
    if direction not in {"positive", "negative"}:
        return None

    candidates: list[tuple[float, float, dict]] = []
    for row in rows:
        current = row.get("availability")
        previous = row.get("previous_availability")
        current_outage = row.get("outage_minutes")
        previous_outage = row.get("previous_outage_minutes")
        if any(value is None for value in (current, previous, current_outage, previous_outage)):
            continue
        availability_delta = float(current) - float(previous)
        outage_delta = float(current_outage) - float(previous_outage)
        same_direction = outage_delta < 0 if direction == "positive" else outage_delta > 0
        if same_direction:
            candidates.append((outage_delta, availability_delta, row))

    if not candidates:
        return None

    outage_delta, availability_delta, row = (
        min(candidates, key=lambda item: item[0])
        if direction == "positive"
        else max(candidates, key=lambda item: item[0])
    )
    contribution = None
    aggregate_outage = float(aggregate_outage_delta) if aggregate_outage_delta is not None else 0.0
    aggregate_outage_matches = aggregate_outage < 0 if direction == "positive" else aggregate_outage > 0
    if aggregate_outage_matches:
        contribution = abs(outage_delta) / abs(aggregate_outage) * 100.0

    return ReportingMetricDriver(
        site_id=str(row["site_id"]),
        site_name=row.get("site_name"),
        current_value=float(row["availability"]),
        previous_value=float(row["previous_availability"]),
        delta_value=availability_delta,
        delta_pct=availability_delta,
        contribution_pct=contribution,
        outage_delta_minutes=outage_delta,
    )


def build_metric_recommendation(
    metric: Literal["revenue", "payload", "availability"],
    *,
    direction: MetricDirection,
    driver: ReportingMetricDriver | None,
    comparison_available: bool,
    evidence_complete: bool = True,
    target_status: str | None = None,
    related_directions: Mapping[str, MetricDirection] | None = None,
    risk_site_delta: int | None = None,
) -> str | None:
    related = related_directions or {}
    site_id = driver.site_id if driver else None

    if not evidence_complete:
        return "Lengkapi sumber data atau konfigurasi yang belum tersedia sebelum menentukan prioritas site."
    if not comparison_available:
        return "Lengkapi data periode pembanding sebelum menentukan prioritas site."
    if metric == "availability" and direction == "negative" and site_id:
        return f"Prioritaskan {site_id}; periksa histori outage, tiket aktif, backup power, dan kondisi transport."
    if metric == "availability" and direction == "positive" and target_status == "not_achieved":
        return "Pertahankan perbaikan dan lanjutkan remediasi pada site yang masih di bawah target Site Class."
    if metric == "revenue" and risk_site_delta is not None and risk_site_delta > 0:
        return "Prioritaskan site yang baru masuk U30/U60 dan driver penurunan revenue terbesar."
    if metric == "revenue" and direction == "negative" and related.get("availability") == "negative" and site_id:
        return f"Korelasikan {site_id} dengan histori outage dan tiket sebelum menentukan tindakan korektif."
    if (
        metric == "revenue"
        and direction == "negative"
        and related.get("payload") in {"positive", "stable"}
        and site_id
    ):
        return (
            f"Tinjau revenue per traffic dan service mix di {site_id}; "
            "jangan simpulkan gangguan jaringan tanpa bukti pendukung."
        )
    if metric == "payload" and direction == "positive" and related.get("revenue") == "negative" and site_id:
        return f"Tinjau revenue per traffic dan service mix di {site_id}."
    if direction == "negative" and site_id:
        return f"Validasi perubahan di {site_id} dan korelasikan dengan histori performa serta tiket."
    if direction in {"positive", "stable"} and target_status == "achieved" and site_id:
        return f"Pertahankan pola operasi dan monitor {site_id} untuk mencegah regresi."
    return None
