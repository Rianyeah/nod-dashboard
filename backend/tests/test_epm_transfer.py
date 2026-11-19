import hashlib
import io
import json
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi import HTTPException

from services.epm_transfer import SEED_ID, portable, read_backup


def legacy_collection():
    return {
        "schema": "fo-route-collection",
        "version": 3,
        "routes": [{
            "id": "original",
            "name": "PSN053 → EPM139",
            "geometry": [{"lat": -7.8, "lng": 112.7}, {"lat": -7.8, "lng": 112.8}],
            "points": [
                {"id": "start", "type": "site", "label": "PSN053", "lat": -7.8, "lng": 112.7, "stationM": 0},
                {"id": "break", "type": "tipus", "label": "Tipus", "lat": -7.8, "lng": 112.73, "stationM": 3000},
                {"id": "end", "type": "site", "label": "EPM139", "lat": -7.8, "lng": 112.8, "stationM": 11000},
            ],
        }],
    }


def test_legacy_seed_identity_and_bare_break():
    collection = legacy_collection()
    route, = read_backup(io.BytesIO(json.dumps(collection).encode()), False)
    assert route["id"] == SEED_ID
    assert len(route["points"]) == 3
    assert route["incidents"] == []


def test_zip_validates_original_checksum_and_omits_storage_keys():
    route, = read_backup(io.BytesIO(json.dumps(legacy_collection()).encode()), False)
    image = b"test-original"
    identifier = str(uuid4())
    route["photos"] = [{
        "id": identifier,
        "point_id": route["points"][1]["id"],
        "incident_id": None,
        "size_bytes": len(image),
        "sha256": hashlib.sha256(image).hexdigest(),
        "object_prefix": "internal/path",
    }]
    collection = portable({"schema": "epm-route-collection", "version": 1, "routes": [route]})
    assert "object_prefix" not in collection["routes"][0]["photos"][0]

    def archive(data):
        buffer = io.BytesIO()
        with ZipFile(buffer, "w") as z:
            z.writestr("collection.json", json.dumps(collection))
            z.writestr(f"originals/{identifier}", data)
        return buffer

    assert len(read_backup(archive(image), True)[0]["photos"]) == 1
    with pytest.raises(HTTPException, match="Checksum"):
        read_backup(archive(b"x" * len(image)), True)
