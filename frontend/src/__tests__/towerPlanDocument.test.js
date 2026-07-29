import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_NOTE_CHARACTERS,
  MAX_NOTE_LINES,
  documentBackgroundPrompt,
  normalizeDocumentSettings,
  resolveDocumentPalette,
  validateDocumentNote,
  wrapDocumentNote,
} from '../features/tower-plan/towerPlanDocument.js';
import {
  TOWER_PLAN_SCHEMA_VERSION,
  buildEngineeringPrompt,
  createBlankTowerPlan,
  migrateTowerPlan,
  validateTowerPlan,
} from '../features/tower-plan/towerPlanState.js';

describe('Tower Visualizer document settings', () => {
  it('adds versioned note and white background defaults', () => {
    const plan = createBlankTowerPlan();

    assert.equal(TOWER_PLAN_SCHEMA_VERSION, 7);
    assert.deepEqual(plan.documentNote, {
      title: 'WORKFLOW NOTE',
      text: '',
      headerColor: '#17263b',
    });
    assert.equal(plan.backgroundPreset, 'white');
    assert.equal(plan.backgroundColor, '#ffffff');
  });

  it('migrates malformed legacy appearance without losing plan data', () => {
    const plan = migrateTowerPlan({
      schemaVersion: 6,
      planTitle: 'TOWER PLAN SITE001',
      siteName: 'SITE001',
      documentNote: {
        title: '',
        text: 'Check feeder',
        headerColor: 'red',
      },
      backgroundPreset: 'missing',
      backgroundColor: '#xyzxyz',
      antennas: [],
    });

    assert.equal(plan.siteName, 'SITE001');
    assert.deepEqual(plan.documentNote, {
      title: 'WORKFLOW NOTE',
      text: 'Check feeder',
      headerColor: '#17263b',
    });
    assert.equal(plan.backgroundPreset, 'white');
    assert.equal(plan.backgroundColor, '#ffffff');
  });

  it('normalizes valid custom colours without changing curated presets', () => {
    assert.deepEqual(
      normalizeDocumentSettings({
        backgroundPreset: 'custom',
        backgroundColor: '#Aa33CC',
        documentNote: {
          title: '  INSTALL FLOW  ',
          text: '  Keep intentional body spacing  ',
          headerColor: '#F5EEDD',
        },
      }),
      {
        documentNote: {
          title: 'INSTALL FLOW',
          text: '  Keep intentional body spacing  ',
          headerColor: '#f5eedd',
        },
        backgroundPreset: 'custom',
        backgroundColor: '#aa33cc',
      },
    );
    assert.equal(
      normalizeDocumentSettings({
        backgroundPreset: 'soft-gray',
        backgroundColor: '#000000',
      }).backgroundColor,
      '#eef2f6',
    );
  });

  it('wraps explicit paragraphs and long tokens deterministically', () => {
    assert.deepEqual(
      wrapDocumentNote('First workflow line.\nSecond workflow line.', 24),
      ['First workflow line.', 'Second workflow line.'],
    );
    assert.deepEqual(
      wrapDocumentNote('ABCDEFGHIJ', 4),
      ['ABCD', 'EFGH', 'IJ'],
    );
    assert.deepEqual(wrapDocumentNote('   '), []);
  });

  it('rejects excessive characters and rendered lines separately', () => {
    assert.deepEqual(
      validateDocumentNote({ text: 'A'.repeat(MAX_NOTE_CHARACTERS + 1) }),
      ['Workflow note maksimal 1.200 karakter.'],
    );
    assert.deepEqual(
      validateDocumentNote({
        text: Array.from({ length: MAX_NOTE_LINES + 1 }, (_, index) => (
          `Line ${index + 1}`
        )).join('\n'),
      }),
      ['Workflow note maksimal 16 baris pada hasil gambar.'],
    );
  });

  it('uses contrast-safe palettes and background prompt labels', () => {
    const dark = {
      ...createBlankTowerPlan(),
      backgroundPreset: 'blueprint-navy',
      backgroundColor: '#102337',
    };
    const custom = {
      ...createBlankTowerPlan(),
      backgroundPreset: 'custom',
      backgroundColor: '#123456',
    };

    assert.deepEqual(resolveDocumentPalette(dark), {
      background: '#102337',
      canvasInk: '#f8fafc',
      canvasMuted: '#cbd5e1',
      guide: '#94a3b8',
    });
    assert.equal(documentBackgroundPrompt(dark), 'Blueprint Navy');
    assert.equal(documentBackgroundPrompt(custom), 'Custom #123456');
    assert.match(buildEngineeringPrompt(dark), /Blueprint Navy background/);
  });

  it('adds one tower-plan validation error when wrapped note exceeds the limit', () => {
    const plan = {
      ...createBlankTowerPlan(),
      planTitle: 'PLAN',
      siteName: 'SITE001',
      documentNote: {
        title: 'WORKFLOW NOTE',
        text: Array.from({ length: MAX_NOTE_LINES + 1 }, (_, index) => (
          `Line ${index + 1}`
        )).join('\n'),
        headerColor: '#17263b',
      },
    };

    assert.deepEqual(
      validateTowerPlan(plan).filter((error) => error.includes('Workflow note')),
      ['Workflow note maksimal 16 baris pada hasil gambar.'],
    );
  });
});
