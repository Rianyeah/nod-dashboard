import math
from typing import Any, Mapping


EARTH_RADIUS_M = 6371000.0
MIN_RENDER_RADIUS_M = 350.0
MAX_RENDER_RADIUS_M = 1500.0
FALLBACK_RENDER_RADIUS_M = 600.0
DEFAULT_ARC_STEPS = 16

# Per-band visualization radius — reflects real RF propagation characteristics.
# Low-band (L900) propagates farthest; ultra-high (L2300) is shortest.
BAND_RENDER_RADIUS_M: dict[str, float] = {
    "L900": 1200.0,
    "L1800": 800.0,
    "L2100": 600.0,
    "L2300": 450.0,
}


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def render_radius_for_band(band: Any) -> float:
    """Return the visualization render radius for a given frequency band."""
    key = str(band or "").strip().upper()
    return BAND_RENDER_RADIUS_M.get(key, FALLBACK_RENDER_RADIUS_M)


def clamp_render_radius_m(value: Any, band: Any = None) -> float:
    """Clamp a radius value within bounds, falling back to per-band default."""
    band_default = render_radius_for_band(band)
    numeric = _to_float(value)
    if numeric is None or numeric < MIN_RENDER_RADIUS_M:
        return band_default
    return min(max(numeric, MIN_RENDER_RADIUS_M), MAX_RENDER_RADIUS_M)


def normalize_bearing(degrees: float) -> float:
    return degrees % 360.0


def _normalize_longitude(degrees: float) -> float:
    return ((degrees + 180.0) % 360.0) - 180.0


def destination_point(
    longitude: float,
    latitude: float,
    bearing_degrees: float,
    distance_m: float,
) -> tuple[float, float]:
    lat1 = math.radians(latitude)
    lon1 = math.radians(longitude)
    bearing = math.radians(normalize_bearing(bearing_degrees))
    angular_distance = distance_m / EARTH_RADIUS_M

    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )

    return (_normalize_longitude(math.degrees(lon2)), math.degrees(lat2))


def _row_value(row: Mapping[str, Any], key: str) -> Any:
    if hasattr(row, "get"):
        return row.get(key)
    return row[key]


def sector_row_to_feature(
    row: Mapping[str, Any],
    arc_steps: int = DEFAULT_ARC_STEPS,
) -> dict[str, Any] | None:
    longitude = _to_float(_row_value(row, "longitude_fix"))
    latitude = _to_float(_row_value(row, "latitude_fix"))
    azimuth = _to_float(_row_value(row, "azimuth"))
    beamwidth = _to_float(_row_value(row, "beamwidth")) or 30.0

    if longitude is None or latitude is None or azimuth is None:
        return None
    if longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90:
        return None

    render_radius_m = clamp_render_radius_m(_row_value(row, "radius"), band=_row_value(row, "band"))
    half_width = max(min(beamwidth, 360.0), 1.0) / 2.0
    start_bearing = azimuth - half_width
    end_bearing = azimuth + half_width
    step_count = max(int(arc_steps), 2)

    center = [longitude, latitude]
    arc = []
    for index in range(step_count + 1):
        ratio = index / step_count
        bearing = start_bearing + (end_bearing - start_bearing) * ratio
        point_lng, point_lat = destination_point(
            longitude,
            latitude,
            bearing,
            render_radius_m,
        )
        arc.append([point_lng, point_lat])

    return {
        "type": "Feature",
        "properties": {
            "site_id": _row_value(row, "site_id"),
            "cell_name": _row_value(row, "cell_name"),
            "sector_base": _row_value(row, "sector_base"),
            "band": _row_value(row, "band"),
            "site_type": _row_value(row, "site_type"),
            "antenna_height": _to_float(_row_value(row, "antenna_height")),
            "antenna_type": _row_value(row, "antenna_type"),
            "azimuth": azimuth,
            "beamwidth": beamwidth,
            "radius": _to_float(_row_value(row, "radius")),
            "render_radius_m": render_radius_m,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[center, *arc, center]],
        },
    }
