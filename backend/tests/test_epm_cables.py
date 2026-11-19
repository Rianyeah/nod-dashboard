import io
import json
import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from services import epm_core, epm_transfer
from services.epm_cables import CableRequest, CableSave, cable_section, record_replacement
from services.epm_geometry import stations


def fixture_payload():
    coordinates = [[112.77, -7.84], [112.774, -7.84], [112.774, -7.845], [112.775, -7.852]]
    values = [
        ("PSN053", "site", 112.77, -7.84),
        ("Tipus 1", "tipus", 112.771, -7.84),
        ("Tipus 2", "tipus", 112.773, -7.84),
        ("Tipus 3", "tipus", 112.774, -7.843),
        ("Sambungan", "sambungan", 112.774, -7.844),
        ("Tipus 4", "tipus", 112.7743, -7.848),
        ("EPM139", "site", 112.775, -7.852),
    ]
    return dict(name="Jalur uji kabel", geometry=dict(type="LineString",coordinates=coordinates),
        points=[dict(id=str(uuid4()),label=label,type=kind,lng=lng,lat=lat) for label,kind,lng,lat in values])


def test_first_kilometre_lists_expected_faults_and_preserves_bend():
    route = {**epm_core.parse_route(fixture_payload()), "revision":1}
    request = CableRequest(origin_point_id=route["points"][0]["id"],length_m=1000,expected_revision=1)
    result = cable_section(route,request)
    assert [p["label"] for p in result["candidates"]]==["Tipus 1","Tipus 2","Tipus 3"]
    assert stations(result["geometry"]["coordinates"])[-1]==pytest.approx(1000, abs=.02)
    assert result["geometry"]["coordinates"][1]==route["geometry"]["coordinates"][1]
    assert result["end_m"]==1000
    reverse = request.model_copy(update=dict(origin_point_id=route["points"][3]["id"],direction="backward",length_m=200))
    backward = cable_section(route,reverse)
    assert backward["end_m"] < backward["start_m"]
    with pytest.raises(HTTPException,match="melebihi"):
        cable_section(route,request.model_copy(update={"length_m":5000}))
    with pytest.raises(HTTPException) as error:
        cable_section(route,request.model_copy(update={"expected_revision":2}))
    assert error.value.status_code==409


@pytest.mark.asyncio
async def test_record_only_retires_confirmed_candidates_and_keeps_incident():
    dsn=os.environ.get("EPM_TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("Requires a disposable database with EPM migrations")
    engine=create_async_engine(dsn)
    try:
        async with async_sessionmaker(engine)() as session:
            async with session.begin() as tx:
                route=await epm_core.create_route(session,fixture_payload())
                origin, retired, kept = route["points"][:3]
                event=await epm_core.create_incident(session,dict(route_id=route["id"],point_id=retired["id"],status="open",
                    started_at=datetime.now(timezone.utc),ticket="EPM-QA"))
                attrs=dict(origin_point_id=origin["id"],length_m=1000,expected_revision=route["revision"],
                    active_at=datetime.now(timezone.utc),incident_id=event["id"],note="Uji penarikan")
                with pytest.raises(HTTPException,match="termasuk kandidat"):
                    await record_replacement(session,route["id"],CableSave(**attrs,archive_point_ids=[origin["id"]]))
                saved=await record_replacement(session,route["id"],CableSave(**attrs,archive_point_ids=[retired["id"]]))
                updated=await epm_core.route_detail(session,route["id"])
                history=await epm_core.list_incidents(session,route_id=route["id"])
                remaining=[p["id"] for p in updated["points"]]
                assert retired["id"] not in remaining and kept["id"] in remaining
                assert updated["geometry"]==route["geometry"] and updated["length_m"]==route["length_m"]
                assert updated["cable_replacements"]==[saved]
                assert sum(p["segment_m"] for p in updated["points"])==pytest.approx(route["length_m"])
                assert [row["id"] for row in history]==[event["id"]]
                original=await epm_core.route_detail(session,route["id"],include_archived=True)
                backup=jsonable_encoder(dict(schema=epm_transfer.SCHEMA,version=1,
                    routes=[{**original,"incidents":history,"photos":[]}]))
                file=io.BytesIO(json.dumps(backup).encode())
                operation=uuid4()
                contents=epm_transfer.read_backup(file,False)
                assert await epm_transfer.restore(session,contents,file,False,True,operation,[])=={"created":1,"skipped":0}
                copied_id=epm_transfer.stable(f"{operation}/{route['id']}/{route['id']}")
                copied=await epm_core.route_detail(session,copied_id,include_archived=True)
                copied_points={p["label"]:p for p in copied["points"]}
                copied_event,=await epm_core.list_incidents(session,route_id=copied_id)
                replacement,=copied["cable_replacements"]
                assert replacement["geometry"]==saved["geometry"]
                assert replacement["origin_point_id"]==str(copied_points["PSN053"]["id"])
                assert replacement["incident_id"]==str(copied_event["id"])
                assert replacement["archived_point_ids"]==[str(copied_points["Tipus 1"]["id"])]
                assert copied_points["Tipus 1"]["archived_at"] is not None
                assert copied_points["Tipus 2"]["archived_at"] is None
                await tx.rollback()
    finally:
        await engine.dispose()
