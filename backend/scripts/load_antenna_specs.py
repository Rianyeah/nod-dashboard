"""
Load scraped antenna specs from JSON into the antenna_specs table.

Reads backend/data/antenna_specs_scraped.json and upserts into the database.
The scraped gain/beamwidth keys are frequency ranges (e.g. "880-960") which
are converted to standard band keys (900, 1800, 2100, 2300) for the RF tilt
tool's SUPPORTED_FREQUENCIES_MHZ.

Usage:
    python backend/scripts/load_antenna_specs.py [--input PATH] [--reset]

    --reset   Truncate antenna_specs before loading (rollback/cleanup)
"""
import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("load_antenna_specs")

DEFAULT_INPUT = BACKEND_DIR / "data" / "antenna_specs_scraped.json"

# Standard frequency bands used by the RF tilt tool
SUPPORTED_BANDS = [900, 1800, 2100, 2300]


def freq_range_to_band(freq_range: str) -> int | None:
    """Map a frequency range string like '880-960' to a standard band (900, 1800, etc.).

    Uses the center frequency of the range to determine the closest standard band.
    Returns None if the range doesn't fall within any standard band.
    """
    try:
        parts = freq_range.split("-")
        low = float(parts[0])
        high = float(parts[1])
    except (ValueError, IndexError):
        return None

    center = (low + high) / 2

    if 800 <= center <= 960:
        return 900
    elif 1710 <= center <= 1990:
        return 1800
    elif 1920 <= center <= 2200:
        return 2100
    elif 2200 <= center <= 2690:
        return 2300
    return None


def convert_band_dict(raw_dict: dict) -> dict:
    """Convert frequency-range-keyed dict to standard-band-keyed dict.

    When multiple sub-bands map to the same standard band, takes the value
    from the sub-band whose center frequency is closest to the standard band.
    """
    if not raw_dict:
        return {}

    band_values: dict[int, list[tuple[float, float]]] = {}
    for freq_range, value in raw_dict.items():
        band = freq_range_to_band(freq_range)
        if band is None or value is None:
            continue
        parts = freq_range.split("-")
        center = (float(parts[0]) + float(parts[1])) / 2
        if band not in band_values:
            band_values[band] = []
        band_values[band].append((center, float(value)))

    result = {}
    for band, entries in band_values.items():
        # Pick the value from the sub-band closest to the standard band center
        best = min(entries, key=lambda e: abs(e[0] - band))
        result[str(band)] = best[1]
    return result


async def load_specs(input_path: Path, db_url: str, reset: bool) -> None:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    antennas = data.get("antennas", [])
    log.info("Loaded %d antenna specs from %s", len(antennas), input_path)

    engine = create_async_engine(db_url, pool_pre_ping=True)
    try:
        async with engine.begin() as conn:
            if reset:
                log.info("Truncating antenna_specs table (--reset)")
                await conn.execute(text("TRUNCATE antenna_specs RESTART IDENTITY CASCADE"))

            inserted = 0
            updated = 0
            for ant in antennas:
                gain_by_band = convert_band_dict(ant.get("gain_dbi_by_band", {}))
                vbw_by_band = convert_band_dict(ant.get("vertical_beamwidth_by_band", {}))

                result = await conn.execute(
                    text("""
                        INSERT INTO antenna_specs (
                            antenna_model, vendor, series, antenna_type_enum,
                            frequency_low_mhz, frequency_high_mhz, frequency_bands,
                            gain_dbi_by_band, vertical_beamwidth_by_band,
                            horizontal_beamwidth, electrical_tilt_min, electrical_tilt_max,
                            ports, weight_kg, height_mm, width_mm, depth_mm,
                            connector_type, source_url, scraped_at
                        ) VALUES (
                            :model, :vendor, :series, :type_enum,
                            :freq_low, :freq_high, :freq_bands,
                            :gain_band, :vbw_band,
                            :hbw, :tilt_min, :tilt_max,
                            :ports, :weight, :height, :width, :depth,
                            :connector, :source_url, NOW()
                        )
                        ON CONFLICT (antenna_model) DO UPDATE SET
                            vendor = EXCLUDED.vendor,
                            series = EXCLUDED.series,
                            antenna_type_enum = EXCLUDED.antenna_type_enum,
                            frequency_low_mhz = EXCLUDED.frequency_low_mhz,
                            frequency_high_mhz = EXCLUDED.frequency_high_mhz,
                            frequency_bands = EXCLUDED.frequency_bands,
                            gain_dbi_by_band = EXCLUDED.gain_dbi_by_band,
                            vertical_beamwidth_by_band = EXCLUDED.vertical_beamwidth_by_band,
                            horizontal_beamwidth = EXCLUDED.horizontal_beamwidth,
                            electrical_tilt_min = EXCLUDED.electrical_tilt_min,
                            electrical_tilt_max = EXCLUDED.electrical_tilt_max,
                            ports = EXCLUDED.ports,
                            weight_kg = EXCLUDED.weight_kg,
                            height_mm = EXCLUDED.height_mm,
                            width_mm = EXCLUDED.width_mm,
                            depth_mm = EXCLUDED.depth_mm,
                            connector_type = EXCLUDED.connector_type,
                            source_url = EXCLUDED.source_url,
                            scraped_at = EXCLUDED.scraped_at,
                            updated_at = NOW()
                    """),
                    {
                        "model": ant["antenna_model"],
                        "vendor": ant.get("vendor"),
                        "series": ant.get("series"),
                        "type_enum": ant.get("antenna_type_enum"),
                        "freq_low": ant.get("frequency_low_mhz"),
                        "freq_high": ant.get("frequency_high_mhz"),
                        "freq_bands": ant.get("frequency_bands"),
                        "gain_band": json.dumps(gain_by_band),
                        "vbw_band": json.dumps(vbw_by_band),
                        "hbw": ant.get("horizontal_beamwidth"),
                        "tilt_min": ant.get("electrical_tilt_min"),
                        "tilt_max": ant.get("electrical_tilt_max"),
                        "ports": ant.get("ports"),
                        "weight": ant.get("weight_kg"),
                        "height": ant.get("height_mm"),
                        "width": ant.get("width_mm"),
                        "depth": ant.get("depth_mm"),
                        "connector": ant.get("connector_type"),
                        "source_url": ant.get("source_url"),
                    },
                )
                if result.rowcount > 0:
                    inserted += 1

            log.info("Upserted %d antenna specs", inserted)

        # Verify
        async with engine.connect() as conn:
            count = await conn.execute(text("SELECT COUNT(*) FROM antenna_specs"))
            log.info("Total rows in antenna_specs: %d", count.scalar())

        # Print sample for verification
        async with engine.connect() as conn:
            sample = await conn.execute(
                text("""
                    SELECT antenna_model, vendor, gain_dbi_by_band, vertical_beamwidth_by_band
                    FROM antenna_specs
                    ORDER BY antenna_model
                    LIMIT 5
                """)
            )
            for row in sample.fetchall():
                log.info("  %s  vendor=%s  gain=%s  vbw=%s", row[0], row[1], row[2], row[3])

    finally:
        await engine.dispose()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Load antenna specs JSON into database")
    p.add_argument("--input", type=Path, default=DEFAULT_INPUT, help=f"Input JSON (default: {DEFAULT_INPUT})")
    p.add_argument("--reset", action="store_true", help="Truncate table before loading")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set in .env")
    asyncio.run(load_specs(args.input, db_url, args.reset))
