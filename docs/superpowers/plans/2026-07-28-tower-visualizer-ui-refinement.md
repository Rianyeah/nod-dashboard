# Tower Visualizer UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename and simplify the Tower Plan workbench into Tower Visualizer while aligning preview typography and lattice-leg labels with the NOD Dashboard.

**Architecture:** Keep page state and Tower Plan APIs unchanged. Apply copy/layout changes in the page and preview component, and contain drawing changes in the SVG renderer so exports and in-page previews share the same Inter typography and exterior foot-label geometry.

**Tech Stack:** React, Tailwind utility classes, Lucide, SVG string renderer, Node test runner.

## Global Constraints

- Preserve Site ID search, auto-fill, grouping, CID, persistence, validation, and export behavior.
- Preserve all existing tower structures and only change lattice foot-label placement.
- Use `Inter, system-ui, sans-serif` as the SVG root font family.
- Keep `Visual style` and `Custom style` at the top of the Prompt generator card, ahead of revision input.

---

## File Structure

- `frontend/src/pages/TowerPlanGeneratorPage.jsx` — page header, Search Site ID/Project Data copy, and placement of prompt style controls.
- `frontend/src/features/tower-plan/TowerPlanPreview.jsx` — minimal preview-card header.
- `frontend/src/features/tower-plan/towerPlanSvg.js` — SVG font family and exterior lattice foot labels.
- `frontend/src/App.jsx`, `frontend/src/components/DashboardSidebar.jsx`, `frontend/src/components/Breadcrumb.jsx`, `frontend/src/services/api.js` — user-facing Tower Visualizer naming.
- `frontend/src/__tests__/towerPlanContracts.test.js` — static copy, layout, and SVG geometry regressions.

### Task 1: Lock UI copy and layout contracts

**Files:**
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`
- Modify: `frontend/src/pages/TowerPlanGeneratorPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/DashboardSidebar.jsx`
- Modify: `frontend/src/components/Breadcrumb.jsx`
- Modify: `frontend/src/services/api.js`

**Interfaces:**
- Consumes: existing `plan.visualStyle`, `plan.customStyle`, `VISUAL_STYLES`, and `SectionTitle`.
- Produces: Tower Visualizer labels while preserving every state handler and route path.

- [ ] **Step 1: Write the failing contracts**

```js
assert.match(page, /title="Search Site ID"/);
assert.match(page, /title="Project Data"/);
assert.doesNotMatch(page, /Auto-filled/);
assert.ok(promptIndex < revisionIndex);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: FAIL because the current labels and card placement still use Tower Plan Generator, Auto-fill Site ID, and Data proyek.

- [ ] **Step 3: Apply minimal page and navigation changes**

```jsx
<h1 className="text-base font-semibold">Tower Visualizer</h1>
<SectionTitle title="Search Site ID" description="Ketik site id dan Enter" />
<SectionTitle title="Project Data" />
```

Remove obsolete header metadata and input caption. Move the two existing style-control JSX blocks into the first grid row of Prompt generator without changing ids, values, disabled rule, or handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: PASS with route, copy, and layout assertions intact.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/App.jsx frontend/src/components/DashboardSidebar.jsx frontend/src/components/Breadcrumb.jsx frontend/src/services/api.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "feat: refine tower visualizer workbench"
```

### Task 2: Simplify preview chrome and align SVG drawing

**Files:**
- Modify: `frontend/src/features/tower-plan/TowerPlanPreview.jsx`
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Modify: `frontend/src/__tests__/towerPlanContracts.test.js`

**Interfaces:**
- Consumes: `towerPlanSvgDataUrl(plan)` and existing lattice `geometry.feet`/`footPoints`.
- Produces: an SVG root with Inter typography and `data-installation-label` groups positioned outside the tower silhouette.

- [ ] **Step 1: Write the failing preview and geometry contracts**

```js
assert.doesNotMatch(preview, /Sumber engineering deterministik/);
assert.doesNotMatch(preview, /BadgeCheck|validationErrors\.length/);
assert.match(svg, /font-family="Inter, system-ui, sans-serif"/);
assert.match(svg, /data-leg-label-side=/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: FAIL because preview still exposes metadata/status and SVG labels are centered beneath feet.

- [ ] **Step 3: Implement minimal preview and SVG changes**

```js
const labelSide = point.x < geometry.towerCenterX ? 'left' : 'right';
const labelX = point.x + (labelSide === 'left' ? -40 : 40);
```

Remove preview metadata and status-badge imports/markup. Add `font-family="Inter, system-ui, sans-serif"` to the SVG root. For each lattice foot, draw a short leader line from the plate to `labelX` and render the `LEG X` text there with a side-aware text anchor; leave monopole markup unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: PASS, including existing multi-type geometry and callout tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/tower-plan/TowerPlanPreview.jsx frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: align tower visualizer preview labels"
```

### Task 3: Verify the finished visualizer

**Files:**
- Verify: `frontend/src/__tests__/towerPlanContracts.test.js`
- Verify: `frontend/src/__tests__/*.test.js`

- [ ] **Step 1: Run focused Tower Visualizer contracts**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: PASS with all Tower Plan contracts green.

- [ ] **Step 2: Run regression, lint, and build**

Run: `node --test src/__tests__/*.test.js && npm run lint && npm run build`

Expected: all suites pass; only the existing non-blocking Vite large-chunk advisory may remain.

- [ ] **Step 3: Verify the authenticated local route**

Open `http://127.0.0.1:5173/tower-plan-generator`, authenticate, confirm the sidebar label, header, simplified cards, style controls, Inter SVG text, and exterior leg labels.

- [ ] **Step 4: Commit verification-only corrections if required**

```bash
git add frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/features/tower-plan/TowerPlanPreview.jsx frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/App.jsx frontend/src/components/DashboardSidebar.jsx frontend/src/components/Breadcrumb.jsx frontend/src/services/api.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: complete tower visualizer refinement"
```
