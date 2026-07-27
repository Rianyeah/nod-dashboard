# Tower Plan Generator Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Tower Plan Generator search, RF grouping and CID handling, add three-leg and monopole tower types, and make the deterministic SVG base geometry and Helicopter View precise.

**Architecture:** Keep the existing FastAPI and React feature boundaries, but make RF grouping a backend domain contract and move tower geometry into a focused frontend module. The page consumes normalized grouped data, migrates existing drafts, and renders all tower types through one configuration-driven SVG engine.

**Tech Stack:** Python 3.14, FastAPI, Pydantic, SQLAlchemy async, React 19, Vite 8, Node test runner, Tailwind/shadcn primitives, deterministic SVG, Playwright CLI.

## Global Constraints

- `sector_base` is the authoritative grouping sector.
- Grouping key is normalized `sector_base + antenna_type + antenna_height`; azimuth and CID are metadata, not grouping keys.
- CID is the non-empty suffix after the final underscore in `enodeb_ci`, with `ci` fallback.
- Four-leg uses A–D at 90-degree ranges; three-leg uses A–C at 120-degree ranges; monopole uses Mounting Side A–D at 90-degree ranges.
- Existing v4/v5 drafts and JSON imports must migrate without losing antennas or CID values.
- SVG/PNG remains the deterministic engineering source; AI output remains optional and separate.
- Use the existing NOD Dashboard theme and component primitives.
- Do not add dependencies.

---

### Task 1: Backend CID and physical antenna grouping

**Files:**
- Modify: `backend/models/tower_plan.py`
- Modify: `backend/routers/tower_plan.py`
- Test: `backend/tests/test_tower_plan.py`

**Interfaces:**
- Produces: `extract_cid(enodeb_ci: Any, fallback_ci: Any) -> str | None`
- Produces: `TowerPlanAntennaGroup.cids: list[str]`
- Produces: `TowerPlanAntennaGroup.azimuth_values_deg: list[float]`
- Produces: `TowerPlanAntennaGroup.azimuth_conflict: bool`
- Produces: `TowerPlanAntennaGroup.azimuth_deg: float | None`
- Consumes: rows returned by `_site_configuration_query()`

- [ ] **Step 1: Write failing CID and grouping tests**

Add literal behavior tests:

```python
def test_extract_cid_uses_enodeb_suffix_and_ci_fallback():
    assert extract_cid("225003_14", 99) == "14"
    assert extract_cid(" 225003_14 ", 99) == "14"
    assert extract_cid("", 99) == "99"
    assert extract_cid(None, None) is None


def test_grouping_uses_sector_model_and_height_and_retains_all_cids():
    rows = [
        {
            "cell_name": "CELL-11",
            "sector": 1,
            "antenna_type": "MODEL-A",
            "antenna_height": 43,
            "azimuth": 60,
            "enodeb_ci": "225003_11",
            "ci": 11,
        },
        {
            "cell_name": "CELL-14",
            "sector": "1",
            "antenna_type": " model-a ",
            "antenna_height": 43.04,
            "azimuth": 60,
            "enodeb_ci": "225003_14",
            "ci": 14,
        },
    ]

    groups, warnings = group_antenna_rows(rows)

    assert warnings == []
    assert len(groups) == 1
    assert groups[0].cids == ["11", "14"]
    assert groups[0].azimuth_values_deg == [60]
    assert groups[0].azimuth_conflict is False
    assert groups[0].azimuth_deg == 60
```

Add a separate conflict test expecting one group, `azimuth_deg is None`, `azimuth_values_deg == [60, 65]`, and `azimuth_conflict is True`.

- [ ] **Step 2: Run tests and confirm RED**

Run:

```powershell
python -m pytest tests/test_tower_plan.py -q
```

Expected: failures because `extract_cid`, `cids`, and azimuth conflict fields do not exist and azimuth is still part of the grouping key.

- [ ] **Step 3: Implement the backend contract**

Add fields:

```python
class TowerPlanAntennaGroup(BaseModel):
    # existing fields
    azimuth_deg: float | None = None
    leg: TowerPlanLeg | None = None
    azimuth_values_deg: list[float] = Field(default_factory=list)
    azimuth_conflict: bool = False
    cids: list[str] = Field(default_factory=list)
```

Implement:

```python
def extract_cid(enodeb_ci: Any, fallback_ci: Any) -> str | None:
    source = _optional_text(enodeb_ci)
    if source:
        suffix = source.rsplit("_", 1)[-1].strip()
        if suffix:
            return suffix
    return _optional_text(fallback_ci)
```

Add `enodeb_ci` and parsed `cid` fields to `TowerPlanSourceCell`. Build grouping buckets with `(model_key, sector_key, height)` only. Store an azimuth set and aggregate parsed CIDs. When the normalized azimuth set has more than one value, return `azimuth_deg=None`, `leg=None`, the sorted values, and a warning requiring review.

- [ ] **Step 4: Run targeted backend tests and confirm GREEN**

Run:

```powershell
python -m pytest tests/test_tower_plan.py -q
```

Expected: all Tower Plan backend tests pass.

- [ ] **Step 5: Commit the backend grouping unit**

```powershell
git add backend/models/tower_plan.py backend/routers/tower_plan.py backend/tests/test_tower_plan.py
git commit -m "feat: group tower antennas with CID metadata"
```

---

### Task 2: Site-only search and aligned configuration query

**Files:**
- Modify: `backend/routers/tower_plan.py`
- Test: `backend/tests/test_tower_plan.py`

**Interfaces:**
- Produces: `_site_search_query(columns: set[str], has_query: bool) -> str`
- Produces: `_site_configuration_query(columns: set[str]) -> str`
- Consumes: `q`, `q_exact`, and `q_prefix` parameters from `search_tower_plan_sites()`

- [ ] **Step 1: Write failing search-query tests**

Add assertions against the backend query boundary:

```python
async def test_site_search_filters_only_site_id_and_ranks_exact_then_prefix():
    session = SequencedSession(
        [{"column_name": "sector_base"}],
        [{"site_id": "PSN003", "cell_count": 18, "estimated_antenna_count": 4}],
    )

    response = await search_tower_plan_sites(q="PSN003", limit=20, session=session)

    sql, params = session.calls[1]
    assert "cell_name ILIKE" not in sql
    assert "UPPER(TRIM(site_id)) = :q_exact" in sql
    assert "UPPER(TRIM(site_id)) LIKE :q_prefix" in sql
    assert "azimuth" not in sql.split("COUNT(DISTINCT", 1)[1].split("AS estimated", 1)[0]
    assert params == {
        "limit": 20,
        "q": "%PSN003%",
        "q_exact": "PSN003",
        "q_prefix": "PSN003%",
    }
    assert response.items[0].site_id == "PSN003"
```

Extend the configuration test to require `enodeb_ci` in the SELECT. Add a source-column test proving `sector_base` is selected when both `sector` and `sector_base` exist.

- [ ] **Step 2: Run the specific tests and confirm RED**

Run:

```powershell
python -m pytest tests/test_tower_plan.py -q
```

Expected: query assertions fail because search still includes `cell_name`, grouping estimate still includes azimuth, and configuration does not select `enodeb_ci`.

- [ ] **Step 3: Implement search ordering and query alignment**

Use:

```sql
AND TRIM(site_id) ILIKE :q
ORDER BY
  CASE
    WHEN UPPER(TRIM(site_id)) = :q_exact THEN 0
    WHEN UPPER(TRIM(site_id)) LIKE :q_prefix THEN 1
    ELSE 2
  END,
  TRIM(site_id)
```

Make `sector_base` authoritative when it exists, falling back to `sector` only when necessary. Make the distinct estimate use sector expression, normalized antenna model, and rounded antenna height only. Add an `enodeb_ci` expression to the configuration SELECT that returns `NULL::text` only when the column is absent. Add parameters `q_exact` and `q_prefix` when a query is present.

- [ ] **Step 4: Run backend tests and confirm GREEN**

Run:

```powershell
python -m pytest tests/test_tower_plan.py -q
```

Expected: all Tower Plan backend tests pass.

- [ ] **Step 5: Commit the search unit**

```powershell
git add backend/routers/tower_plan.py backend/tests/test_tower_plan.py
git commit -m "fix: make tower site search predictable"
```

---

### Task 3: Tower types, installation mapping, CID state, and migration

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Produces: `TOWER_PLAN_SCHEMA_VERSION = 6`
- Produces: `TOWER_TYPES`
- Produces: `TOWER_TYPE_CONFIG`
- Produces: `installationForAzimuth(towerType, azimuth) -> "A" | "B" | "C" | "D"`
- Produces: `changeTowerType(state, towerType) -> TowerPlanState`
- Produces: antenna `cids: string[]`
- Consumes: backend group fields from Tasks 1–2

- [ ] **Step 1: Write failing state and migration tests**

Add table-driven literal expectations:

```javascript
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
    antennas: [{ id: 'a', name: 'A', cid: '11, 14', azimuth: 300, leg: 'D' }],
  });

  assert.equal(migrated.schemaVersion, 6);
  assert.deepEqual(migrated.antennas[0].cids, ['11', '14']);
  assert.equal(migrated.antennas[0].leg, 'C');
});
```

Add tests that `buildAutofillDraft()` retains group CIDs, leaves conflicting azimuth blank, and `validateAutofillDraft()` blocks the conflict.

- [ ] **Step 2: Run the frontend contract test and confirm RED**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: missing export and schema/CID assertions fail.

- [ ] **Step 3: Implement tower configuration and migration**

Define:

```javascript
export const TOWER_TYPES = [
  'Four-leg lattice tower',
  'Three-leg lattice tower',
  'Monopole',
];

export const TOWER_TYPE_CONFIG = {
  'Four-leg lattice tower': {
    positions: ['A', 'B', 'C', 'D'],
    interval: 90,
    label: 'Installation leg',
  },
  'Three-leg lattice tower': {
    positions: ['A', 'B', 'C'],
    interval: 120,
    label: 'Installation leg',
  },
  Monopole: {
    positions: ['A', 'B', 'C', 'D'],
    interval: 90,
    label: 'Mounting side',
  },
};
```

Normalize azimuth into `[0, 360)`, map boundary values to the approved position ranges, and recalculate every antenna position in `changeTowerType()`. Parse legacy comma/ampersand CID strings into unique natural-order `cids`.

- [ ] **Step 4: Run the frontend contract test and confirm GREEN**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: all Tower Plan frontend state tests pass.

- [ ] **Step 5: Commit the state unit**

```powershell
git add frontend/src/features/tower-plan/towerPlanState.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower type and CID state contracts"
```

---

### Task 4: Keyboard-complete Site ID picker

**Files:**
- Modify: `frontend/src/features/tower-plan/TowerPlanSitePicker.jsx`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Produces: `selectSiteFromResults(items, query) -> site item | null`
- Consumes: `searchTowerPlanSites(query, signal)` and `onSelect(siteId)`

- [ ] **Step 1: Write a failing selection test**

```javascript
it('selects exact Site ID before the first fuzzy result', () => {
  const items = [{ site_id: 'PSN003A' }, { site_id: 'PSN003' }];

  assert.deepEqual(selectSiteFromResults(items, 'psn003'), { site_id: 'PSN003' });
  assert.deepEqual(selectSiteFromResults(items, 'unknown'), { site_id: 'PSN003A' });
  assert.equal(selectSiteFromResults([], 'PSN003'), null);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: import fails because `selectSiteFromResults` does not exist.

- [ ] **Step 3: Implement selection and interaction states**

Export the pure selector, call it when Enter is pressed, and pass the selected `site_id` to `chooseSite()`. Keep Arrow Down and Escape behavior. Add `aria-busy`, an inline loading row, and preserve explicit error and empty rows.

- [ ] **Step 4: Run the test and confirm GREEN**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: Tower Plan contracts pass.

- [ ] **Step 5: Commit the picker unit**

```powershell
git add frontend/src/features/tower-plan/TowerPlanSitePicker.jsx frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: complete tower site keyboard search"
```

---

### Task 5: Configuration-driven tower geometry and SVG spacing

**Files:**
- Create: `frontend/src/features/tower-plan/towerPlanGeometry.js`
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Produces: `getTowerGeometry(towerType)`
- Produces: `TOWER_DRAWING_LAYOUT`
- Produces: geometry fields `feet`, `towerEnvelopeRight`, `helicopterPanel`, `structureKind`
- Consumes: `plan.towerType`, antenna installation positions, tower height

- [ ] **Step 1: Write failing geometry tests**

```javascript
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
```

Extend the SVG test with literal checks for:

- four, three, and one `data-foot-plate` elements;
- matching `data-installation-label` values;
- `data-structure-kind="lattice-four"`, `"lattice-three"`, and `"monopole"`;
- grouped CID text.

- [ ] **Step 2: Run the frontend contract test and confirm RED**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: missing geometry module and unchanged SVG fail.

- [ ] **Step 3: Implement geometry descriptors**

Use fixed engineering layout constants:

```javascript
export const TOWER_DRAWING_LAYOUT = {
  canvasWidth: 1024,
  canvasHeight: 1536,
  towerCenterX: 500,
  towerEnvelopeRight: 680,
  helicopterPanel: { x: 750, y: 1040, width: 240, height: 340 },
};
```

Return distinct foot/world coordinates and structure kind for all three tower types. Derive plate rectangles, tower-member endpoints, installation badges, and plan-view points from the same feet array. Render monopole with one flange and anchor bolts instead of lattice feet.

- [ ] **Step 4: Refactor the SVG renderer around geometry**

Replace the fixed `LEG_WORLD`, hard-coded feet, and independent ground polygon with geometry-driven functions. Set `data-foot-plate`, `data-installation-label`, and `data-structure-kind` attributes for testability and exported-document diagnostics. Move the Helicopter View to its reserved panel and show `CID(s)` joined naturally.

- [ ] **Step 5: Run the frontend contract test and confirm GREEN**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: geometry and SVG contracts pass.

- [ ] **Step 6: Commit the renderer unit**

```powershell
git add frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: render precise multi-type tower geometry"
```

---

### Task 6: Workbench and review-dialog integration

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_router_auth.py`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Breadcrumb.jsx`
- Modify: `frontend/src/components/DashboardSidebar.jsx`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/pages/TowerPlanGeneratorPage.jsx`
- Modify: `frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx`
- Modify: `frontend/src/features/tower-plan/TowerPlanAutofillDialog.jsx`
- Modify: `frontend/src/features/tower-plan/TowerPlanPreview.jsx`
- Create: `frontend/src/features/tower-plan/towerPlanStorage.js`
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `TOWER_TYPES`, `TOWER_TYPE_CONFIG`, `changeTowerType()`, grouped `cids`, and azimuth conflict metadata
- Produces: tower-type selector, dynamic installation labels/options, CID list editor, and blocking conflict review

- [ ] **Step 1: Write failing workbench behavior contracts**

Add tests against state outcomes rather than source-only presence:

```javascript
it('changing to three-leg recalculates every installation position', () => {
  const state = {
    ...createBlankTowerPlan(),
    antennas: [
      { ...baseAntenna, id: 'a', azimuth: 110, leg: 'B' },
      { ...baseAntenna, id: 'b', azimuth: 300, leg: 'D' },
    ],
  };

  const changed = changeTowerType(state, 'Three-leg lattice tower');

  assert.deepEqual(changed.antennas.map((antenna) => antenna.leg), ['A', 'C']);
});
```

Add a draft-validation assertion for unresolved azimuth conflict and a prompt assertion containing the selected tower type plus grouped CIDs.

- [ ] **Step 2: Run the frontend contract test and confirm RED**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: new state/output assertions fail.

- [ ] **Step 3: Implement the UI integration**

- Replace the disabled tower-type input with a dashboard-styled select.
- Use `changeTowerType()` on selection.
- Pass the selected tower type into the auto-fill review.
- Show conflict values and an editable azimuth in the review dialog.
- Recalculate installation position after azimuth edits.
- Render A–C only for three-leg and A–D for four-leg/monopole.
- Label monopole controls `Mounting side`.
- Replace the single CID control with `CID(s)` comma-separated editing backed by `cids`.
- Keep source metadata visible and update copy from fixed “four-leg” wording to tower-neutral wording.

- [ ] **Step 4: Run targeted frontend tests and lint**

Run:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
npm run lint
```

Expected: tests and lint exit successfully.

- [ ] **Step 5: Commit the workbench unit**

```powershell
git add backend/.env.example backend/main.py backend/tests/test_router_auth.py frontend/src/App.jsx frontend/src/components/Breadcrumb.jsx frontend/src/components/DashboardSidebar.jsx frontend/src/services/api.js frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx frontend/src/features/tower-plan/TowerPlanAutofillDialog.jsx frontend/src/features/tower-plan/TowerPlanPreview.jsx frontend/src/features/tower-plan/towerPlanStorage.js frontend/src/features/tower-plan/towerPlanState.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: integrate tower types into planning workbench"
```

---

### Task 7: Full verification and local browser proof

**Files:**
- Verify all modified Tower Plan files
- Do not retain Playwright output artifacts

**Interfaces:**
- Consumes: complete feature from Tasks 1–6
- Produces: verification evidence and a live local server

- [ ] **Step 1: Run the full backend suite**

```powershell
python -m pytest -q
```

Expected: zero failures.

- [ ] **Step 2: Run the full frontend suite**

```powershell
node --test src/__tests__/*.test.js
```

Expected: zero failures.

- [ ] **Step 3: Run lint and production build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit successfully. Existing Vite chunk-size warnings are non-blocking.

- [ ] **Step 4: Restart the local backend and verify health**

Run Uvicorn from the feature worktree with process-only local security values and:

```text
http://127.0.0.1:8000/api/v1/health
```

Expected: HTTP 200 with `{"status":"ok"}`.

- [ ] **Step 5: Verify the user flow with Playwright CLI**

Verify:

1. Login with the process-local test account.
2. Open `/tower-plan-generator`.
3. Type `PSN003` and press Enter.
4. Confirm four physical groups and grouped CID metadata.
5. Resolve tower height and apply.
6. Switch among four-leg, three-leg, and monopole.
7. Confirm dynamic Leg/Mounting Side values.
8. Inspect desktop and mobile layout.
9. Export SVG and PNG.
10. Confirm no page-specific console errors.

- [ ] **Step 6: Inspect exported SVG and visual spacing**

Confirm plate count, label alignment, and at least 50 px separation between the tower envelope and Helicopter View. Remove Playwright snapshots/downloads after inspection.

- [ ] **Step 7: Run final repository checks**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intended feature changes.
