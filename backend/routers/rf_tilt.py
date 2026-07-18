"""
RF Tilt Analysis router — endpoints for RF vertical tilt analysis.

GET  /rf-tilt/sites?q={query}  — search sites from ransys_gabungan
GET  /rf-tilt/antenna-spec     — look up scraped antenna specs by model
POST /rf-tilt/analysis          — run tilt analysis with DEM elevation data
"""
import os
import re
import math
import asyncio
import logging
import json
from typing import List, Optional, Literal

import httpx
import runtime_compat  # noqa: F401
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from database import get_session
from rate_limit import RateLimitExceeded
from models.rf_tilt import (
    ClutterPoint,
    TiltAnalysisRequest,
    TiltAnalysisResponse,
    ProfilePoint,
    BeamResult,
    LinkAnalysis,
    RfTiltSiteItem,
    RfTiltSiteSearchResponse,
    AntennaSpecResponse,
    AntennaReference,
    AntennaModelListItem,
    AntennaModelListResponse,
)
from queries.sql_queries import (
    RF_TILT_SITE_SEARCH_QUERY,
    ANTENNA_SPEC_LOOKUP_QUERY,
    ANTENNA_SPEC_FUZZY_QUERY,
    ANTENNA_MODEL_LIST_QUERY,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rf-tilt", tags=["RF Tilt Analysis"])

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

EARTH_RADIUS_M = 6371000.0
K_FACTOR = 4 / 3
SPEED_OF_LIGHT_M_S = 299_792_458.0

OPEN_METEO_ELEVATION_URL = "http://api.open-meteo.com/v1/elevation"
OPENTOPO_GLOBALDEM_URL = "http://portal.opentopography.org/API/globaldem"
OPENTOPOGRAPHY_API_KEY = os.environ.get("OPENTOPOGRAPHY_API_KEY", "")

CHUNK_SIZE = 100
NODATA_THRESHOLD = -1000
MAX_RF_ANALYSIS_DISTANCE_M = 50_000
MAX_RF_ANALYSIS_SAMPLES = 5_001
RF_ANALYSIS_LIMIT = 10
RF_ANALYSIS_WINDOW_SECONDS = 60
RF_ANALYSIS_CONCURRENCY_TIMEOUT_SECONDS = 0.01

SUPPORTED_FREQUENCIES_MHZ = (900, 1800, 2100, 2300)

ANTENNA_BAND_REFERENCE = {
    900:  {"typical_gain_dbi": 16.0, "typical_vbw_deg": 14.0, "typical_hbw_deg": 65.0},
    1800: {"typical_gain_dbi": 17.5, "typical_vbw_deg": 7.5,  "typical_hbw_deg": 65.0},
    2100: {"typical_gain_dbi": 17.8, "typical_vbw_deg": 6.5,  "typical_hbw_deg": 65.0},
    2300: {"typical_gain_dbi": 17.8, "typical_vbw_deg": 5.5,  "typical_hbw_deg": 65.0},
}

BAND_TO_FREQ_MHZ = {
    "L900": 900,
    "L1800": 1800,
    "L2100": 2100,
    "L2300": 2300,
}


# --------------------------------------------------------------------------
# Antenna spec matching
# --------------------------------------------------------------------------

# Reuse the normalisation logic from extract_antenna_models for matching
# raw antenna_type values to canonical model names in antenna_specs.
_VENDOR_SUBSTRINGS = sorted([
    "huawei", "andrew", "commscope", "kathrein", "katherine",
    "ericsson", "argus", "anatel", "celwave", "rosenberger",
    "agisson", "netop", "comba", "kathren", "katrein",
    "khatrein", "katrhein", "katherin", "hw",
], key=len, reverse=True)

_DESCRIPTOR_SUBSTRINGS = sorted([
    "antennasectoral", "antennasector", "antennasektor",
    "antennarf", "antennabts", "antena", "antenna",
    "sectoral", "sector", "sektor",
    "vtm", "a1m",
], key=len, reverse=True)

_JUNK_PATTERNS = [
    r"\([^)]*\)",
    r"\b\d+T\d+R?\b",
    r"\b\d+T\d*S\b",
    r"\b\d+[TS]\b",
    r"\b\d+\s*ports?\b",
    r"\bports?\b",
    r"\b\d{3,4}[-/]\d{3,4}([-/]\d{3,4})+\b",
    r"\b\d{4}(?:/\d{4})+\b",
    r"\.pafx\b", r"\bet\.pafx\b",
    r"\bwd7m[a-z0-9]+\b",
    r"\bmhz\b",
    r"\bu2100\b",
]


def _normalise_antenna_type(raw: str) -> str | None:
    """Normalise a raw antenna_type string to a canonical model name.

    This is a lightweight copy of the logic in extract_antenna_models.py
    so the router doesn't depend on the scripts package at runtime.
    """
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip().replace("_", " ")
    for p in _JUNK_PATTERNS:
        s = re.sub(p, " ", s, flags=re.I)
    s = s.lower()
    for v in _VENDOR_SUBSTRINGS:
        s = s.replace(v, " ")
    for d in _DESCRIPTOR_SUBSTRINGS:
        s = s.replace(d, " ")
    for w in ["rru", "bts", "ret", "rf", "rfs", "manual", "pudar",
              "high", "band", "existing", "dual", "beam", "easy", "macro",
              "indoor", "omni", "no", "data", "tidak", "jelas", "buram",
              "mobi", "collo", "colo", "et"]:
        s = re.sub(rf"\b{w}\b", " ", s, flags=re.I)
    s = re.sub(r"\s+", "", s).upper().strip("-./()")
    if not s or len(s) < 2:
        return None

    # Match known model patterns
    if m := re.match(r"^(AAU\d{4,5})", s):
        return m.group(1)
    if m := re.match(r"^H(AAU\d{4,5})", s):
        return m.group(1)
    if m := re.match(r"^([A-Z]{2,4}\d{4,5}R\d{1,3})(?:V\d{1,3})?", s):
        return m.group(1)
    if m := re.match(r"^([A-Z]{2,4}\d{5,8})(?:V\d{1,3})?", s):
        return m.group(1)
    if m := re.match(r"^([A-Z]\d{5}PD\d{2})(?:V\d{1,3})?", s):
        return m.group(1)
    if m := re.match(r"^([A-Z]\d{5,6}[A-Z]\d{1,2})", s):
        return m.group(1)
    if m := re.match(r"^(A\d{5,7}R\d{1,3})(?:V\d{1,3})?", s):
        return m.group(1)
    if m := re.match(r"^(A\d{6,8})(?:V\d{1,3})?", s):
        return m.group(1)
    if m := re.match(r"^(A0\d{4}PD\d{2})(?:V\d{1,3})?", s):
        return m.group(1)
    if m := re.match(r"^([A-Z]{2,5})-?(\d{4,5}[A-Z]{2,3})(?:-[A-Z]{2,5})?", s):
        return f"{m.group(1)}-{m.group(2)}"
    if m := re.match(r"^(DB[A-Z]{2,3})-?(\d{4}[A-Z])(?:-[A-Z]{3,4})?", s):
        return f"{m.group(1)}-{m.group(2)}"
    if m := re.match(r"^(DB\d{3}[A-Z]{2}\d{2,3}[A-Z]{3})", s):
        return m.group(1)
    if m := re.match(r"^(TBXLHA)-?(\d{4,5}[A-Z])(?:-[A-Z]{3,4})?", s):
        return f"{m.group(1)}-{m.group(2)}"
    if m := re.match(r"^(VHLP\d+-\d+-NC\d)", s):
        return m.group(1)
    if m := re.match(r"^(\d{6,8})(?:V\d{2})?", s):
        return m.group(1)
    if m := re.match(r"^K(\d{6,8})", s):
        return m.group(1)
    if m := re.match(r"^(KRE\d{7})", s):
        return m.group(1)
    if m := re.match(r"^(CNPX)-?(\d{3}[A-Z]?)(?:[.\-](\d{1,2}[A-Z]?))?(?:-(\d+[A-Z]?-?[A-Z0-9]*))?", s):
        parts = [m.group(1), m.group(2)]
        if m.group(3):
            parts.append(m.group(3))
        if m.group(4):
            parts.append(m.group(4))
        return "-".join(parts)
    if m := re.match(r"^(CNPX\d{3}[A-Z]?)(?:-(\d+[A-Z]?))?", s):
        base = m.group(1)
        if m.group(2):
            return f"{base}-{m.group(2)}"
        return base
    if m := re.match(r"^([A-Z]*NPX\d{3}[A-Z]?-\d+[A-Z]?)", s):
        return m.group(1)
    if m := re.match(r"^(HG\d{4,5}[A-Z]?-\d{2,3})", s):
        return m.group(1)
    if m := re.match(r"^(S-?WAVE.*)", s):
        return m.group(1)
    if m := re.match(r"^(BA-[A-Z0-9\-]+)", s):
        return m.group(1)
    if m := re.match(r"^(MB\d?[A-Z]?/?.*)", s):
        return m.group(1)
    if m := re.match(r"^(DX-\d{3,4}-\d{4}-.*)", s):
        return m.group(1)
    if m := re.match(r"^(AP\d{6})", s):
        return m.group(1)
    if m := re.match(r"^(APX-?\d{6})", s):
        return m.group(1)
    if s and len(s) <= 50 and re.search(r"[A-Z0-9]", s):
        return s
    return None


async def match_antenna_spec(
    session: AsyncSession,
    raw_antenna_type: str,
    frequency_mhz: int,
) -> AntennaReference:
    """Look up antenna specs for a raw antenna_type string.

    Tries exact match on normalised model name, then fuzzy prefix match.
    Falls back to generic ANTENNA_BAND_REFERENCE if no DB match found.
    """
    model = _normalise_antenna_type(raw_antenna_type)

    # Try exact match
    if model:
        result = await session.execute(
            text(ANTENNA_SPEC_LOOKUP_QUERY),
            {"antenna_model": model},
        )
        row = result.mappings().first()

        if row:
            gain = None
            vbw = None
            gain_band = row.get("gain_dbi_by_band")
            vbw_band = row.get("vertical_beamwidth_by_band")
            if gain_band and isinstance(gain_band, str):
                try:
                    gain = json.loads(gain_band).get(str(frequency_mhz))
                except (json.JSONDecodeError, TypeError):
                    pass
            elif gain_band and isinstance(gain_band, dict):
                gain = gain_band.get(str(frequency_mhz))
            if vbw_band and isinstance(vbw_band, str):
                try:
                    vbw = json.loads(vbw_band).get(str(frequency_mhz))
                except (json.JSONDecodeError, TypeError):
                    pass
            elif vbw_band and isinstance(vbw_band, dict):
                vbw = vbw_band.get(str(frequency_mhz))

            return AntennaReference(
                antenna_model=row.get("antenna_model"),
                series=row.get("series"),
                vendor=row.get("vendor"),
                frequency_mhz=frequency_mhz,
                gain_dbi=gain,
                vertical_beamwidth_deg=vbw,
                horizontal_beamwidth_deg=row.get("horizontal_beamwidth"),
                matched=True,
                match_method="exact",
                source_url=row.get("source_url"),
            )

        # Try fuzzy: prefix match on normalised model
        # Extract first 6+ chars as prefix pattern
        prefix = model[:min(len(model), 10)]
        result = await session.execute(
            text(ANTENNA_SPEC_FUZZY_QUERY),
            {"pattern": f"{prefix}%"},
        )
        row = result.mappings().first()

        if row:
            gain = None
            vbw = None
            gain_band = row.get("gain_dbi_by_band")
            vbw_band = row.get("vertical_beamwidth_by_band")
            if gain_band and isinstance(gain_band, str):
                try:
                    gain = json.loads(gain_band).get(str(frequency_mhz))
                except (json.JSONDecodeError, TypeError):
                    pass
            elif gain_band and isinstance(gain_band, dict):
                gain = gain_band.get(str(frequency_mhz))
            if vbw_band and isinstance(vbw_band, str):
                try:
                    vbw = json.loads(vbw_band).get(str(frequency_mhz))
                except (json.JSONDecodeError, TypeError):
                    pass
            elif vbw_band and isinstance(vbw_band, dict):
                vbw = vbw_band.get(str(frequency_mhz))

            return AntennaReference(
                antenna_model=row.get("antenna_model"),
                series=row.get("series"),
                vendor=row.get("vendor"),
                frequency_mhz=frequency_mhz,
                gain_dbi=gain,
                vertical_beamwidth_deg=vbw,
                horizontal_beamwidth_deg=row.get("horizontal_beamwidth"),
                matched=True,
                match_method="fuzzy",
                source_url=row.get("source_url"),
            )

    # Fallback to generic reference
    band_ref = ANTENNA_BAND_REFERENCE.get(frequency_mhz, {})
    return AntennaReference(
        antenna_model=model,
        frequency_mhz=frequency_mhz,
        gain_dbi=band_ref.get("typical_gain_dbi"),
        vertical_beamwidth_deg=band_ref.get("typical_vbw_deg"),
        horizontal_beamwidth_deg=band_ref.get("typical_hbw_deg"),
        matched=False,
        match_method="generic_fallback",
        note="Typical values from public reference — no scraped spec matched.",
    )


# --------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------

def destination_point(lat: float, lon: float, azimuth_deg: float, distance_m: float):
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    brng = math.radians(azimuth_deg)
    d_r = distance_m / EARTH_RADIUS_M
    lat2 = math.asin(
        math.sin(lat1) * math.cos(d_r) + math.cos(lat1) * math.sin(d_r) * math.cos(brng)
    )
    lon2 = lon1 + math.atan2(
        math.sin(brng) * math.sin(d_r) * math.cos(lat1),
        math.cos(d_r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def curvature_drop(distance_m: float) -> float:
    return (distance_m ** 2) / (2 * K_FACTOR * EARTH_RADIUS_M)


def beam_elevation(antenna_asl: float, tilt_deg: float, distance_m: float) -> float:
    theta = math.radians(tilt_deg)
    return antenna_asl - distance_m * math.tan(theta) + curvature_drop(distance_m)


def find_impact_distance(distances: List[float], terrain: List[float],
                          antenna_asl: float, tilt_deg: float) -> Optional[float]:
    prev_diff = None
    prev_d = None
    for d, ground in zip(distances, terrain):
        beam_h = beam_elevation(antenna_asl, tilt_deg, d)
        diff = beam_h - ground
        if prev_diff is not None and prev_diff > 0 >= diff:
            span = d - prev_d
            frac = prev_diff / (prev_diff - diff) if (prev_diff - diff) != 0 else 0
            return prev_d + span * frac
        prev_diff, prev_d = diff, d
    return None


def sector_polygon(lat: float, lon: float, azimuth: float, hbw: float,
                    radius_m: float, arc_steps: int = 24) -> List[List[float]]:
    if radius_m <= 0:
        radius_m = 1.0
    half = hbw / 2
    coords = [[lon, lat]]
    for i in range(arc_steps + 1):
        brg = azimuth - half + (hbw * i / arc_steps)
        plat, plon = destination_point(lat, lon, brg, radius_m)
        coords.append([plon, plat])
    coords.append([lon, lat])
    return coords


def wavelength_m(freq_mhz: float) -> float:
    return SPEED_OF_LIGHT_M_S / (freq_mhz * 1e6)


def haversine_distance_bearing(lat1: float, lon1: float, lat2: float, lon2: float):
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = EARTH_RADIUS_M * c

    y = math.sin(dlambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    bearing = (math.degrees(math.atan2(y, x)) + 360) % 360

    return distance, bearing


def two_point_bulge(d1: float, d2: float) -> float:
    return (d1 * d2) / (2 * K_FACTOR * EARTH_RADIUS_M)


def find_line_obstruction(distances: List[float], terrain: List[float],
                           line_values: List[float], total_d: float) -> Optional[float]:
    prev_diff = None
    prev_d = None
    for d, ground, line_h in zip(distances, terrain, line_values):
        if d > total_d:
            break
        diff = line_h - ground
        if prev_diff is not None and prev_diff > 0 >= diff:
            span = d - prev_d
            frac = prev_diff / (prev_diff - diff) if (prev_diff - diff) != 0 else 0
            return prev_d + span * frac
        prev_diff, prev_d = diff, d
    return None


def fresnel_radius(x: float, total_d: float, wavelength: float, n: int = 1) -> float:
    if total_d <= 0 or x <= 0 or x >= total_d:
        return 0.0
    return math.sqrt(n * wavelength * x * (total_d - x) / total_d)


def find_fresnel_violation_distance(distances: List[float], terrain: List[float],
                                     antenna_asl: float, tilt_deg: float, total_d: float,
                                     wavelength: float, clearance_pct: float) -> Optional[float]:
    if total_d <= 0:
        return None
    for d, ground in zip(distances, terrain):
        if d <= 0 or d > total_d:
            continue
        beam_h = beam_elevation(antenna_asl, tilt_deg, d)
        clearance = beam_h - ground
        required = (clearance_pct / 100.0) * fresnel_radius(d, total_d, wavelength)
        if clearance < required:
            return d
    return None


def apply_clutter(distances: List[float], terrain: List[float],
                   clutter: List[ClutterPoint]) -> List[float]:
    if not clutter:
        return terrain
    tolerance = (distances[1] - distances[0]) if len(distances) > 1 else 15.0
    bumps = {}
    for cp in clutter:
        idx = min(range(len(distances)), key=lambda i: abs(distances[i] - cp.distance))
        if abs(distances[idx] - cp.distance) <= tolerance:
            bumps[idx] = max(bumps.get(idx, 0.0), cp.height)
    out = list(terrain)
    for idx, extra in bumps.items():
        out[idx] = out[idx] + extra
    return out


# --------------------------------------------------------------------------
# Elevation sources
# --------------------------------------------------------------------------

def _bbox_for_profile(lat: float, lon: float, max_distance: float, margin: float = 1.15):
    radius = max_distance * margin
    dlat = radius / 111320.0
    dlon = radius / (111320.0 * max(math.cos(math.radians(lat)), 1e-6))
    return (lat - dlat, lat + dlat, lon - dlon, lon + dlon)


async def _fetch_opentopo_raster(lat: float, lon: float, max_distance: float) -> bytes:
    south, north, west, east = _bbox_for_profile(lat, lon, max_distance)
    params = {
        "demtype": "COP30",
        "south": south, "north": north, "west": west, "east": east,
        "outputFormat": "GTiff",
        "API_Key": OPENTOPOGRAPHY_API_KEY,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(OPENTOPO_GLOBALDEM_URL, params=params)
        resp.raise_for_status()
        return resp.content


def _sample_raster(raster_bytes: bytes, points: List[tuple]) -> List[float]:
    import rasterio
    from rasterio.io import MemoryFile

    with MemoryFile(raster_bytes) as memfile:
        with memfile.open() as ds:
            coords = [(lon, lat) for lat, lon in points]
            values = [v[0] for v in ds.sample(coords)]
    return [float(v) if v is not None and v > NODATA_THRESHOLD else 0.0 for v in values]


async def fetch_elevations_opentopo(lat: float, lon: float, max_distance: float,
                                     points: List[tuple]) -> List[float]:
    if not OPENTOPOGRAPHY_API_KEY:
        raise RuntimeError("OPENTOPOGRAPHY_API_KEY not configured")

    raster_bytes = await _fetch_opentopo_raster(lat, lon, max_distance)
    return await asyncio.to_thread(_sample_raster, raster_bytes, points)


async def fetch_elevations_open_meteo(points: List[tuple]) -> List[float]:
    results: List[float] = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        chunks = [points[i:i + CHUNK_SIZE] for i in range(0, len(points), CHUNK_SIZE)]

        async def fetch_chunk(chunk):
            lats = ",".join(f"{p[0]:.6f}" for p in chunk)
            lons = ",".join(f"{p[1]:.6f}" for p in chunk)
            resp = await client.get(
                OPEN_METEO_ELEVATION_URL, params={"latitude": lats, "longitude": lons}
            )
            resp.raise_for_status()
            return resp.json().get("elevation", [])

        chunk_results = await asyncio.gather(*(fetch_chunk(c) for c in chunks))
        for cr in chunk_results:
            results.extend(cr)
    return results


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/sites", response_model=RfTiltSiteSearchResponse)
async def search_rf_tilt_sites(
    q: str = Query("", description="Search query for site_id or cell_name"),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    """Search sites from ransys_gabungan for RF Tilt Analysis."""
    filters = ""
    params: dict = {"limit": limit}

    if q and q.strip():
        filters = " AND (site_id ILIKE :q OR cell_name ILIKE :q)"
        params["q"] = f"%{q.strip()}%"

    result = await session.execute(
        text(RF_TILT_SITE_SEARCH_QUERY.format(filters=filters)),
        params,
    )
    rows = result.mappings().all()

    items = []
    for row in rows:
        items.append(RfTiltSiteItem(
            site_id=row["site_id"],
            cell_name=row.get("cell_name"),
            sector_base=str(row["sector_base"]) if row.get("sector_base") is not None else None,
            band=row.get("band"),
            latitude=row["latitude_fix"],
            longitude=row["longitude_fix"],
            azimuth=row.get("azimuth"),
            electrical_tilt=row.get("electrical_tilt"),
            mechanical_tilt=row.get("mechanical_tilt"),
            antenna_height=row.get("antenna_height"),
            beamwidth=row.get("beamwidth"),
            antenna_type=row.get("antenna_type"),
        ))

    return RfTiltSiteSearchResponse(items=items, total=len(items))


@router.get("/antenna-models", response_model=AntennaModelListResponse)
async def list_antenna_models(
    q: str = Query("", description="Partial model name search"),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    params = {"limit": limit, "q": q.strip(), "q_pattern": f"%{q.strip()}%" if q.strip() else ""}
    result = await session.execute(text(ANTENNA_MODEL_LIST_QUERY), params)
    rows = result.mappings().all()
    items = [AntennaModelListItem(**dict(row)) for row in rows]
    return AntennaModelListResponse(items=items, total=len(items))


@router.get("/antenna-spec", response_model=AntennaSpecResponse)
async def get_antenna_spec(
    antenna_type: str = Query(..., description="Raw antenna_type string from ransys_gabungan"),
    session: AsyncSession = Depends(get_session),
):
    """Look up scraped antenna specifications by raw antenna_type string.

    Normalises the raw antenna_type to a canonical model name, then queries
    the antenna_specs table for an exact or fuzzy match.
    """
    model = _normalise_antenna_type(antenna_type)

    if not model:
        return AntennaSpecResponse(
            antenna_model=antenna_type,
            matched=False,
            match_method="no_model_extracted",
        )

    # Exact match
    result = await session.execute(
        text(ANTENNA_SPEC_LOOKUP_QUERY),
        {"antenna_model": model},
    )
    row = result.mappings().first()

    if not row:
        # Fuzzy prefix match
        prefix = model[:min(len(model), 10)]
        result = await session.execute(
            text(ANTENNA_SPEC_FUZZY_QUERY),
            {"pattern": f"{prefix}%"},
        )
        row = result.mappings().first()

    if not row:
        return AntennaSpecResponse(
            antenna_model=model,
            matched=False,
            match_method="no_match",
        )

    # Parse JSONB fields
    gain_band = row.get("gain_dbi_by_band")
    vbw_band = row.get("vertical_beamwidth_by_band")
    if isinstance(gain_band, str):
        try:
            gain_band = json.loads(gain_band)
        except json.JSONDecodeError:
            gain_band = None
    if isinstance(vbw_band, str):
        try:
            vbw_band = json.loads(vbw_band)
        except json.JSONDecodeError:
            vbw_band = None

    return AntennaSpecResponse(
        antenna_model=row["antenna_model"],
        vendor=row.get("vendor"),
        series=row.get("series"),
        antenna_type_enum=row.get("antenna_type_enum"),
        frequency_low_mhz=row.get("frequency_low_mhz"),
        frequency_high_mhz=row.get("frequency_high_mhz"),
        frequency_bands=row.get("frequency_bands"),
        gain_dbi_by_band=gain_band,
        vertical_beamwidth_by_band=vbw_band,
        horizontal_beamwidth=row.get("horizontal_beamwidth"),
        electrical_tilt_min=row.get("electrical_tilt_min"),
        electrical_tilt_max=row.get("electrical_tilt_max"),
        ports=row.get("ports"),
        weight_kg=row.get("weight_kg"),
        height_mm=row.get("height_mm"),
        width_mm=row.get("width_mm"),
        depth_mm=row.get("depth_mm"),
        connector_type=row.get("connector_type"),
        source_url=row.get("source_url"),
        matched=True,
        match_method="exact",
    )


def resolve_analysis_parameters(req: TiltAnalysisRequest) -> tuple[bool, float, float, int]:
    """Resolve and bound the distance-derived analysis work before I/O."""
    target_mode = req.target_latitude is not None and req.target_longitude is not None
    if target_mode:
        link_distance, link_azimuth = haversine_distance_bearing(
            req.latitude, req.longitude, req.target_latitude, req.target_longitude
        )
        azimuth_used = link_azimuth
        max_distance_used = link_distance
    else:
        azimuth_used = req.azimuth
        max_distance_used = req.max_distance

    if max_distance_used > MAX_RF_ANALYSIS_DISTANCE_M:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"RF analysis distance must not exceed {MAX_RF_ANALYSIS_DISTANCE_M} metres",
        )

    n_samples = max(2, int(max_distance_used / req.sample_interval) + 1)
    if n_samples > MAX_RF_ANALYSIS_SAMPLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"RF analysis must not exceed {MAX_RF_ANALYSIS_SAMPLES} terrain samples",
        )

    return target_mode, azimuth_used, max_distance_used, n_samples


@router.post("/analysis", response_model=TiltAnalysisResponse)
async def analyze_tilt(
    req: TiltAnalysisRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Rate-limit and bound an RF vertical tilt analysis before DEM work."""
    target_mode, azimuth_used, max_distance_used, n_samples = resolve_analysis_parameters(req)
    subject = getattr(request.state, "dashboard_subject", "unknown")
    client_address = request.client.host if request.client else "unknown"
    try:
        request.app.state.rf_limiter.consume(
            f"{subject}:{client_address}",
            RF_ANALYSIS_LIMIT,
            RF_ANALYSIS_WINDOW_SECONDS,
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many RF analysis requests",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc

    try:
        await asyncio.wait_for(
            request.app.state.rf_analysis_semaphore.acquire(),
            timeout=RF_ANALYSIS_CONCURRENCY_TIMEOUT_SECONDS,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="RF analysis capacity is temporarily exhausted",
            headers={"Retry-After": "1"},
        ) from exc

    try:
        return await run_bounded_analysis(
            req,
            session,
            target_mode=target_mode,
            azimuth_used=azimuth_used,
            max_distance_used=max_distance_used,
            n_samples=n_samples,
        )
    finally:
        request.app.state.rf_analysis_semaphore.release()


async def run_bounded_analysis(
    req: TiltAnalysisRequest,
    session: AsyncSession,
    *,
    target_mode: bool,
    azimuth_used: float,
    max_distance_used: float,
    n_samples: int,
) -> TiltAnalysisResponse:
    """Run DEM and raster work while the caller holds the analysis semaphore."""
    total_tilt = req.mechanical_tilt + req.electrical_tilt
    half_vbw = req.vertical_beamwidth / 2
    upper_angle = total_tilt - half_vbw
    lower_angle = total_tilt + half_vbw

    distances = [i * max_distance_used / (n_samples - 1) for i in range(n_samples)]
    sample_points = [
        destination_point(req.latitude, req.longitude, azimuth_used, d) for d in distances
    ]
    all_points = [(req.latitude, req.longitude)] + sample_points

    dem_source_used = req.dem_source
    elevations = None

    if req.dem_source == "opentopography":
        try:
            elevations = await fetch_elevations_opentopo(
                req.latitude, req.longitude, max_distance_used, all_points
            )
        except Exception as exc:
            logger.warning("OpenTopography DEM failed, falling back to Open-Meteo: %s", exc)
            dem_source_used = "open_meteo (fallback)"

    if elevations is None:
        try:
            elevations = await fetch_elevations_open_meteo(all_points)
            if req.dem_source == "open_meteo":
                dem_source_used = "open_meteo"
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Elevation service error: {exc}")

    if len(elevations) < n_samples + 1:
        raise HTTPException(status_code=502, detail="Incomplete elevation data returned")

    site_elevation = elevations[0]
    terrain = apply_clutter(distances, elevations[1:], req.clutter)
    antenna_asl = site_elevation + req.antenna_height
    wavelength = wavelength_m(req.frequency_mhz)

    def beam_result(angle: float) -> BeamResult:
        profile = [
            ProfilePoint(distance=d, elevation=beam_elevation(antenna_asl, angle, d))
            for d in distances
        ]
        impact = find_impact_distance(distances, terrain, antenna_asl, angle)
        total_d = impact if impact is not None else max_distance_used
        fresnel_violation = find_fresnel_violation_distance(
            distances, terrain, antenna_asl, angle, total_d, wavelength, req.fresnel_clearance_pct
        )
        return BeamResult(
            angle_deg=angle, profile=profile, impact_distance=impact,
            fresnel_clear_distance=fresnel_violation,
        )

    main_beam = beam_result(total_tilt)
    upper_beam = beam_result(upper_angle)
    lower_beam = beam_result(lower_angle)

    main_m = main_beam.impact_distance or max_distance_used
    far_m = upper_beam.impact_distance or max_distance_used

    sector_poly = sector_polygon(
        req.latitude, req.longitude, azimuth_used, req.horizontal_beamwidth, main_m
    )
    footprint_poly = sector_polygon(
        req.latitude, req.longitude, azimuth_used, req.horizontal_beamwidth, far_m
    )

    link_analysis = None
    if target_mode:
        target_elevation = terrain[-1]
        target_asl_h = target_elevation + req.target_height

        def link_elevation(x: float) -> float:
            frac = x / max_distance_used if max_distance_used > 0 else 0.0
            straight = antenna_asl + frac * (target_asl_h - antenna_asl)
            return straight + two_point_bulge(x, max_distance_used - x)

        link_profile_vals = [link_elevation(d) for d in distances]
        los_obstruction = find_line_obstruction(distances, terrain, link_profile_vals, max_distance_used)

        fresnel_obstruction = None
        for d, ground, line_h in zip(distances, terrain, link_profile_vals):
            if d <= 0 or d > max_distance_used:
                continue
            clearance = line_h - ground
            required = (req.fresnel_clearance_pct / 100.0) * fresnel_radius(d, max_distance_used, wavelength)
            if clearance < required:
                fresnel_obstruction = d
                break

        link_analysis = LinkAnalysis(
            target_latitude=req.target_latitude,
            target_longitude=req.target_longitude,
            distance_m=max_distance_used,
            azimuth_deg=azimuth_used,
            target_elevation=target_elevation,
            target_height=req.target_height,
            profile=[ProfilePoint(distance=d, elevation=e) for d, e in zip(distances, link_profile_vals)],
            los_clear=los_obstruction is None,
            los_obstruction_distance=los_obstruction,
            fresnel_clear=fresnel_obstruction is None,
            fresnel_obstruction_distance=fresnel_obstruction,
        )

    antenna_reference = None
    if req.antenna_type:
        antenna_reference = await match_antenna_spec(
            session, req.antenna_type, req.frequency_mhz
        )
    elif req.antenna_series:
        band_ref = ANTENNA_BAND_REFERENCE.get(req.frequency_mhz, {})
        antenna_reference = AntennaReference(
            series=req.antenna_series,
            frequency_mhz=req.frequency_mhz,
            gain_dbi=band_ref.get("typical_gain_dbi"),
            vertical_beamwidth_deg=band_ref.get("typical_vbw_deg"),
            horizontal_beamwidth_deg=band_ref.get("typical_hbw_deg"),
            matched=False,
            match_method="generic_fallback",
            note="Typical values from public reference — verify against your exact model.",
        )

    practical_main_m = main_beam.fresnel_clear_distance or main_beam.impact_distance

    return TiltAnalysisResponse(
        site_elevation=site_elevation,
        total_tilt=total_tilt,
        dem_source_used=dem_source_used,
        frequency_mhz=req.frequency_mhz,
        wavelength_m=wavelength,
        fresnel_clearance_pct=req.fresnel_clearance_pct,
        antenna_reference=antenna_reference,
        azimuth_used=azimuth_used,
        max_distance_used=max_distance_used,
        terrain_profile=[ProfilePoint(distance=d, elevation=e) for d, e in zip(distances, terrain)],
        main_beam=main_beam,
        upper_beam=upper_beam,
        lower_beam=lower_beam,
        sector_polygon=sector_poly,
        footprint_polygon=footprint_poly,
        near_m=lower_beam.impact_distance,
        main_m=main_beam.impact_distance,
        far_m=upper_beam.impact_distance,
        practical_main_m=practical_main_m,
        link=link_analysis,
    )
