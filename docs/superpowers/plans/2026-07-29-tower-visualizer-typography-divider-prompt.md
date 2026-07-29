# Tower Visualizer Typography, Divider, and Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tower Visualizer document details readable and configurable, add a professional tower/sidebar divider, rename the default workflow note, and align the prompt with the current 1900 × 1200 export.

**Architecture:** Extend the existing versioned document settings with normalized typography state, then resolve reusable SVG text metrics from that state. Keep the fixed canvas and deterministic geometry; reflow individual cards instead of scaling the whole SVG. The existing editor, renderer, prompt builder, and storage migration remain the integration boundaries.

**Tech Stack:** React 19, JavaScript ES modules, deterministic SVG strings, Node test runner, ESLint, Vite.

## Global Constraints

- Keep the SVG canvas fixed at 1900 × 1200.
- Detail font presets are Small 11 px, Standard 13 px, Large 15 px, and Custom 10–16 px.
- Standard 13 px is the default.
- Do not add dependencies.
- Preserve custom workflow-note titles during migration.
- Blank notes remain absent from SVG and prompt.
- Preserve all unrelated untracked files in `D:\Web-dashboard`.

---

### Task 1: Versioned typography state and workflow-note migration

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanDocument.js`
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Modify: `frontend/src/features/tower-plan/towerPlanStorage.js`
- Modify: `frontend/src/__tests__/towerPlanDocument.test.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Produces: `DETAIL_FONT_PRESETS`, `normalizeDetailTypography(raw)`, and `resolveDetailTypography(plan)`.
- Produces plan fields: `detailFontPreset` and `detailFontSize`.
- Consumed later by `TowerPlanDocumentEditor`, `renderTowerPlanSvg`, and `buildEngineeringPrompt`.

- [ ] **Step 1: Write failing state and migration tests**

Add tests asserting:

```js
assert.equal(TOWER_PLAN_SCHEMA_VERSION, 8);
assert.equal(createBlankTowerPlan().documentNote.title, 'Skenario Pekerjaan');
assert.deepEqual(
  normalizeDetailTypography({ detailFontPreset: 'large', detailFontSize: 10 }),
  { detailFontPreset: 'large', detailFontSize: 15 },
);
assert.deepEqual(
  normalizeDetailTypography({ detailFontPreset: 'custom', detailFontSize: 99 }),
  { detailFontPreset: 'custom', detailFontSize: 16 },
);
assert.equal(
  migrateTowerPlan({
    schemaVersion: 7,
    documentNote: { title: 'WORKFLOW NOTE', text: '', headerColor: '#17263b' },
    antennas: [],
  }).documentNote.title,
  'Skenario Pekerjaan',
);
assert.equal(
  migrateTowerPlan({
    schemaVersion: 7,
    documentNote: { title: 'INSTALL FLOW', text: '', headerColor: '#17263b' },
    antennas: [],
  }).documentNote.title,
  'INSTALL FLOW',
);
```

Extend storage source contracts to require `nod_tower_plan_draft_v8` before
the retained v7 fallback.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because schema 8, typography helpers, and the new default title
do not exist.

- [ ] **Step 3: Implement normalized typography state**

In `towerPlanDocument.js`, add:

```js
export const DETAIL_FONT_PRESETS = Object.freeze([
  { id: 'small', label: 'Small', size: 11 },
  { id: 'standard', label: 'Standard', size: 13 },
  { id: 'large', label: 'Large', size: 15 },
  { id: 'custom', label: 'Custom', size: null },
]);

export function normalizeDetailTypography(raw = {}) {
  const preset = DETAIL_FONT_PRESETS.find(
    (candidate) => candidate.id === raw.detailFontPreset,
  ) || DETAIL_FONT_PRESETS[1];
  const customSize = Math.min(16, Math.max(10, Number(raw.detailFontSize) || 13));
  return {
    detailFontPreset: preset.id,
    detailFontSize: preset.size ?? customSize,
  };
}
```

Set `DEFAULT_DOCUMENT_NOTE.title` to `Skenario Pekerjaan`. During
normalization, treat a blank title or exact former default `WORKFLOW NOTE` as
the new default, while preserving any other title. Include typography in
`normalizeDocumentSettings()` and expose `resolveDetailTypography(plan)` with
stable text metrics:

```js
{
  size,
  titleSize: Math.min(16, size + 1),
  lineHeight: size + 4,
  noteLineHeight: size + 5,
  wrapCharacters: Math.max(26, Math.round(40 * 13 / size)),
}
```

Bump `TOWER_PLAN_SCHEMA_VERSION` to 8 and add `nod_tower_plan_draft_v8` as the
current storage key while retaining v7 through v4 fallbacks.

- [ ] **Step 4: Run focused tests and lint**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- frontend/src/features/tower-plan/towerPlanDocument.js frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/towerPlanStorage.js frontend/src/__tests__/towerPlanDocument.test.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower detail typography state"
```

---

### Task 2: Adaptive SVG typography and professional divider

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanGeometry.js`
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `resolveDetailTypography(plan)`.
- Produces: SVG attributes `data-detail-font-size`, `data-layout-divider`,
  `data-callout-font-size`, and existing geometry attributes with adaptive
  card sizes.

- [ ] **Step 1: Write failing SVG layout tests**

For a Large 15 px plan with 16 antennas, assert:

```js
assert.match(svg, /data-detail-font-size="15"/);
assert.match(svg, /data-layout-divider="true"/);
assert.match(svg, /data-callout-font-size="15"/);
assert.match(svg, /data-note-title="Skenario Pekerjaan"/);
```

Parse all callout rectangles and retain the existing non-overlap and
inside-canvas assertions. Add:

```js
assert.ok(
  Math.max(...cards.map((card) => card.x + card.width))
    < TOWER_DRAWING_LAYOUT.sidebarDividerX,
);
assert.ok(TOWER_DRAWING_LAYOUT.sidebarDividerX < TOWER_DRAWING_LAYOUT.sidebar.siteData.x);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because the divider and adaptive typography attributes are
absent.

- [ ] **Step 3: Add divider geometry and adaptive text metrics**

Add `sidebarDividerX: 1285` to `TOWER_DRAWING_LAYOUT`. Render a divider before
the sidebar cards:

```svg
<g data-layout-divider="true" data-divider-x="1285">
  <line x1="1285" y1="122" x2="1285" y2="1092"
    stroke="{palette.guide}" stroke-width="2"/>
  <line x1="1285" y1="122" x2="1285" y2="174"
    stroke="#17263b" stroke-width="6"/>
  <line x1="1285" y1="1040" x2="1285" y2="1092"
    stroke="#17263b" stroke-width="6"/>
</g>
```

Use `resolveDetailTypography(state)` in callouts, Site Data, Legend,
Helicopter View, and note. Derive title wrapping, header height, detail line
height, and note height from the resolved metrics. Preserve the existing
maximum two-line callout title and fixed right-panel geometry.

Emit resolved size attributes on the root SVG and callout text. Include
`data-note-title` on the optional note group.

- [ ] **Step 4: Run focused tests and lint**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
npm run lint
```

Expected: PASS with all 16 Large-font callouts contained and separated.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: improve tower drawing readability"
```

---

### Task 3: Font controls and current-layout prompt

**Files:**
- Modify: `frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx`
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Modify: `frontend/src/__tests__/towerPlanDocument.test.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `DETAIL_FONT_PRESETS`.
- Produces user changes through the existing `onChange(partialPlan)` boundary.
- Updates `buildEngineeringPrompt(state, revisionInstruction)`.

- [ ] **Step 1: Write failing UI and prompt tests**

Add source contracts for `Detail font size`, `DETAIL_FONT_PRESETS`,
`detailFontPreset`, `detailFontSize`, `min={10}`, and `max={16}`.

Add a prompt test:

```js
const plan = {
  ...createBlankTowerPlan(),
  siteName: 'PSN005',
  towerHeight: 72,
  legABearingDeg: 45,
  detailFontPreset: 'large',
  detailFontSize: 15,
  documentNote: {
    title: 'Skenario Pekerjaan',
    text: 'Add RRUS then install antenna APE.',
    headerColor: '#8b2f23',
  },
};
const prompt = buildEngineeringPrompt(plan);
assert.match(prompt, /1900 × 1200 landscape/);
assert.match(prompt, /alternating red-and-white 10-metre paint blocks/);
assert.match(prompt, /vertical divider/);
assert.match(prompt, /Site Data, Legend, Helicopter View/);
assert.match(prompt, /15 px detail text/);
assert.match(prompt, /Skenario Pekerjaan/);
assert.match(prompt, /Add RRUS then install antenna APE/);
```

Also assert that a blank note title/body is not described.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
```

Expected: FAIL because UI wiring and current-layout prompt wording are absent.

- [ ] **Step 3: Implement the editor and prompt**

Render four preset buttons below Background using the existing selected button
styles. Selecting a curated preset writes its fixed size. Selecting Custom
preserves the current normalized size and reveals:

```jsx
<Input
  id="tower-custom-detail-font-size"
  max={16}
  min={10}
  type="number"
  value={plan.detailFontSize}
  onChange={(event) => onChange({
    detailFontPreset: 'custom',
    detailFontSize: Math.min(16, Math.max(10, Number(event.target.value) || 13)),
  })}
/>
```

Change the empty-title fallback to `Skenario Pekerjaan`.

Extend `buildEngineeringPrompt()` with natural instructions describing the
fixed landscape layout, 10-metre paint bands, callout placement, divider,
right-panel order, resolved font size, background, and optional note. Do not
add words such as `template`, `deterministic`, or `schema`.

- [ ] **Step 4: Run focused tests and lint**

Run:

```powershell
node --test src/__tests__/towerPlanDocument.test.js src/__tests__/towerPlanContracts.test.js
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx frontend/src/features/tower-plan/towerPlanState.js frontend/src/__tests__/towerPlanDocument.test.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower font controls and current prompt"
```

---

### Task 4: Full regression and browser verification

**Files:**
- Modify only if a defect is found: files changed in Tasks 1–3.

**Interfaces:**
- Verifies the complete Tower Visualizer workbench and export pipeline.

- [ ] **Step 1: Run the complete frontend verification**

```powershell
node --test src/__tests__/*.test.js
npm run lint
npm run build
git diff --check main...HEAD
```

Expected: all tests pass, ESLint exits 0, Vite build exits 0, and diff check is
empty.

- [ ] **Step 2: Verify the local browser flow**

At `http://127.0.0.1:5174/tower-plan-generator`:

1. Confirm `Skenario Pekerjaan` is the default/fallback note title.
2. Select Standard, Large, and Custom 16 px.
3. Add a short note and open the large preview.
4. Verify fonts enlarge, divider remains between callouts and sidebar, and no
   text overlaps.
5. Create Prompt and verify it mentions the current layout, 16 px detail text,
   selected background, and note.
6. Verify Zoom In, Reset, and close still work.
7. Confirm browser console contains zero errors.
8. Restore the pre-QA draft values.

- [ ] **Step 3: Commit any QA-only correction**

If QA required a code correction, rerun Step 1 and commit only the corrected
Tower Visualizer files. If no correction was required, do not create an empty
commit.
