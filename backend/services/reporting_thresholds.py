"""Business rules for versioned Reporting thresholds."""

from __future__ import annotations

from models.reporting_thresholds import (
    ReportingThresholdSnapshot,
    RevenueTargetInput,
    ThresholdVersionInput,
)
from periods import resolve_month_period
from queries.reporting_foundation import canonical_nop
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


PAYLOAD_MB_PER_TB = 1024 * 1024
SITE_CLASSES = ("DIAMOND", "PLATINUM", "GOLD", "SILVER", "BRONZE")
EXPECTED_THRESHOLD_KEYS = tuple(
    [("availability", "target", site_class) for site_class in SITE_CLASSES]
    + [
        ("revenue", "u30_upper", "*"),
        ("revenue", "u60_upper", "*"),
        ("payload", "target", "*"),
    ]
)


def classify_revenue(
    value: int | float | None,
    u30_upper: int | float,
    u60_upper: int | float,
) -> str:
    if value is None:
        return "unavailable"
    if value < u30_upper:
        return "u30"
    if value < u60_upper:
        return "u60"
    return "achieved"


def achieved_payload(value_mb: int | float | None, target_tb: int | float) -> str:
    if value_mb is None:
        return "unavailable"
    return "achieved" if value_mb >= target_tb * PAYLOAD_MB_PER_TB else "not_achieved"


def achieved_availability(value: float | None, target: float | None) -> str:
    if value is None or target is None:
        return "unavailable"
    return "achieved" if value >= target else "not_achieved"


def overall_target_status(*statuses: str) -> str:
    if any(status == "unavailable" for status in statuses):
        return "unavailable"
    return "achieved" if all(status == "achieved" for status in statuses) else "not_achieved"


def _threshold_key(metric: str, threshold_key: str, site_class: str) -> str:
    return f"{metric}:{threshold_key}:{site_class}"


def build_threshold_snapshot(rows: list[dict], requested_month: str) -> ReportingThresholdSnapshot:
    resolved = {
        (
            str(row.get("metric") or ""),
            str(row.get("threshold_key") or ""),
            str(row.get("site_class") or "").upper(),
        ): row
        for row in rows
    }
    missing = [
        _threshold_key(*key)
        for key in EXPECTED_THRESHOLD_KEYS
        if key not in resolved
    ]
    availability = {
        site_class: (
            float(resolved[("availability", "target", site_class)]["threshold_value"])
            if ("availability", "target", site_class) in resolved
            else None
        )
        for site_class in SITE_CLASSES
    }
    effective_months = sorted(
        {str(row.get("effective_month")) for row in rows if row.get("effective_month")}
    )
    updated_rows = sorted(
        rows,
        key=lambda row: str(row.get("updated_at") or ""),
    )

    def value(metric: str, threshold_key: str, cast):
        row = resolved.get((metric, threshold_key, "*"))
        return cast(row["threshold_value"]) if row is not None else None

    latest = updated_rows[-1] if updated_rows else {}
    version = (
        f"{len(rows)}:{latest.get('updated_at') or ''}"
        if rows
        else "unconfigured"
    )
    return ReportingThresholdSnapshot(
        availability=availability,
        revenue_u30_upper=value("revenue", "u30_upper", int),
        revenue_u60_upper=value("revenue", "u60_upper", int),
        payload_target_tb=value("payload", "target", float),
        effective_month=effective_months[-1] if effective_months else None,
        requested_month=requested_month,
        complete=not missing,
        missing_keys=missing,
        version=version,
        updated_by=latest.get("updated_by"),
        updated_at=latest.get("updated_at"),
    )


def threshold_write_rows(
    effective_month: str,
    payload: ThresholdVersionInput,
    actor: str,
) -> list[dict]:
    period = resolve_month_period(
        period_start=effective_month,
        period_end=effective_month,
    )
    values: list[tuple[str, str, str, float | int, str]] = [
        (
            "availability",
            "target",
            site_class,
            getattr(payload.availability, site_class.lower()),
            "percent",
        )
        for site_class in SITE_CLASSES
    ]
    values.extend(
        [
            ("revenue", "u30_upper", "*", payload.revenue_u30_upper, "idr"),
            ("revenue", "u60_upper", "*", payload.revenue_u60_upper, "idr"),
            ("payload", "target", "*", payload.payload_target_tb, "tb"),
        ]
    )
    return [
        {
            "metric": metric,
            "threshold_key": threshold_key,
            "site_class": site_class,
            "effective_month": period.period_start,
            "threshold_value": threshold_value,
            "unit": unit,
            "updated_by": actor,
        }
        for metric, threshold_key, site_class, threshold_value, unit in values
    ]


async def resolve_threshold_snapshot(
    session: AsyncSession,
    requested_month: str,
) -> ReportingThresholdSnapshot:
    period = resolve_month_period(
        period_start=requested_month,
        period_end=requested_month,
    )
    result = await session.execute(
        text(
            """
            SELECT DISTINCT ON (metric, threshold_key, site_class)
                metric,
                threshold_key,
                site_class,
                threshold_value,
                effective_month,
                updated_by,
                updated_at
            FROM public.reporting_metric_thresholds
            WHERE effective_month <= :requested_month
            ORDER BY metric, threshold_key, site_class, effective_month DESC, updated_at DESC
            """
        ),
        {"requested_month": period.period_start},
    )
    rows = [dict(row) for row in result.mappings().all()]
    return build_threshold_snapshot(rows, period.period_start)


async def save_threshold_version(
    session: AsyncSession,
    effective_month: str,
    payload: ThresholdVersionInput,
    actor: str,
) -> ReportingThresholdSnapshot:
    rows = threshold_write_rows(effective_month, payload, actor)
    await session.execute(
        text(
            """
            INSERT INTO public.reporting_metric_thresholds (
                metric,
                threshold_key,
                site_class,
                effective_month,
                threshold_value,
                unit,
                updated_by,
                updated_at
            ) VALUES (
                :metric,
                :threshold_key,
                :site_class,
                :effective_month,
                :threshold_value,
                :unit,
                :updated_by,
                now()
            )
            ON CONFLICT (metric, threshold_key, site_class, effective_month)
            DO UPDATE SET
                threshold_value = EXCLUDED.threshold_value,
                unit = EXCLUDED.unit,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            """
        ),
        rows,
    )
    await session.commit()
    return build_threshold_snapshot(rows, rows[0]["effective_month"])


def _canonical_month(value: str | None) -> str | None:
    if value is None:
        return None
    return resolve_month_period(period_start=value, period_end=value).period_start


async def list_revenue_targets(
    session: AsyncSession,
    *,
    nop: str | None = None,
    month_from: str | None = None,
    month_to: str | None = None,
    limit: int = 100,
) -> list[dict]:
    params = {
        "nop_key": canonical_nop(nop),
        "month_from": _canonical_month(month_from),
        "month_to": _canonical_month(month_to),
        "limit": max(1, min(int(limit), 200)),
    }
    result = await session.execute(
        text(
            """
            SELECT
                nop_key,
                trx_month,
                target_revenue,
                note,
                updated_by,
                updated_at
            FROM public.reporting_revenue_targets
            WHERE (CAST(:nop_key AS text) IS NULL OR nop_key = :nop_key)
              AND (CAST(:month_from AS text) IS NULL OR trx_month >= :month_from)
              AND (CAST(:month_to AS text) IS NULL OR trx_month <= :month_to)
            ORDER BY trx_month DESC, nop_key
            LIMIT :limit
            """
        ),
        params,
    )
    rows = [dict(row) for row in result.mappings().all()]
    for row in rows:
        row["target_revenue"] = int(row.get("target_revenue") or 0)
    return rows


async def upsert_revenue_target(
    session: AsyncSession,
    *,
    nop: str,
    trx_month: str,
    payload: RevenueTargetInput,
    actor: str,
) -> dict:
    nop_key = canonical_nop(nop)
    if nop_key is None:
        raise ValueError("NOP wajib dipilih untuk target revenue")
    month = _canonical_month(trx_month)
    result = await session.execute(
        text(
            """
            INSERT INTO public.reporting_revenue_targets (
                nop_key,
                trx_month,
                target_revenue,
                note,
                updated_by,
                updated_at
            ) VALUES (
                :nop_key,
                :trx_month,
                :target_revenue,
                :note,
                :updated_by,
                now()
            )
            ON CONFLICT (nop_key, trx_month) DO UPDATE SET
                target_revenue = EXCLUDED.target_revenue,
                note = EXCLUDED.note,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            RETURNING nop_key, trx_month, target_revenue, note, updated_by, updated_at
            """
        ),
        {
            "nop_key": nop_key,
            "trx_month": month,
            "target_revenue": payload.target_revenue,
            "note": payload.note,
            "updated_by": actor,
        },
    )
    await session.commit()
    row = dict(result.mappings().one())
    row["target_revenue"] = int(row.get("target_revenue") or 0)
    return row
