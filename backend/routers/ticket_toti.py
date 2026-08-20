"""Ticket TOTI dashboard helpers and endpoints."""

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException

from periods import resolve_month_period


router = APIRouter(prefix="/ticketing/toti", tags=["Ticket TOTI"])


def normalize_category_label(value: str | None) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return "Unknown"
    if normalized.upper() == "VANDALISM":
        return "Vandalisme"
    return normalized


def normalized_nop_sql(column: str) -> str:
    collapsed = f"regexp_replace(trim(coalesce({column}, '')), '\\s+', ' ', 'g')"
    return (
        "CASE "
        f"WHEN {collapsed} = '' THEN 'Unknown' "
        f"WHEN {collapsed} ~* '^NSA(?:\\s+|$)' "
        f"THEN regexp_replace({collapsed}, '^NSA(?:\\s+|$)', 'NOP ', 'i') "
        f"ELSE {collapsed} END"
    )


def safe_timestamp_sql(column: str) -> str:
    trimmed = f"trim({column})"
    return (
        "CASE "
        f"WHEN {trimmed} ~ '^\\d{{4}}-\\d{{2}}-\\d{{2}} "
        "\\d{2}:\\d{2}:\\d{2}$' "
        f"AND pg_input_is_valid({trimmed}, 'timestamp without time zone') "
        f"THEN {trimmed}::timestamp "
        "ELSE NULL END"
    )


def previous_period_bounds(start_date: date, end_date: date) -> tuple[date, date]:
    selected_days = (end_date - start_date).days + 1
    previous_end = start_date - timedelta(days=1)
    return previous_end - timedelta(days=selected_days - 1), previous_end


def shared_query_params(
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
    nop: str | None = None,
    cluster: str | None = None,
    mitra: str | None = None,
    kategori: str | None = None,
    status: str | None = None,
) -> dict:
    has_month_period = period_start is not None or period_end is not None
    has_custom_period = start_date is not None or end_date is not None
    if has_month_period and has_custom_period:
        raise HTTPException(
            status_code=422,
            detail="Gunakan rentang bulan atau rentang tanggal khusus, bukan keduanya.",
        )
    if (start_date is None) != (end_date is None):
        raise HTTPException(status_code=422, detail="start_date dan end_date wajib diisi bersama.")

    period = None
    if has_month_period:
        period = resolve_month_period(period_start=period_start, period_end=period_end)
        start_date = period.start_date
        end_date = period.end_date_exclusive - timedelta(days=1)

    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail="Rentang tanggal harus berurutan.")

    return {
        "start_date": start_date,
        "end_date": end_date,
        "nop": nop,
        "cluster": cluster,
        "mitra": mitra,
        "kategori": kategori,
        "status": status,
        "_period": period,
    }


def build_filter_clause(params: dict) -> str:
    clauses: list[str] = []
    if params.get("start_date"):
        clauses.append("t.requested_at >= CAST(:start_date AS date)")
    if params.get("end_date"):
        clauses.append("t.requested_at < (CAST(:end_date AS date) + interval '1 day')")
    if params.get("nop"):
        clauses.append("UPPER(t.normalized_nop) = UPPER(:nop)")
    if params.get("cluster"):
        clauses.append("UPPER(TRIM(t.cluster)) = UPPER(TRIM(:cluster))")
    if params.get("mitra"):
        clauses.append("UPPER(TRIM(t.mitra)) = UPPER(TRIM(:mitra))")
    if params.get("kategori"):
        if params["kategori"].strip().upper() in {"VANDALISM", "VANDALISME"}:
            clauses.append("UPPER(TRIM(t.kategori)) = 'VANDALISM'")
        else:
            clauses.append("UPPER(TRIM(t.kategori)) = UPPER(TRIM(:kategori))")
    if params.get("status"):
        clauses.append("UPPER(TRIM(t.status)) = UPPER(TRIM(:status))")
    return "".join(f" AND {clause}" for clause in clauses)
