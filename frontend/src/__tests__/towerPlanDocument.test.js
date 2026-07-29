import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DETAIL_FONT_PRESETS,
  MAX_NOTE_CHARACTERS,
  MAX_NOTE_LINES,
  documentBackgroundPrompt,
  normalizeDetailTypography,
  normalizeDocumentSettings,
  resolveDetailTypography,
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
import {
  clampPan,
  clampZoom,
  zoomAroundPoint,
} from '../features/tower-plan/towerPlanPreviewTransform.js';

describe('Tower Visualizer document settings', () => {
  it('clamps preview zoom and keeps the pointer anchored', () => {
    assert.equal(clampZoom(0.2), 0.5);
    assert.equal(clampZoom(3), 2.5);
    assert.deepEqual(
      zoomAroundPoint({ zoom: 1, x: 0, y: 0 }, 2, { x: 100, y: 80 }),
      { zoom: 2, x: -100, y: -80 },
    );
  });

  it('clamps panning while keeping part of the document visible', () => {
    assert.deepEqual(
      clampPan(
        { zoom: 1, x: -5000, y: 5000 },
        { width: 1000, height: 700 },
        { width: 1900, height: 1200 },
      ),
      { zoom: 1, x: -1800, y: 600 },
    );
  });

  it('adds versioned note and white background defaults', () => {
    const plan = createBlankTowerPlan();

    assert.equal(TOWER_PLAN_SCHEMA_VERSION, 8);
    assert.deepEqual(plan.documentNote, {
      title: 'Skenario Pekerjaan',
      text: '',
      headerColor: '#17263b',
    });
    assert.equal(plan.backgroundPreset, 'white');
    assert.equal(plan.backgroundColor, '#ffffff');
    assert.equal(plan.detailFontPreset, 'standard');
    assert.equal(plan.detailFontSize, 13);
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
      title: 'Skenario Pekerjaan',
      text: 'Check feeder',
      headerColor: '#17263b',
    });
    assert.equal(plan.backgroundPreset, 'white');
    assert.equal(plan.backgroundColor, '#ffffff');
    assert.equal(plan.detailFontPreset, 'standard');
    assert.equal(plan.detailFontSize, 13);
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
        detailFontPreset: 'standard',
        detailFontSize: 13,
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

  it('normalizes curated and custom detail typography deterministically', () => {
    assert.deepEqual(
      DETAIL_FONT_PRESETS.map(({ id, size }) => [id, size]),
      [
        ['small', 11],
        ['standard', 13],
        ['large', 15],
        ['custom', null],
      ],
    );
    assert.deepEqual(
      normalizeDetailTypography({ detailFontPreset: 'large', detailFontSize: 10 }),
      { detailFontPreset: 'large', detailFontSize: 15 },
    );
    assert.deepEqual(
      normalizeDetailTypography({ detailFontPreset: 'custom', detailFontSize: 99 }),
      { detailFontPreset: 'custom', detailFontSize: 16 },
    );
    assert.deepEqual(
      normalizeDetailTypography({ detailFontPreset: 'custom', detailFontSize: 2 }),
      { detailFontPreset: 'custom', detailFontSize: 10 },
    );
    assert.deepEqual(
      resolveDetailTypography({ detailFontPreset: 'custom', detailFontSize: 16 }),
      {
        size: 16,
        titleSize: 16,
        lineHeight: 18,
        noteLineHeight: 19,
        wrapCharacters: 33,
        noteWrapCharacters: 62,
      },
    );
  });

  it('migrates only the former default workflow title', () => {
    const formerDefault = migrateTowerPlan({
      schemaVersion: 7,
      documentNote: {
        title: 'WORKFLOW NOTE',
        text: '',
        headerColor: '#17263b',
      },
      antennas: [],
    });
    const customTitle = migrateTowerPlan({
      schemaVersion: 7,
      documentNote: {
        title: 'INSTALL FLOW',
        text: '',
        headerColor: '#17263b',
      },
      antennas: [],
    });

    assert.equal(formerDefault.documentNote.title, 'Skenario Pekerjaan');
    assert.equal(customTitle.documentNote.title, 'INSTALL FLOW');
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
