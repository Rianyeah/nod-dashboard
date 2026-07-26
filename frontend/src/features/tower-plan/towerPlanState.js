export const MAX_ANTENNAS = 16;
export const TOWER_PLAN_SCHEMA_VERSION = 6;
export const TOWER_PLAN_TEMPLATE_VERSION = 'tower-plan-multi-type-v2';
export const FOUR_LEG_TOWER = 'Four-leg lattice tower';
export const THREE_LEG_TOWER = 'Three-leg lattice tower';
export const MONOPOLE_TOWER = 'Monopole';
export const TOWER_TYPES = [FOUR_LEG_TOWER, THREE_LEG_TOWER, MONOPOLE_TOWER];
export const TOWER_TYPE_CONFIG = {
  [FOUR_LEG_TOWER]: {
    positions: ['A', 'B', 'C', 'D'],
    interval: 90,
    label: 'Installation leg',
  },
  [THREE_LEG_TOWER]: {
    positions: ['A', 'B', 'C'],
    interval: 120,
    label: 'Installation leg',
  },
  [MONOPOLE_TOWER]: {
    positions: ['A', 'B', 'C', 'D'],
    interval: 90,
    label: 'Mounting side',
  },
};

export const STATUS_COLORS = {
  Existing: '#334155',
  New: '#1769e0',
  Relocation: '#d97706',
  Dismantle: '#b42318',
};

const VALID_STATUSES = new Set(Object.keys(STATUS_COLORS));

function makeId() {
  return globalThis.crypto?.randomUUID?.()
    || `antenna-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAzimuth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return ((parsed % 360) + 360) % 360;
}

function naturalCompare(left, right) {
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function normalizeCids(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[,;&]+/);
  return [...new Set(values.map((cid) => String(cid).trim()).filter(Boolean))]
    .sort(naturalCompare);
}

export function installationForAzimuth(towerType, azimuth) {
  const config = TOWER_TYPE_CONFIG[towerType] || TOWER_TYPE_CONFIG[FOUR_LEG_TOWER];
  const normalized = normalizeAzimuth(azimuth);
  if (normalized === null) return config.positions[0];
  const index = Math.max(0, Math.ceil(normalized / config.interval) - 1);
  return config.positions[Math.min(index, config.positions.length - 1)];
}

export function createBlankTowerPlan() {
  return {
    schemaVersion: TOWER_PLAN_SCHEMA_VERSION,
    promptTemplateVersion: TOWER_PLAN_TEMPLATE_VERSION,
    planTitle: '',
    siteName: '',
    towerType: FOUR_LEG_TOWER,
    towerHeight: 50,
    legABearingDeg: 45,
    visualStyle: 'Clean Engineering Infographic',
    customStyle: '',
    antennas: [],
    source: null,
  };
}

function normalizeAntenna(antenna = {}, index = 0, towerType = FOUR_LEG_TOWER) {
  const status = VALID_STATUSES.has(antenna.status) ? antenna.status : 'Existing';
  const cids = normalizeCids(antenna.cids ?? antenna.cid);
  const azimuth = numeric(antenna.azimuth, 0);
  return {
    id: antenna.id || makeId(),
    name: String(antenna.name || `Antenna ${index + 1}`),
    operator: String(antenna.operator || ''),
    status,
    sector: String(antenna.sector ?? index + 1),
    height: numeric(antenna.height, 0),
    azimuth,
    cids,
    cid: cids.join(', '),
    leg: installationForAzimuth(towerType, azimuth),
    color: /^#[0-9a-f]{6}$/i.test(antenna.color || '')
      ? antenna.color
      : STATUS_COLORS[status],
    note: String(antenna.note || ''),
    source: antenna.source ? structuredClone(antenna.source) : null,
  };
}

export function migrateTowerPlan(raw) {
  const base = createBlankTowerPlan();
  if (!raw || typeof raw !== 'object') return base;
  const towerType = TOWER_TYPES.includes(raw.towerType)
    ? raw.towerType
    : FOUR_LEG_TOWER;
  const antennas = Array.isArray(raw.antennas)
    ? raw.antennas
      .slice(0, MAX_ANTENNAS)
      .map((antenna, index) => normalizeAntenna(antenna, index, towerType))
    : [];
  return {
    ...base,
    ...raw,
    schemaVersion: TOWER_PLAN_SCHEMA_VERSION,
    promptTemplateVersion: TOWER_PLAN_TEMPLATE_VERSION,
    planTitle: String(raw.planTitle || ''),
    siteName: String(raw.siteName || ''),
    towerType,
    towerHeight: numeric(raw.towerHeight, 50),
    legABearingDeg: numeric(raw.legABearingDeg, 45),
    antennas,
    source: raw.source && typeof raw.source === 'object'
      ? structuredClone(raw.source)
      : null,
  };
}

export function buildAutofillDraft(configuration, towerType = FOUR_LEG_TOWER) {
  const siteName = String(configuration?.site_id || '').trim().toUpperCase();
  const towerHeight = configuration?.tower_height?.status === 'available'
    ? numeric(configuration.tower_height.value_m, '')
    : '';
  const sourceAntennas = Array.isArray(configuration?.antennas)
    ? configuration.antennas
    : [];
  return {
    siteName,
    planTitle: siteName ? `TOWER PLAN ${siteName}` : '',
    towerHeight,
    towerHeightStatus: configuration?.tower_height?.status || 'missing',
    towerHeightValues: [...(configuration?.tower_height?.values_m || [])],
    sourceColumns: { ...(configuration?.source_columns || {}) },
    warnings: [...(configuration?.warnings || [])],
    antennas: sourceAntennas.map((antenna, index) => {
      const azimuthConflict = Boolean(antenna.azimuth_conflict);
      const hasAzimuth = !azimuthConflict
        && antenna.azimuth_deg !== null
        && antenna.azimuth_deg !== ''
        && Number.isFinite(Number(antenna.azimuth_deg));
      const azimuth = hasAzimuth ? Number(antenna.azimuth_deg) : '';
      const cids = normalizeCids(antenna.cids);
      return {
        id: antenna.group_key || makeId(),
        name: String(antenna.name || `Antenna ${index + 1}`),
        operator: '',
        status: 'Existing',
        sector: String(antenna.sector ?? ''),
        height: numeric(antenna.height_m, 0),
        azimuth,
        cids,
        cid: cids.join(', '),
        leg: hasAzimuth ? installationForAzimuth(towerType, azimuth) : '',
        azimuthConflict,
        azimuthValues: [...(antenna.azimuth_values_deg || [])],
        color: STATUS_COLORS.Existing,
        note: '',
        selected: true,
        source: {
          groupKey: antenna.group_key || null,
          antennaModel: antenna.antenna_model || null,
          cellCount: numeric(antenna.cell_count, 0),
          cellNames: [...(antenna.cell_names || [])],
          bands: [...(antenna.bands || [])],
          technologies: [...(antenna.technologies || [])],
          cells: structuredClone(antenna.cells || []),
        },
      };
    }),
  };
}

export function buildAutofillWarnings(draft) {
  const warnings = [...(draft?.warnings || [])];
  const hasTowerHeightWarning = warnings.some((warning) => (
    String(warning).toLowerCase().includes('tower_hight')
  ));
  if (draft?.towerHeightStatus === 'missing' && !hasTowerHeightWarning) {
    warnings.unshift('`tower_hight` belum tersedia; masukkan tinggi tower manual.');
  }
  if (draft?.towerHeightStatus === 'conflict') {
    warnings.unshift(
      `Ditemukan nilai tower berbeda: ${(draft.towerHeightValues || []).join(', ')} m.`,
    );
  }
  return [...new Set(warnings)];
}

export function validateAutofillDraft(draft) {
  const errors = [];
  const towerHeight = Number(draft?.towerHeight);
  const selected = (draft?.antennas || []).filter((antenna) => antenna.selected);
  if (!draft?.siteName?.trim()) errors.push('Site ID wajib diisi.');
  if (!(towerHeight > 0)) errors.push('Tinggi tower wajib diisi dengan nilai valid.');
  if (!selected.length) errors.push('Pilih minimal satu antena.');
  if (selected.length > MAX_ANTENNAS) {
    errors.push(`Pilih maksimal ${MAX_ANTENNAS} antena fisik.`);
  }
  selected.forEach((antenna, index) => {
    if (antenna.azimuthConflict || antenna.azimuth === '') {
      errors.push(`Antenna ${index + 1}: azimuth konflik wajib diselesaikan.`);
    }
    if (!TOWER_TYPE_CONFIG[FOUR_LEG_TOWER].positions.includes(antenna.leg)) {
      errors.push(`Antenna ${index + 1}: posisi instalasi wajib diisi.`);
    }
    if (!String(antenna.sector || '').trim()) {
      errors.push(`Antenna ${index + 1}: sector wajib diisi.`);
    }
    if (!(Number(antenna.height) >= 0) || Number(antenna.height) > towerHeight) {
      errors.push(`Antenna ${index + 1}: tinggi melebihi tinggi tower.`);
    }
  });
  return errors;
}

export function applyAutofillDraft(state, draft) {
  const selectedAntennas = draft.antennas
    .filter((antenna) => antenna.selected)
    .map((antenna, index) => normalizeAntenna(
      Object.fromEntries(Object.entries(antenna).filter(([key]) => key !== 'selected')),
      index,
      state.towerType,
    ));
  return {
    ...state,
    planTitle: draft.planTitle.trim(),
    siteName: draft.siteName.trim().toUpperCase(),
    towerHeight: Number(draft.towerHeight),
    antennas: selectedAntennas,
    source: {
      provider: 'ransys_gabungan',
      siteId: draft.siteName.trim().toUpperCase(),
      sourceColumns: { ...draft.sourceColumns },
      importedAt: new Date().toISOString(),
    },
  };
}

export function updateAntenna(state, antennaId, changes) {
  return {
    ...state,
    antennas: state.antennas.map((antenna) => {
      if (antenna.id !== antennaId) return antenna;
      const nextStatus = changes.status || antenna.status;
      const nextAzimuth = Object.hasOwn(changes, 'azimuth')
        ? changes.azimuth
        : antenna.azimuth;
      const nextCids = Object.hasOwn(changes, 'cids')
        ? normalizeCids(changes.cids)
        : normalizeCids(changes.cid ?? antenna.cids ?? antenna.cid);
      return {
        ...antenna,
        ...changes,
        cids: nextCids,
        cid: nextCids.join(', '),
        leg: Object.hasOwn(changes, 'azimuth')
          ? installationForAzimuth(state.towerType, nextAzimuth)
          : antenna.leg,
        azimuthConflict: Object.hasOwn(changes, 'azimuth')
          ? false
          : Boolean(antenna.azimuthConflict),
        color: changes.status && !changes.color
          ? STATUS_COLORS[nextStatus]
          : (changes.color || antenna.color),
      };
    }),
  };
}

export function changeTowerType(state, towerType) {
  const nextTowerType = TOWER_TYPES.includes(towerType) ? towerType : FOUR_LEG_TOWER;
  return {
    ...state,
    towerType: nextTowerType,
    antennas: state.antennas.map((antenna) => ({
      ...antenna,
      leg: installationForAzimuth(nextTowerType, antenna.azimuth),
    })),
  };
}

export function addAntenna(state) {
  if (state.antennas.length >= MAX_ANTENNAS) return state;
  const number = state.antennas.length + 1;
  return {
    ...state,
    antennas: [
      ...state.antennas,
      normalizeAntenna({
        id: makeId(),
        name: `New Antenna Sec ${number}`,
        status: 'New',
        sector: String(number),
        height: '',
        azimuth: '',
        leg: 'A',
      }, number - 1, state.towerType),
    ],
  };
}

export function duplicateAntenna(state, antennaId) {
  if (state.antennas.length >= MAX_ANTENNAS) return state;
  const source = state.antennas.find((antenna) => antenna.id === antennaId);
  if (!source) return state;
  const copy = normalizeAntenna({
    ...source,
    id: makeId(),
    name: `${source.name} Copy`,
    source: source.source ? structuredClone(source.source) : null,
  }, state.antennas.length, state.towerType);
  return { ...state, antennas: [...state.antennas, copy] };
}

export function removeAntenna(state, antennaId) {
  return {
    ...state,
    antennas: state.antennas.filter((antenna) => antenna.id !== antennaId),
  };
}

export function sortAntennas(state) {
  return {
    ...state,
    antennas: [...state.antennas].sort((a, b) => (
      Number(b.height) - Number(a.height)
      || String(a.sector).localeCompare(String(b.sector), undefined, { numeric: true })
      || String(a.name).localeCompare(String(b.name))
    )),
  };
}

export function validateTowerPlan(state) {
  const errors = [];
  const towerHeight = Number(state.towerHeight);
  const bearing = Number(state.legABearingDeg);
  if (!state.planTitle.trim()) errors.push('Plan title wajib diisi.');
  if (!state.siteName.trim()) errors.push('Site ID wajib diisi.');
  if (!TOWER_TYPES.includes(state.towerType)) errors.push('Tower type tidak didukung.');
  if (!(towerHeight > 0)) errors.push('Tinggi tower harus lebih besar dari 0.');
  if (!Number.isFinite(bearing) || bearing < 0 || bearing >= 360) {
    errors.push('Leg A bearing harus berada pada 0–359,9°.');
  }
  if (state.antennas.length > MAX_ANTENNAS) {
    errors.push(`Maksimal ${MAX_ANTENNAS} antena.`);
  }

  const cids = new Set();
  const validPositions = TOWER_TYPE_CONFIG[state.towerType]?.positions || [];
  state.antennas.forEach((antenna, index) => {
    const height = Number(antenna.height);
    const azimuth = Number(antenna.azimuth);
    if (!antenna.name.trim()) errors.push(`Antenna ${index + 1}: nama wajib diisi.`);
    if (!(height >= 0) || height > towerHeight) {
      errors.push(`Antenna ${index + 1}: tinggi melebihi tinggi tower.`);
    }
    if (!Number.isFinite(azimuth) || azimuth < 0 || azimuth >= 360) {
      errors.push(`Antenna ${index + 1}: azimuth harus 0–359,9°.`);
    }
    if (!validPositions.includes(antenna.leg)) {
      errors.push(`Antenna ${index + 1}: posisi instalasi tidak valid.`);
    }
    normalizeCids(antenna.cids ?? antenna.cid).forEach((cid) => {
      if (cids.has(cid)) errors.push(`CID ${cid} digunakan lebih dari sekali.`);
      cids.add(cid);
    });
  });
  return errors;
}

export function buildAiPayload(state, mode = 'draft', revisionInstruction = '') {
  return {
    mode,
    tower_height_m: Number(state.towerHeight),
    leg_a_bearing_deg: Number(state.legABearingDeg),
    visual_style: state.visualStyle === 'Custom Style' && state.customStyle.trim()
      ? state.customStyle.trim()
      : state.visualStyle,
    revision_instruction: revisionInstruction,
    antennas: state.antennas.map((antenna) => ({
      status: antenna.status,
      height_m: Number(antenna.height),
      azimuth_deg: Number(antenna.azimuth),
      leg: antenna.leg,
      color: antenna.color,
    })),
  };
}

export function buildEngineeringPrompt(state, revisionInstruction = '') {
  return [
    `TEMPLATE: ${TOWER_PLAN_TEMPLATE_VERSION}`,
    `TARGET: deterministic ${state.towerType} planning drawing`,
    `TITLE: ${state.planTitle}`,
    `SITE: ${state.siteName}`,
    `TOWER: ${state.towerType}, ${Number(state.towerHeight).toFixed(1)} m`,
    `LEG A BEARING: ${Number(state.legABearingDeg).toFixed(1)} degrees`,
    'ANTENNAS:',
    JSON.stringify(state.antennas.map((antenna) => ({
      name: antenna.name,
      status: antenna.status,
      sector: antenna.sector,
      heightM: Number(antenna.height),
      azimuthDeg: Number(antenna.azimuth),
      cids: normalizeCids(antenna.cids ?? antenna.cid),
      leg: antenna.leg,
      color: antenna.color,
    })), null, 2),
    `REVISION: ${revisionInstruction.trim() || 'None.'}`,
    'Use the deterministic SVG/PNG export as the approved engineering source.',
  ].join('\n');
}
