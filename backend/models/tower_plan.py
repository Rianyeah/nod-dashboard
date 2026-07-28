"""Validated contracts for the Tower Plan Generator."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


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
    electrical_tilt_deg: float | None = None
    electrical_tilt_conflict: bool = False
    mechanical_tilt_deg: float | None = None
    mechanical_tilt_conflict: bool = False
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
