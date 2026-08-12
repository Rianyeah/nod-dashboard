# Ticketing Dashboard Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Ticketing location distribution and add approved FOP threshold styling and table sorting while removing the Average MTTR tooltip.

**Architecture:** Change the location response from fixed positive counters to long-form categorical aggregates, then pivot only the selected metric into chart-ready stacked series in a pure frontend utility. Keep FOP sorting and threshold calculations client-side because all FOP rows and period metadata already arrive in the dashboard response.

**Tech Stack:** FastAPI, SQLAlchemy text queries, Pydantic, React, Recharts, Tailwind CSS, Node test runner, unittest/pytest

## Global Constraints

- Keep the existing dashboard layout and FOP score formula unchanged.
- Kabupaten/Kota category segments must use a stacked bar, not separate grouped bars.
- Takeover threshold is exactly 26 tickets per selected calendar month.
- Preserve all unrelated user changes and work only on `codex/ticketing-dashboard-fop`.

---

### Task 1: Long-form location aggregation

**Files:**
- Modify: `backend/models/ticketing.py`
- Modify: `backend/routers/ticketing.py`
- Test: `backend/tests/test_ticketing_contract.py`

**Interfaces:**
- Produces: `TicketingLocationBreakdownItem(label: str, metric: str, value: str, tickets: int)`.
- Consumes: the existing dashboard filter clause and `ticketing_fault_center` categorical columns.

- [x] **Step 1: Write a failing backend contract test** asserting the long-form fields and SQL categories for takeover, visitation, backup success, and escalation.
- [x] **Step 2: Run `python -m pytest backend/tests/test_ticketing_contract.py -q`** and confirm the new assertion fails against the fixed-counter contract.
- [x] **Step 3: Replace the fixed counters with a `CROSS JOIN LATERAL` categorical aggregate** that normalizes blanks to `Unknown` and booleans to `Escalated` / `Not Escalated`.
- [x] **Step 4: Update the Pydantic response item and remove the obsolete title-stripping mutation.**
- [x] **Step 5: Rerun the backend contract test** and confirm it passes.

### Task 2: Stacked location chart

**Files:**
- Modify: `frontend/src/features/ticketing/ticketingChartUtils.js`
- Modify: `frontend/src/features/ticketing/ticketingChartConfig.js`
- Modify: `frontend/src/features/ticketing/TicketingCharts.jsx`
- Test: `frontend/src/__tests__/ticketingChartUtils.test.js`
- Test: `frontend/src/__tests__/ticketingContracts.test.js`

**Interfaces:**
- Consumes: long-form location rows from Task 1.
- Produces: `buildStackedLocationData(rows, metric, limit)` returning `{ rows, series }`, where row series keys are safe generated identifiers and each series retains its category label.

- [x] **Step 1: Write failing utility tests** for pivoting all active categories, summing location totals, limiting deterministically, and preserving the input.
- [x] **Step 2: Run `node --test src/__tests__/ticketingChartUtils.test.js` from `frontend`** and confirm failure.
- [x] **Step 3: Implement the pivot utility and update dropdown metric keys.**
- [x] **Step 4: Render one Recharts `Bar` per returned series with the shared `stackId="location"`, dynamic colors, tooltip labels, and legend.**
- [x] **Step 5: Rerun the chart utility and contract tests** and confirm they pass.

### Task 3: FOP thresholds, sorting, and MTTR cleanup

**Files:**
- Create: `frontend/src/features/ticketing/ticketingFopUtils.js`
- Modify: `frontend/src/pages/TicketingPage.jsx`
- Create: `frontend/src/__tests__/ticketingFopUtils.test.js`
- Modify: `frontend/src/__tests__/ticketingContracts.test.js`

**Interfaces:**
- Produces: `getFopMonthCount(periodMeta, startDate, endDate)`, `getTakeoverThreshold(monthCount)`, and `sortFopRows(rows, key, direction)`.
- Consumes: dashboard FOP rows, dashboard period metadata, and the active date filter.

- [x] **Step 1: Write failing tests** for 1/2/3-month thresholds, inclusive custom-date month counting, null-last numeric sorting, alphabetical PIC sorting, input immutability, and default descending score order.
- [x] **Step 2: Run the focused Node tests** and confirm failure because the utility does not exist.
- [x] **Step 3: Implement the pure FOP utilities.**
- [x] **Step 4: Remove `HelpHint` from Average MTTR, add sortable header buttons and direction indicators, and apply green text for score `> 50` and takeover `>= 26 x months`.**
- [x] **Step 5: Run focused frontend tests** and confirm they pass.

### Task 4: Integrated verification and PR refresh

**Files:**
- Modify only test fallout required by the approved behavior.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a verified update on PR #28.

- [x] **Step 1: Run the full backend test suite.**
- [x] **Step 2: Run the full frontend test suite, lint, and production build.**
- [x] **Step 3: Query Neon independently** to confirm all category values and counts for a known month.
- [x] **Step 4: Run local browser QA** for stacked bars, sorting direction, threshold colors, and the removed MTTR tooltip.
- [x] **Step 5: Run `graphify update .` and inspect its result.**
- [ ] **Step 6: Commit scoped changes, push the existing feature branch, and report PR status.**
