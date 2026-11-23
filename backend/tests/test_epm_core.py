from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.epm_core import day_bounds, parse_incident, parse_route, revision_check


def route_fixture():
    # The first and last legs traverse the same road in opposite directions.
    coords = [[112.0,-7.8],[112.001,-7.8],[112.002,-7.8],[112.001,-7.8],[112.0,-7.8]]
    anchors = [dict(id=str(uuid4()),lng=coords[i][0],lat=coords[i][1],vertex_index=i)
               for i in (0,2,4)]
    points = [
        dict(id=str(uuid4()),label="Site awal",type="site",lng=112,lat=-7.8),
        dict(id=str(uuid4()),label="Tipus 1",type="tipus",lng=112.001,lat=-7.80001,
             from_anchor_id=anchors[1]["id"],to_anchor_id=anchors[2]["id"]),
        dict(id=str(uuid4()),label="EPM1",type="site",lng=112,lat=-7.8),
    ]
    return dict(id=str(uuid4()),name="Trase uji",geometry=dict(type="LineString",coordinates=coords),
                anchors=anchors,points=points)


def test_projection_stays_on_chosen_return_leg_and_retains_raw_location():
    raw = route_fixture()
    prepared = parse_route(raw)
    point = prepared["points"][1]
    assert point["station_m"] == pytest.approx(prepared["length_m"]*.75, abs=.001)
    assert point["lat"] == raw["points"][1]["lat"]
    assert 1 < point["offset_m"] < 2
    before = prepared["length_m"]
    extra = dict(raw["points"][1],id=str(uuid4()),lng=112.0005)
    raw["points"].insert(2,extra)
    result = parse_route(raw)
    assert result["geometry"] == prepared["geometry"] and result["length_m"] == before
    assert result["points"][2]["station_m"] > point["station_m"]
    assert sum(p["segment_m"] for p in result["points"]) == pytest.approx(before)


def test_projection_rejects_ambiguous_loop_and_deleted_anchors():
    data = route_fixture()
    data["points"][1].pop("from_anchor_id")
    data["points"][1].pop("to_anchor_id")
    with pytest.raises(HTTPException, match="lebih dari satu"):
        parse_route(data)
    data["points"][1]["from_anchor_id"] = str(uuid4())
    with pytest.raises(HTTPException, match="Pilih ulang sela"):
        parse_route(data)


def test_validation_rejects_invalid_route_and_mismatched_revision():
    raw = route_fixture()
    raw["geometry"]["coordinates"][1][1] = float("nan")
    with pytest.raises(HTTPException) as exc:
        parse_route(raw)
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException) as exc:
        revision_check(1,2)
    assert exc.value.status_code == 409


def test_remote_sector_is_valid_at_the_epm_endpoint():
    raw = route_fixture()
    raw["points"][-1]["type"] = "remote_sector"
    assert parse_route(raw)["points"][-1]["type"] == "remote_sector"
    raw["points"][1]["type"] = "remote_sector"
    with pytest.raises(HTTPException, match="titik akhir"):
        parse_route(raw)


def test_incident_dates_validate_completed_work_and_legacy_import():
    base = dict(route_id=uuid4(),point_id=uuid4(),status="resolved",started_at="2026-11-19T23:50:00+07:00")
    with pytest.raises(HTTPException):
        parse_incident(base)
    with pytest.raises(HTTPException):
        parse_incident({**base,"recovered_at":"2026-11-18T23:50:00+07:00"})
    done = parse_incident({**base,"recovered_at":"2026-11-20T00:10:00+07:00"})
    assert done["recovered_at"] - done["started_at"] == timedelta(minutes=20)
    assert day_bounds(date(2026,11,19)) <= done["started_at"] < day_bounds(date(2026,11,19), end=True)
    assert day_bounds(date(2026,11,19), end=True) < done["recovered_at"]
    assert parse_incident({**base,"started_at":None},legacy=True)["started_at"] is None


@pytest.mark.asyncio
async def test_real_postgres_inventory_history_and_archive():
    """Point EPM_TEST_DATABASE_URL at a disposable DB with all EPM migrations applied."""
    import os
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from services import epm_core as epm
    dsn = os.environ.get("EPM_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Disposable EPM test database was not supplied")
    engine = create_async_engine(dsn)
    try:
        async with async_sessionmaker(engine)() as session:
            async with session.begin() as transaction:
                seeded = await epm.route_detail(session,"051e7738-a501-5112-974e-b57f16b05195")
                assert seeded["length_m"] == pytest.approx(4433.872,abs=.001)
                assert [p["label"] for p in seeded["points"]][6:9] == ["Sambungan Km3","Tipus 4","Sambungan Km4"]
                assert len(seeded["points"]) == 10
                payload = route_fixture()
                row = await epm.create_route(session,payload)
                assert row["revision"] == 1 and row["points"][1]["photo_count"] == 0
                template = dict(route_id=row["id"],point_id=row["points"][1]["id"],status="open",
                                started_at="2026-11-19T23:50+07:00")
                first = await epm.create_incident(session,template)
                second = await epm.create_incident(session,dict(template,started_at="2026-11-20T00:01+07:00"))
                assert first["id"] != second["id"]
                await epm.update_incident(session, first["id"],dict(expected_revision=1,status="resolved",
                                            recovered_at="2026-11-20T00:10+07:00"))
                found = await epm.list_incidents(session,route_id=row["id"],date_to=date(2026,11,19))
                assert len(found)==1 and found[0]["duration_minutes"]==20
                updated = await epm.update_route(session,row["id"],dict(payload,name="Baru",expected_revision=1))
                assert updated["revision"] == 2
                with pytest.raises(HTTPException) as exc:
                    await epm.update_route(session,row["id"],dict(payload,expected_revision=1))
                assert exc.value.status_code == 409
                await epm.archive(session,"epm_routes",row["id"],2)
                history = await epm.list_incidents(session,route_id=row["id"])
                assert len(history) == 2
                assert next(i for i in history if i["id"]==second["id"])["status"]=="open"
                await transaction.rollback()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_real_postgres_photos_on_every_point_type(monkeypatch):
    import io
    import os

    from PIL import Image
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from services import epm_core as epm, epm_photos

    dsn = os.environ.get("EPM_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Disposable EPM test database was not supplied")
    raw = io.BytesIO()
    Image.new("RGB", (12, 12), "tomato").save(raw, "PNG")
    monkeypatch.setattr(epm_photos, "_write_variants", lambda *args: None)
    engine = create_async_engine(dsn)
    try:
        async with async_sessionmaker(engine)() as session:
            async with session.begin() as transaction:
                payload = route_fixture()
                middle = payload["points"][1]
                payload["points"][1:1] = [dict(middle, id=str(uuid4()), label=kind, type=kind)
                                           for kind in ("sambungan", "lainnya")]
                payload["points"][-1]["type"] = "remote_sector"
                route = await epm.create_route(session, payload)
                for point in route["points"]:
                    photo = await epm_photos.save_photo(session, photo_id=uuid4(), point_id=point["id"],
                        incident_id=None, caption=point["label"], raw=raw.getvalue())
                    assert photo["point_id"] == point["id"]
                middle["type"] = "sambungan"
                updated = await epm.update_route(session, route["id"], dict(payload, expected_revision=1))
                assert all(point["photo_count"] == 1 for point in updated["points"])
                assert next(point for point in updated["points"] if str(point["id"]) == middle["id"])["type"] == "sambungan"
                await transaction.rollback()
    finally:
        await engine.dispose()
