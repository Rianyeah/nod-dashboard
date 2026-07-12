/* ═══════════════════════════════════════════════════════════════════════
   Shared colour palette for RF Tilt Analysis
   Used by: RfTiltChart, RfTiltMap, RfTiltResultPanel
   ═══════════════════════════════════════════════════════════════════════ */

export const RF_COLORS = {
  /* Terrain (earthy soil pastel) */
  terrainFillTop:    '#a0785a',   // warm sienna
  terrainFillBottom: '#6b4f3a',   // deep earth brown
  terrainStroke:     '#c4a882',   // sandy outline

  /* Beams */
  main:   '#22d3ee',   // cyan — main beam / LOS
  upper:  '#facc15',   // amber — upper beam
  lower:  '#f87171',   // soft red — lower beam

  /* Impact markers (on map + result panel) — same as beam colours */
  impactLower:  '#f87171',
  impactMain:   '#22d3ee',
  impactUpper:  '#facc15',
  fresnel:      '#fb923c',   // orange for fresnel

  /* Coverage map polygons */
  footprint: '#22d3ee',     // cyan — RF footprint area
  sector:    '#facc15',     // amber — sector polygon

  /* P2P link */
  link: '#a78bfa',           // purple

  /* Misc */
  beacon: '#ef4444',         // red tip beacon
  towerStruct: '#cbd5e1',    // tower structure
  towerBrace:  '#94a3b8',    // cross braces
  towerDiag:   '#64748b',    // diagonals
};

/* ─── Chart configuration for shadcn ChartContainer ─────────────────── */

export const rfTiltChartConfig = {
  terrain:  { label: 'Terrain',          color: RF_COLORS.terrainStroke },
  main:     { label: 'Main Beam',        color: RF_COLORS.main },
  upper:    { label: 'Upper Beam',       color: RF_COLORS.upper },
  lower:    { label: 'Lower Beam',       color: RF_COLORS.lower },
  link:     { label: 'Link Line (P2P)',  color: RF_COLORS.link },
  towerTop: { label: 'Tower',            color: RF_COLORS.main },
};

/* ─── Frequency / Antenna constants ─────────────────────────────────── */

export const FREQUENCY_OPTIONS = [900, 1800, 2100, 2300];
export const ANTENNA_SERIES_OPTIONS = ['AQU', 'APE', 'ASI', 'ADU', 'ATR'];

export const TYPICAL_VBW_BY_BAND = {
  900: 14.0,
  1800: 7.5,
  2100: 6.5,
  2300: 5.5,
};

export const BAND_TO_FREQ_MHZ = {
  L900: 900,
  L1800: 1800,
  L2100: 2100,
  L2300: 2300,
};

export const DEFAULT_PARAMS = {
  latitude: -7.666314,
  longitude: 112.576138,
  azimuth: 180,
  antenna_height: 15,
  mechanical_tilt: 2,
  electrical_tilt: 0,
  vertical_beamwidth: 6,
  horizontal_beamwidth: 65,
  max_distance: 2000,
  sample_interval: 30,
  dem_source: 'open_meteo',
  frequency_mhz: 1800,
  antenna_series: 'AQU',
  antenna_type: null,
  fresnel_clearance_pct: 60,
  target_latitude: null,
  target_longitude: null,
  target_height: 1.5,
};
