# Impact Service Compact Reporting and Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Impact Service denser for screen reporting, add an A4 landscape report with a prioritized OPEN alarm dataset, remove chart label strokes, and add server-side sorting to the alarm table.

**Architecture:** Extend the existing `/impact-service/alarms` endpoint with validated `sort_by` and `sort_dir` parameters. Keep the interactive table and print dataset as separate frontend requests so printing does not mutate the user's active table filters or pagination. Apply compact screen styles through existing feature components and isolate print-specific behavior with semantic classes plus `@media print`.

**Tech Stack:** FastAPI, SQLAlchemy text queries, React 19, shadcn/ui Table and Button, Recharts, Tailwind CSS v4, Node test runner, Python unittest, Playwright.

---

### Task 1: Lock backend and frontend contracts

**Files:**
- Modify: `backend/tests/test_impact_service_contract.py`
- Modify: `frontend/src/__tests__/impactServiceShadcnContracts.test.js`

- [ ] Add failing assertions for the backend sort whitelist, `sort_by`,
  `sort_dir`, severity CASE ordering, frontend sort state/params, print query,
  print classes, compact dimensions, and absence of SVG label strokes.
- [ ] Run the focused Python and Node tests and confirm they fail because the
  new contracts are not implemented.

### Task 2: Add safe server-side sorting

**Files:**
- Modify: `backend/routers/impact_service.py`

- [ ] Add an immutable mapping from public sort keys to trusted SQL
  expressions.
- [ ] Add a severity CASE expression ordered Critical, Major, Minor, Warning,
  then other values.
- [ ] Validate `sort_by` and `sort_dir` through FastAPI query constraints.
- [ ] Format only the trusted ORDER BY fragment into `ALARMS_LIST_QUERY`.
- [ ] Keep count filtering, pagination, response shape, and detail endpoint
  unchanged.
- [ ] Run backend contracts and verify they pass.

### Task 3: Add interactive table sorting and print data flow

**Files:**
- Modify: `frontend/src/pages/ImpactServicePage.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceAlarmTable.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceHeader.jsx`

- [ ] Add `sortBy` and `sortDir` state with default `tanggal` and `desc`.
- [ ] Include sorting only in `tableParams`; reset page one when sorting
  changes.
- [ ] Render sortable header buttons with accessible direction text and arrow
  indicators.
- [ ] Add a print action that requests up to 100 rows with global date/NOP,
  `status=OPEN`, `sort_by=severity`, and `sort_dir=asc`.
- [ ] Render the print dataset in a print-only table without changing screen
  search, status, severity, sorting, or page state.

### Task 4: Apply compact reporting density and print styles

**Files:**
- Modify: `frontend/src/features/impact-service/ImpactServiceHeader.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceFilters.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceKpiGrid.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceCharts.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceTopAlarms.jsx`
- Modify: `frontend/src/features/impact-service/ImpactServiceAlarmTable.jsx`
- Modify: `frontend/src/index.css`

- [ ] Remove stroke-related attributes from chart value labels and use solid
  semantic contrast colors.
- [ ] Reduce page/card gaps, chart heights, header padding, KPI height, table
  row height, and control height by approximately 25 percent.
- [ ] Add A4 landscape page rules and hide navigation, breadcrumb,
  interactive controls, pagination, and screen-only table during print.
- [ ] Keep KPI cards, chart cards, Top Alarm Names, and print alarm rows from
  splitting where practical.

### Task 5: Verify behavior

**Files:**
- Modify: `e2e-playwright.spec.js` if stable assertions are needed

- [ ] Run frontend contracts, backend contracts, targeted ESLint, and the Vite
  production build.
- [ ] Run the Impact Service Playwright flow and verify sorting request
  isolation.
- [ ] Validate desktop, mobile, and print emulation with screenshots and no
  relevant console errors.
- [ ] Run `graphify update .` and `git diff --check`.
