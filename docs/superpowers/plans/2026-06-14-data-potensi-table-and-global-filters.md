# Data Potensi Table and Global Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Data Potensi filters drive every KPI/chart/table and make its site table match the Impact Service shadcn table behavior.

**Architecture:** Add a shared backend filter builder used by dashboard aggregation and paginated site queries, plus a filter-options endpoint constrained by NOP and Status Site. Extract the site table into a focused React feature component while the page owns global filter state, advanced Popover state, request parameters, and modal selection.

**Tech Stack:** FastAPI, SQLAlchemy text queries, Pydantic, React 19, Vite, Tailwind CSS v4, shadcn/ui Radix components, Recharts, Python unittest, Node test runner, Playwright CLI.

---

### Task 1: Define Regression Contracts

**Files:**
- Create: `backend/tests/test_data_potensi_contract.py`
- Create: `frontend/src/__tests__/dataPotensiContracts.test.js`

- [ ] Add backend assertions for common advanced filters, a filter-options endpoint, category normalization, and whitelisted `sort_by`/`sort_dir`.
- [ ] Add frontend assertions for a focused `DataPotensiSiteTable`, shadcn table states, `DashboardFilterPopover`, dashboard-wide advanced params, explicit page-reset handlers, and the responsive KPI grid.
- [ ] Run both targeted tests and confirm they fail because the new contracts are not implemented.

### Task 2: Implement Shared Backend Filtering and Sorting

**Files:**
- Modify: `backend/models/data_potensi.py`
- Modify: `backend/routers/data_potensi.py`
- Test: `backend/tests/test_data_potensi_contract.py`

- [ ] Add typed filter-option response fields for cluster, kabupaten, class, type, transport, battery, and TP.
- [ ] Add a shared advanced-filter builder using bound parameters and case-insensitive trimmed comparisons.
- [ ] Apply the shared filter fragment to scorecard, donut, stacked-bar, TP distribution, site count, and site list queries.
- [ ] Add `/data-potensi/filter-options` constrained by NOP and Status Site.
- [ ] Add whitelisted server-side ordering for every sortable table column.
- [ ] Normalize empty and equivalent missing categories to `Tidak ada`.
- [ ] Run the backend contract test until it passes.

### Task 3: Implement Impact-Style Data Potensi Table

**Files:**
- Create: `frontend/src/features/data-potensi/DataPotensiSiteTable.jsx`
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Modify: `frontend/src/services/api.js`
- Test: `frontend/src/__tests__/dataPotensiContracts.test.js`

- [ ] Build the toolbar with search, advanced-filter Popover, active chips, and reset.
- [ ] Build accessible server-sorted shadcn table headers and keyboard-activatable rows.
- [ ] Add Skeleton rows, Empty state, Tooltip truncation, status badges, and shared pagination.
- [ ] Move table state to the page and send search/filter/sort/page parameters to the API.
- [ ] Fetch advanced filter options whenever NOP or Status Site changes.
- [ ] Apply advanced filters to dashboard and table parameters.
- [ ] Reset page 1 from all global, advanced, search, and sort handlers.
- [ ] Run the frontend contract test until it passes.

### Task 4: Complete Page States and Responsive Fixes

**Files:**
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Test: `frontend/src/__tests__/dataPotensiContracts.test.js`

- [ ] Replace console-only failures with dashboard and table Alert states.
- [ ] Add initial KPI/chart Skeleton states while retaining stale data during failed refreshes.
- [ ] Change KPI layout to `grid-cols-1 sm:grid-cols-2 xl:grid-cols-5`.
- [ ] Remove unused theme-token code and use the established lint exception only around intentional request-loading state updates.
- [ ] Run the targeted frontend contract and ESLint checks.

### Task 5: Verify End to End

**Files:**
- Verify: `backend/routers/data_potensi.py`
- Verify: `frontend/src/pages/DataPotensiPage.jsx`
- Verify: `frontend/src/features/data-potensi/DataPotensiSiteTable.jsx`
- Update: `graphify-out/`

- [ ] Run backend Data Potensi tests and the existing Impact Service contract test.
- [ ] Run all frontend Node contract tests.
- [ ] Run targeted ESLint and the production build.
- [ ] Use Playwright at `http://127.0.0.1:5173/data-potensi` on desktop and mobile for Popover apply/cancel, global chart updates, sorting, pagination reset, keyboard row activation, themes, and console errors.
- [ ] Run `graphify update .`.
- [ ] Run `git diff --check` and inspect only the intended files.
