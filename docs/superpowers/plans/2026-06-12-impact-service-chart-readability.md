# Impact Service Chart Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Impact Service KPI hierarchy and chart readability with visible Site IDs, larger value labels, a labelled category donut, and consistently rounded bars.

**Architecture:** Keep request orchestration and API contracts unchanged. Limit production edits to the existing KPI, chart, and chart-config feature modules; encode the approved visual contracts in the existing pure Node contract test and verify behavior in the rendered NOP-filtered page.

**Tech Stack:** React 19, Recharts 3.8, shadcn/ui Chart and Card, Tailwind CSS v4, Node test runner, Playwright.

---

### Task 1: Lock the approved visual contracts

**Files:**
- Modify: `frontend/src/__tests__/impactServiceShadcnContracts.test.js`

- [ ] **Step 1: Write failing assertions**

Add assertions requiring:

```js
assert.match(kpis, /text-\[38px\]/);
assert.match(charts, /PieChart/);
assert.match(charts, /innerRadius=\{58\}/);
assert.match(charts, /interval=\{0\}/);
assert.match(charts, /dataKey="open"[\s\S]*LabelList/);
assert.match(charts, /dataKey="clear"[\s\S]*LabelList/);
assert.match(charts, /fontSize=\{13\}/);
assert.match(charts, /radius=\{\[8,\s*8,\s*8,\s*8\]\}/);
```

- [ ] **Step 2: Run the focused contract test**

Run:

```powershell
node --test src/__tests__/impactServiceShadcnContracts.test.js
```

Expected: FAIL because the current category chart is a BarChart, Site ID ticks may be skipped, and chart labels/radii still use the previous settings.

### Task 2: Refine KPI hierarchy

**Files:**
- Modify: `frontend/src/features/impact-service/ImpactServiceKpiGrid.jsx`

- [ ] **Step 1: Align icon and title**

Compose the icon and `CardTitle` inside one horizontal flex row so generated Card grid styles cannot place the icon below the title.

- [ ] **Step 2: Increase the KPI value**

Change the metric value to `text-[38px]` while retaining monospace, tabular numbers, metric color, delta, and comparison label.

### Task 3: Add reusable chart labels and colors

**Files:**
- Modify: `frontend/src/features/impact-service/impactServiceChartConfig.js`
- Modify: `frontend/src/features/impact-service/ImpactServiceCharts.jsx`

- [ ] **Step 1: Add category colors**

Export a stable category palette and `getCategoryColor(index)` so donut slices and valued legend use identical colors.

- [ ] **Step 2: Add non-zero label renderers**

Add shared renderers for vertical and horizontal bar values. Render only positive values, use 13px bold text, and choose white or dark foreground according to the series fill.

- [ ] **Step 3: Apply labels and rounded corners**

Add `LabelList` to OPEN/CLEAR bars in trend, contribution, and severity charts. Add a total `LabelList` to aging only. Use `[8, 8, 8, 8]` for every Bar radius.

### Task 4: Fix Site ID visibility

**Files:**
- Modify: `frontend/src/features/impact-service/ImpactServiceCharts.jsx`

- [ ] **Step 1: Normalize site labels**

Map selected-NOP site data with:

```js
label: site.site_id || site.site_name || `Site ${index + 1}`
```

- [ ] **Step 2: Prevent tick skipping**

Set `interval={0}`, increase Y-axis width, use a readable tick font and foreground color, and increase the chart left margin.

### Task 5: Replace category bars with a valued donut

**Files:**
- Modify: `frontend/src/features/impact-service/ImpactServiceCharts.jsx`

- [ ] **Step 1: Build the donut**

Use `PieChart`, `Pie`, and `Cell` with `dataKey="total"`, `nameKey="label"`, `innerRadius={58}`, `outerRadius={88}`, `cornerRadius={8}`, and the shared category palette.

- [ ] **Step 2: Add center total and valued legend**

Calculate the category total with `reduce`. Render it in the donut center and render every category name with its formatted value in a compact legend adjacent to or below the donut according to available width.

### Task 6: Verify contracts and rendered behavior

**Files:**
- Modify: `e2e-playwright.spec.js` only if a stable rendered assertion is required

- [ ] **Step 1: Run focused tests and lint**

```powershell
node --test src/__tests__/impactServiceShadcnContracts.test.js src/__tests__/dashboardReportingContracts.test.js
npx eslint src/features/impact-service/ImpactServiceKpiGrid.jsx src/features/impact-service/ImpactServiceCharts.jsx src/features/impact-service/impactServiceChartConfig.js src/__tests__/impactServiceShadcnContracts.test.js
```

- [ ] **Step 2: Run the production build**

```powershell
npm run build
```

- [ ] **Step 3: Run browser QA**

Open `/impact-service`, select a NOP, and verify:

- all Site IDs are visible;
- every non-zero OPEN/CLEAR segment has a readable value;
- Category Distribution is a donut with center total and valued legend;
- KPI title/icon alignment and value size match the approved design;
- dark and light themes have no clipping or console errors.

- [ ] **Step 4: Refresh the code graph**

```powershell
graphify update .
```
