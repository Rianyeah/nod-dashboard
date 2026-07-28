# Tower Visualizer Paint, Mechanical Tilt, and Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render alternating 10 m red-white tower paint, auto-fill the modal Mechanical Tilt for a physical antenna group, remove Electrical Tilt from Tower Visualizer, and reorganize the SVG footer.

**Architecture:** Keep the existing `ransys_gabungan` site query and physical antenna grouping key. Replace the old all-values-must-match tilt calculation with a deterministic modal-value resolver for MT, then map only MT into persisted frontend antenna state. Use shared geometry constants and SVG helpers to draw physical paint bands and a two-column footer that supplies the helicopter panel with more usable label area.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, React 19, SVG string renderer, Node test runner, pytest, ESLint, Vite.

## Global Constraints

- Retain the physical antenna grouping key `sector_base + antenna_type + antenna_height`, CID extraction, azimuth rules, and all three tower types.
- Count `TOTAL CELL` from unique non-empty CID values across displayed antenna records.
- Resolve Mechanical Tilt from the unique highest-frequency normalized source value; a tied highest frequency is blank and warns.
- Remove Electrical Tilt only from Tower Visualizer; do not modify RF Tilt Analysis data or controls.
- Paint every tower in 10 m red-white elevation bands beginning with red at ground level.
- Preserve collision-safe helicopter labels and support up to 16 antennas.

---

## File Structure

- `backend/models/tower_plan.py` — Tower Plan API response models for source-cell and group tilt data.
- `backend/routers/tower_plan.py` — source-value normalization, MT frequency resolution, and API warning generation.
- `backend/tests/test_tower_plan.py` — grouping contracts for MT mode/tie and Electrical Tilt removal.
- `frontend/src/features/tower-plan/towerPlanState.js` — MT-only antenna normalization, auto-fill mapping, migration, and prompt generation.
- `frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx` — MT-only input form.
- `frontend/src/features/tower-plan/towerPlanGeometry.js` — footer layout constants shared by renderer and exports.
- `frontend/src/features/tower-plan/towerPlanSvg.js` — paint-band drawing, MT-only callout text, Site Data totals, and stacked footer rendering.
- `frontend/src/__tests__/towerPlanContracts.test.js` — frontend auto-fill/editor/prompt/SVG regression contracts.

### Task 1: Resolve Mechanical Tilt by frequency and remove Electrical Tilt group data

**Files:**
- Modify: `backend/models/tower_plan.py`
- Modify: `backend/routers/tower_plan.py`
- Modify: `backend/tests/test_tower_plan.py`

**Interfaces:**
- Consumes: `TowerPlanSourceCell.mechanical_tilt` values from the existing `ransys_gabungan` query.
- Produces: `TowerPlanAntennaGroup.mechanical_tilt_deg: float | None` and `mechanical_tilt_conflict: bool`; no Electrical Tilt group fields.

- [ ] **Step 1: Write the failing group-resolution test**

```python
groups, warnings = group_antenna_rows([
    {**base, "cell_name": "CELL-1", "mechanical_tilt": 2},
    {**base, "cell_name": "CELL-2", "mechanical_tilt": 2},
    {**base, "cell_name": "CELL-3", "mechanical_tilt": 1},
])

assert groups[0].mechanical_tilt_deg == 2
assert groups[0].mechanical_tilt_conflict is False
assert not any("mechanical tilt" in warning.lower() for warning in warnings)
assert "electrical_tilt_deg" not in groups[0].model_dump()
```

Add independent cases for `0` as the highest-frequency value and a `1`/`2` tie that returns `None` plus a Mechanical Tilt warning.

- [ ] **Step 2: Run the backend test to verify it fails**

Run: `pytest backend/tests/test_tower_plan.py -k tilt -q`

Expected: FAIL because the current resolver requires all source values to agree and returns Electrical Tilt group fields.

- [ ] **Step 3: Implement the modal MT resolver**

```python
def _resolve_group_mechanical_tilt(cells: Iterable[TowerPlanSourceCell]) -> tuple[float | None, bool]:
    frequencies: Counter[Decimal] = Counter()
    for cell in cells:
        if cell.mechanical_tilt is None:
            continue
        try:
            frequencies[_one_decimal(cell.mechanical_tilt)] += 1
        except ValueError:
            continue
    if not frequencies:
        return None, False
    highest_count = max(frequencies.values())
    winners = [value for value, count in frequencies.items() if count == highest_count]
    if len(winners) != 1:
        return None, True
    return _display_number(winners[0]), False
```

Remove `electrical_tilt_deg` and `electrical_tilt_conflict` from `TowerPlanAntennaGroup`, stop resolving/issuing Electrical Tilt warnings, and retain raw source-cell Electrical Tilt only if required for existing source metadata compatibility.

- [ ] **Step 4: Run the focused backend contract**

Run: `pytest backend/tests/test_tower_plan.py -k tilt -q`

Expected: PASS with majority, zero, tie, CID, and group-key behavior intact.

- [ ] **Step 5: Commit the API contract**

```bash
git add backend/models/tower_plan.py backend/routers/tower_plan.py backend/tests/test_tower_plan.py
git commit -m "fix: resolve tower mechanical tilt by frequency"
```

### Task 2: Make frontend antenna state Mechanical Tilt only

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Modify: `frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: API `mechanical_tilt_deg` and `mechanical_tilt_conflict` from Task 1.
- Produces: persisted `mechanicalTilt` antenna values and MT-only prompt/editor output.

- [ ] **Step 1: Write failing state and editor contracts**

```js
const draft = buildAutofillDraft({
  ...groupedConfiguration,
  antennas: [{
    ...groupedConfiguration.antennas[0],
    mechanical_tilt_deg: 2,
    mechanical_tilt_conflict: false,
  }],
});
const applied = applyAutofillDraft(createBlankTowerPlan(), draft);

assert.equal(applied.antennas[0].mechanicalTilt, 2);
assert.match(buildEngineeringPrompt(applied), /mechanical tilt 2°/i);
assert.doesNotMatch(buildEngineeringPrompt(applied), /electrical tilt/i);
assert.match(editorSource, /Mechanical Tilt \(MT\)/);
assert.doesNotMatch(editorSource, /Electrical Tilt \(ET\)/);
```

Add a migration assertion that a stored legacy `electricalTilt` value does not reappear in normalized state or SVG output.

- [ ] **Step 2: Run the frontend contract to verify it fails**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: FAIL because Electrical Tilt remains in state, input markup, prompts, and SVG callouts.

- [ ] **Step 3: Implement the MT-only state path**

```js
mechanicalTilt: numericOrBlank(antenna.mechanicalTilt, ''),
```

Delete `electricalTilt` normalization, auto-fill mapping, conflict metadata, prompt wording, editor input, and SVG detail text. Keep `mechanicalTilt` blank for a reported tie and preserve manual MT values across local-draft migration.

- [ ] **Step 4: Run the frontend state contract**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: PASS for MT auto-fill/manual editing and no Tower Visualizer ET surfaces.

- [ ] **Step 5: Commit the frontend MT-only change**

```bash
git add frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: simplify tower visualizer tilt data"
```

### Task 3: Render 10 m paint bands and the new footer

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanGeometry.js`
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: normalized MT-only antenna state, `normalizeCids`, and `TOWER_DRAWING_LAYOUT`.
- Produces: structured SVG data attributes `data-tower-paint-band`, `data-footer-card`, and `data-helicopter-panel` for regression checks.

- [ ] **Step 1: Write failing SVG layout contracts**

```js
assert.match(svg, /data-tower-paint-band="0" data-paint-color="red"/);
assert.match(svg, /data-tower-paint-band="1" data-paint-color="white"/);
assert.match(svg, /TOTAL ANTENNA: <tspan font-weight="700">3<\/tspan>/);
assert.match(svg, /TOTAL CELL: <tspan font-weight="700">5<\/tspan>/);
assert.ok(legend.y >= siteData.y + siteData.height);
assert.equal(helicopter.y, siteData.y);
assert.equal(helicopter.height, legend.y + legend.height - siteData.y);
```

Run the assertions for Four-leg, Three-leg, and Monopole plans. Use duplicate CIDs in different antennas to verify Total Cell counts unique values once.

- [ ] **Step 2: Run the SVG contract to verify it fails**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: FAIL because the renderer uses one gradient and places Legend alongside Site Data.

- [ ] **Step 3: Implement segmented paint and footer helpers**

```js
function paintBandForHeight(height) {
  const index = Math.max(0, Math.floor(Number(height) / 10));
  return { index, color: index % 2 === 0 ? 'red' : 'white' };
}
```

Split legs and monopole shaft paths at every 10 m boundary. Render white members with a gray under-stroke. Move footer constants so `siteData` and `legend` form a left stack while `helicopterPanel` spans the matching right-side height. Calculate `totalAntennas` and unique `totalCells` before emitting Site Data markup. Remove obsolete duplicate footer markup rather than covering it with a white rectangle.

- [ ] **Step 4: Run the SVG contract**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: PASS for paint alternation, footer geometry, totals, callout wrapping, and non-overlapping helicopter labels.

- [ ] **Step 5: Commit the SVG renderer**

```bash
git add frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: refine tower visualizer paint and footer"
```

### Task 4: Verify the integrated local Tower Visualizer

**Files:**
- Verify: `backend/tests/test_tower_plan.py`
- Verify: `frontend/src/__tests__/towerPlanContracts.test.js`
- Verify: `frontend/src/__tests__/*.test.js`

**Interfaces:**
- Consumes: all API, editor, state, and SVG changes from Tasks 1–3.
- Produces: evidence for local auto-fill and download-ready rendering at `/tower-plan-generator`.

- [ ] **Step 1: Run focused test suites**

Run: `pytest backend/tests/test_tower_plan.py -q` and `node --test src/__tests__/towerPlanContracts.test.js`

Expected: both commands exit with zero failures.

- [ ] **Step 2: Run repository quality gates**

Run: `node --test src/__tests__/*.test.js`, `npm run lint`, and `npm run build`

Expected: each exits with code 0. Existing Vite asset-size advisory is acceptable if no build error occurs.

- [ ] **Step 3: Verify in the local dashboard**

Open `http://127.0.0.1:5174/tower-plan-generator`, search a populated Site ID, and inspect that MT appears for an unambiguous mode, ET has no Tower Visualizer input or SVG text, paint bands alternate every 10 m, totals are correct, Legend is below Site Data, and helicopter labels remain separated for Four-leg, Three-leg, and Monopole choices.

- [ ] **Step 4: Commit only verified corrections**

```bash
git add backend/models/tower_plan.py backend/routers/tower_plan.py backend/tests/test_tower_plan.py frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: complete tower visualizer refinement"
```
