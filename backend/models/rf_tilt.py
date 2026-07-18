"""
Pydantic models for RF Tilt Analysis feature.
"""
from typing import List, Optional, Literal, Dict, Any

from pydantic import BaseModel, Field, model_validator


# --- Site search models ---

class RfTiltSiteItem(BaseModel):
    site_id: str
    cell_name: Optional[str] = None
    sector_base: Optional[str] = None
    band: Optional[str] = None
    latitude: float
    longitude: float
    azimuth: Optional[float] = None
    electrical_tilt: Optional[float] = None
    mechanical_tilt: Optional[float] = None
    antenna_height: Optional[float] = None
    beamwidth: Optional[float] = None
    antenna_type: Optional[str] = None


class RfTiltSiteSearchResponse(BaseModel):
    items: List[RfTiltSiteItem]
    total: int


# --- Antenna spec models ---

class AntennaSpecResponse(BaseModel):
    """Full antenna specification from antenna_specs table."""
    antenna_model: str
    vendor: Optional[str] = None
    series: Optional[str] = None
    antenna_type_enum: Optional[str] = None
    frequency_low_mhz: Optional[int] = None
    frequency_high_mhz: Optional[int] = None
    frequency_bands: Optional[str] = None
    gain_dbi_by_band: Optional[Dict[str, float]] = None
    vertical_beamwidth_by_band: Optional[Dict[str, float]] = None
    horizontal_beamwidth: Optional[float] = None
    electrical_tilt_min: Optional[float] = None
    electrical_tilt_max: Optional[float] = None
    ports: Optional[int] = None
    weight_kg: Optional[float] = None
    height_mm: Optional[float] = None
    width_mm: Optional[float] = None
    depth_mm: Optional[float] = None
    connector_type: Optional[str] = None
    source_url: Optional[str] = None
    matched: bool = Field(True, description="True if exact model match found, False if generic/fallback")
    match_method: Optional[str] = Field(None, description="exact, fuzzy, or generic_fallback")


class AntennaModelListItem(BaseModel):
    antenna_model: str
    vendor: Optional[str] = None
    series: Optional[str] = None
    frequency_bands: Optional[str] = None
    ports: Optional[int] = None
    connector_type: Optional[str] = None
    frequency_low_mhz: Optional[int] = None
    frequency_high_mhz: Optional[int] = None


class AntennaModelListResponse(BaseModel):
    items: List[AntennaModelListItem]
    total: int


class AntennaReference(BaseModel):
    """Antenna reference data returned in TiltAnalysisResponse."""
    antenna_model: Optional[str] = None
    series: Optional[str] = None
    vendor: Optional[str] = None
    frequency_mhz: int
    gain_dbi: Optional[float] = None
    vertical_beamwidth_deg: Optional[float] = None
    horizontal_beamwidth_deg: Optional[float] = None
    matched: bool = Field(False, description="True if matched to scraped spec, False if generic fallback")
    match_method: Optional[str] = Field(None, description="exact, fuzzy, or generic_fallback")
    source_url: Optional[str] = None
    note: Optional[str] = None


# --- Analysis request / response models ---

class ClutterPoint(BaseModel):
    distance: float = Field(..., ge=0, description="Meters along the azimuth from the site")
    height: float = Field(..., ge=0, description="Extra height (m) above ground at this point")


class TiltAnalysisRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    azimuth: float = Field(..., ge=0, le=360, description="Degrees, 0 = North")
    antenna_height: float = Field(..., gt=0, description="Meters above ground")
    mechanical_tilt: float = Field(0.0, description="Degrees, positive = downtilt")
    electrical_tilt: float = Field(0.0, description="Degrees, positive = downtilt")
    vertical_beamwidth: float = Field(..., gt=0, description="Degrees")
    horizontal_beamwidth: float = Field(65.0, gt=0, le=360, description="Degrees")
    max_distance: float = Field(2000.0, gt=0, le=50_000, description="Meters")
    sample_interval: float = Field(30.0, ge=10, description="Meters between DEM samples")
    frequency_mhz: Literal[900, 1800, 2100, 2300] = Field(
        1800, description="Carrier frequency band"
    )
    antenna_series: Optional[Literal["AQU", "APE", "ASI", "ADU", "ATR"]] = Field(
        None, description="Huawei antenna product line, for reference/reporting only"
    )
    antenna_type: Optional[str] = Field(
        None, description="Raw antenna_type from ransys_gabungan; used to look up scraped specs"
    )
    fresnel_clearance_pct: float = Field(
        60.0, gt=0, le=100, description="Required % of first Fresnel zone clearance"
    )
    target_latitude: Optional[float] = Field(
        None, ge=-90, le=90, description="If set with target_longitude, switches to point-to-point mode"
    )
    target_longitude: Optional[float] = Field(None, ge=-180, le=180)
    target_height: float = Field(
        1.5, ge=0, description="Height (m) above ground at the target point"
    )
    dem_source: Literal["opentopography", "open_meteo"] = Field(
        "open_meteo", description="opentopography = 30m DSM; open_meteo = 90m bare terrain"
    )
    clutter: List[ClutterPoint] = Field(
        default_factory=list,
        max_length=200,
        description="Optional building heights to overlay on terrain",
    )

    @model_validator(mode="after")
    def target_coordinates_are_paired(self):
        if (self.target_latitude is None) != (self.target_longitude is None):
            raise ValueError("target_latitude and target_longitude must be provided together")
        return self


class ProfilePoint(BaseModel):
    distance: float
    elevation: float


class BeamResult(BaseModel):
    angle_deg: float
    profile: List[ProfilePoint]
    impact_distance: Optional[float]
    fresnel_clear_distance: Optional[float] = Field(
        None, description="Distance at which physical clearance first drops below the required Fresnel %"
    )


class TiltAnalysisResponse(BaseModel):
    site_elevation: float
    total_tilt: float
    dem_source_used: str
    frequency_mhz: int
    wavelength_m: float
    fresnel_clearance_pct: float
    antenna_reference: Optional[AntennaReference] = None
    azimuth_used: float
    max_distance_used: float
    terrain_profile: List[ProfilePoint]
    main_beam: BeamResult
    upper_beam: BeamResult
    lower_beam: BeamResult
    sector_polygon: List[List[float]]
    footprint_polygon: List[List[float]]
    near_m: Optional[float]
    main_m: Optional[float]
    far_m: Optional[float]
    practical_main_m: Optional[float] = Field(
        None, description="Realistic usable distance on the main beam once Fresnel-zone diffraction is accounted for"
    )
    link: Optional["LinkAnalysis"] = Field(
        None, description="Present only when target_latitude/target_longitude were provided"
    )


class LinkAnalysis(BaseModel):
    target_latitude: float
    target_longitude: float
    distance_m: float
    azimuth_deg: float
    target_elevation: float
    target_height: float
    profile: List[ProfilePoint]
    los_clear: bool
    los_obstruction_distance: Optional[float]
    fresnel_clear: bool
    fresnel_obstruction_distance: Optional[float]


TiltAnalysisResponse.model_rebuild()
