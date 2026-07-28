# Tower Visualizer Download, Tilt, and SVG Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Simplify Tower Visualizer downloads, auto-fill MT/ET safely, and produce a red-white engineering SVG with collision-safe labels.

**Architecture:** Keep the existing Site ID and ransys_gabungan grouping path, but add deterministic group-level tilt consensus fields to its API contract. Map those fields into the persisted antenna state and shared SVG renderer. The page becomes a minimal Download surface while validation continues to gate prompt and binary download actions through the existing notice flow.

**Tech Stack:** FastAPI/Pydantic/SQLAlchemy async, React 19, SVG string renderer, Node test runner, pytest, ESLint, Vite.

## Global Constraints

- Preserve physical antenna grouping by sector_base + antenna_type + antenna_height and existing CID/azimuth behavior.
- A tilt conflict must never select a source-cell value automatically or block applying a valid antenna group.
- Preserve legacy operator data in stored plans but remove its editable UI field.
- Expose exactly PNG file and SVG file in the Download panel; do not expose JSON import/export controls.
- Keep valid-plan gating for prompt and binary download actions; show only a compact green valid notice in the aside.
- Render MT/ET only when a value is present; blank tilt is valid.
- Retain Four-leg, Three-leg, and Monopole structures and support up to 16 antennas.

---

## File Structure

- backend/models/tower_plan.py — public response fields for group-level tilt consensus.
- backend/routers/tower_plan.py — deterministic consensus calculation from grouped ransys_gabungan cells.
- backend/tests/test_tower_plan.py — server contracts for unanimous, missing, and conflicting tilt data.
- frontend/src/features/tower-plan/towerPlanState.js — antenna MT/ET state, auto-fill mapping, and prompt text.
- frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx — MT/ET controls and removal of the operator input.
- frontend/src/pages/TowerPlanGeneratorPage.jsx — Download-only panel and compact valid state.
- frontend/src/features/tower-plan/towerPlanGeometry.js — widened drawing/footer constants.
- frontend/src/features/tower-plan/towerPlanSvg.js — red-white structure, wrapped dynamic callouts, footer-aligned helicopter panel, and collision-safe labels.
- frontend/src/__tests__/towerPlanContracts.test.js — frontend data, page, and SVG output contracts.

### Task 1: Add conflict-safe tilt consensus to the Tower Plan API

**Files:**
- Modify: backend/models/tower_plan.py
- Modify: backend/routers/tower_plan.py
- Modify: backend/tests/test_tower_plan.py

**Interfaces:**
- Consumes: per-cell mechanical_tilt and electrical_tilt already selected by _site_configuration_query().
- Produces: TowerPlanAntennaGroup.mechanical_tilt_deg, electrical_tilt_deg, mechanical_tilt_conflict, and electrical_tilt_conflict.

- [ ] **Step 1: Write failing backend consensus tests**

~~~python
def test_grouping_uses_unanimous_tilt_and_flags_conflicts():
    groups, warnings = group_antenna_rows([
        {**base_row, "cell_name": "CELL-1", "mechanical_tilt": 1, "electrical_tilt": 2},
        {**base_row, "cell_name": "CELL-2", "mechanical_tilt": 1, "electrical_tilt": 3},
    ])

    assert groups[0].mechanical_tilt_deg == 1
    assert groups[0].mechanical_tilt_conflict is False
    assert groups[0].electrical_tilt_deg is None
    assert groups[0].electrical_tilt_conflict is True
    assert any("electrical tilt" in warning.lower() for warning in warnings)
~~~

Also add a fixture with None plus one numeric value and assert that the one available value is returned without conflict.

- [ ] **Step 2: Run test to verify it fails**

Run: pytest backend/tests/test_tower_plan.py -k tilt -q

Expected: FAIL because TowerPlanAntennaGroup has no group-level tilt fields.

- [ ] **Step 3: Implement consensus fields and warning helper**

~~~python
def _resolve_group_tilt(cells, field):
    values = {
        float(value)
        for cell in cells
        if (value := getattr(cell, field)) is not None
    }
    if len(values) == 1:
        return values.pop(), False
    return None, len(values) > 1
~~~

Add the four Pydantic fields with None/False defaults. Resolve both fields for every group, append one actionable warning for each conflict, and assign the fields to TowerPlanAntennaGroup without changing its grouping key.

- [ ] **Step 4: Run backend contracts to verify they pass**

Run: pytest backend/tests/test_tower_plan.py -q

Expected: PASS, including source-column fallback and CID grouping tests.

- [ ] **Step 5: Commit the API contract**

~~~bash
git add backend/models/tower_plan.py backend/routers/tower_plan.py backend/tests/test_tower_plan.py
git commit -m "feat: expose tower plan tilt consensus"
~~~

### Task 2: Carry MT/ET through antenna state and simplify the workbench

**Files:**
- Modify: frontend/src/features/tower-plan/towerPlanState.js
- Modify: frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx
- Modify: frontend/src/pages/TowerPlanGeneratorPage.jsx
- Modify: frontend/src/__tests__/towerPlanContracts.test.js

**Interfaces:**
- Consumes: API group fields from Task 1 and current updateAntenna/buildEngineeringPrompt behavior.
- Produces: persisted mechanicalTilt and electricalTilt antenna properties; Download-only UI.

- [ ] **Step 1: Write failing frontend state and page contracts**

~~~js
const draft = buildAutofillDraft({
  ...groupedConfiguration,
  antennas: [{
    ...groupedConfiguration.antennas[0],
    mechanical_tilt_deg: 1,
    electrical_tilt_deg: 2,
    mechanical_tilt_conflict: false,
    electrical_tilt_conflict: false,
  }],
});
const applied = applyAutofillDraft(createBlankTowerPlan(), draft);

assert.equal(applied.antennas[0].mechanicalTilt, 1);
assert.equal(applied.antennas[0].electricalTilt, 2);
assert.match(buildEngineeringPrompt(applied), /mechanical tilt 1°; electrical tilt 2°/i);
assert.doesNotMatch(editorSource, /Operator\/owner/);
assert.match(editorSource, /Mechanical Tilt \(MT\)/);
assert.match(page, /title="Download"/);
assert.doesNotMatch(page, /Export JSON|Import JSON|title="Validation"/);
~~~

- [ ] **Step 2: Run the frontend Tower Plan contracts to verify they fail**

Run: node --test src/__tests__/towerPlanContracts.test.js

Expected: FAIL because state has no tilt properties and the page still shows JSON/Validation UI.

- [ ] **Step 3: Implement state, controls, and Download panel**

~~~js
mechanicalTilt: numericOrBlank(antenna.mechanicalTilt, ''),
electricalTilt: numericOrBlank(antenna.electricalTilt, ''),
~~~

Map mechanical_tilt_deg/electrical_tilt_deg in buildAutofillDraft(), preserve both during normalize/migration/duplicate/update, and include non-blank degree values in each engineering prompt line. Add MT and ET number inputs with step="0.1"; remove only the visible operator form group. Remove exportJson, importJson, jsonInputRef, FileJson, and Upload from the page. Render two flex-1 Download buttons in one row and a green valid check only when validationErrors.length is zero.

- [ ] **Step 4: Run frontend contracts to verify they pass**

Run: node --test src/__tests__/towerPlanContracts.test.js

Expected: PASS, including legacy migration, CID, prompt, and page-wiring contracts.

- [ ] **Step 5: Commit the workbench changes**

~~~bash
git add frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower plan tilt controls"
~~~

### Task 3: Redesign the shared SVG for legibility and collision safety

**Files:**
- Modify: frontend/src/features/tower-plan/towerPlanGeometry.js
- Modify: frontend/src/features/tower-plan/towerPlanSvg.js
- Modify: frontend/src/__tests__/towerPlanContracts.test.js

**Interfaces:**
- Consumes: normalized antenna MT/ET state from Task 2 and all tower geometries.
- Produces: widened red-white SVG, dynamic callout card layout, and footer-aligned helicopter view with non-overlapping sector labels.

- [ ] **Step 1: Write failing SVG geometry contracts**

~~~js
assert.match(svg, /viewBox="0 0 1200 1536"/);
assert.match(svg, /id="tower-red-white"/);
assert.match(svg, /MT: 1° · ET: 2°/);
assert.equal((svg.match(/data-callout-title-line=/g) || []).length >= 2, true);
assert.equal((svg.match(/data-helicopter-label-box=/g) || []).length, plan.antennas.length);
assert.equal(helicopterBottom, footerBottom);
~~~

Use a 16-antenna fixture with long names and close azimuth/height values. Parse data-callout-card and data-helicopter-label-box coordinates, assert that no two cards overlap, no two label boxes overlap, every box stays within the canvas/panel, and the tower-height dimension corridor ends before the left callout column.

- [ ] **Step 2: Run the SVG contracts to verify they fail**

Run: node --test src/__tests__/towerPlanContracts.test.js

Expected: FAIL because the current renderer is 1024 px wide, uses a slate steel gradient, fixed-height cards, and direct helicopter label placement.

- [ ] **Step 3: Implement widened layout and SVG helpers**

~~~js
function wrapSvgText(value, maxCharacters, maxLines) {
  const words = String(value).trim().split(/\s+/);
  return words.reduce((lines, word) => {
    const current = lines.at(-1) || '';
    const proposed = [current, word].filter(Boolean).join(' ');
    if (current && proposed.length > maxCharacters && lines.length < maxLines) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = proposed;
    }
    return lines;
  }, ['']);
}
~~~

Set TOWER_DRAWING_LAYOUT.canvasWidth to 1200, move the tower center, callout columns, and footer to named constants, and reserve a left dimension corridor. Replace steel with tower-red-white stops #b42318, #ffffff, #e11d48; update lattice rings/braces to complementary red/pink strokes. Generate multiline callout headers, dynamic header/card heights, MT/ET detail text, and stacked side slots. Move the helicopter panel into the footer row, resize it to fit its shared baseline, and choose the first in-panel non-overlapping SEC/azimuth label box from deterministic radial/perpendicular offset candidates.

- [ ] **Step 4: Run SVG and Tower Plan contracts to verify they pass**

Run: node --test src/__tests__/towerPlanContracts.test.js

Expected: PASS for Four-leg, Three-leg, Monopole, 16 callouts, footer alignment, and non-overlap checks.

- [ ] **Step 5: Commit the renderer**

~~~bash
git add frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: refine tower visualizer engineering svg"
~~~

### Task 4: Verify the completed Tower Visualizer flow

**Files:**
- Verify: backend/tests/test_tower_plan.py
- Verify: frontend/src/__tests__/towerPlanContracts.test.js
- Verify: frontend/src/__tests__/*.test.js

**Interfaces:**
- Consumes: all API, state, workbench, and SVG changes from Tasks 1–3.
- Produces: evidence that auto-fill, PNG/SVG download, and all tower renderings remain stable.

- [ ] **Step 1: Run backend and focused frontend regression suites**

Run: pytest backend/tests/test_tower_plan.py -q and node --test src/__tests__/towerPlanContracts.test.js

Expected: both exit with zero failures.

- [ ] **Step 2: Run complete frontend quality gates**

Run: node --test src/__tests__/*.test.js, npm run lint, and npm run build

Expected: all commands exit 0; Vite may emit its existing large-chunk advisory only.

- [ ] **Step 3: Verify authenticated local rendering**

Open the worktree server at http://127.0.0.1:5174/tower-plan-generator. Load a Site ID and check MT/ET auto-fill, manual edits, two Download actions, compact valid notice, long callout wrapping, no helicopter-label collisions, red-white tower structure, and Four-leg/Three-leg/Monopole previews.

- [ ] **Step 4: Commit only required follow-up corrections**

~~~bash
git add backend/models/tower_plan.py backend/routers/tower_plan.py backend/tests/test_tower_plan.py frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: complete tower visualizer refinement"
~~~

