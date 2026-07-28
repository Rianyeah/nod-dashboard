"""Tower Plan Generator site search and configuration API."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models.tower_plan import (
    TowerPlanAntennaGroup,
    TowerPlanSiteSearchItem,
    TowerPlanSiteConfigurationResponse,
    TowerPlanSiteSearchResponse,
    TowerPlanSourceCell,
    TowerPlanSourceColumns,
    TowerPlanTowerHeight,
)


router = APIRouter(prefix="/tower-plan", tags=["Tower Plan Generator"])

ONE_DECIMAL = Decimal("0.1")

RANSYS_COLUMNS_QUERY = """
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ransys_gabungan'
"""


def _one_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value)).quantize(ONE_DECIMAL, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Nilai numerik tidak valid") from exc


def normalize_azimuth(value: Any) -> Decimal:
    """Return an azimuth in [0, 360), rounded to the editor precision."""
    numeric = _one_decimal(value)
    normalized = ((numeric % Decimal("360")) + Decimal("360")) % Decimal("360")
    if normalized == Decimal("360.0"):
        return Decimal("0.0")
    return normalized


def leg_for_azimuth(value: Any) -> str:
    """Map normalized azimuth to the approved physical tower leg ranges."""
    azimuth = normalize_azimuth(value)
    if azimuth <= Decimal("90.0"):
        return "A"
    if azimuth <= Decimal("180.0"):
        return "B"
    if azimuth <= Decimal("270.0"):
        return "C"
    return "D"


def _normalized_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _optional_text(value: Any) -> str | None:
    normalized = _normalized_text(value)
    return normalized or None


def _display_number(value: Decimal) -> float:
    return float(value)


def extract_cid(enodeb_ci: Any, ci: Any) -> str | None:
    """Use the suffix after the last underscore, falling back to the CI column."""
    composite = _optional_text(enodeb_ci)
    if composite:
        suffix = composite.rsplit("_", 1)[-1].strip()
        if suffix:
            return suffix
    return _optional_text(ci)


def _natural_text_key(value: str) -> tuple[tuple[int, int | str], ...]:
    return tuple(
        (0, int(part)) if part.isdigit() else (1, part.casefold())
        for part in re.split(r"(\d+)", value)
        if part
    )


def resolve_source_columns(columns: Iterable[str]) -> TowerPlanSourceColumns:
    available = {str(column).casefold() for column in columns}
    return TowerPlanSourceColumns(
        tower_height="tower_hight" if "tower_hight" in available else None,
        sector="sector_base" if "sector_base" in available else (
            "sector" if "sector" in available else None
        ),
    )


def resolve_tower_height(rows: Iterable[dict[str, Any]]) -> TowerPlanTowerHeight:
    values: set[Decimal] = set()
    for row in rows:
        value = row.get("tower_height")
        if value is None or value == "":
            continue
        try:
            normalized = _one_decimal(value)
        except ValueError:
            continue
        if normalized > 0:
            values.add(normalized)

    ordered = sorted(values)
    display_values = [_display_number(value) for value in ordered]
    if not ordered:
        return TowerPlanTowerHeight(status="missing", values_m=[])
    if len(ordered) > 1:
        return TowerPlanTowerHeight(status="conflict", values_m=display_values)
    return TowerPlanTowerHeight(
        status="available",
        value_m=display_values[0],
        values_m=display_values,
    )


def _resolve_group_mechanical_tilt(
    cells: Iterable[TowerPlanSourceCell],
) -> tuple[float | None, bool]:
    frequencies: Counter[Decimal] = Counter()
    for cell in cells:
        value = cell.mechanical_tilt
        if value is None:
            continue
        try:
            frequencies[_one_decimal(value)] += 1
        except ValueError:
            continue
    if not frequencies:
        return None, False
    highest_count = max(frequencies.values())
    winners = [value for value, count in frequencies.items() if count == highest_count]
    if len(winners) != 1:
        return None, True
    return _display_number(winners[0]), False


def group_antenna_rows(
    rows: Iterable[dict[str, Any]],
) -> tuple[list[TowerPlanAntennaGroup], list[str]]:
    """Collapse logical cells that share one physical sector antenna."""
    buckets: dict[tuple[str, str, Decimal], dict[str, Any]] = {}
    warnings: list[str] = []

    for index, row in enumerate(rows):
        cell_name = _optional_text(row.get("cell_name")) or f"row-{index + 1}"
        try:
            height = _one_decimal(row.get("antenna_height"))
            azimuth = normalize_azimuth(row.get("azimuth"))
        except ValueError:
            warnings.append(
                f"Cell {cell_name} dilewati karena tinggi atau azimuth tidak valid."
            )
            continue
        if height < 0:
            warnings.append(
                f"Cell {cell_name} dilewati karena tinggi atau azimuth tidak valid."
            )
            continue

        sector = _normalized_text(row.get("sector")) or ""
        if not sector:
            warnings.append(
                f"Cell {cell_name} tidak memiliki sector dan perlu diperiksa manual."
            )
        sector_key = (
            sector.casefold()
            if sector
            else f"__cell__:{cell_name.casefold()}:{index}"
        )
        model = _normalized_text(row.get("antenna_type"))
        if model:
            model_key = model.casefold()
            display_model = model
        else:
            model_key = f"__cell__:{cell_name.casefold()}:{index}"
            display_model = "Unknown model"
            warnings.append(
                f"Cell {cell_name} tidak memiliki antenna model dan tidak digabung otomatis."
            )

        key = (model_key, sector_key, height)
        bucket = buckets.setdefault(
            key,
            {
                "model": display_model,
                "sector": sector,
                "height": height,
                "azimuths": set(),
                "cids": set(),
                "cells": [],
            },
        )
        bucket["azimuths"].add(azimuth)
        cid = extract_cid(row.get("enodeb_ci"), row.get("ci"))
        if cid:
            bucket["cids"].add(cid)
        bucket["cells"].append(
            TowerPlanSourceCell(
                cell_name=_optional_text(row.get("cell_name")),
                band=_optional_text(row.get("band")),
                technology=_optional_text(row.get("teknologi")),
                ci=_optional_text(row.get("ci")),
                enodeb_ci=_optional_text(row.get("enodeb_ci")),
                cid=cid,
                electrical_tilt=row.get("electrical_tilt"),
                mechanical_tilt=row.get("mechanical_tilt"),
                beamwidth=row.get("beamwidth"),
            )
        )

    groups: list[TowerPlanAntennaGroup] = []
    for key, bucket in buckets.items():
        cells: list[TowerPlanSourceCell] = bucket["cells"]
        cell_names = sorted({cell.cell_name for cell in cells if cell.cell_name})
        bands = sorted({cell.band for cell in cells if cell.band})
        technologies = sorted({cell.technology for cell in cells if cell.technology})
        azimuths: list[Decimal] = sorted(bucket["azimuths"])
        azimuth_conflict = len(azimuths) > 1
        azimuth = azimuths[0] if len(azimuths) == 1 else None
        mechanical_tilt_deg, mechanical_tilt_conflict = _resolve_group_mechanical_tilt(cells)
        if azimuth_conflict:
            azimuth_labels = ", ".join(f"{value:.1f}°" for value in azimuths)
            warnings.append(
                f"Antenna {bucket['model']} · SEC {bucket['sector']} memiliki "
                f"azimuth berbeda ({azimuth_labels}) dan perlu diperiksa manual."
            )
        if mechanical_tilt_conflict:
            warnings.append(
                f"Antenna {bucket['model']} · SEC {bucket['sector']} memiliki "
                "mechanical tilt dengan frekuensi tertinggi yang imbang dan perlu diperiksa manual."
            )
        group_key = hashlib.sha256(
            json.dumps(
                [key[0], key[1], str(key[2])],
                ensure_ascii=True,
            ).encode("utf-8")
        ).hexdigest()[:16]
        groups.append(
            TowerPlanAntennaGroup(
                group_key=group_key,
                name=f"{bucket['model']} · SEC {bucket['sector']}",
                antenna_model=bucket["model"],
                sector=bucket["sector"],
                height_m=_display_number(bucket["height"]),
                azimuth_deg=_display_number(azimuth) if azimuth is not None else None,
                leg=leg_for_azimuth(azimuth) if azimuth is not None else None,
                azimuth_values_deg=[
                    _display_number(value) for value in azimuths
                ],
                azimuth_conflict=azimuth_conflict,
                mechanical_tilt_deg=mechanical_tilt_deg,
                mechanical_tilt_conflict=mechanical_tilt_conflict,
                cids=sorted(bucket["cids"], key=_natural_text_key),
                cell_count=len(cells),
                cell_names=cell_names,
                bands=bands,
                technologies=technologies,
                cells=cells,
            )
        )

    groups.sort(
        key=lambda group: (
            -group.height_m,
            group.sector.casefold(),
            group.antenna_model.casefold(),
            group.azimuth_deg if group.azimuth_deg is not None else -1,
        )
    )
    return groups, warnings


async def _get_ransys_columns(session: AsyncSession) -> set[str]:
    result = await session.execute(text(RANSYS_COLUMNS_QUERY))
    return {
        str(row["column_name"])
        for row in result.mappings().all()
        if row.get("column_name")
    }


def _sector_expression(columns: set[str]) -> str:
    if "sector_base" in columns:
        return "sector_base::text"
    if "sector" in columns:
        return "sector::text"
    return "NULL::text"


def _tower_height_expression(columns: set[str]) -> str:
    if "tower_hight" in columns:
        return "tower_hight::double precision"
    return "NULL::double precision"


def _enodeb_ci_expression(columns: set[str]) -> str:
    if "enodeb_ci" in columns:
        return "enodeb_ci::text"
    return "NULL::text"


def _site_search_query(columns: set[str], has_query: bool) -> str:
    sector_expression = _sector_expression(columns)
    query_filter = "AND site_id ILIKE :q_contains" if has_query else ""
    relevance_order = (
        """
            CASE
                WHEN UPPER(TRIM(site_id)) = UPPER(:q_exact) THEN 0
                WHEN TRIM(site_id) ILIKE :q_prefix THEN 1
                ELSE 2
            END,
        """
        if has_query
        else ""
    )
    return f"""
        SELECT
            TRIM(site_id) AS site_id,
            COUNT(*)::integer AS cell_count,
            COUNT(DISTINCT CONCAT_WS(
                '|',
                ROUND(antenna_height::numeric, 1)::text,
                COALESCE(NULLIF({sector_expression}, ''), CONCAT('__cell__:', id::text)),
                COALESCE(
                    NULLIF(
                        LOWER(REGEXP_REPLACE(TRIM(COALESCE(antenna_type, '')), '\\s+', ' ', 'g')),
                        ''
                    ),
                    CONCAT('__cell__:', COALESCE(cell_name, ''), ':', id::text)
                )
            ))::integer AS estimated_antenna_count
        FROM ransys_gabungan
        WHERE NULLIF(TRIM(site_id), '') IS NOT NULL
          AND azimuth IS NOT NULL
          AND antenna_height IS NOT NULL
          {query_filter}
        GROUP BY TRIM(site_id)
        ORDER BY {relevance_order} TRIM(site_id)
        LIMIT :limit
    """


def _site_configuration_query(columns: set[str]) -> str:
    sector_expression = _sector_expression(columns)
    tower_height_expression = _tower_height_expression(columns)
    enodeb_ci_expression = _enodeb_ci_expression(columns)
    return f"""
        SELECT
            TRIM(site_id) AS site_id,
            cell_name,
            {sector_expression} AS sector,
            band,
            teknologi,
            ci,
            {enodeb_ci_expression} AS enodeb_ci,
            azimuth,
            antenna_height,
            antenna_type,
            electrical_tilt,
            mechanical_tilt,
            beamwidth,
            {tower_height_expression} AS tower_height
        FROM ransys_gabungan
        WHERE UPPER(TRIM(site_id)) = :site_id
        ORDER BY antenna_height DESC NULLS LAST, {sector_expression}, band, cell_name
    """


@router.get("/sites", response_model=TowerPlanSiteSearchResponse)
async def search_tower_plan_sites(
    q: str = Query("", max_length=128),
    limit: int = Query(20, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
):
    columns = await _get_ransys_columns(session)
    normalized_query = q.strip()
    params: dict[str, Any] = {"limit": limit}
    if normalized_query:
        params.update(
            {
                "q_exact": normalized_query,
                "q_prefix": f"{normalized_query}%",
                "q_contains": f"%{normalized_query}%",
            }
        )
    result = await session.execute(
        text(_site_search_query(columns, bool(normalized_query))),
        params,
    )
    items = [
        TowerPlanSiteSearchItem(
            site_id=str(row["site_id"]),
            cell_count=int(row["cell_count"]),
            estimated_antenna_count=int(row["estimated_antenna_count"]),
        )
        for row in result.mappings().all()
    ]
    return TowerPlanSiteSearchResponse(items=items, total=len(items))


@router.get(
    "/sites/{site_id}/configuration",
    response_model=TowerPlanSiteConfigurationResponse,
)
async def get_tower_plan_site_configuration(
    site_id: str,
    session: AsyncSession = Depends(get_session),
):
    normalized_site_id = site_id.strip().upper()
    if not normalized_site_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Site ID wajib diisi.",
        )
    columns = await _get_ransys_columns(session)
    source_columns = resolve_source_columns(columns)
    result = await session.execute(
        text(_site_configuration_query(columns)),
        {"site_id": normalized_site_id},
    )
    rows = [dict(row) for row in result.mappings().all()]
    antennas, warnings = group_antenna_rows(rows)
    tower_height = resolve_tower_height(rows)
    if not rows:
        warnings.append(f"Site ID {normalized_site_id} tidak ditemukan.")
    elif source_columns.tower_height is None:
        warnings.append(
            "Kolom tower_hight belum tersedia; tinggi tower harus diisi manual."
        )
    if source_columns.sector is None:
        warnings.append("Kolom sector tidak tersedia; sector perlu diperiksa manual.")
    return TowerPlanSiteConfigurationResponse(
        site_id=normalized_site_id,
        source_columns=source_columns,
        tower_height=tower_height,
        antennas=antennas,
        warnings=warnings,
    )


@router.post("/{unmatched_path:path}", include_in_schema=False)
async def reject_unmatched_tower_plan_post(unmatched_path: str):
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
