# Ticket TOTI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact Neon-backed Ticket TOTI subpage under Ticketing and make the existing Manual Takeover scorecard percentage-first.

**Architecture:** Keep Fault Center and TOTI as separate route/API modules joined by a shared local navigation. The backend parses the text timestamps defensively in a base CTE, normalizes NOP and category values at query time, and returns presentation-ready aggregate contracts. The frontend retains the existing dashboard shell and isolates dashboard versus table request state.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, Pydantic, PostgreSQL/Neon, React 18, React Router, Recharts, Tailwind CSS, Node test runner, pytest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-20-ticket-toti-dashboard-design.md`

## Global Constraints

- Do not mutate `public.ticket_toti`, add a migration, or expose credentials.
- Use `tgl_request` for period identity and `tgl_close - tgl_request` for duration.
- Normalize leading `NSA ` to `NOP ` in query expressions and filters.
- Implement every behavior through a red-green-refactor cycle.
- Keep dashboard SQL calls sequential on a single `AsyncSession`.
- Preserve last successful dashboard/table data when a refresh request fails.
- Use existing dashboard primitives and design tokens; add no frontend dependencies.
- Run `graphify update .` after material source changes.

---

### Task 1: Define and test the backend TOTI contract

**Files:**

- Create: `backend/models/ticket_toti.py`
- Create: `backend/routers/ticket_toti.py`
- Create: `backend/tests/test_ticket_toti.py`

- [ ] **Step 1: Write failing helper and response-model tests**

Add tests that import the new module and assert strict timestamp parsing, NSA/NOP normalization, category display normalization, mutually exclusive period input, equal previous-period calculation, and the exact response fields. Start with examples such as:

```python
def test_normalize_category_label_translates_vandalism():
    assert normalize_category_label(" VANDALISM ") == "Vandalisme"


def test_previous_custom_period_has_equal_day_count():
    assert previous_period_bounds(date(2026, 7, 10), date(2026, 7, 19)) == (
        date(2026, 6, 30),
        date(2026, 7, 9),
    )


def test_normalized_nop_sql_combines_nsa_and_nop():
    expression = normalized_nop_sql("nop")
    assert "NSA" in expression
    assert "NOP" in expression
```

- [ ] **Step 2: Run the focused backend test and confirm RED**

Run: `python -m pytest tests/test_ticket_toti.py -q`

Expected: FAIL because `backend.models.ticket_toti` or `backend.routers.ticket_toti` does not exist.

- [ ] **Step 3: Add the Pydantic API models**

Define typed models for filters, summary/top-item, trend points, distribution items, dashboard response, ticket row, and paginated ticket response. Use optional datetimes/duration where the source can be open or malformed.

```python
class TicketTotiTopItem(BaseModel):
    label: str
    tickets: int
    share: float


class TicketTotiRow(BaseModel):
    siteid: str | None = None
    sitename: str | None = None
    id: str
    kategori: str
    sub_kategori: str | None = None
    permasalahan: str | None = None
    kondisi_site: str | None = None
    requested_at: datetime
    closed_at: datetime | None = None
    duration_seconds: int | None = None
```

- [ ] **Step 4: Add pure helpers and the safe parsed-base SQL**

Implement `normalize_category_label`, `normalized_nop_sql`, `safe_timestamp_sql`, `previous_period_bounds`, shared query parameters, bound filter construction, and row mapping. The timestamp SQL must guard conversion with a regex before `to_timestamp`/cast and must exclude invalid request timestamps.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `python -m pytest tests/test_ticket_toti.py -q`

Expected: PASS.

- [ ] **Step 6: Commit the contract slice**

```powershell
git add backend/models/ticket_toti.py backend/routers/ticket_toti.py backend/tests/test_ticket_toti.py
git commit -m "feat: define Ticket TOTI API contract"
```

---

### Task 2: Implement tested TOTI filters, dashboard, and table endpoints

**Files:**

- Modify: `backend/routers/ticket_toti.py`
- Modify: `backend/tests/test_ticket_toti.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/test_router_auth.py`

- [ ] **Step 1: Write failing endpoint query tests**

Use the repository's fake async-session/result patterns to prove:

- filter options are sorted, unique, nonblank, and NOP-normalized;
- the default period is the latest request month;
- dashboard filter parameters are reused by every aggregate;
- a top label tie sorts alphabetically after count;
- distributions return ten rows plus `Lainnya`;
- VANDALISM maps to Vandalisme and a vandalism count;
- dashboard trend is daily for one month and monthly for multiple months;
- tickets search four text columns, order by request/id descending, and paginate;
- duration is null for open/malformed/negative timestamps;
- `/api/v1/ticketing/toti/*` is registered behind dashboard authentication.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `python -m pytest tests/test_ticket_toti.py tests/test_router_auth.py -q`

Expected: FAIL on missing endpoints/router registration.

- [ ] **Step 3: Implement `GET /ticketing/toti/filters`**

Return min/max/default dates, available months, canonical NOPs, clusters, mitras, display-ready categories, and statuses. Cache the response through the existing cache abstraction with a TOTI-specific key.

- [ ] **Step 4: Implement `GET /ticketing/toti/dashboard`**

Resolve the period once, build one filtered parsed-base CTE, then execute sequential bound queries for current total, previous total, top mitra, top category, vandalism, trend, cluster distribution, mitra distribution, and last updated timestamp. Apply deterministic sorting and aggregate distribution overflow into `Lainnya`.

```python
rate = None if previous_total == 0 else ((total - previous_total) / previous_total) * 100
share = 0.0 if total == 0 else tickets / total * 100
```

- [ ] **Step 5: Implement `GET /ticketing/toti/tickets`**

Add bound search terms, count query, 15-row-compatible pagination, deterministic ordering, normalized category output, and duration seconds only for valid nonnegative closed intervals.

- [ ] **Step 6: Register the router behind dashboard authentication**

Import `ticket_toti` in `backend/main.py` and include it with the same authenticated dependency list used for the existing Ticketing router.

- [ ] **Step 7: Run focused and full backend verification**

Run:

```powershell
python -m pytest tests/test_ticket_toti.py tests/test_router_auth.py -q
python -m pytest tests -q
```

Expected: PASS with no new warnings or regressions.

- [ ] **Step 8: Commit the endpoint slice**

```powershell
git add backend/routers/ticket_toti.py backend/tests/test_ticket_toti.py backend/main.py backend/tests/test_router_auth.py
git commit -m "feat: add Ticket TOTI backend endpoints"
```

---

### Task 3: Add shared Ticketing navigation, route, API functions, and Manual Takeover change

**Files:**

- Create: `frontend/src/components/TicketingSectionNav.jsx`
- Create: `frontend/src/__tests__/ticketTotiContracts.test.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Breadcrumb.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/pages/TicketingPage.jsx`
- Modify: `frontend/src/services/api.js`

- [ ] **Step 1: Write failing frontend contract tests**

Assert the following source/runtime contracts:

- `/ticketing/toti` lazily renders `TicketTotiPage`;
- shared tabs link to `/ticketing` and `/ticketing/toti` and expose `aria-current`;
- Ticketing sidebar stays active for nested TOTI routes;
- breadcrumb maps `toti` to `Ticket TOTI`;
- three API functions call `/ticketing/toti/filters`, `/dashboard`, and `/tickets`;
- Manual Takeover's primary value is `formatPercent(summary?.manual_takeover_rate)`;
- Manual Takeover subtitle is count versus `summary?.total_tickets`.

- [ ] **Step 2: Run the focused frontend test and confirm RED**

Run: `node --test src/__tests__/ticketTotiContracts.test.js`

Expected: FAIL on missing route, nav, API functions, and percentage-first rendering.

- [ ] **Step 3: Implement local Ticketing navigation**

Use `NavLink`, exact matching for Fault Center, nested matching for TOTI, `aria-current="page"`, existing red/graphite tokens, and equal-width behavior on narrow screens. Render it in the existing Ticketing page below the title block.

- [ ] **Step 4: Wire the route, breadcrumb, and sidebar scope**

Lazy-load `TicketTotiPage`, add the authenticated route, map the breadcrumb label, and treat `pathname.startsWith('/ticketing')` as active for the single global Ticketing item.

- [ ] **Step 5: Add the API service functions**

Build query strings through the existing URL parameter helper and return the same parsed/error-normalized result style as Fault Center.

- [ ] **Step 6: Change Manual Takeover display only**

```jsx
<Scorecard
  title="Manual Takeover"
  value={formatPercent(summary?.manual_takeover_rate)}
  subtitle={`${formatNumber(summary?.manual_takeover_tickets)} dari ${formatNumber(summary?.total_tickets)} ticket`}
  icon={Hand}
/>
```

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `node --test src/__tests__/ticketTotiContracts.test.js src/__tests__/ticketingContracts.test.js`

Expected: PASS.

- [ ] **Step 8: Commit the routing slice**

```powershell
git add frontend/src/components/TicketingSectionNav.jsx frontend/src/__tests__/ticketTotiContracts.test.js frontend/src/App.jsx frontend/src/components/Breadcrumb.jsx frontend/src/components/Sidebar.jsx frontend/src/pages/TicketingPage.jsx frontend/src/services/api.js
git commit -m "feat: add Ticketing TOTI navigation"
```

---

### Task 4: Build the compact Ticket TOTI dashboard UI

**Files:**

- Create: `frontend/src/features/ticket-toti/ticketTotiUtils.js`
- Create: `frontend/src/features/ticket-toti/TicketTotiCharts.jsx`
- Create: `frontend/src/features/ticket-toti/TicketTotiTable.jsx`
- Create: `frontend/src/pages/TicketTotiPage.jsx`
- Modify: `frontend/src/__tests__/ticketTotiContracts.test.js`
- Create: `frontend/src/__tests__/ticketTotiUtils.test.js`

- [ ] **Step 1: Write failing utility and page contract tests**

Cover duration formatting and comparison text with exact cases:

```javascript
assert.equal(formatDuration(16320), '4j 32m')
assert.equal(formatDuration(198000), '2h 7j')
assert.equal(formatDuration(null, { isOpen: true }), 'Belum close')
assert.equal(formatDuration(null), '-')
```

Also assert four required scorecard labels, a combined Total/Vandalisme chart, Cluster and Tower Provider distribution sections, the eight table headers, 15-row request limit, isolated search/page state, scoped retry states, and the empty-state wording.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test src/__tests__/ticketTotiUtils.test.js src/__tests__/ticketTotiContracts.test.js`

Expected: FAIL because the feature modules/page do not exist.

- [ ] **Step 3: Implement deterministic presentation utilities**

Add Indonesian compact duration, signed period comparison, share/count subtitle helpers, and safe text fallbacks. Keep them pure so edge cases stay unit-testable.

- [ ] **Step 4: Implement the charts module**

Use existing chart tokens and Recharts primitives. Render a responsive composed chart with total bars and a Vandalisme line, plus two compact horizontal top-ten distribution charts with accessible names/tooltips.

- [ ] **Step 5: Implement the mini table module**

Render search, sticky eight-column header, compact rows, title tooltips for truncated text, tabular IDs, duration status, pagination, and table-only loading/error/empty states. Constrain horizontal scrolling to the table viewport.

- [ ] **Step 6: Implement `TicketTotiPage` state and layout**

Reuse the Ticketing shell, filter bar, period controls, comboboxes, filter chips, scorecards, alerts, skeletons, and refresh behavior. Keep separate `dashboardState` and `tableState`; search/page changes call only `fetchTicketTotiTickets`. On request failure, update the error while leaving the prior successful data intact.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `node --test src/__tests__/ticketTotiUtils.test.js src/__tests__/ticketTotiContracts.test.js src/__tests__/ticketingContracts.test.js`

Expected: PASS.

- [ ] **Step 8: Run frontend suite, lint, and production build**

Run:

```powershell
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

Expected: PASS; production bundle contains the lazy Ticket TOTI chunk.

- [ ] **Step 9: Commit the dashboard UI slice**

```powershell
git add frontend/src/features/ticket-toti frontend/src/pages/TicketTotiPage.jsx frontend/src/__tests__/ticketTotiContracts.test.js frontend/src/__tests__/ticketTotiUtils.test.js
git commit -m "feat: build Ticket TOTI dashboard"
```

---

### Task 5: Verify live behavior, responsive UI, and repository graph

**Files:**

- Modify only files required by defects reproduced during verification.

- [ ] **Step 1: Run complete automated verification from clean processes**

Run backend pytest, all frontend node tests, frontend lint, and frontend production build again. Record exact pass/fail totals and distinguish existing npm audit advisories from regressions.

- [ ] **Step 2: Start local backend and frontend with safe process-only configuration**

Use an unused localhost port pair, an exact `PUBLIC_APP_ORIGIN`, existing local database configuration without printing secrets, and inert nonproduction webhook URLs where required. Confirm `/health` before browser navigation.

- [ ] **Step 3: Perform authenticated desktop browser QA**

Validate:

- local tabs and URL navigation;
- Manual Takeover percentage-first display;
- latest-period live values and four TOTI cards;
- one-month daily trend and a multi-month monthly trend;
- Cluster/Mitra distributions;
- search/pagination isolation;
- NOP MALANG combining NSA and NOP records;
- an open row displaying `Belum close`;
- refresh/retry without losing last successful results.

- [ ] **Step 4: Perform 390 px responsive browser QA**

Confirm no page-level horizontal overflow, readable stacked scorecards/charts, keyboard-visible local tabs, and horizontal scrolling only inside the table viewport. Save screenshots as untracked QA artifacts when useful.

- [ ] **Step 5: Fix every reproduced regression through RED-GREEN**

For each issue, add or tighten a focused automated test, demonstrate failure, make the smallest source correction, rerun the focused test, and then repeat the complete verification set.

- [ ] **Step 6: Refresh Graphify**

Run: `graphify update .`

Expected: successful incremental graph update covering the new backend/frontend modules and route links.

- [ ] **Step 7: Review scope and commit verification fixes**

Run `git status --short`, `git diff --check`, and inspect `git diff origin/main...HEAD`. Stage only implementation, tests, spec, and plan files; leave screenshots/logs untracked.

```powershell
git add backend/main.py backend/models/ticket_toti.py backend/routers/ticket_toti.py backend/tests/test_router_auth.py backend/tests/test_ticket_toti.py frontend/src/App.jsx frontend/src/components/Breadcrumb.jsx frontend/src/components/Sidebar.jsx frontend/src/components/TicketingSectionNav.jsx frontend/src/features/ticket-toti frontend/src/pages/TicketingPage.jsx frontend/src/pages/TicketTotiPage.jsx frontend/src/services/api.js frontend/src/__tests__/ticketingContracts.test.js frontend/src/__tests__/ticketTotiContracts.test.js frontend/src/__tests__/ticketTotiUtils.test.js docs/superpowers/specs/2026-08-20-ticket-toti-dashboard-design.md docs/superpowers/plans/2026-08-20-ticket-toti-dashboard.md
git commit -m "test: verify Ticket TOTI dashboard"
```

- [ ] **Step 8: Prepare branch handoff**

Report the feature branch name, commits, test/build/browser evidence, Graphify result, live-data checks, and any unrelated baseline advisories. Do not push, merge, or delete the worktree without explicit user authorization.
