"""
Extract and normalise unique antenna_type values from ransys_gabungan.

Outputs a canonical list of base antenna models to backend/data/antenna_models_raw.json
for use by the scraping stage.

Usage:
    python backend/scripts/extract_antenna_models.py [--output PATH] [--db-url URL]

DB connection uses DATABASE_URL from backend/.env (asyncpg SQLAlchemy) — NOT the
hardcoded-DSN pattern from load_data.py.
"""
import argparse
import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

# Allow importing backend modules when run as a script
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("extract_antenna_models")

DEFAULT_OUTPUT = BACKEND_DIR / "data" / "antenna_models_raw.json"

# --- Normalisation rules -----------------------------------------------------

# Vendor / brand names to strip as substrings (case-insensitive).
# Safe: no antenna model number contains these vendor names.
# Sorted by length descending so "katherine" is stripped before "katherin".
VENDOR_SUBSTRINGS = sorted([
    "huawei", "andrew", "commscope", "kathrein", "katherine",
    "ericsson", "argus", "anatel", "celwave", "rosenberger",
    "agisson", "netop", "comba", "kathren", "katrein",
    "khatrein", "katrhein", "katherin", "hw",
], key=len, reverse=True)

# Descriptor substrings to strip (concatenated forms without spaces)
# These are stripped as substrings on the lowercased string.
DESCRIPTOR_SUBSTRINGS = sorted([
    "antennasectoral", "antennasector", "antennasektor",
    "antennarf", "antennabts", "antena", "antenna",
    "sectoral", "sector", "sektor",
    "vtm",                          # Variable Tilt Module suffix
    "a1m",                          # Andrew variant suffix
], key=len, reverse=True)

# Patterns to strip from the string (regex, applied before substring removal)
JUNK_PATTERNS = [
    r"\([^)]*\)",                           # parentheticals
    r"\b\d+T\d+R?\b",                       # 4T4R, 2T2R
    r"\b\d+T\d*S\b",                        # 4T6S
    r"\b\d+[TS]\b",                         # 6T, 2S (single-letter tech desc)
    r"\b\d+\s*ports?\b",                    # "12 Port", "4 Ports"
    r"\bports?\b",                          # "Port"
    r"\b\d{3,4}[-/]\d{3,4}([-/]\d{3,4})+\b", # freq ranges: 806-960/1710-2500
    r"\b\d{4}(?:/\d{4})+\b",               # 900/1800/2100/2300
    r"\.pafx\b", r"\bet\.pafx\b",          # file extensions
    r"\bwd7m[a-z0-9]+\b",                  # WD7M... FCC IDs
    r"\bmhz\b",                            # MHz suffix
    r"\bu2100\b",                          # U2100 band designation
]


def _strip_all(s: str, patterns: list[str], flags: int = re.I) -> str:
    for p in patterns:
        s = re.sub(p, " ", s, flags=flags)
    return s


def normalise_antenna_type(raw: str) -> str | None:
    """Normalise a raw antenna_type string to a canonical base model.

    Strategy: lowercase and aggressively strip noise (vendors, descriptors,
    parentheticals, tech annotations) as substrings to handle concatenated
    forms, then remove all spaces and match a known model pattern. Version
    suffixes (v01, v06) are stripped — the canonical model is version-free
    since hardware revisions share the same antenna specs.

    Returns None if no model number can be extracted.
    """
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()

    # Replace underscores with spaces
    s = s.replace("_", " ")

    # Strip junk regex patterns (parentheticals, tech descriptors, etc.)
    s = _strip_all(s, JUNK_PATTERNS)

    # Lowercase everything for case-insensitive substring matching
    s = s.lower()

    # Strip vendor names as substrings (handles concatenated forms like
    # "huaweiape4516r1v06", "andrewhbxx-6516dsvtm", "kathrein739650")
    for v in VENDOR_SUBSTRINGS:
        s = s.replace(v, " ")

    # Strip descriptor substrings (concatenated forms without spaces)
    for d in DESCRIPTOR_SUBSTRINGS:
        s = s.replace(d, " ")

    # Strip remaining standalone words
    for w in ["rru", "bts", "ret", "rf", "rfs", "manual", "pudar",
              "high", "band", "existing", "dual", "beam", "easy", "macro",
              "indoor", "omni", "no", "data", "tidak", "jelas", "buram",
              "mobi", "collo", "colo", "et"]:
        s = re.sub(rf"\b{w}\b", " ", s, flags=re.I)

    # Remove all spaces, uppercase, strip trailing punctuation
    s = re.sub(r"\s+", "", s).upper().strip("-./()")

    if not s or len(s) < 2:
        return None

    # --- Try known model patterns (first match wins) ---

    # Huawei AAU (active): AAU5336, AAU5768 etc.
    if m := re.match(r"^(AAU\d{4,5})", s):
        return m.group(1)

    # Huawei HAAU (active, with H prefix): HAAU5323 → AAU5323
    if m := re.match(r"^H(AAU\d{4,5})", s):
        return m.group(1)

    # Huawei passive standard (with R): APE4516R1v06 → APE4516R1 (strip version)
    if m := re.match(r"^([A-Z]{2,4}\d{4,5}R\d{1,3})(?:V\d{1,3})?", s):
        return m.group(1)

    # Huawei passive (without R, 6-8 digits): ATR451704V01 → ATR451704,
    # ADU451816V02 → ADU451816, APE451704V01 → APE451704, ADU45176V02 → ADU45176
    if m := re.match(r"^([A-Z]{2,4}\d{5,8})(?:V\d{1,3})?", s):
        return m.group(1)

    # Huawei passive PD: A12264PD01v06 → A12264PD01 (strip version)
    if m := re.match(r"^([A-Z]\d{5}PD\d{2})(?:V\d{1,3})?", s):
        return m.group(1)

    # Huawei passive S-type: A264518S0 → A264518S0 (5-6 digits before letter)
    if m := re.match(r"^([A-Z]\d{5,6}[A-Z]\d{1,2})", s):
        return m.group(1)

    # Huawei A704516R0 type (A + digits + R + digits)
    if m := re.match(r"^(A\d{5,7}R\d{1,3})(?:V\d{1,3})?", s):
        return m.group(1)

    # Huawei A79451700 type (A + 6-8 digits, no R): A79451700V02 → A79451700
    if m := re.match(r"^(A\d{6,8})(?:V\d{1,3})?", s):
        return m.group(1)

    # Huawei A08260PD00 type (A0 + digits + PD + digits)
    if m := re.match(r"^(A0\d{4}PD\d{2})(?:V\d{1,3})?", s):
        return m.group(1)

    # Commscope/Andrew HBXX/LBX/LDX/HBX: HBXX-6516DS-VTM → HBXX-6516DS
    # Also handles missing hyphen: HBXX6516DS → HBXX-6516DS
    if m := re.match(r"^([A-Z]{2,5})-?(\d{4,5}[A-Z]{2,3})(?:-[A-Z]{2,5})?", s):
        prefix, body = m.group(1), m.group(2)
        return f"{prefix}-{body}"

    # Andrew DBXLH/DBXRH/DBLXH: DBXLH-6565C-VTM → DBXLH-6565C
    if m := re.match(r"^(DB[A-Z]{2,3})-?(\d{4}[A-Z])(?:-[A-Z]{3,4})?", s):
        return f"{m.group(1)}-{m.group(2)}"

    # Andrew DB856DG65EXY type: keep as-is (no hyphenation standardisation)
    if m := re.match(r"^(DB\d{3}[A-Z]{2}\d{2,3}[A-Z]{3})", s):
        return m.group(1)

    # Andrew TBXLHA: TBXLHA-6565C-VTM → TBXLHA-6565C
    if m := re.match(r"^(TBXLHA)-?(\d{4,5}[A-Z])(?:-[A-Z]{3,4})?", s):
        return f"{m.group(1)}-{m.group(2)}"

    # Andrew VHLP: VHLP4-15-NC3 → VHLP4-15-NC3 (keep as-is)
    if m := re.match(r"^(VHLP\d+-\d+-NC\d)", s):
        return m.group(1)

    # Kathrein numeric: 739650, 80010123 (6-8 digits, strip version)
    if m := re.match(r"^(\d{6,8})(?:V\d{2})?", s):
        return m.group(1)

    # Kathrein K-prefixed: K739650 → 739650
    if m := re.match(r"^K(\d{6,8})", s):
        return m.group(1)

    # Kathrein KRE: KRE1011741 → KRE1011741
    if m := re.match(r"^(KRE\d{7})", s):
        return m.group(1)

    # Argus CNPX: CNPX-410-14M, CNPX310M-4P, CNPX410.14M-4P-E1
    if m := re.match(r"^(CNPX)-?(\d{3}[A-Z]?)(?:[.\-](\d{1,2}[A-Z]?))?(?:-(\d+[A-Z]?-?[A-Z0-9]*))?", s):
        parts = [m.group(1), m.group(2)]
        if m.group(3):
            parts.append(m.group(3))
        if m.group(4):
            parts.append(m.group(4))
        return "-".join(parts)

    # Argus NPX/NNPX: NPX412M-E1, NNPX412M-E1, NPX414M-E2
    if m := re.match(r"^([A-Z]*NPX\d{3}[A-Z]?-\d+[A-Z]?)", s):
        return m.group(1)

    # Argus CNPX310R, CNPX310R-4P
    if m := re.match(r"^(CNPX\d{3}[A-Z]?)(?:-(\d+[A-Z]?))?", s):
        base = m.group(1)
        if m.group(2):
            return f"{base}-{m.group(2)}"
        return base

    # Anatel HG: HG2412P-180 → HG2412P-180
    if m := re.match(r"^(HG\d{4,5}[A-Z]?-\d{2,3})", s):
        return m.group(1)

    # Rosenberger S-Wave: S-WAVE U-65-18DV10 → S-WAVE-U-65-18DV10
    if m := re.match(r"^(S-?WAVE.*)", s):
        return m.group(1)

    # Rosenberger BA: BA-G6W6W6W6W6X65V-11-TK → BA-G6W6W6W6W6X65V-11-TK
    if m := re.match(r"^(BA-[A-Z0-9\-]+)", s):
        return m.group(1)

    # Mobi MB: MB4B/QMF-65-16/16DE-IN-TSL → keep as-is
    if m := re.match(r"^(MB\d?[A-Z]?/?.*)", s):
        return m.group(1)

    # DX-1710-2170-90-171-21 type (Agisson/Huawei)
    if m := re.match(r"^(DX-\d{3,4}-\d{4}-.*)", s):
        return m.group(1)

    # AP901213 RFS type: AP901213 → AP901213
    if m := re.match(r"^(AP\d{6})", s):
        return m.group(1)

    # APX-909014 type: APX-909014 → APX-909014
    if m := re.match(r"^(APX-?\d{6})", s):
        return m.group(1)

    # Fallback: if short alphanumeric string remains, return it
    if s and len(s) <= 50 and re.search(r"[A-Z0-9]", s):
        return s

    return None


def classify_series(model: str) -> str | None:
    """Infer the antenna series code from a normalised model string."""
    if not model:
        return None
    m = re.match(r"^([A-Z]{2,4})", model)
    if m:
        return m.group(1)
    return None


async def fetch_distinct_antenna_types(db_url: str) -> list[tuple[str, int]]:
    """Query all DISTINCT antenna_type values with row counts from ransys_gabungan."""
    engine = create_async_engine(db_url, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT antenna_type, COUNT(*) as cnt "
                    "FROM ransys_gabungan "
                    "WHERE antenna_type IS NOT NULL AND antenna_type::text !~ '^\\s*$' "
                    "GROUP BY antenna_type "
                    "ORDER BY antenna_type"
                )
            )
            return [(row[0], row[1]) for row in result.fetchall() if row[0]]
    finally:
        await engine.dispose()


def build_model_records(raw_values: list[tuple[str, int]]) -> list[dict]:
    """Normalise raw values into deduplicated model records with counts."""
    mapping: dict[str, dict] = {}
    for raw, count in raw_values:
        model = normalise_antenna_type(raw)
        if not model:
            continue
        if model not in mapping:
            mapping[model] = {
                "antenna_model": model,
                "series": classify_series(model),
                "raw_count": 0,
                "raw_examples": [],
            }
        mapping[model]["raw_count"] += count
        if len(mapping[model]["raw_examples"]) < 3:
            mapping[model]["raw_examples"].append(raw)
    # Sort by raw_count descending (most common first) for scraping priority
    return sorted(mapping.values(), key=lambda r: -r["raw_count"])


async def main(output: Path, db_url: str | None) -> None:
    db_url = db_url or os.getenv("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set in .env or --db-url")

    log.info("Querying antenna_type with counts from ransys_gabungan ...")
    raw_values = await fetch_distinct_antenna_types(db_url)
    total_rows = sum(c for _, c in raw_values)
    log.info("Fetched %d distinct raw antenna_type values (%d total rows)",
             len(raw_values), total_rows)

    records = build_model_records(raw_values)
    log.info("Normalised to %d unique base models", len(records))

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "raw_count": len(raw_values),
                "total_rows": total_rows,
                "normalised_count": len(records),
                "models": records,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    log.info("Wrote %s", output)

    # Print summary sorted by site count
    for r in records:
        log.info("  %4d rows  %-35s series=%s", r["raw_count"], r["antenna_model"], r["series"])


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Extract & normalise antenna models from ransys_gabungan")
    p.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output JSON path (default: {DEFAULT_OUTPUT})",
    )
    p.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="Database URL (default: DATABASE_URL from .env)",
    )
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(main(args.output, args.db_url))
