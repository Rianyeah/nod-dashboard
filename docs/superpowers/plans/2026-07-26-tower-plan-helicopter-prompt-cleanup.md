# Tower Plan Helicopter View and Prompt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a height-aware Helicopter View, produce a professional natural-language prompt for external image generators, and retire the unused direct AI/reference-image surfaces without changing Site ID auto-fill or engineering exports.

**Architecture:** Keep all drawing output deterministic inside the existing SVG renderer, but extract elevation-ring calculation into a small pure frontend module so radii and ordering are directly testable. Keep prompt generation in the existing state domain module because it derives only from plan state. Remove the direct AI flow across the React page, API client, IndexedDB exports, FastAPI models/router, application state, environment example, and their contracts; retain the non-destructive IndexedDB asset store for backward compatibility.

**Tech Stack:** React 19, JavaScript ES modules, Node test runner, inline SVG, Tailwind CSS 4, Axios, FastAPI, Pydantic 2, pytest, Playwright browser verification.

## Global Constraints

- Work only in `D:\Web-dashboard\.worktrees\tower-plan-generator` on branch `codex/tower-plan-generator`.
- Preserve the existing Site ID search, `ransys_gabungan` grouping, CID extraction, tower-type state migration, local draft, and SVG/PNG/JSON exports.
- Preserve the IndexedDB `assets` object store declaration; remove only unused read/write exports and consumers.
- Do not change grouping semantics: one physical antenna remains keyed by `sector_base + antenna_type + antenna_height`.
- Do not add the future recommendations (schedule export, clearance checker, comparison, or batch mode) in this scope.
- Use test-driven changes: write or update the focused contract first, run it to observe the intended failure, implement the minimum production change, then rerun it.
- Keep each production commit scoped to one task below.

## File Responsibility Map

| File | Responsibility in this change |
|---|---|
| `frontend/src/features/tower-plan/towerPlanHelicopter.js` | New pure helpers for unique height rings and height-to-radius lookup. |
| `frontend/src/features/tower-plan/towerPlanSvg.js` | Render elevation rings, per-antenna top-view paths, coloured arrowheads, labels, and collision offsets. |
| `frontend/src/features/tower-plan/towerPlanState.js` | Build the external image-generator prompt and remove the obsolete AI payload helper. |
| `frontend/src/pages/TowerPlanGeneratorPage.jsx` | Keep prompt controls; remove Reference Visual and direct AI UI/state/effects/handlers. |
| `frontend/src/services/api.js` | Remove the two retired Tower Plan AI client calls. |
| `frontend/src/features/tower-plan/towerPlanStorage.js` | Remove unused asset read/write exports while retaining the existing asset object store. |
| `frontend/src/__tests__/towerPlanContracts.test.js` | Contract coverage for ring geometry, SVG labels/offsets, prompt wording, and frontend cleanup. |
| `backend/models/tower_plan.py` | Remove direct AI capability/request models and imports used only by them. |
| `backend/routers/tower_plan.py` | Retain site search/configuration only; remove provider, capability, and generation code. |
| `backend/main.py` | Remove Tower Plan AI limiter and semaphore application state. |
| `backend/.env.example` | Remove the retired `TOWER_PLAN_AI_ENABLED` flag. |
| `backend/tests/test_tower_plan.py` | Remove direct AI unit/route tests and add explicit endpoint-retirement coverage. |
| `backend/tests/test_router_auth.py` | Remove the retired capability route from the protected-route matrix. |

---

## Task 1: Add Pure Elevation-Ring Geometry

**Files:**

- Create: `frontend/src/features/tower-plan/towerPlanHelicopter.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Write failing ring-layout contracts**

Import the new helper:

```js
import {
  buildElevationRings,
  radiusForHeight,
} from '../features/tower-plan/towerPlanHelicopter.js';
```

Add focused cases proving:

```js
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
```

- [ ] **Step 2: Run the focused contract and observe RED**

Run from `frontend`:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `towerPlanHelicopter.js`.

- [ ] **Step 3: Implement the pure ring helpers**

Create:

```js
const SINGLE_RING_RADIUS = 62;
const OUTER_RING_RADIUS = 72;
const INNER_RING_RADIUS = 42;

export function buildElevationRings(antennas = []) {
  const heights = [...new Set(
    antennas
      .map((antenna) => Number(antenna.height))
      .filter(Number.isFinite),
  )].sort((left, right) => right - left);

  if (heights.length === 1) {
    return [{ height: heights[0], radius: SINGLE_RING_RADIUS }];
  }

  return heights.map((height, index) => ({
    height,
    radius: OUTER_RING_RADIUS
      - ((OUTER_RING_RADIUS - INNER_RING_RADIUS) * index) / (heights.length - 1),
  }));
}

export function radiusForHeight(rings, height) {
  return rings.find((ring) => ring.height === Number(height))?.radius
    ?? SINGLE_RING_RADIUS;
}
```

Return `[]` for no finite heights through the normal mapping path.

- [ ] **Step 4: Run the focused contract and observe GREEN**

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: all Tower Plan contracts pass.

- [ ] **Step 5: Commit the geometry helper**

```powershell
git add frontend/src/features/tower-plan/towerPlanHelicopter.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: add tower elevation ring geometry"
```

---

## Task 2: Render Height-Aware Helicopter View

**Files:**

- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Extend the SVG contract before changing the renderer**

Use a plan fixture containing:

- two different heights, such as `46` and `40`;
- two antennas with the same installation position, height, and azimuth;
- non-default antenna colours;
- a sector/azimuth pair that is easy to assert, such as Sector `3`, azimuth `310`.

Add assertions:

```js
assert.equal((svg.match(/data-elevation-ring=/g) || []).length, 2);
assert.match(svg, /data-elevation-ring="46"[^>]*r="72"/);
assert.match(svg, /data-elevation-ring="40"[^>]*r="42"/);
assert.match(svg, />SEC 3 \| 310(?:\.0)?°</);
assert.match(svg, /data-arrow-color="#334155"/);
assert.match(svg, /data-overlap-index="0"/);
assert.match(svg, /data-overlap-index="1"/);
```

Retain the existing assertions for `data-installation-label`, `data-structure-kind`, tower foot plates, escaping, and 50-pixel panel spacing.

Add one loop rendering Four-leg, Three-leg, and Monopole and asserting:

```js
assert.equal(
  (svg.match(/data-top-antenna=/g) || []).length,
  plan.antennas.length,
);
```

- [ ] **Step 2: Run the SVG contract and observe RED**

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: missing `data-elevation-ring`, `SEC ... | ...°`, coloured arrowhead, or overlap diagnostics.

- [ ] **Step 3: Import and render elevation rings**

In `towerPlanSvg.js`:

```js
import {
  buildElevationRings,
  radiusForHeight,
} from './towerPlanHelicopter.js';
```

Inside `helicopterView`:

```js
const rings = buildElevationRings(state.antennas);
const ringMarkup = rings.map(({ height: ringHeight, radius }, index) => `
  <circle data-elevation-ring="${escapeXml(ringHeight)}"
    cx="${cx}" cy="${cy}" r="${radius}" fill="none"
    stroke="#d3dce7" stroke-width="1.5"/>
  <text x="${cx + radius + 5}" y="${cy + (index % 2 === 0 ? -3 : 10)}"
    fill="#637389" font-size="9">${ringHeight} m</text>
`).join('');
```

Place `${ringMarkup}` behind the footprint and antenna paths.

- [ ] **Step 4: Add coloured arrowheads and per-antenna layout**

Add a local `coloredArrowHead(x, y, bearing, color)` helper that returns a small
filled triangle with:

```html
data-arrow-color="${escapeXml(color)}"
```

Replace the shared `marker-end="url(#arrow)"` antenna marker.

For each antenna:

1. Use `radiusForHeight(rings, antenna.height)` for its starting ring.
2. Use the selected leg/mounting-side bearing from `geometry.positions` and
   `geometry.interval`.
3. Count duplicates by normalized key:

   ```js
   `${position}|${Number(antenna.height)}|${Number(antenna.azimuth)}`
   ```

4. Apply a six-pixel tangential offset per previous duplicate, without changing
   stored height or azimuth.
5. Wrap the result:

   ```html
   <g data-top-antenna="${escapeXml(antenna.id)}" data-overlap-index="${occurrence}">
   ```

6. Render the visible label exactly as:

   ```text
   SEC <sector> | <azimuth>°
   ```

Use a defensively formatted numeric azimuth without an unnecessary trailing
`.0`, while preserving decimal azimuths.

- [ ] **Step 5: Confirm all tower-type SVG contracts are GREEN**

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: all focused contracts pass for Four-leg, Three-leg, and Monopole.

- [ ] **Step 6: Commit the renderer**

```powershell
git add frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: restore height-aware helicopter view"
```

---

## Task 3: Rewrite the Prompt as Professional Natural Language

**Files:**

- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Replace the old prompt assertions with content and exclusion contracts**

Build a Monopole plan with two antennas and grouped CID values. Assert that the
result includes:

```js
assert.match(prompt, /Create a professional Monopole tower planning illustration for site PSN099\./);
assert.match(prompt, /52 metres high/);
assert.match(prompt, /Mounting Side A oriented 45 degrees clockwise from North/);
assert.match(prompt, /- Antenna Sectoral .*Existing; Sector 1; 46 m; azimuth 40°; CIDs 11, 12; Mounting Side A\./);
assert.match(prompt, /Use a Clean Engineering Infographic visual style/);
assert.match(prompt, /Do not add, remove, merge, or change any supplied antenna or measurement\./);
```

Assert the banned implementation terms are absent, case-insensitively:

```js
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
assert.doesNotMatch(prompt, /[\{\}\[\]"]/);
```

Add separate cases for:

- Four-leg/Three-leg wording uses `Leg A`;
- optional revision produces a natural `Revision request:` sentence;
- no antenna records produces `No antennas are currently defined for this plan.`;
- custom style uses `state.customStyle` when non-empty.

- [ ] **Step 2: Run the prompt contract and observe RED**

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: old `TEMPLATE`, `TARGET`, JSON, and `deterministic` output violates the new contract.

- [ ] **Step 3: Rewrite `buildEngineeringPrompt`**

Keep it pure and use `normalizeCids`. Structure the implementation as readable
paragraphs:

```js
const installationName = state.towerType === 'Monopole'
  ? 'Mounting Side'
  : 'Leg';
const visualStyle = state.visualStyle === 'Custom Style' && state.customStyle.trim()
  ? state.customStyle.trim()
  : state.visualStyle;
const antennaLines = state.antennas.map((antenna) => {
  const cids = normalizeCids(antenna.cids ?? antenna.cid);
  const cidText = cids.length ? `CIDs ${cids.join(', ')}` : 'CID not specified';
  return `- ${antenna.name} — ${antenna.status}; Sector ${antenna.sector}; `
    + `${formatMeasurement(antenna.height)} m; azimuth ${formatMeasurement(antenna.azimuth)}°; `
    + `${cidText}; ${installationName} ${antenna.leg}.`;
});
```

Return these sections separated by blank lines:

1. request and site/plan identity;
2. tower height and orientation;
3. `Install the following antennas exactly:` plus bullets, or the explicit
   empty-state sentence;
4. selected visual style and portrait/white-background engineering composition;
5. optional revision request;
6. the no-add/remove/merge/change constraint.

Do not use `TOWER_PLAN_TEMPLATE_VERSION` in the output. Retain that constant and
`promptTemplateVersion` state field for state migration compatibility.

- [ ] **Step 4: Run the prompt contract and observe GREEN**

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: all prompt content/exclusion cases pass.

- [ ] **Step 5: Commit the prompt rewrite**

```powershell
git add frontend/src/features/tower-plan/towerPlanState.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: generate professional tower image prompts"
```

---

## Task 4: Remove the Frontend AI and Reference-Image Surfaces

**Files:**

- Modify: `frontend/src/pages/TowerPlanGeneratorPage.jsx`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/features/tower-plan/towerPlanState.js`
- Modify: `frontend/src/features/tower-plan/towerPlanStorage.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Write frontend cleanup contracts**

Update the source-level workbench/API assertions:

```js
assert.match(page, /title="Prompt generator"/);
assert.match(page, /Create Prompt/);
assert.match(page, /Copy/);
assert.doesNotMatch(page, /Referensi visual/);
assert.doesNotMatch(page, /Visualisasi AI/);
assert.doesNotMatch(page, /fetchTowerPlanAiCapabilities/);
assert.doesNotMatch(page, /generateTowerPlanAiVisualization/);
assert.doesNotMatch(page, /loadTowerPlanAsset/);
assert.doesNotMatch(page, /saveTowerPlanAsset/);
assert.doesNotMatch(page, /manualImageUrl|aiImageUrl|aiCapabilities|aiMode|aiLoading/);

assert.doesNotMatch(api, /tower-plan\/ai-capabilities/);
assert.doesNotMatch(api, /tower-plan\/ai-visualizations/);
assert.doesNotMatch(api, /generateTowerPlanAiVisualization/);
assert.doesNotMatch(stateSource, /export function buildAiPayload/);
assert.doesNotMatch(storageSource, /export async function loadTowerPlanAsset/);
assert.doesNotMatch(storageSource, /export async function saveTowerPlanAsset/);
assert.match(storageSource, /createObjectStore\(ASSET_STORE\)/);
```

Remove the old anonymous `buildAiPayload` test and import.

- [ ] **Step 2: Run the frontend cleanup contract and observe RED**

```powershell
node --test src/__tests__/towerPlanContracts.test.js
```

Expected: the page, API client, state helper, and storage exports still contain
the retired AI/reference flow.

- [ ] **Step 3: Simplify page imports, state, and hydration**

In `TowerPlanGeneratorPage.jsx`:

- remove `Bot` and `ImageIcon`;
- retain `LoaderCircle` for Site ID auto-fill, `Upload` for JSON import, and
  `Sparkles` for Create Prompt;
- remove AI API imports, `buildAiPayload`, and asset storage imports;
- remove `MAX_ASSET_SIZE`;
- remove `aiMode`, `aiCapabilities`, `aiLoading`, `aiImageUrl`,
  `manualImageUrl`, and `imageInputRef`;
- hydrate only with `loadTowerPlanDraft()`;
- remove object-URL cleanup effects;
- remove `uploadReference` and `generateAi`.

The hydration effect should retain its active guard:

```js
useEffect(() => {
  let active = true;
  loadTowerPlanDraft().then((storedPlan) => {
    if (!active) return;
    if (storedPlan) setPlan(storedPlan);
    setHydrated(true);
  });
  return () => {
    active = false;
  };
}, []);
```

- [ ] **Step 4: Reduce the card to prompt-only controls**

Rename:

```jsx
<SectionTitle
  icon={WandSparkles}
  title="Prompt generator"
  description="Buat instruksi profesional yang siap disalin ke generator gambar eksternal."
/>
```

Keep the revision input, Create Prompt, Copy, and textarea. Remove the entire
bordered two-column block containing Reference Visual and AI Visualization.
Change the textarea placeholder to:

```text
Prompt profesional akan tampil di sini.
```

- [ ] **Step 5: Remove dead client/domain/storage functions**

- Delete `fetchTowerPlanAiCapabilities` and
  `generateTowerPlanAiVisualization` from `services/api.js`.
- Delete `buildAiPayload` from `towerPlanState.js`.
- Delete `loadTowerPlanAsset` and `saveTowerPlanAsset` from
  `towerPlanStorage.js`.
- Keep `ASSET_STORE`, database version, and `createObjectStore(ASSET_STORE)` so
  existing IndexedDB databases are not destructively migrated.

- [ ] **Step 6: Run focused tests, lint, and build**

From `frontend`:

```powershell
node --test src/__tests__/towerPlanContracts.test.js
npm run lint
npm run build
```

Expected: focused contracts, ESLint, and Vite build pass.

- [ ] **Step 7: Commit the frontend cleanup**

```powershell
git add frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/services/api.js frontend/src/features/tower-plan/towerPlanState.js frontend/src/features/tower-plan/towerPlanStorage.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "refactor: remove tower plan AI surfaces"
```

---

## Task 5: Retire the Backend Direct AI API

**Files:**

- Modify: `backend/models/tower_plan.py`
- Modify: `backend/routers/tower_plan.py`
- Modify: `backend/main.py`
- Modify: `backend/.env.example`
- Modify: `backend/tests/test_tower_plan.py`
- Modify: `backend/tests/test_router_auth.py`

- [ ] **Step 1: Replace AI behavior tests with endpoint-retirement contracts**

Remove imports and tests for:

- `TowerPlanAiAntenna`;
- `TowerPlanAiRequest`;
- `build_ai_prompt`;
- AI provider success/failure, input filtering, and capability configuration.

Add:

```python
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/tower-plan/ai-capabilities"),
        ("post", "/api/v1/tower-plan/ai-visualizations"),
    ],
)
def test_retired_tower_plan_ai_routes_are_not_registered(
    authenticated_client,
    method,
    path,
):
    response = getattr(authenticated_client, method)(path)
    assert response.status_code == 404
```

Remove `/api/v1/tower-plan/ai-capabilities` from `PROTECTED_PATHS` in
`test_router_auth.py`; a removed route should be tested as absent, not protected.

- [ ] **Step 2: Run the focused backend tests and observe RED**

From `backend`:

```powershell
python -m pytest tests/test_tower_plan.py tests/test_router_auth.py -q
```

Expected: both currently registered AI routes return something other than 404.

- [ ] **Step 3: Remove AI-only Pydantic models**

In `models/tower_plan.py`, delete `TowerPlanAiCapabilities`,
`TowerPlanAiAntenna`, `TowerPlanAiRequest`, and the now-unused
`TowerPlanTowerType` alias. Remove `ConfigDict` from the Pydantic import because
it becomes unused. Keep `TowerPlanLeg`, `Literal`, `BaseModel`, and `Field`
because the site-configuration models still require them.

- [ ] **Step 4: Remove the provider and routes from `routers/tower_plan.py`**

Delete:

- imports `asyncio`, `base64`, `logging`, `os`, `httpx`, `Request`, `Response`,
  `TowerPlanAiCapabilities`, `TowerPlanAiRequest`, `RateLimitExceeded`, and
  `verify_browser_origin`;
- the AI-only `logger`;
- AI constants (`AI_REQUEST_LIMIT`, windows/timeouts, provider URL);
- `build_ai_prompt`;
- `_ai_configuration`;
- `get_tower_plan_ai_capabilities`;
- `generate_ai_image`;
- `create_tower_plan_ai_visualization`.

Keep imports that remain used by Site ID search/configuration. Update the module
docstring to:

```python
"""Tower Plan Generator site search and configuration API."""
```

Run an import scan after editing:

```powershell
rg -n "TowerPlanAi|ai-capabilities|ai-visualizations|OPENAI_IMAGE|TOWER_PLAN_AI|generate_ai_image|build_ai_prompt" backend
```

Expected: no runtime matches; only the deliberate retirement URL strings in
`tests/test_tower_plan.py` may remain.

- [ ] **Step 5: Remove application state and environment flag**

In `backend/main.py`, delete:

```python
app.state.tower_plan_ai_limiter = InMemoryRateLimiter()
app.state.tower_plan_ai_semaphore = asyncio.Semaphore(1)
```

Retain `asyncio`, `InMemoryRateLimiter`, and `RateLimitExceeded` because RF Tilt
and login still use them.

Remove these Tower Plan provider lines from `backend/.env.example`, because a
repository scan confirms they have no other consumer:

```dotenv
TOWER_PLAN_AI_ENABLED=false
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
```

Do not remove the `httpx` dependency; RF Tilt still imports and uses it.

- [ ] **Step 6: Run focused and full backend tests**

```powershell
python -m pytest tests/test_tower_plan.py tests/test_router_auth.py -q
python -m pytest tests -q
```

Expected: retirement routes return 404 and the complete backend suite passes.

- [ ] **Step 7: Commit the backend cleanup**

```powershell
git add backend/models/tower_plan.py backend/routers/tower_plan.py backend/main.py backend/.env.example backend/tests/test_tower_plan.py backend/tests/test_router_auth.py
git commit -m "refactor: retire tower plan AI API"
```

---

## Task 6: Full Regression and Live Browser Verification

**Files:**

- Modify only if verification finds a scoped defect in the files above.
- Record no screenshots or generated artifacts in Git unless explicitly needed
  for an existing test.

- [ ] **Step 1: Scan for incomplete or retired implementation remnants**

From the worktree root:

```powershell
rg -n "Visualisasi AI|Referensi visual|fetchTowerPlanAiCapabilities|generateTowerPlanAiVisualization|buildAiPayload|TowerPlanAi|tower_plan_ai|TOWER_PLAN_AI_ENABLED|OPENAI_IMAGE_MODEL" frontend/src backend
```

Expected: no matches related to this implementation. Investigate every match
rather than excluding it automatically.

- [ ] **Step 2: Run the full automated verification sequence**

Backend:

```powershell
Set-Location backend
python -m pytest tests -q
```

Frontend:

```powershell
Set-Location ..\frontend
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

Expected: all commands exit with code `0`.

- [ ] **Step 3: Restart the local stack from this worktree if needed**

Use the established local test credentials and process-only security settings.
Verify:

```text
Frontend: http://127.0.0.1:5173/tower-plan-generator
Backend:  http://127.0.0.1:8000/api/v1/health
Login:    operator / tower-plan-test
```

Do not persist secrets to repository files.

- [ ] **Step 4: Verify live Site ID data and Helicopter View**

Using the browser:

1. Log in and open `/tower-plan-generator`.
2. Search `PSN003` and apply its configuration.
3. Confirm the antenna count/grouping still matches the backend result.
4. Use a configuration with multiple unique heights; if live PSN003 lacks
   enough height variation, adjust only local form values after auto-fill.
5. Inspect the preview SVG and confirm:
   - `data-elevation-ring` count equals unique valid antenna-height count;
   - the highest height has radius `72` when multiple heights exist;
   - the lowest height has radius `42`;
   - every antenna displays `SEC <sector> | <azimuth>°`;
   - same position/height/azimuth antennas do not fully overlap;
   - arrowheads match their antenna colours.
6. Switch Four-leg, Three-leg, and Monopole and confirm footprints and
   installation labels stay aligned.

- [ ] **Step 5: Verify prompt and cleanup in the live UI**

1. Click Create Prompt.
2. Confirm site, tower orientation, each antenna, CID list, selected style, and
   revision instruction appear in readable English prose.
3. Confirm none of `TEMPLATE`, `TARGET`, `deterministic`, raw JSON, or internal
   field names appear.
4. Click Copy and confirm the textarea content reaches the clipboard where
   browser permissions allow.
5. Confirm Reference Visual and AI Visualization panels are absent.
6. Confirm SVG, PNG, and JSON exports remain available.

- [ ] **Step 6: Verify desktop/mobile layout and browser diagnostics**

At desktop and a mobile viewport (for example `390 × 844`):

- no horizontal page overflow;
- preview remains readable;
- Prompt generator controls wrap without clipping;
- no page-specific console errors;
- no failed requests to either retired AI endpoint.

- [ ] **Step 7: Review diff and commit any verification-only fix**

```powershell
git diff --check
git status --short
git diff --stat
```

If verification required a scoped fix, rerun the affected focused test plus the
full verification sequence, then commit:

```powershell
git add frontend/src/features/tower-plan/towerPlanHelicopter.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/features/tower-plan/towerPlanState.js frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/services/api.js frontend/src/features/tower-plan/towerPlanStorage.js frontend/src/__tests__/towerPlanContracts.test.js backend/models/tower_plan.py backend/routers/tower_plan.py backend/main.py backend/.env.example backend/tests/test_tower_plan.py backend/tests/test_router_auth.py
git commit -m "fix: complete tower plan prompt cleanup"
```

If no fix was needed, do not create an empty commit.

## Completion Criteria

- Unique valid antenna heights map to the approved ring radii and visible height
  labels.
- Every top-view antenna uses its height ring, installation position, azimuth,
  antenna colour, and `SEC <sector> | <azimuth>°` annotation.
- Duplicate top-view paths receive distinct visual offsets.
- Prompt output is natural English prose, contains all supplied engineering
  data, and excludes implementation jargon and raw serialization.
- Reference Visual and direct AI surfaces are absent from frontend and backend.
- Site search/configuration, auto-fill grouping, CID extraction, local draft,
  tower types, and SVG/PNG/JSON exports remain working.
- Focused tests, full test suites, lint, build, browser desktop/mobile checks,
  and console/network checks all pass.
