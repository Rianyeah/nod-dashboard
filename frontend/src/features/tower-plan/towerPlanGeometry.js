import {
  FOUR_LEG_TOWER,
  MONOPOLE_TOWER,
  THREE_LEG_TOWER,
} from './towerPlanState.js';

export const TOWER_DRAWING_LAYOUT = {
  canvasWidth: 1200,
  canvasHeight: 1536,
  towerCenterX: 600,
  towerBaseY: 1190,
  towerVerticalSpan: 1015,
  heightDimensionCorridorRight: 170,
  towerEnvelopeRight: 770,
  calloutColumns: {
    left: { x: 180, width: 260, elbowX: 460 },
    right: { x: 820, width: 330, elbowX: 800 },
  },
  footer: {
    y: 1320,
    siteData: { x: 40, width: 360, height: 130 },
    legend: { x: 40, y: 1460, width: 360, height: 70 },
  },
  helicopterPanel: {
    x: 430,
    y: 1320,
    width: 730,
    height: 210,
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
    helicopterPanel: { ...TOWER_DRAWING_LAYOUT.helicopterPanel },
  };
}
