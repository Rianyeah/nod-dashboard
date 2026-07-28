import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  MAX_ANTENNAS,
  TOWER_PLAN_SCHEMA_VERSION,
  applyAutofillDraft,
  buildAutofillDraft,
  buildAutofillWarnings,
  buildEngineeringPrompt,
  normalizeCids,
  createBlankTowerPlan,
  changeTowerType,
  installationForAzimuth,
  migrateTowerPlan,
  updateAntenna,
  updateAutofillAntennaDraft,
  validateAutofillDraft,
  validateTowerPlan,
} from '../features/tower-plan/towerPlanState.js';
import {
  canSelectCurrentSiteResult,
  selectSiteFromResults,
} from '../features/tower-plan/towerPlanSiteSelection.js';
import {
  TOWER_DRAWING_LAYOUT,
  getTowerGeometry,
} from '../features/tower-plan/towerPlanGeometry.js';
import {
  buildElevationRings,
  radiusForHeight,
} from '../features/tower-plan/towerPlanHelicopter.js';
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
  it('builds unique elevation rings with deterministic radii', () => {
    assert.deepEqual(
      buildElevationRings([{ height: 46 }, { height: '40' }, { height: 46 }, { height: 'bad' }]),
      [
        { height: 46, radius: 72 },
        { height: 40, radius: 42 },
      ],
    );

    assert.deepEqual(
      buildElevationRings([{ height: 46 }]),
      [{ height: 46, radius: 62 }],
    );

    assert.deepEqual(
      buildElevationRings([{ height: 46 }, { height: 40 }, { height: 32 }]),
      [
        { height: 46, radius: 72 },
        { height: 40, radius: 57 },
        { height: 32, radius: 42 },
      ],
    );

    assert.equal(radiusForHeight([{ height: 46, radius: 72 }], 46), 72);
    assert.equal(radiusForHeight([], 46), 62);
  });

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

  it('carries resolved mechanical tilt into editable antenna state without electrical tilt', () => {
    const draft = buildAutofillDraft({
      ...groupedConfiguration,
      antennas: [{
        ...groupedConfiguration.antennas[0],
        mechanical_tilt_deg: 1,
        mechanical_tilt_conflict: false,
      }],
    });
    const applied = applyAutofillDraft(createBlankTowerPlan(), draft);
    const edited = updateAntenna(applied, 'group-a', {
      mechanicalTilt: '1.5',
      electricalTilt: '3',
    });
    const prompt = buildEngineeringPrompt(edited);

    assert.equal(draft.antennas[0].mechanicalTilt, 1);
    assert.equal(draft.antennas[0].source.mechanicalTiltConflict, false);
    assert.equal(edited.antennas[0].mechanicalTilt, '1.5');
    assert.equal('electricalTilt' in edited.antennas[0], false);
    assert.match(prompt, /mechanical tilt 1\.5\u00b0/i);
    assert.doesNotMatch(prompt, /electrical tilt/i);
  });

  it('drops legacy electrical tilt during Tower Visualizer plan migration', () => {
    const migrated = migrateTowerPlan({
      antennas: [{
        id: 'legacy-tilt',
        name: 'Legacy antenna',
        sector: '1',
        height: 35,
        azimuth: 45,
        leg: 'A',
        electricalTilt: 6,
        mechanicalTilt: 2,
      }],
    });

    assert.equal(migrated.antennas[0].mechanicalTilt, 2);
    assert.equal('electricalTilt' in migrated.antennas[0], false);
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

  it('keeps a missing source antenna height blank through draft validation and prompt generation', () => {
    const withoutHeight = Object.fromEntries(
      Object.entries(groupedConfiguration.antennas[0]).filter(([key]) => key !== 'height_m'),
    );
    const draft = buildAutofillDraft({
      ...groupedConfiguration,
      antennas: [
        {
          ...groupedConfiguration.antennas[0],
          group_key: 'null-height',
          height_m: null,
        },
        {
          ...withoutHeight,
          group_key: 'omitted-height',
        },
      ],
    });
    const errors = validateAutofillDraft(draft).join(' ');
    const applied = applyAutofillDraft(createBlankTowerPlan(), draft);
    const prompt = buildEngineeringPrompt(applied);

    assert.deepEqual(draft.antennas.map((antenna) => antenna.height), ['', '']);
    assert.match(errors, /Antenna 1: tinggi wajib diisi/i);
    assert.match(errors, /Antenna 2: tinggi wajib diisi/i);
    assert.deepEqual(applied.antennas.map((antenna) => antenna.height), ['', '']);
    assert.equal((prompt.match(/height not specified/g) || []).length, 2);
    assert.doesNotMatch(prompt, /; 0 m; azimuth/i);
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

  it('keeps a manual installation leg until its azimuth changes', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );

    const manuallyPlaced = updateAntenna(state, 'group-a', { leg: 'C' });
    const preservedAfterOtherEdit = updateAntenna(manuallyPlaced, 'group-a', { note: 'field verified' });
    const remappedAfterAzimuthEdit = updateAntenna(preservedAfterOtherEdit, 'group-a', { azimuth: 110 });

    assert.equal(manuallyPlaced.antennas[0].leg, 'C');
    assert.equal(preservedAfterOtherEdit.antennas[0].leg, 'C');
    assert.equal(remappedAfterAzimuthEdit.antennas[0].leg, 'B');
  });

  it('preserves a valid intentional auto-fill leg override during apply', () => {
    const draft = buildAutofillDraft(groupedConfiguration);
    draft.antennas[0].leg = 'B';

    const applied = applyAutofillDraft(createBlankTowerPlan(), draft);

    assert.equal(applied.antennas[0].leg, 'B');
  });

  it('commits multi-CID input only after the draft is complete', () => {
    const editorSource = readFileSync(
      new URL('../features/tower-plan/TowerPlanAntennaEditor.jsx', import.meta.url),
      'utf8',
    );
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );

    assert.match(editorSource, /const \[cidDraft, setCidDraft\] = useState/);
    assert.match(editorSource, /onBlur=\{commitCidDraft\}/);
    assert.match(editorSource, /event\.key === 'Enter'/);
    assert.deepEqual(normalizeCids('11, 12'), ['11', '12']);
    assert.deepEqual(updateAntenna(state, 'group-a', { cids: '11, 12' }).antennas[0].cids, ['11', '12']);
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

  it('preserves imported antennas above the validation limit instead of dropping them', () => {
    const migrated = migrateTowerPlan({
      towerHeight: 50,
      antennas: Array.from({ length: MAX_ANTENNAS + 1 }, (_, index) => ({
        id: `import-${index}`,
        name: `Imported ${index + 1}`,
        sector: String(index + 1),
        height: 30,
        azimuth: index * 10,
        leg: 'A',
      })),
    });

    assert.equal(migrated.antennas.length, MAX_ANTENNAS + 1);
    assert.match(validateTowerPlan(migrated).join(' '), /maksimal 16/i);
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

  it('resolves an auto-fill azimuth conflict and recalculates the position', () => {
    const draft = buildAutofillDraft({
      ...groupedConfiguration,
      antennas: [{
        ...groupedConfiguration.antennas[0],
        azimuth_deg: null,
        leg: null,
        azimuth_values_deg: [120, 125],
        azimuth_conflict: true,
      }],
    }, 'Three-leg lattice tower');

    const resolved = updateAutofillAntennaDraft(
      draft,
      draft.antennas[0].id,
      { azimuth: 125 },
    );

    assert.equal(resolved.antennas[0].azimuthConflict, false);
    assert.equal(resolved.antennas[0].leg, 'B');
    assert.deepEqual(validateAutofillDraft(resolved), []);
  });

  it('selects exact Site ID before the first fuzzy result', () => {
    const items = [{ site_id: 'PSN003A' }, { site_id: 'PSN003' }];

    assert.deepEqual(selectSiteFromResults(items, 'psn003'), { site_id: 'PSN003' });
    assert.deepEqual(selectSiteFromResults(items, 'unknown'), { site_id: 'PSN003A' });
    assert.equal(selectSiteFromResults([], 'PSN003'), null);
  });

  it('only allows Enter selection for results belonging to the current Site ID query', () => {
    const pickerSource = readFileSync(
      new URL('../features/tower-plan/TowerPlanSitePicker.jsx', import.meta.url),
      'utf8',
    );

    assert.equal(canSelectCurrentSiteResult('PSN003', 'PSN003', false), true);
    assert.equal(canSelectCurrentSiteResult('PSN003B', 'PSN003', false), false);
    assert.equal(canSelectCurrentSiteResult('PSN003', 'PSN003', true), false);
    assert.equal(canSelectCurrentSiteResult('P', 'P', false), false);
    assert.match(pickerSource, /const \[resultsQuery, setResultsQuery\] = useState\(''\)/);
    assert.match(pickerSource, /setResultsQuery\(normalized\)/);
    assert.match(pickerSource, /event\.key === 'Enter' && open && hasCurrentResults/);
  });

  it('builds a professional Monopole prompt with grouped CIDs and mounting sides', () => {
    const state = {
      ...changeTowerType(createBlankTowerPlan(), 'Monopole'),
      planTitle: 'TOWER PLAN PSN099',
      siteName: 'PSN099',
      towerHeight: 52,
      antennas: [
        {
          id: 'existing-sector-1',
          name: 'Antenna Sectoral Alpha',
          status: 'Existing',
          sector: '1',
          height: 46,
          azimuth: 40,
          cids: ['12', '11', '12'],
          leg: 'A',
        },
        {
          id: 'new-sector-2',
          name: 'Antenna Sectoral Beta',
          status: 'New',
          sector: '2',
          height: 38,
          azimuth: 150,
          cids: ['21', '22'],
          leg: 'B',
        },
      ],
    };

    const prompt = buildEngineeringPrompt(state);

    assert.match(prompt, /Create a professional Monopole tower planning illustration for site PSN099\./);
    assert.match(prompt, /52 metres high/);
    assert.match(prompt, /Mounting Side A oriented 45 degrees clockwise from North/);
    assert.match(prompt, /- Antenna Sectoral Alpha .*Existing; Sector 1; 46 m; azimuth 40°; CIDs 11, 12; Mounting Side A\./);
    assert.match(prompt, /- Antenna Sectoral Beta .*New; Sector 2; 38 m; azimuth 150°; CIDs 21, 22; Mounting Side B\./);
    assert.match(prompt, /Use a Clean Engineering Infographic visual style/);
    assert.match(prompt, /Do not add, remove, merge, or change any supplied antenna or measurement\./);

    for (const banned of [
      /TEMPLATE/i,
      /TARGET/i,
      /deterministic/i,
      /schemaVersion/i,
      /promptTemplateVersion/i,
      /heightM/i,
      /azimuthDeg/i,
      /approved engineering source/i,
    ]) {
      assert.doesNotMatch(prompt, banned);
    }
    assert.doesNotMatch(prompt, /[{}[\]"]/);
  });

  it('uses Leg wording for lattice tower prompts', () => {
    const prompt = buildEngineeringPrompt({
      ...createBlankTowerPlan(),
      siteName: 'PSN100',
      antennas: [{
        name: 'Antenna Sectoral Gamma', status: 'Existing', sector: '1', height: 42,
        azimuth: 90, cids: ['31'], leg: 'A',
      }],
    });

    assert.match(prompt, /Leg A oriented 45 degrees clockwise from North/);
    assert.match(prompt, /CIDs 31; Leg A\./);
  });

  it('uses natural planning wording for every lattice tower prompt', () => {
    const expectedOpenings = [
      [
        'Four-leg lattice tower',
        'Create a professional Four-leg lattice tower planning illustration for site PSN003. '
          + 'Plan title: TOWER PLAN PSN003.',
      ],
      [
        'Three-leg lattice tower',
        'Create a professional Three-leg lattice tower planning illustration for site PSN003. '
          + 'Plan title: TOWER PLAN PSN003.',
      ],
    ];

    expectedOpenings.forEach(([towerType, expectedOpening]) => {
      const prompt = buildEngineeringPrompt({
        ...changeTowerType(createBlankTowerPlan(), towerType),
        planTitle: 'TOWER PLAN PSN003',
        siteName: 'PSN003',
      });

      assert.equal(prompt.split('\n\n', 1)[0], expectedOpening);
    });
  });

  it('includes a natural revision request when one is supplied', () => {
    const prompt = buildEngineeringPrompt(createBlankTowerPlan(), 'Show clearer sector labels.');

    assert.match(prompt, /Revision request: Show clearer sector labels\./);
  });

  it('finishes a revision instruction with terminal punctuation', () => {
    const prompt = buildEngineeringPrompt(createBlankTowerPlan(), 'Darken the steel finish');

    assert.match(prompt, /Revision request: Darken the steel finish\./);
  });

  it('does not treat blank engineering fields as zero in validation or prompts', () => {
    const plan = {
      ...createBlankTowerPlan(),
      planTitle: 'BLANK INPUT CHECK',
      siteName: 'PSNBLANK',
      towerHeight: '',
      legABearingDeg: '',
      antennas: [{
        id: 'blank-fields',
        name: 'Blank field antenna',
        sector: '',
        height: '',
        azimuth: '',
        cids: [],
        leg: 'A',
        status: 'Existing',
      }],
    };

    const errors = validateTowerPlan(plan).join(' ');
    const prompt = buildEngineeringPrompt(plan);
    const migrated = migrateTowerPlan(plan);

    assert.match(errors, /tinggi tower wajib diisi/i);
    assert.match(errors, /Leg A bearing wajib diisi/i);
    assert.match(errors, /sector wajib diisi/i);
    assert.match(errors, /tinggi wajib diisi/i);
    assert.match(errors, /azimuth wajib diisi/i);
    assert.match(prompt, /height not specified/i);
    assert.match(prompt, /azimuth not specified/i);
    assert.doesNotMatch(prompt, /Blank field antenna[^\n]*; 0 m; azimuth 0\u00b0/);
    assert.equal(migrated.towerHeight, '');
    assert.equal(migrated.legABearingDeg, '');
    assert.equal(migrated.antennas[0].height, '');
    assert.equal(migrated.antennas[0].azimuth, '');
  });

  it('details a non-default Three-leg antenna orientation in the prompt', () => {
    const state = {
      ...changeTowerType(createBlankTowerPlan(), 'Three-leg lattice tower'),
      planTitle: 'TOWER PLAN PSN333',
      siteName: 'PSN333',
      towerHeight: 48,
      legABearingDeg: 15,
      antennas: [{
        id: 'three-leg-sector',
        name: 'Antenna Sectoral Delta',
        status: 'Relocation',
        sector: '3',
        height: 41,
        azimuth: 285,
        cids: ['71', '72'],
        leg: 'C',
      }],
    };

    const prompt = buildEngineeringPrompt(state);

    assert.match(prompt, /Create a professional Three-leg lattice tower planning illustration for site PSN333\./);
    assert.match(prompt, /Leg A oriented 15 degrees clockwise from North/);
    assert.match(prompt, /- Antenna Sectoral Delta .*Relocation; Sector 3; 41 m; azimuth 285\u00b0; CIDs 71, 72; Leg C\./);
  });

  it('states when no antenna records are defined', () => {
    const prompt = buildEngineeringPrompt(createBlankTowerPlan());

    assert.match(prompt, /No antennas are currently defined for this plan\./);
  });

  it('uses a non-empty custom visual style in the prompt', () => {
    const prompt = buildEngineeringPrompt({
      ...createBlankTowerPlan(),
      visualStyle: 'Custom Style',
      customStyle: 'Blueprint watercolor',
    });

    assert.match(prompt, /Use a Blueprint watercolor visual style/);
  });
});


describe('Tower Plan deterministic output and dashboard wiring', () => {
  it('provides aligned feet and a footer-aligned helicopter panel for every tower type', () => {
    const expected = [
      ['Four-leg lattice tower', 4, 'lattice-four'],
      ['Three-leg lattice tower', 3, 'lattice-three'],
      ['Monopole', 1, 'monopole'],
    ];

    expected.forEach(([towerType, footCount, structureKind]) => {
      const geometry = getTowerGeometry(towerType);
      assert.equal(geometry.feet.length, footCount);
      assert.equal(geometry.structureKind, structureKind);
      assert.equal(geometry.helicopterPanel.y, TOWER_DRAWING_LAYOUT.footer.y);
      assert.equal(
        geometry.helicopterPanel.height,
        TOWER_DRAWING_LAYOUT.footer.legend.y
          + TOWER_DRAWING_LAYOUT.footer.legend.height
          - TOWER_DRAWING_LAYOUT.footer.y,
      );
      assert.ok(
        geometry.helicopterPanel.y > TOWER_DRAWING_LAYOUT.towerBaseY,
        `${towerType} helicopter panel must sit below the tower drawing`,
      );
    });
  });

  it('renders escaped site data, antenna geometry, and helicopter view in SVG', () => {
    const baseState = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const plan = {
      ...baseState,
      siteName: '<SITE&001>',
      antennas: [
        {
          ...baseState.antennas[0],
          id: 'sector-3-primary',
          sector: '3',
          height: 46,
          azimuth: 310,
          leg: 'A',
          color: '#334155',
        },
        {
          ...baseState.antennas[0],
          id: 'sector-3-overlap',
          sector: '3',
          height: 46,
          azimuth: 310,
          leg: 'A',
          color: '#7c3aed',
        },
        {
          ...baseState.antennas[0],
          id: 'sector-2-inner',
          sector: '2',
          height: 40,
          azimuth: 190,
          leg: 'B',
          color: '#be123c',
        },
      ],
    };
    const svg = renderTowerPlanSvg(plan);

    assert.match(svg, /viewBox="0 0 1200 1536"/);
    assert.match(svg, /font-family="Inter, system-ui, sans-serif"/);
    assert.match(svg, /HELICOPTER VIEW/);
    assert.match(svg, /MODEL-A/);
    assert.match(svg, /LEG A/);
    assert.match(svg, /CID\(S\): 11, 14/);
    assert.equal((svg.match(/data-foot-plate=/g) || []).length, 4);
    assert.match(svg, /data-installation-label="A"/);
    assert.match(svg, /data-structure-kind="lattice-four"/);
    assert.match(svg, /&lt;SITE&amp;001&gt;/);
    assert.doesNotMatch(svg, /<SITE&001>/);
    assert.equal((svg.match(/data-elevation-ring=/g) || []).length, 2);
    assert.match(svg, /data-elevation-ring="46"/);
    assert.match(svg, /data-elevation-ring="40"/);
    assert.match(svg, />SEC 3 \| 310(?:\.0)?°</);
    assert.match(svg, /data-arrow-color="#334155"/);
    assert.match(svg, /data-overlap-index="0"/);
    assert.match(svg, /data-overlap-index="1"/);
  });

  it('keeps the red-white SVG drawing legible with wrapped callouts and collision-safe helicopter labels', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const plan = {
      ...state,
      antennas: Array.from({ length: MAX_ANTENNAS }, (_, index) => ({
        ...state.antennas[0],
        id: `dense-${index + 1}`,
        name: `Antenna Sectoral Super Long Engineering Name ${index + 1} MB4B MobI`,
        sector: String((index % 3) + 1),
        height: 46 - (index % 4) * 0.2,
        azimuth: 300 + (index % 5),
        leg: index % 2 ? 'A' : 'B',
        mechanicalTilt: 1,
        cids: index < 2 ? ['11', '14'] : [`${index + 20}`],
      })),
    };
    const svg = renderTowerPlanSvg(plan);
    const cards = [...svg.matchAll(
      /<rect data-callout-card="(\d+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
    )].map(([, id, x, y, width, height]) => ({
      id: Number(id),
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    }));
    const helicopterBoxes = [...svg.matchAll(
      /<g data-helicopter-label-box="([^"]+)" data-box-x="([\d.]+)" data-box-y="([\d.]+)" data-box-width="([\d.]+)" data-box-height="([\d.]+)"/g,
    )].map(([, id, x, y, width, height]) => ({
      id,
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    }));
    const footerCards = [...svg.matchAll(
      /<g data-footer-card="([^"]+)" data-footer-x="([\d.]+)" data-footer-y="([\d.]+)" data-footer-width="([\d.]+)" data-footer-height="([\d.]+)"/g,
    )].map(([, id, x, y, width, height]) => ({
      id,
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    }));
    const siteData = footerCards.find((card) => card.id === 'site-data');
    const legend = footerCards.find((card) => card.id === 'legend');
    const helicopterPanel = getTowerGeometry(plan.towerType).helicopterPanel;

    assert.equal(TOWER_DRAWING_LAYOUT.canvasWidth, 1200);
    assert.match(svg, /data-tower-paint-band="0" data-paint-color="red"/);
    assert.match(svg, /data-tower-paint-band="1" data-paint-color="white"/);
    assert.match(svg, /MT: 1\u00b0/);
    assert.doesNotMatch(svg, /ET:/);
    assert.match(svg, /TOTAL ANTENNA: <tspan font-weight="700">16<\/tspan>/);
    assert.match(svg, /TOTAL CELL: <tspan font-weight="700">16<\/tspan>/);
    assert.ok((svg.match(/data-callout-title-line=/g) || []).length >= 2);
    assert.equal(cards.length, MAX_ANTENNAS);
    assert.equal(helicopterBoxes.length, plan.antennas.length);
    assert.equal(footerCards.length, 2);
    assert.equal(legend.x, siteData.x);
    assert.ok(legend.y >= siteData.y + siteData.height);
    assert.equal(helicopterPanel.y, siteData.y);
    assert.equal(helicopterPanel.height, legend.y + legend.height - siteData.y);

    cards.forEach((card, index) => {
      assert.ok(card.x >= TOWER_DRAWING_LAYOUT.heightDimensionCorridorRight);
      assert.ok(card.x + card.width <= TOWER_DRAWING_LAYOUT.canvasWidth);
      cards.slice(index + 1).forEach((other) => {
        const separated = card.x + card.width <= other.x
          || other.x + other.width <= card.x
          || card.y + card.height <= other.y
          || other.y + other.height <= card.y;
        assert.equal(separated, true, `callout cards ${card.id} and ${other.id} overlap`);
      });
    });

    helicopterBoxes.forEach((box, index) => {
      assert.ok(box.x >= helicopterPanel.x && box.y >= helicopterPanel.y);
      assert.ok(box.x + box.width <= helicopterPanel.x + helicopterPanel.width);
      assert.ok(box.y + box.height <= helicopterPanel.y + helicopterPanel.height);
      helicopterBoxes.slice(index + 1).forEach((other) => {
        const separated = box.x + box.width <= other.x
          || other.x + other.width <= box.x
          || box.y + box.height <= other.y
          || other.y + other.height <= box.y;
        assert.equal(separated, true, `helicopter labels ${box.id} and ${other.id} overlap`);
      });
    });
  });

  it('places every lattice leg label outside its physical foot plate', () => {
    [
      ['Four-leg lattice tower', ['A', 'B', 'C', 'D']],
      ['Three-leg lattice tower', ['A', 'B', 'C']],
    ].forEach(([towerType, expectedLegs]) => {
      const svg = renderTowerPlanSvg(changeTowerType(createBlankTowerPlan(), towerType));
      const labels = [...svg.matchAll(
        /<g data-leg-label="([A-D])" data-leg-label-side="(left|right)" data-foot-x="([\d.]+)" data-label-x="([\d.]+)"/g,
      )].map(([, leg, side, footX, labelX]) => ({
        leg,
        side,
        footX: Number(footX),
        labelX: Number(labelX),
      }));

      assert.equal(labels.length, expectedLegs.length);
      assert.deepEqual(labels.map(({ leg }) => leg), expectedLegs);
      labels.forEach(({ leg, side, footX, labelX }) => {
        const exterior = side === 'left' ? labelX < footX - 24 : labelX > footX + 24;
        assert.equal(exterior, true, `LEG ${leg} label must be outside its foot plate`);
      });
    });
  });

  it('renders every antenna in the helicopter view for every tower type', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const plan = {
      ...state,
      antennas: [
        { ...state.antennas[0], id: 'a', leg: 'A', height: 46, azimuth: 310 },
        { ...state.antennas[0], id: 'b', leg: 'A', height: 46, azimuth: 310 },
        { ...state.antennas[0], id: 'c', leg: 'B', height: 40, azimuth: 190 },
      ],
    };

    ['Four-leg lattice tower', 'Three-leg lattice tower', 'Monopole'].forEach((towerType) => {
      const svg = renderTowerPlanSvg(changeTowerType(plan, towerType));

      assert.equal(
        (svg.match(/data-top-antenna=/g) || []).length,
        plan.antennas.length,
      );
    });
  });

  it('lays out sixteen SVG callout cards without overlap', () => {
    const state = applyAutofillDraft(
      createBlankTowerPlan(),
      buildAutofillDraft(groupedConfiguration),
    );
    const plan = {
      ...state,
      antennas: Array.from({ length: MAX_ANTENNAS }, (_, index) => ({
        ...state.antennas[0],
        id: `callout-${index + 1}`,
        name: `Sectoral ${index + 1}`,
        sector: String(index + 1),
        height: 46 - index * 0.5,
        azimuth: (index * 22.5) % 360,
        leg: 'A',
      })),
    };

    const svg = renderTowerPlanSvg(plan);
    const cards = [...svg.matchAll(
      /<rect data-callout-card="(\d+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
    )].map(([, id, x, y, width, height]) => ({
      id: Number(id),
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
    }));

    assert.equal(cards.length, MAX_ANTENNAS);
    assert.equal(new Set(cards.map((card) => card.id)).size, MAX_ANTENNAS);
    cards.forEach((card, index) => {
      cards.slice(index + 1).forEach((other) => {
        const separated = card.x + card.width <= other.x
          || other.x + other.width <= card.x
          || card.y + card.height <= other.y
          || other.y + other.height <= card.y;
        assert.equal(separated, true, `callout cards ${card.id} and ${other.id} overlap`);
      });
    });
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
    const stateSource = readFileSync(
      new URL('../features/tower-plan/towerPlanState.js', import.meta.url),
      'utf8',
    );
    const storageSource = readFileSync(
      new URL('../features/tower-plan/towerPlanStorage.js', import.meta.url),
      'utf8',
    );

    assert.match(app, /TowerPlanGeneratorPage/);
    assert.match(app, /path="\/tower-plan-generator"/);
    assert.ok(
      sidebar.indexOf("'/rf-tilt-analysis'") < sidebar.indexOf("'/tower-plan-generator'"),
    );
    assert.match(app, /Memuat Tower Visualizer/);
    assert.match(sidebar, /Tower Visualizer/);
    assert.match(breadcrumb, /'tower-plan-generator': 'Tower Visualizer'/);
    assert.match(api, /searchTowerPlanSites/);
    assert.match(api, /fetchTowerPlanConfiguration/);
    assert.doesNotMatch(api, /tower-plan\/ai-capabilities/);
    assert.doesNotMatch(api, /tower-plan\/ai-visualizations/);
    assert.doesNotMatch(api, /generateTowerPlanAiVisualization/);
    assert.doesNotMatch(stateSource, /export function buildAiPayload/);
    assert.doesNotMatch(storageSource, /export async function loadTowerPlanAsset/);
    assert.doesNotMatch(storageSource, /export async function saveTowerPlanAsset/);
    assert.match(storageSource, /createObjectStore\(ASSET_STORE\)/);
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
    const editor = readFileSync(
      new URL('../features/tower-plan/TowerPlanAntennaEditor.jsx', import.meta.url),
      'utf8',
    );

    assert.match(page, /Tower Visualizer/);
    assert.doesNotMatch(page, /Auto-filled/);
    assert.doesNotMatch(page, /Multi-type engineering plan/);
    assert.match(page, /title="Search Site ID"/);
    assert.match(page, /Ketik site id dan Enter/);
    assert.doesNotMatch(page, /Posisi instalasi dihitung otomatis/);
    assert.match(page, /title="Project Data"/);
    assert.doesNotMatch(page, /Parameter utama tower dan orientasi helicopter view/);
    assert.match(page, /TowerPlanAutofillDialog/);
    assert.match(page, /TowerPlanPreview/);
    assert.match(page, /TOWER_TYPES\.map/);
    assert.match(page, /changeTowerType/);
    assert.match(page, /title="Prompt generator"/);
    assert.ok(
      page.indexOf('id="tower-style"') < page.indexOf('id="tower-revision"'),
      'visual style must be configured before the revision instruction',
    );
    assert.ok(
      page.indexOf('id="tower-custom-style"') < page.indexOf('id="tower-revision"'),
      'custom style must be configured before the revision instruction',
    );
    assert.match(page, /Create Prompt/);
    assert.match(page, /Copy/);
    assert.doesNotMatch(page, /Referensi visual/);
    assert.doesNotMatch(page, /Visualisasi AI/);
    assert.doesNotMatch(page, /fetchTowerPlanAiCapabilities/);
    assert.doesNotMatch(page, /generateTowerPlanAiVisualization/);
    assert.doesNotMatch(page, /loadTowerPlanAsset/);
    assert.doesNotMatch(page, /saveTowerPlanAsset/);
    assert.doesNotMatch(page, /manualImageUrl|aiImageUrl|aiCapabilities|aiMode|aiLoading/);
    assert.match(page, /Urungkan/);
    assert.match(
      page,
      /tower-revision[\s\S]{0,500}setRevisionInstruction[\s\S]{0,200}setPromptOutput\(''\)/,
    );
    assert.match(page, /title="Download"/);
    assert.match(page, /PNG file/);
    assert.match(page, /SVG file/);
    assert.doesNotMatch(page, /Export JSON|Import JSON|jsonInputRef/);
    assert.doesNotMatch(page, /title="Validation"/);
    assert.match(page, /Konfigurasi valid/);
    assert.doesNotMatch(editor, /Operator\/owner/);
    assert.match(editor, /Mechanical Tilt \(MT\)/);
    assert.doesNotMatch(editor, /Electrical Tilt \(ET\)/);
    assert.match(review, /Review Auto-fill/);
    assert.match(review, /Terapkan konfigurasi/);
    assert.match(review, /maksimal 16/i);
    assert.match(review, /sector_base \+ antenna_type \+ antenna_height/);
    assert.match(review, /azimuthConflict/);
    assert.doesNotMatch(preview, /Sumber engineering deterministik/);
    assert.doesNotMatch(preview, /BadgeCheck|validationErrors/);
  });
});
