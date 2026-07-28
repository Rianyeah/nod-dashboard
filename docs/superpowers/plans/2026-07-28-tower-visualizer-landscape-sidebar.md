# Tower Visualizer Landscape Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Tower Visualizer as a landscape engineering sheet with readable Site Data, Legend, and Helicopter View stacked in a right-hand sidebar.

**Architecture:** `towerPlanGeometry.js` owns the `1900 x 1200` document coordinates and sidebar rectangles. `towerPlanSvg.js` renders those rectangles and changes the helicopter renderer from tiny free-floating labels into a radar plus deterministic readout rows. Existing SVG contract tests remain the source of truth for geometric containment, collision prevention, paint bands, counts, and visible output.

**Tech Stack:** React, ES modules, Node built-in test runner, Vite, SVG.

## Global Constraints

- Preserve red/white 10-m paint bands, all three tower types, callout wrapping, SVG/PNG exports, and NOD Dashboard font family.
- The SVG canvas is exactly `1900 x 1200`.
- Site Data, Legend, and Helicopter View are stacked vertically in the right sidebar, in that order.
- Helicopter View retains north-fixed footprint and elevation rings, with contained, non-overlapping `SEC n | azimuth degrees` readout rows.
- Keep all existing `data-*` regression hooks unless a replacement hook is added in the same task.

---

### Task 1: Establish landscape geometry and stacked sidebar contract

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanGeometry.js`
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `TOWER_DRAWING_LAYOUT` and `getTowerGeometry(towerType)`.
- Produces: `TOWER_DRAWING_LAYOUT.canvasWidth`, `canvasHeight`, `sidebar.siteData`, `sidebar.legend`, and `helicopterPanel` consumed by `renderTowerPlanSvg()` and `helicopterView()`.

- [ ] **Step 1: Write the failing landscape/sidebar test**

  In the dense SVG contract, replace the portrait assertions with the target layout and assert all sidebar cards have one right-hand x-coordinate, stack in order, and remain to the right of antenna callout cards:

  ```js
  assert.equal(TOWER_DRAWING_LAYOUT.canvasWidth, 1900);
  assert.equal(TOWER_DRAWING_LAYOUT.canvasHeight, 1200);
  assert.match(svg, /viewBox="0 0 1900 1200"/);
  assert.equal(siteData.x, legend.x);
  assert.ok(siteData.y < legend.y);
  assert.ok(legend.y < helicopterPanel.y);
  assert.ok(siteData.x > Math.max(...cards.map((card) => card.x + card.width)));
  assert.ok(helicopterPanel.x <= siteData.x);
  assert.ok(helicopterPanel.x + helicopterPanel.width <= TOWER_DRAWING_LAYOUT.canvasWidth);
  ```

- [ ] **Step 2: Run the focused test and verify it fails for the existing portrait document**

  Run: `node --test src/__tests__/towerPlanContracts.test.js`

  Expected: FAIL because the current SVG is `1200 x 1536` and Site Data/Legend are below the tower rather than in a right-hand sidebar.

- [ ] **Step 3: Implement the minimal landscape geometry**

  In `towerPlanGeometry.js`, use a 1900 by 1200 canvas, reserve the right-most column for the stack, and keep callouts entirely before the sidebar. Replace footer placement with a sidebar layout shaped as follows:

  ```js
  canvasWidth: 1900,
  canvasHeight: 1200,
  sidebar: {
    siteData: { x: 1330, y: 150, width: 520, height: 130 },
    legend: { x: 1330, y: 302, width: 520, height: 70 },
  },
  helicopterPanel: { x: 1330, y: 398, width: 520, height: 420 },
  ```

  Reposition the tower base/vertical span and callout columns so callout cards stay within the left drawing field. In `towerPlanSvg.js`, render Site Data and Legend from `layout.sidebar`; retain their `data-footer-card` attributes and render the new canvas dimensions from `TOWER_DRAWING_LAYOUT`.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `node --test src/__tests__/towerPlanContracts.test.js`

  Expected: PASS, with the geometry test proving a landscape viewBox and vertically stacked right-hand sidebar.

- [ ] **Step 5: Commit the geometry change**

  ```bash
  git add frontend/src/features/tower-plan/towerPlanGeometry.js frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
  git commit -m "feat: move tower visualizer summary to sidebar"
  ```

### Task 2: Render a readable radar and deterministic helicopter readout

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `state.antennas`, `geometry.positions`, `buildElevationRings(antennas)`, `TOWER_DRAWING_LAYOUT.helicopterPanel`.
- Produces: `data-helicopter-readout-row`, `data-readout-x`, `data-readout-y`, `data-readout-width`, and `data-readout-height` nodes in the helicopter SVG group.

- [ ] **Step 1: Write the failing readable-readout test**

  Parse the readout attributes in the dense configuration and assert one row per antenna, row containment, vertical ordering, and one retained ring per antenna height:

  ```js
  const readoutRows = [...svg.matchAll(
    /<g data-helicopter-readout-row="([^"]+)" data-readout-x="([\d.]+)" data-readout-y="([\d.]+)" data-readout-width="([\d.]+)" data-readout-height="([\d.]+)"/g,
  )];
  assert.equal(readoutRows.length, plan.antennas.length);
  assert.equal((svg.match(/data-elevation-ring=/g) || []).length, 4);
  ```

  Convert coordinates to numbers and assert each row stays inside `helicopterPanel`, has a larger y-coordinate than the previous row, and contains `SEC n | azimuth degrees` text.

- [ ] **Step 2: Run the focused test and verify it fails because readout rows do not exist**

  Run: `node --test src/__tests__/towerPlanContracts.test.js`

  Expected: FAIL with `0 !== plan.antennas.length` for `data-helicopter-readout-row`.

- [ ] **Step 3: Implement the radar/readout split**

  In `helicopterView()`:

  ```js
  const radar = { x: x + 30, y: y + 58, width: 215, height: 270 };
  const readout = { x: x + 270, y: y + 52, width: width - 294, height: height - 76 };
  const rowHeight = Math.max(18, Math.floor(readout.height / Math.max(1, antennas.length)));
  ```

  Centre the north marker, rings, footprint, and arrows within `radar`. Add a numbered marker at each antenna arrow. Render exactly one coloured readout row per source antenna inside `readout`, with `SEC ${sector} | ${azimuth} degrees`, fixed source order, and the four `data-readout-*` attributes. Remove the old floating label-box output so the layout cannot overlap around the radar.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `node --test src/__tests__/towerPlanContracts.test.js`

  Expected: PASS, with all readout rows contained and vertically non-overlapping for 16 antennas.

- [ ] **Step 5: Commit the helicopter readability change**

  ```bash
  git add frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
  git commit -m "feat: improve tower helicopter readout"
  ```

### Task 3: Verify exported and live preview output

**Files:**
- Modify: none unless verification exposes a regression.
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `renderTowerPlanSvg(state)` and `towerPlanSvgDataUrl(state)`.
- Produces: evidence that landscape SVG is valid in test, production build, and local dashboard preview.

- [ ] **Step 1: Run the complete frontend contract suite**

  Run: `node --test src/__tests__/*.test.js`

  Expected: all frontend test suites pass with no Tower Visualizer contract failures.

- [ ] **Step 2: Run static and production checks**

  Run:

  ```bash
  npm run lint
  npm run build
  ```

  Expected: both commands exit with code 0.

- [ ] **Step 3: Verify the local dashboard preview**

  Open `http://127.0.0.1:5174/tower-plan-generator`, load the available populated site, and verify visually that the SVG is landscape; the sidebar is right-aligned in Site Data, Legend, Helicopter View order; rings remain visible; and `SEC | azimuth` rows are readable without collision.

- [ ] **Step 4: Commit any verification-only correction**

  If a code correction was required, stage only its in-scope files and commit it with a `fix: refine tower visualizer landscape preview` message. Otherwise do not create an empty commit.
