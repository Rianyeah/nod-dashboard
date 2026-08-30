"""Shared, parameterized query helpers for Site Map and site results."""

from __future__ import annotations

import re


_SAFE_ALIAS = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

SITE_SORT_EXPRESSIONS = {
    "site_id": '{master}."Siteid"',
    "site_name": '{master}."Site Name"',
    "kabupaten": '{master}."Kabupaten/KOTA"',
    "site_class": '{master}."Site Class"',
    "jumlah_cell": "{metrics}.jumlah_cell",
    "avg_availability": "{metrics}.avg_availability",
    "total_outage_menit": "{metrics}.total_outage_menit",
    "rca_dominan": "{metrics}.rca_dominan",
    "status_site": '{master}."Status Site"',
}


def _validated_alias(value: str) -> str:
    if not _SAFE_ALIAS.fullmatch(value):
        raise ValueError("SQL alias must be an identifier")
    return value


def build_site_filters(
    *,
    kabupaten: str | None = None,
    cluster: str | None = None,
    status: str | None = None,
    kelas: str | None = None,
    nop: str | None = None,
    alias: str = "m",
) -> tuple[str, dict[str, str]]:
    """Build shared master-site predicates using bound parameters only."""
    master = _validated_alias(alias)
    predicates: list[str] = []
    params: dict[str, str] = {}
    columns = {
        "kabupaten": '"Kabupaten/KOTA"',
        "cluster": '"New Cluster"',
        "status": '"Status Site"',
        "kelas": '"Site Class"',
        "nop": '"NOP"',
    }
    values = {
        "kabupaten": kabupaten,
        "cluster": cluster,
        "status": status,
        "kelas": kelas,
        "nop": nop,
    }
    for key, value in values.items():
        if value is None or not str(value).strip():
            continue
        predicates.append(f" AND {master}.{columns[key]} = :{key}")
        params[key] = str(value).strip()
    return "".join(predicates), params


def build_site_search_filter(
    q: str | None = None,
    *,
    alias: str = "m",
) -> tuple[str, dict[str, str]]:
    """Build the explorer search predicate across visible identity fields."""
    master = _validated_alias(alias)
    normalized = str(q or "").strip()
    if not normalized:
        return "", {}
    return (
        f' AND ({master}."Siteid" ILIKE :q'
        f' OR {master}."Site Name" ILIKE :q'
        f' OR {master}."Kabupaten/KOTA" ILIKE :q)',
        {"q": f"%{normalized}%"},
    )


def build_site_order(
    sort_by: str = "site_id",
    sort_dir: str = "asc",
    *,
    alias: str = "m",
    metrics_alias: str = "agg",
) -> str:
    """Return a server-owned ORDER BY clause for site results."""
    master = _validated_alias(alias)
    metrics = _validated_alias(metrics_alias)
    if sort_by not in SITE_SORT_EXPRESSIONS:
        return f'{master}."Siteid" ASC NULLS LAST'

    expression = SITE_SORT_EXPRESSIONS[sort_by].format(master=master, metrics=metrics)
    direction = "DESC" if str(sort_dir).lower() == "desc" else "ASC"
    primary = f"{expression} {direction} NULLS LAST"
    if sort_by == "site_id":
        return primary
    return f'{primary}, {master}."Siteid" ASC'
