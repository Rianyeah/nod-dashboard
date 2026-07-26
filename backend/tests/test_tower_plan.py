from __future__ import annotations

from decimal import Decimal

import pytest
from unittest.mock import AsyncMock

from models.tower_plan import (
    TowerPlanAiAntenna,
    TowerPlanAiRequest,
    TowerPlanSourceColumns,
)
from routers.tower_plan import (
    build_ai_prompt,
    extract_cid,
    group_antenna_rows,
    leg_for_azimuth,
    normalize_azimuth,
    resolve_source_columns,
    resolve_tower_height,
)
from tests.conftest import TEST_ORIGIN


class FakeMappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return FakeMappings(self._rows)


class SequencedSession:
    def __init__(self, *result_sets):
        self._result_sets = list(result_sets)
        self.calls = []

    async def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return FakeResult(self._result_sets.pop(0))


@pytest.mark.parametrize(
    ("azimuth", "expected"),
    (
        (0, "A"),
        (90, "A"),
        (90.1, "B"),
        (180, "B"),
        (180.1, "C"),
        (270, "C"),
        (270.1, "D"),
        (359.9, "D"),
        (360, "A"),
        (-10, "D"),
    ),
)
def test_leg_boundaries_follow_the_approved_azimuth_ranges(azimuth, expected):
    assert leg_for_azimuth(azimuth) == expected


def test_normalize_azimuth_uses_one_decimal_and_wraps_full_rotations():
    assert normalize_azimuth(450.04) == Decimal("90.0")
    assert normalize_azimuth(-0.04) == Decimal("0.0")


@pytest.mark.parametrize(
    ("enodeb_ci", "ci", "expected"),
    (
        ("12345_11", 999, "11"),
        ("SITE_WITH_UNDERSCORE_42", None, "42"),
        (" 12345_07 ", None, "07"),
        (None, 31, "31"),
        ("", "CID-9", "CID-9"),
    ),
)
def test_extract_cid_uses_enodeb_suffix_and_ci_fallback(enodeb_ci, ci, expected):
    assert extract_cid(enodeb_ci, ci) == expected


def test_grouping_merges_cells_that_share_physical_antenna_dimensions():
    rows = [
        {
            "site_id": "SITE001",
            "cell_name": "SITE001_L18_1",
            "sector": 1,
            "band": "L1800",
            "teknologi": "4G",
            "ci": 101,
            "enodeb_ci": "88001_11",
            "azimuth": 30,
            "antenna_height": 42,
            "antenna_type": "  Antenna Sectoral AQU4518R21v06 Huawei ",
        },
        {
            "site_id": "SITE001",
            "cell_name": "SITE001_L21_1",
            "sector": "1",
            "band": "L2100",
            "teknologi": "4G",
            "ci": 102,
            "enodeb_ci": "88001_12",
            "azimuth": 30.04,
            "antenna_height": 42.04,
            "antenna_type": "antenna   sectoral aqu4518r21v06 huawei",
        },
    ]

    groups, warnings = group_antenna_rows(rows)

    assert warnings == []
    assert len(groups) == 1
    assert groups[0].sector == "1"
    assert groups[0].height_m == 42
    assert groups[0].azimuth_deg == 30
    assert groups[0].leg == "A"
    assert groups[0].cell_count == 2
    assert groups[0].cell_names == ["SITE001_L18_1", "SITE001_L21_1"]
    assert groups[0].bands == ["L1800", "L2100"]
    assert groups[0].cids == ["11", "12"]
    assert groups[0].azimuth_values_deg == [30]
    assert groups[0].azimuth_conflict is False


def test_grouping_uses_sector_model_and_height_as_the_physical_key():
    base = {
        "site_id": "SITE001",
        "cell_name": "CELL",
        "sector": 1,
        "band": "L1800",
        "teknologi": "4G",
        "enodeb_ci": "88001_11",
        "azimuth": 30,
        "antenna_height": 42,
        "antenna_type": "MODEL-A",
    }
    rows = [
        base,
        {**base, "cell_name": "HEIGHT", "antenna_height": 43},
        {
            **base,
            "cell_name": "AZIMUTH",
            "enodeb_ci": "88001_12",
            "azimuth": 31,
        },
        {**base, "cell_name": "SECTOR", "sector": 2},
        {**base, "cell_name": "MODEL", "antenna_type": "MODEL-B"},
    ]

    groups, warnings = group_antenna_rows(rows)

    assert len(groups) == 4
    conflicted = next(
        group
        for group in groups
        if group.sector == "1"
        and group.antenna_model == "MODEL-A"
        and group.height_m == 42
    )
    assert conflicted.cell_count == 2
    assert conflicted.cids == ["11", "12"]
    assert conflicted.azimuth_deg is None
    assert conflicted.leg is None
    assert conflicted.azimuth_values_deg == [30, 31]
    assert conflicted.azimuth_conflict is True
    assert warnings == [
        "Antenna MODEL-A · SEC 1 memiliki azimuth berbeda (30.0°, 31.0°) "
        "dan perlu diperiksa manual."
    ]


def test_missing_model_does_not_merge_unrelated_cells():
    rows = [
        {
            "site_id": "SITE001",
            "cell_name": "CELL-A",
            "sector": 1,
            "azimuth": 30,
            "antenna_height": 42,
            "antenna_type": None,
        },
        {
            "site_id": "SITE001",
            "cell_name": "CELL-B",
            "sector": 1,
            "azimuth": 30,
            "antenna_height": 42,
            "antenna_type": None,
        },
    ]

    groups, warnings = group_antenna_rows(rows)

    assert len(groups) == 2
    assert len(warnings) == 2


def test_missing_sector_remains_unresolved_for_manual_review():
    groups, warnings = group_antenna_rows(
        [
            {
                "site_id": "SITE001",
                "cell_name": "CELL-A",
                "sector": None,
                "azimuth": 30,
                "antenna_height": 42,
                "antenna_type": "MODEL-A",
            },
            {
                "site_id": "SITE001",
                "cell_name": "CELL-B",
                "sector": None,
                "azimuth": 30,
                "antenna_height": 42,
                "antenna_type": "MODEL-A",
            }
        ]
    )

    assert len(groups) == 2
    assert {group.sector for group in groups} == {""}
    assert warnings == [
        "Cell CELL-A tidak memiliki sector dan perlu diperiksa manual.",
        "Cell CELL-B tidak memiliki sector dan perlu diperiksa manual.",
    ]


def test_invalid_rows_are_reported_instead_of_becoming_invented_antennas():
    groups, warnings = group_antenna_rows(
        [
            {
                "site_id": "SITE001",
                "cell_name": "NO-HEIGHT",
                "sector": 1,
                "azimuth": 30,
                "antenna_height": None,
                "antenna_type": "MODEL-A",
            }
        ]
    )

    assert groups == []
    assert warnings == ["Cell NO-HEIGHT dilewati karena tinggi atau azimuth tidak valid."]


def test_source_columns_prefer_new_schema_and_fall_back_safely():
    assert resolve_source_columns({"tower_hight", "sector", "sector_base"}) == (
        TowerPlanSourceColumns(tower_height="tower_hight", sector="sector_base")
    )
    assert resolve_source_columns({"sector_base"}) == TowerPlanSourceColumns(
        tower_height=None,
        sector="sector_base",
    )


def test_tower_height_reports_available_missing_and_conflicting_values():
    available = resolve_tower_height([{"tower_height": 50}, {"tower_height": 50.04}])
    missing = resolve_tower_height([{"tower_height": None}])
    conflict = resolve_tower_height([{"tower_height": 50}, {"tower_height": 60}])

    assert available.status == "available"
    assert available.value_m == 50
    assert available.values_m == [50]
    assert missing.status == "missing"
    assert missing.value_m is None
    assert conflict.status == "conflict"
    assert conflict.value_m is None
    assert conflict.values_m == [50, 60]


def test_ai_prompt_contains_only_anonymous_engineering_geometry():
    request = TowerPlanAiRequest(
        mode="draft",
        tower_height_m=50,
        leg_a_bearing_deg=45,
        visual_style="Clean Engineering Infographic",
        revision_instruction="Make the tower steel slightly darker",
        antennas=[
            TowerPlanAiAntenna(
                status="Existing",
                height_m=42,
                azimuth_deg=30,
                leg="A",
                color="#334155",
            )
        ],
    )

    prompt = build_ai_prompt(request)

    assert "SITE001" not in prompt
    assert "CELL-A" not in prompt
    assert "50.0 m" in prompt
    assert "30.0 degrees" in prompt
    assert "Leg A" in prompt
    assert "Make the tower steel slightly darker" in prompt


@pytest.mark.asyncio
async def test_site_search_uses_parameterized_query_and_returns_group_estimate():
    from routers.tower_plan import search_tower_plan_sites

    session = SequencedSession(
        [{"column_name": "sector_base"}],
        [{"site_id": "SITE001", "cell_count": 6, "estimated_antenna_count": 2}],
    )

    response = await search_tower_plan_sites(q=" site ", limit=20, session=session)

    assert response.items[0].site_id == "SITE001"
    assert response.items[0].cell_count == 6
    assert response.items[0].estimated_antenna_count == 2
    assert session.calls[1][1] == {
        "q_exact": "site",
        "q_prefix": "site%",
        "q_contains": "%site%",
        "limit": 20,
    }
    assert "ransys_gabungan" in session.calls[1][0]
    assert ":q_contains" in session.calls[1][0]
    assert "%%" not in session.calls[1][0]
    assert "tower_hight" not in session.calls[1][0]
    assert " sector " not in session.calls[1][0].lower()
    assert "cell_name ILIKE" not in session.calls[1][0]
    assert "CASE" in session.calls[1][0]
    assert "ROUND((((azimuth::numeric" not in session.calls[1][0]


@pytest.mark.asyncio
async def test_configuration_uses_new_columns_and_returns_grouped_antennas():
    from routers.tower_plan import get_tower_plan_site_configuration

    session = SequencedSession(
        [
            {"column_name": "tower_hight"},
            {"column_name": "sector"},
            {"column_name": "sector_base"},
            {"column_name": "enodeb_ci"},
        ],
        [
            {
                "site_id": "SITE001",
                "cell_name": "CELL-L18",
                "sector": "1",
                "band": "L1800",
                "teknologi": "4G",
                "ci": 101,
                "enodeb_ci": "88001_11",
                "azimuth": 20,
                "antenna_height": 42,
                "antenna_type": "MODEL-A",
                "electrical_tilt": 2,
                "mechanical_tilt": 1,
                "beamwidth": 65,
                "tower_height": 50,
            },
            {
                "site_id": "SITE001",
                "cell_name": "CELL-L21",
                "sector": "1",
                "band": "L2100",
                "teknologi": "4G",
                "ci": 102,
                "enodeb_ci": "88001_12",
                "azimuth": 20,
                "antenna_height": 42,
                "antenna_type": "MODEL-A",
                "electrical_tilt": 3,
                "mechanical_tilt": 1,
                "beamwidth": 65,
                "tower_height": 50,
            },
        ],
    )

    response = await get_tower_plan_site_configuration(
        site_id=" site001 ",
        session=session,
    )

    assert response.site_id == "SITE001"
    assert response.source_columns.tower_height == "tower_hight"
    assert response.source_columns.sector == "sector_base"
    assert response.tower_height.status == "available"
    assert response.tower_height.value_m == 50
    assert len(response.antennas) == 1
    assert response.antennas[0].cell_count == 2
    assert response.antennas[0].leg == "A"
    assert session.calls[1][1] == {"site_id": "SITE001"}
    assert "tower_hight" in session.calls[1][0]
    assert "sector_base::text AS sector" in session.calls[1][0]
    assert "enodeb_ci::text AS enodeb_ci" in session.calls[1][0]
    assert response.antennas[0].cids == ["11", "12"]


@pytest.mark.asyncio
async def test_configuration_fallback_never_references_missing_schema_columns():
    from routers.tower_plan import get_tower_plan_site_configuration

    session = SequencedSession(
        [{"column_name": "sector_base"}],
        [],
    )

    response = await get_tower_plan_site_configuration(
        site_id="SITE404",
        session=session,
    )

    assert response.source_columns.tower_height is None
    assert response.source_columns.sector == "sector_base"
    assert response.tower_height.status == "missing"
    assert "tower_hight" not in session.calls[1][0]
    assert " sector " not in session.calls[1][0].lower()
    assert "NULL::double precision AS tower_height" in session.calls[1][0]
    assert "sector_base::text AS sector" in session.calls[1][0]
    assert "NULL::text AS enodeb_ci" in session.calls[1][0]


def test_ai_capabilities_are_disabled_by_default(authenticated_client, monkeypatch):
    monkeypatch.delenv("TOWER_PLAN_AI_ENABLED", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = authenticated_client.get("/api/v1/tower-plan/ai-capabilities")

    assert response.status_code == 200
    assert response.json() == {
        "enabled": False,
        "model": "gpt-image-2",
        "qualities": ["draft", "final"],
        "request_limit_per_hour": 5,
    }


def test_ai_generation_rejects_sensitive_extra_fields(authenticated_client, monkeypatch):
    monkeypatch.setenv("TOWER_PLAN_AI_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-openai-key")

    response = authenticated_client.post(
        "/api/v1/tower-plan/ai-visualizations",
        headers={"Origin": TEST_ORIGIN},
        json={
            "mode": "draft",
            "tower_height_m": 50,
            "leg_a_bearing_deg": 45,
            "visual_style": "Technical Blueprint",
            "revision_instruction": "",
            "antennas": [],
            "site_id": "SECRET-SITE",
        },
    )

    assert response.status_code == 422


def test_ai_generation_returns_png_from_server_side_adapter(
    authenticated_client,
    monkeypatch,
    mocker,
):
    monkeypatch.setenv("TOWER_PLAN_AI_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-only-openai-key")
    generate = mocker.patch(
        "routers.tower_plan.generate_ai_image",
        new_callable=AsyncMock,
        return_value=b"\x89PNG\r\n\x1a\nimage",
    )

    response = authenticated_client.post(
        "/api/v1/tower-plan/ai-visualizations",
        headers={"Origin": TEST_ORIGIN},
        json={
            "mode": "final",
            "tower_height_m": 50,
            "leg_a_bearing_deg": 45,
            "visual_style": "Technical Blueprint",
            "revision_instruction": "",
            "antennas": [],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")
    request = generate.await_args.args[0]
    assert request.mode == "final"
