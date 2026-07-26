"""Validated contracts for the Tower Plan Generator."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


TowerPlanLeg = Literal["A", "B", "C", "D"]


class TowerPlanSourceColumns(BaseModel):
    tower_height: str | None = None
    sector: str | None = None


class TowerPlanTowerHeight(BaseModel):
    status: Literal["available", "missing", "conflict"]
    value_m: float | None = None
    values_m: list[float] = Field(default_factory=list)


class TowerPlanSourceCell(BaseModel):
    cell_name: str | None = None
    band: str | None = None
    technology: str | None = None
    ci: str | None = None
    enodeb_ci: str | None = None
    cid: str | None = None
    electrical_tilt: float | None = None
    mechanical_tilt: float | None = None
    beamwidth: float | None = None


class TowerPlanAntennaGroup(BaseModel):
    group_key: str
    name: str
    antenna_model: str
    sector: str
    height_m: float
    azimuth_deg: float | None = None
    leg: TowerPlanLeg | None = None
    azimuth_values_deg: list[float] = Field(default_factory=list)
    azimuth_conflict: bool = False
    cids: list[str] = Field(default_factory=list)
    status: Literal["Existing"] = "Existing"
    color: str = "#334155"
    cell_count: int
    cell_names: list[str] = Field(default_factory=list)
    bands: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    cells: list[TowerPlanSourceCell] = Field(default_factory=list)


class TowerPlanSiteSearchItem(BaseModel):
    site_id: str
    cell_count: int
    estimated_antenna_count: int


class TowerPlanSiteSearchResponse(BaseModel):
    items: list[TowerPlanSiteSearchItem]
    total: int


class TowerPlanSiteConfigurationResponse(BaseModel):
    site_id: str
    source_columns: TowerPlanSourceColumns
    tower_height: TowerPlanTowerHeight
    antennas: list[TowerPlanAntennaGroup]
    warnings: list[str] = Field(default_factory=list)


class TowerPlanAiCapabilities(BaseModel):
    enabled: bool
    model: str
    qualities: list[Literal["draft", "final"]]
    request_limit_per_hour: int


class TowerPlanAiAntenna(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["Existing", "New", "Relocation", "Dismantle"]
    height_m: float = Field(ge=0, le=500)
    azimuth_deg: float = Field(ge=0, lt=360)
    leg: TowerPlanLeg
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class TowerPlanAiRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["draft", "final"] = "draft"
    tower_height_m: float = Field(gt=0, le=500)
    leg_a_bearing_deg: float = Field(ge=0, lt=360)
    visual_style: str = Field(min_length=1, max_length=120)
    revision_instruction: str = Field(default="", max_length=500)
    antennas: list[TowerPlanAiAntenna] = Field(max_length=16)
