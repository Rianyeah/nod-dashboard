"""Ordered road corridors and distances in metres (WGS84 coordinates)."""

from bisect import bisect_left
from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Literal
from uuid import UUID, uuid4, uuid5

from pydantic import BaseModel, ConfigDict, Field, model_validator

RADIUS_M = 6_371_008.8


class Coordinates(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    lat: float = Field(ge=-85, le=85)
    lng: float = Field(ge=-180, le=180)


class Anchor(Coordinates):
    id: UUID = Field(default_factory=uuid4)
    label: str = Field(default="", max_length=150)
    vertex_index: int | None = Field(default=None, ge=0)


class Point(Coordinates):
    id: UUID = Field(default_factory=uuid4)
    label: str = Field(min_length=1, max_length=150)
    type: Literal["site", "tipus", "sambungan", "lainnya"]
    note: str = Field(default="", max_length=2000)
    from_anchor_id: UUID | None = None
    to_anchor_id: UUID | None = None
    station_m: float | None = Field(default=None, ge=0)


class Geometry(BaseModel):
    type: Literal["LineString"]
    coordinates: list[tuple[float, float]] = Field(min_length=2, max_length=30_000)

    @model_validator(mode="after")
    def valid_coordinates(self):
        if any(not (-180 <= lng <= 180 and -85 <= lat <= 85) for lng, lat in self.coordinates):
            raise ValueError("Koordinat trase tidak valid.")
        return self


class Route(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(min_length=1, max_length=150)
    start_site: str = Field(default="", max_length=150)
    end_site: str = Field(default="", max_length=150)
    area: str = Field(default="", max_length=150)
    pic: str = Field(default="", max_length=150)
    asset_ref: str = Field(default="", max_length=500)
    reference_distance: str = Field(default="", max_length=150)
    verification: Literal["pending", "field"] = "pending"
    source: Literal["road", "manual", "imported"] = "manual"
    geometry: Geometry
    anchors: list[Anchor] = Field(default_factory=list, max_length=1000)
    points: list[Point] = Field(min_length=2, max_length=1000)


def distance(a, b):
    lng1, lat1 = a
    lng2, lat2 = b
    h = sin(radians(lat2 - lat1) / 2) ** 2 + cos(radians(lat1)) * cos(
        radians(lat2)
    ) * sin(radians(lng2 - lng1) / 2) ** 2
    return 2 * RADIUS_M * asin(sqrt(min(1.0, max(0.0, h))))


def stations(coords):
    result = [0.0]
    for a, b in zip(coords, coords[1:]):
        result.append(result[-1] + distance(a, b))
    return result


def make_anchors(route, vertices):
    anchors = route.anchors
    if not anchors:
        anchors = [
            Anchor(id=uuid5(route.id, name), label=name, lng=vertices[index][0],
                   lat=vertices[index][1], vertex_index=index)
            for name, index in (("Awal", 0), ("Akhir", len(vertices) - 1))
        ]
    if len(anchors) < 2 or len({a.id for a in anchors}) != len(anchors):
        raise ValueError("Gunakan sedikitnya dua titik belok dengan ID berbeda.")
    indices = []
    for i, a in enumerate(anchors):
        index = a.vertex_index if a.vertex_index is not None else i
        if a.vertex_index is None and len(vertices) != len(anchors):
            raise ValueError("Tentukan posisi setiap titik belok pada garis trase.")
        if index >= len(vertices) or (indices and index <= indices[-1]):
            raise ValueError("Urutan titik belok tidak cocok dengan trase.")
        indices.append(index)
    if indices[0] != 0 or indices[-1] != len(vertices) - 1:
        raise ValueError("Titik belok awal dan akhir harus berada di ujung trase.")
    return [dict(a.model_dump(mode="json"), vertex_index=i) for a, i in zip(anchors, indices)]


@dataclass(frozen=True)
class Projection:
    station: float
    offset: float
    vertex: int


def project(raw, vertices, chain, first, last, hint=None):
    """Restrict projection to the selected leg; preserve the raw survey coordinate."""
    best = None
    ambiguous = False
    scale = cos(radians(raw[1]))
    for index in range(first, last):
        a, b = vertices[index:index + 2]
        dx, dy = (b[0] - a[0]) * scale, b[1] - a[1]
        denom = dx * dx + dy * dy
        t = 0 if denom == 0 else max(0, min(1, (
            (raw[0] - a[0]) * scale * dx + (raw[1] - a[1]) * dy
        ) / denom))
        offset = distance(raw, (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        station = chain[index] + t * (chain[index + 1] - chain[index])
        candidate = Projection(station, offset, index)
        if best is None or offset < best.offset - 0.01:
            best, ambiguous = candidate, False
        elif abs(offset - best.offset) <= 0.01 and abs(station - best.station) > 1:
            if hint is None or abs(abs(hint - station) - abs(hint - best.station)) < 1:
                ambiguous = True
            elif abs(hint - station) < abs(hint - best.station):
                best, ambiguous = candidate, False
    if ambiguous:
        raise ValueError("Lokasi menyentuh lebih dari satu bagian trase. Pilih sela titik belok.")
    return best


def prepare_route(payload):
    route = Route.model_validate(payload)
    vertices = route.geometry.coordinates
    chain = stations(vertices)
    if chain[-1] < 0.1:
        raise ValueError("Trase harus memiliki panjang positif.")
    anchors = make_anchors(route, vertices)
    lookup = {a["id"]: i for i, a in enumerate(anchors)}
    indices = [a["vertex_index"] for a in anchors]
    if len({p.id for p in route.points}) != len(route.points):
        raise ValueError("ID titik duplikat dalam satu jalur.")
    if route.points[0].type != "site" or route.points[-1].type != "site":
        raise ValueError("Titik awal dan akhir harus berupa site.")
    work, points = 0, []
    for i, point in enumerate(route.points):
        raw = (point.lng, point.lat)
        if i in (0, len(route.points) - 1):
            start = i == 0
            idx = 0 if start else len(vertices) - 1
            leg = 0 if start else len(anchors) - 2
            snap = Projection(chain[idx], distance(raw, vertices[idx]), idx)
        else:
            first, last = 0, len(vertices) - 1
            if point.from_anchor_id is not None or point.to_anchor_id is not None:
                a, b = lookup.get(str(point.from_anchor_id)), lookup.get(str(point.to_anchor_id))
                if a is None or b != a + 1:
                    raise ValueError(f"Pilih ulang sela trase untuk {point.label}.")
                first, last = indices[a], indices[b]
            work += last - first
            if work > 2_000_000:
                raise ValueError("Pilih sela titik belok untuk membatasi area pencarian titik.")
            snap = project(raw, vertices, chain, first, last, point.station_m)
            leg = max(0, bisect_left(indices, snap.vertex + 1) - 1)
        points.append(dict(point.model_dump(mode="json"), station_m=snap.station, offset_m=snap.offset,
                           from_anchor_id=anchors[leg]["id"], to_anchor_id=anchors[leg + 1]["id"]))
    points.sort(key=lambda p: p["station_m"])
    for i, point in enumerate(points):
        point["segment_m"] = point["station_m"] - (points[i - 1]["station_m"] if i else 0)
        point["position"] = i
        point["photo_count"] = 0
    result = route.model_dump(mode="json", exclude={"points","anchors"})
    result.update(points=points, anchors=anchors, length_m=chain[-1],
                  start_site=route.start_site or points[0]["label"],
                  end_site=route.end_site or points[-1]["label"])
    return result
