import {
  FOUR_LEG_TOWER,
  MONOPOLE_TOWER,
  THREE_LEG_TOWER,
} from './towerPlanState.js';

export const TOWER_DRAWING_LAYOUT = {
  canvasWidth: 1900,
  canvasHeight: 1200,
  drawingCenterX: 700,
  towerCenterX: 700,
  towerBaseY: 1080,
  towerVerticalSpan: 880,
  heightDimensionCorridorRight: 175,
  towerEnvelopeRight: 880,
  sidebarDividerX: 1285,
  calloutColumns: {
    left: { x: 190, width: 280, elbowX: 490 },
    right: { x: 920, width: 320, elbowX: 895 },
  },
  sidebar: {
    siteData: { x: 1330, y: 150, width: 520, height: 130 },
    legend: { x: 1330, y: 302, width: 520, height: 70 },
  },
  helicopterPanel: {
    x: 1330,
    y: 398,
    width: 520,
    height: 420,
  },
  notePanel: {
    x: 1330,
    y: 842,
    width: 520,
    minHeight: 92,
    maxHeight: 358,
    headerHeight: 32,
    lineHeight: 14,
  },
};

const FOUR_LEG_FEET = [
  { id: 'A', x: 1, z: -1 },
  { id: 'B', x: 1, z: 1 },
  { id: 'C', x: -1, z: 1 },
  { id: 'D', x: -1, z: -1 },
];

const THREE_LEG_FEET = [
  { id: 'A', x: 0, z: -1.15 },
  { id: 'B', x: 1.08, z: 0.8 },
  { id: 'C', x: -1.08, z: 0.8 },
];

const MONOPOLE_SIDES = [
  { id: 'A', x: 0, z: -0.24 },
  { id: 'B', x: 0.24, z: 0 },
  { id: 'C', x: 0, z: 0.24 },
  { id: 'D', x: -0.24, z: 0 },
];

const GEOMETRIES = {
  [FOUR_LEG_TOWER]: {
    structureKind: 'lattice-four',
    feet: FOUR_LEG_FEET,
    installationPoints: FOUR_LEG_FEET,
    positions: ['A', 'B', 'C', 'D'],
    interval: 90,
  },
  [THREE_LEG_TOWER]: {
    structureKind: 'lattice-three',
    feet: THREE_LEG_FEET,
    installationPoints: THREE_LEG_FEET,
    positions: ['A', 'B', 'C'],
    interval: 120,
  },
  [MONOPOLE_TOWER]: {
    structureKind: 'monopole',
    feet: [{ id: 'BASE', x: 0, z: 0 }],
    installationPoints: MONOPOLE_SIDES,
    positions: ['A', 'B', 'C', 'D'],
    interval: 90,
  },
};

export function getTowerGeometry(towerType) {
  const geometry = GEOMETRIES[towerType] || GEOMETRIES[FOUR_LEG_TOWER];
  return {
    ...geometry,
    feet: geometry.feet.map((foot) => ({ ...foot })),
    installationPoints: geometry.installationPoints.map((point) => ({ ...point })),
    positions: [...geometry.positions],
    towerCenterX: TOWER_DRAWING_LAYOUT.towerCenterX,
    towerEnvelopeRight: TOWER_DRAWING_LAYOUT.towerEnvelopeRight,
    sidebar: {
      siteData: { ...TOWER_DRAWING_LAYOUT.sidebar.siteData },
      legend: { ...TOWER_DRAWING_LAYOUT.sidebar.legend },
    },
    helicopterPanel: { ...TOWER_DRAWING_LAYOUT.helicopterPanel },
    notePanel: { ...TOWER_DRAWING_LAYOUT.notePanel },
  };
}
