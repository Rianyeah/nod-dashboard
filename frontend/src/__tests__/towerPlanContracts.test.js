import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  MAX_ANTENNAS,
  TOWER_PLAN_SCHEMA_VERSION,
  applyAutofillDraft,
  buildAiPayload,
  buildAutofillDraft,
  buildAutofillWarnings,
  createBlankTowerPlan,
  changeTowerType,
  installationForAzimuth,
  migrateTowerPlan,
  updateAntenna,
  validateAutofillDraft,
  validateTowerPlan,
} from '../features/tower-plan/towerPlanState.js';
import { selectSiteFromResults } from '../features/tower-plan/towerPlanSiteSelection.js';
import { getTowerGeometry } from '../features/tower-plan/towerPlanGeometry.js';
import { renderTowerPlanSvg } from '../features/tower-plan/towerPlanSvg.js';


const groupedConfiguration = {
  site_id: 'SITE001',
  source_columns: { tower_height: 'tower_hight', sector: 'sector' },
  tower_height: { status: 'available', value_m: 50, values_m: [50] },
  warnings: [],
  antennas: [
    {
      group_key: 'group-a',
      name: 'MODEL-A · SEC 1',
      antenna_model: 'MODEL-A',
      sector: '1',
      height_m: 42,
      azimuth_deg: 30,
      azimuth_values_deg: [30],
      azimuth_conflict: false,
      leg: 'A',
      cids: ['11', '14'],
      status: 'Existing',
      color: '#334155',
      cell_count: 2,
      cell_names: ['CELL-L18', 'CELL-L21'],
      bands: ['L1800', 'L2100'],
      technologies: ['4G'],
      cells: [],
    },
  ],
};


describe('Tower Plan state contracts', () => {
  it('starts from a blank four-leg tower rather than the legacy preset', () => {
    const state = createBlankTowerPlan();

    assert.equal(state.schemaVersion, 6);
    assert.equal(state.schemaVersion, TOWER_PLAN_SCHEMA_VERSION);
    assert.equal(state.towerType, 'Four-leg lattice tower');
    assert.equal(state.towerHeight, 50);
    assert.equal(state.legABearingDeg, 45);
    assert.deepEqual(state.antennas, []);
  });

  it('builds a review draft from grouped Site ID configuration', () => {
    const draft = buildAutofillDraft(groupedConfiguration);

    assert.equal(draft.siteName, 'SITE001');
    assert.equal(draft.planTitle, 'TOWER PLAN SITE001');
    assert.equal(draft.towerHeight, 50);
    assert.equal(draft.antennas.length, 1);
    assert.equal(draft.antennas[0].name, 'MODEL-A · SEC 1');
    assert.equal(draft.antennas[0].leg, 'A');
    assert.deepEqual(draft.antennas[0].cids, ['11', '14']);
    assert.equal(draft.antennas[0].source.cellCount, 2);
    assert.equal(draft.antennas[0].selected, true);
  });

  it('requires manual tower height when the source is missing or conflicting', () => {
    const missing = buildAutofillDraft({
      ...groupedConfiguration,
      tower_height: { status: 'missing', value_m: null, values_m: [] },
    });
    const conflict = buildAutofillDraft({
      ...groupedConfiguration,
      tower_height: { status: 'conflict', value_m: null, values_m: [50, 60] },
    });

    assert.equal(missing.towerHeight, '');
    assert.equal(conflict.towerHeight, '');
    assert.match(validateAutofillDraft(missing)[0], /tinggi tower/i);
  });

  it('shows one actionable warning when tower_hight is unavailable', () => {
    const draft = buildAutofillDraft({
      ...groupedConfiguration,
      tower_height: { status: 'missing', value_m: null, values_m: [] },
      warnings: ['Kolom tower_hight belum tersedia; tinggi tower harus diisi manual.'],
    });

    const warnings = buildAutofillWarnings(draft);

    assert.deepEqual(warnings, [
      'Kolom tower_hight belum tersedia; tinggi tower harus diisi manual.',
    ]);
  });

  it('blocks review drafts above the physical antenna limit without truncating data', () => {
    const draft = buildAutofillDraft({
      ...groupedConfiguration,
      antennas: Array.from({ length: MAX_ANTENNAS + 1 }, (_, index) => ({
        ...groupedConfiguration.antennas[0],
        group_key: `group-${index}`,
        name: `MODEL-${index}`,
      })),
    });

    assert.equal(draft.antennas.length, MAX_ANTENNAS + 1);
    assert.equal(draft.antennas.filter((antenna) => antenna.selected).length, MAX_ANTENNAS + 1);
    assert.match(validateAutofillDraft(draft).join(' '), /maksimal 16/i);
  });

  it('replaces antennas immutably while preserving the prior snapshot for undo', () => {
    const current = {
      ...createBlankTowerPlan(),
      siteName: 'OLD',
      antennas: [{
        id: 'old',
        name: 'Old antenna',
        operator: '',
        status: 'New',
        sector: '1',
        height: 20,
        azimuth: 10,
        cid: '',
        leg: 'A',
        color: '#1769e0',
        note: '',
      }],
    };
    const draft = buildAutofillDraft(groupedConfiguration);

    const next = applyAutofillDraft(current, draft);

    assert.notEqual(next, current);
    assert.equal(current.siteName, 'OLD');
    assert.equal(current.antennas[0].id, 'old');
    assert.equal(next.siteName, 'SITE001');
    assert.equal(next.antennas.length, 1);
    assert.equal(next.antennas[0].id, 'group-a');
  });

  it('updates antenna rows without mutating the current state', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );

    const next = updateAntenna(state, 'group-a', { height: 40 });

    assert.equal(state.antennas[0].height, 42);
    assert.equal(next.antennas[0].height, 40);
  });

  it('validates tower geometry and duplicate CID values', () => {
    const base = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const invalid = {
      ...base,
      towerHeight: 40,
      antennas: [
        { ...base.antennas[0], cids: ['10'], cid: '10' },
        {
          ...base.antennas[0],
          id: 'second',
          cids: ['10'],
          cid: '10',
          leg: 'B',
        },
      ],
    };

    const errors = validateTowerPlan(invalid).join(' ');

    assert.match(errors, /melebihi tinggi tower/i);
    assert.match(errors, /CID 10 digunakan lebih dari sekali/i);
  });

  it('migrates legacy schema v4 while preserving antennas', () => {
    const migrated = migrateTowerPlan({
      schemaVersion: 4,
      planTitle: 'LEGACY',
      siteName: 'SITE-OLD',
      towerHeight: '60',
      antennas: [{ id: 'a', name: 'Legacy', height: '40', azimuth: '90', leg: 'A' }],
    });

    assert.equal(migrated.schemaVersion, 6);
    assert.equal(migrated.towerHeight, 60);
    assert.equal(migrated.antennas[0].name, 'Legacy');
    assert.equal(migrated.antennas[0].status, 'Existing');
  });

  it('maps installation positions for every tower type', () => {
    assert.equal(installationForAzimuth('Four-leg lattice tower', 110), 'B');
    assert.equal(installationForAzimuth('Three-leg lattice tower', 120), 'A');
    assert.equal(installationForAzimuth('Three-leg lattice tower', 120.1), 'B');
    assert.equal(installationForAzimuth('Three-leg lattice tower', 300), 'C');
    assert.equal(installationForAzimuth('Monopole', 280), 'D');
  });

  it('migrates legacy CID and recalculates unsupported legs', () => {
    const migrated = migrateTowerPlan({
      schemaVersion: 5,
      towerType: 'Three-leg lattice tower',
      antennas: [{
        id: 'a',
        name: 'A',
        cid: '11, 14 & 11',
        azimuth: 300,
        leg: 'D',
      }],
    });

    assert.equal(migrated.schemaVersion, 6);
    assert.deepEqual(migrated.antennas[0].cids, ['11', '14']);
    assert.equal(migrated.antennas[0].leg, 'C');
  });

  it('changing tower type recalculates all installation positions', () => {
    const state = {
      ...createBlankTowerPlan(),
      antennas: [
        { id: 'a', name: 'A', azimuth: 110, leg: 'B' },
        { id: 'b', name: 'B', azimuth: 300, leg: 'D' },
      ],
    };

    const changed = changeTowerType(state, 'Three-leg lattice tower');

    assert.equal(changed.towerType, 'Three-leg lattice tower');
    assert.deepEqual(changed.antennas.map((antenna) => antenna.leg), ['A', 'C']);
  });

  it('keeps conflicting azimuth unresolved and blocks auto-fill apply', () => {
    const draft = buildAutofillDraft({
      ...groupedConfiguration,
      antennas: [{
        ...groupedConfiguration.antennas[0],
        azimuth_deg: null,
        leg: null,
        azimuth_values_deg: [30, 35],
        azimuth_conflict: true,
      }],
    });

    assert.equal(draft.antennas[0].azimuth, '');
    assert.equal(draft.antennas[0].azimuthConflict, true);
    assert.match(validateAutofillDraft(draft).join(' '), /azimuth/i);
  });

  it('selects exact Site ID before the first fuzzy result', () => {
    const items = [{ site_id: 'PSN003A' }, { site_id: 'PSN003' }];

    assert.deepEqual(selectSiteFromResults(items, 'psn003'), { site_id: 'PSN003' });
    assert.deepEqual(selectSiteFromResults(items, 'unknown'), { site_id: 'PSN003A' });
    assert.equal(selectSiteFromResults([], 'PSN003'), null);
  });

  it('builds an anonymous AI payload with geometry only', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const payload = buildAiPayload({
      ...state,
      planTitle: 'SECRET TITLE',
      siteName: 'SECRET SITE',
      antennas: [{
        ...state.antennas[0],
        name: 'SECRET CELL',
        operator: 'SECRET OPERATOR',
        cid: 'SECRET CID',
        note: 'SECRET NOTE',
      }],
    }, 'final', 'Darker steel');

    assert.deepEqual(Object.keys(payload).sort(), [
      'antennas',
      'leg_a_bearing_deg',
      'mode',
      'revision_instruction',
      'tower_height_m',
      'visual_style',
    ]);
    assert.deepEqual(Object.keys(payload.antennas[0]).sort(), [
      'azimuth_deg',
      'color',
      'height_m',
      'leg',
      'status',
    ]);
    assert.doesNotMatch(JSON.stringify(payload), /SECRET/);
  });
});


describe('Tower Plan deterministic output and dashboard wiring', () => {
  it('provides aligned feet and safe helicopter spacing for every tower type', () => {
    const expected = [
      ['Four-leg lattice tower', 4, 'lattice-four'],
      ['Three-leg lattice tower', 3, 'lattice-three'],
      ['Monopole', 1, 'monopole'],
    ];

    expected.forEach(([towerType, footCount, structureKind]) => {
      const geometry = getTowerGeometry(towerType);
      assert.equal(geometry.feet.length, footCount);
      assert.equal(geometry.structureKind, structureKind);
      assert.ok(
        geometry.helicopterPanel.x - geometry.towerEnvelopeRight >= 50,
        `${towerType} must keep at least 50 px of clear space`,
      );
    });
  });

  it('renders escaped site data, antenna geometry, and helicopter view in SVG', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const svg = renderTowerPlanSvg({ ...state, siteName: '<SITE&001>' });

    assert.match(svg, /viewBox="0 0 1024 1536"/);
    assert.match(svg, /HELICOPTER VIEW/);
    assert.match(svg, /MODEL-A/);
    assert.match(svg, /LEG A/);
    assert.match(svg, /CID\(S\): 11, 14/);
    assert.equal((svg.match(/data-foot-plate=/g) || []).length, 4);
    assert.match(svg, /data-installation-label="A"/);
    assert.match(svg, /data-structure-kind="lattice-four"/);
    assert.match(svg, /&lt;SITE&amp;001&gt;/);
    assert.doesNotMatch(svg, /<SITE&001>/);
  });

  it('renders distinct three-leg and monopole structures', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const threeLeg = renderTowerPlanSvg(changeTowerType(
      state,
      'Three-leg lattice tower',
    ));
    const monopole = renderTowerPlanSvg(changeTowerType(state, 'Monopole'));

    assert.match(threeLeg, /data-structure-kind="lattice-three"/);
    assert.equal((threeLeg.match(/data-foot-plate=/g) || []).length, 3);
    assert.match(threeLeg, /data-installation-label="C"/);
    assert.doesNotMatch(threeLeg, /data-installation-label="D"/);
    assert.match(monopole, /data-structure-kind="monopole"/);
    assert.equal((monopole.match(/data-foot-plate=/g) || []).length, 1);
    assert.match(monopole, /data-anchor-bolt=/);
  });

  it('wires the lazy route, sidebar placement, breadcrumb, and API functions', () => {
    const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const sidebar = readFileSync(
      new URL('../components/DashboardSidebar.jsx', import.meta.url),
      'utf8',
    );
    const breadcrumb = readFileSync(
      new URL('../components/Breadcrumb.jsx', import.meta.url),
      'utf8',
    );
    const api = readFileSync(new URL('../services/api.js', import.meta.url), 'utf8');

    assert.match(app, /TowerPlanGeneratorPage/);
    assert.match(app, /path="\/tower-plan-generator"/);
    assert.ok(
      sidebar.indexOf("'/rf-tilt-analysis'") < sidebar.indexOf("'/tower-plan-generator'"),
    );
    assert.match(sidebar, /Tower Plan Generator/);
    assert.match(breadcrumb, /'tower-plan-generator': 'Tower Plan Generator'/);
    assert.match(api, /searchTowerPlanSites/);
    assert.match(api, /fetchTowerPlanConfiguration/);
    assert.match(api, /generateTowerPlanAiVisualization/);
  });

  it('renders the complete professional workbench and review flow', () => {
    const page = readFileSync(
      new URL('../pages/TowerPlanGeneratorPage.jsx', import.meta.url),
      'utf8',
    );
    const review = readFileSync(
      new URL('../features/tower-plan/TowerPlanAutofillDialog.jsx', import.meta.url),
      'utf8',
    );
    const preview = readFileSync(
      new URL('../features/tower-plan/TowerPlanPreview.jsx', import.meta.url),
      'utf8',
    );

    assert.match(page, /Auto-fill Site ID/);
    assert.match(page, /TowerPlanAutofillDialog/);
    assert.match(page, /TowerPlanPreview/);
    assert.match(page, /Visualisasi AI/);
    assert.match(page, /Urungkan/);
    assert.match(
      page,
      /tower-revision[\s\S]{0,500}setRevisionInstruction[\s\S]{0,200}setPromptOutput\(''\)/,
    );
    assert.match(page, /Export PNG/);
    assert.match(page, /Export SVG/);
    assert.match(page, /Export JSON/);
    assert.match(page, /Import JSON/);
    assert.match(review, /Review Auto-fill/);
    assert.match(review, /Terapkan konfigurasi/);
    assert.match(review, /maksimal 16/i);
    assert.match(preview, /Sumber engineering deterministik/);
  });
});
