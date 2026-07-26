import {
  FOUR_LEG_TOWER,
  MONOPOLE_TOWER,
  THREE_LEG_TOWER,
} from './towerPlanState.js';

export const TOWER_DRAWING_LAYOUT = {
  canvasWidth: 1024,
  canvasHeight: 1536,
  towerCenterX: 480,
  towerBaseY: 1190,
  towerVerticalSpan: 1015,
  towerEnvelopeRight: 660,
  helicopterPanel: {
    x: 730,
    y: 1030,
    width: 260,
    height: 350,
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
