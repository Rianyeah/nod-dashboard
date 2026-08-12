# Ticketing Dashboard FOP Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Ticketing dashboard with takeover filtering, Average MTTR, adaptive trend aggregation, selectable Kabupaten/Kota metrics, and a ranked FOP performance table.

**Architecture:** Extend the existing Ticketing dashboard endpoint so one filter-aware payload carries every new aggregate. Keep scoring and trend-boundary decisions in pure Python helpers, keep SQL aggregation in the Ticketing router, and let the React chart switch already-loaded location metrics locally without another request.

**Tech Stack:** Python 3, FastAPI, SQLAlchemy text queries, Pydantic, PostgreSQL/Neon, React 19, Recharts 3, Radix Select, Tailwind CSS, Node test runner, unittest, Playwright, Graphify.

## Global Constraints

- Work only in `D:/Web-dashboard/.worktrees/ticketing-dashboard-fop` on `codex/ticketing-dashboard-fop`.
- Preserve the SLA distribution chart and SLA Status Ticket List column; only the advanced SLA filter is replaced.
- Use the confirmed FOP weights in this order: takeover 50%, visitation 30%, backup sukses 10%, response speed 10%.
- One month is daily, two or three months is weekly, and more than three months is monthly.
- Do not add a frontend request or mutate Neon schema/source data.
- Keep existing dashboard primitives, loading behavior, responsive design tokens, and empty states.
- Use TDD: observe every new test fail before adding its implementation.
- Stage only files listed by the current task and do not push or open a PR.

## File Structure

- Create `backend/ticketing_metrics.py`: pure trend-resolution and FOP scoring helpers.
- Create `backend/tests/test_ticketing_metrics.py`: behavioral tests for helper boundaries and ranking math.
- Modify `backend/models/ticketing.py`: response models for takeover options, adaptive trend metadata, location metrics, and FOP rows.
- Modify `backend/routers/ticketing.py`: takeover filter, Average MTTR, dynamic trend SQL, location aggregation, FOP aggregation, and response wiring.
- Modify `backend/tests/test_ticketing_contract.py`: router/model/query contract coverage.
- Modify `frontend/src/features/ticketing/ticketingChartConfig.js`: labels/colors for selectable location metrics.
- Create `frontend/src/features/ticketing/ticketingChartUtils.js`: pure trend-title and location-metric sorting utilities.
- Modify `frontend/src/features/ticketing/TicketingCharts.jsx`: adaptive trend title and Kabupaten/Kota dropdown.
- Create `frontend/src/__tests__/ticketingChartUtils.test.js`: behavioral tests for adaptive chart utilities.
- Modify `frontend/src/pages/TicketingPage.jsx`: takeover filter, scorecards, and the FOP table/layout.
- Modify `frontend/src/__tests__/ticketingContracts.test.js`: UI and request-contract coverage.
- Refresh `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` after material changes; these remain generated artifacts unless already tracked.

---

### Task 1: Pure Ticketing Metric Helpers and Models

**Files:**
- Create: `backend/ticketing_metrics.py`
- Create: `backend/tests/test_ticketing_metrics.py`
- Modify: `backend/models/ticketing.py`

**Interfaces:**
- Consumes: standard-library `date`, `math`, and `typing.Literal` only.
- Produces: `resolve_trend_granularity(month_count=None, start_date=None, end_date=None) -> Literal["day", "week", "month"]`.
- Produces: `rank_fop_performance(rows: list[dict]) -> list[dict]` with `rank` and `performance_score` added.
- Produces: Pydantic fields `takeovers`, `average_mttr_hours`, `trend_granularity`, `location_breakdown`, and `fop_performance` used by Task 2.

- [ ] **Step 1: Write failing helper tests**

Create `backend/tests/test_ticketing_metrics.py` with tests equivalent to:

```python
from datetime import date
import unittest

from ticketing_metrics import rank_fop_performance, resolve_trend_granularity


class TicketingMetricsTest(unittest.TestCase):
    def test_trend_granularity_uses_month_and_custom_date_boundaries(self):
        self.assertEqual(resolve_trend_granularity(month_count=1), "day")
        self.assertEqual(resolve_trend_granularity(month_count=2), "week")
        self.assertEqual(resolve_trend_granularity(month_count=3), "week")
        self.assertEqual(resolve_trend_granularity(month_count=4), "month")
        self.assertEqual(
            resolve_trend_granularity(start_date=date(2026, 1, 1), end_date=date(2026, 1, 31)),
            "day",
        )
        self.assertEqual(
            resolve_trend_granularity(start_date=date(2026, 1, 1), end_date=date(2026, 4, 4)),
            "month",
        )

    def test_fop_score_uses_confirmed_weights_and_inverse_response(self):
        ranked = rank_fop_performance([
            {"pic": "Volume", "takeover_tickets": 10, "visitation_tickets": 0,
             "backup_sukses_tickets": 0, "average_response_minutes": 30.0},
            {"pic": "Speed", "takeover_tickets": 0, "visitation_tickets": 10,
             "backup_sukses_tickets": 10, "average_response_minutes": 10.0},
        ])
        self.assertEqual(ranked[0]["pic"], "Volume")
        self.assertEqual(ranked[0]["performance_score"], 50.0)
        self.assertEqual(ranked[1]["performance_score"], 50.0)
        self.assertEqual([row["rank"] for row in ranked], [1, 2])

    def test_fop_score_handles_equal_zero_counts_and_missing_response(self):
        ranked = rank_fop_performance([
            {"pic": "Valid", "takeover_tickets": 5, "visitation_tickets": 0,
             "backup_sukses_tickets": 0, "average_response_minutes": 20.0},
            {"pic": "Missing", "takeover_tickets": 5, "visitation_tickets": 0,
             "backup_sukses_tickets": 0, "average_response_minutes": None},
        ])
        self.assertEqual(ranked[0]["performance_score"], 60.0)
        self.assertEqual(ranked[1]["performance_score"], 50.0)
```

- [ ] **Step 2: Run helper tests and verify RED**

Run: `python -m unittest tests.test_ticketing_metrics -v` from `backend/`.

Expected: FAIL because `ticketing_metrics` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `backend/ticketing_metrics.py` with these exact rules:

```python
from datetime import date
from typing import Literal

TrendGranularity = Literal["day", "week", "month"]


def resolve_trend_granularity(*, month_count=None, start_date=None, end_date=None):
    if month_count is not None:
        span = month_count
        return "day" if span <= 1 else "week" if span <= 3 else "month"
    if start_date is None or end_date is None:
        return "day"
    inclusive_days = (end_date - start_date).days + 1
    return "day" if inclusive_days <= 31 else "week" if inclusive_days <= 93 else "month"
```

Implement `rank_fop_performance` with per-component min-max normalization. Equal positive counts score 100; equal zero counts score 0; equal valid response values score 100; missing response scores 0. Round the weighted result to two decimals and sort by the deterministic sequence in the design spec before assigning one-based ranks.

- [ ] **Step 4: Add Pydantic response contracts**

Modify `backend/models/ticketing.py`:

```python
class TicketingLocationBreakdownItem(BaseModel):
    label: str
    takeover_tickets: int = 0
    visitation_tickets: int = 0
    backup_sukses_tickets: int = 0
    escalated_tickets: int = 0


class TicketingFopPerformanceItem(BaseModel):
    rank: int
    pic: str
    performance_score: float
    takeover_tickets: int = 0
    visitation_tickets: int = 0
    backup_sukses_tickets: int = 0
    average_response_minutes: float | None = None
```

Replace `sla_statuses` with `takeovers` in `TicketingFilters`, add `average_mttr_hours` to `TicketingSummary`, and add these fields to `TicketingDashboard`:

```python
trend_granularity: str = "day"
location_breakdown: list[TicketingLocationBreakdownItem] = []
fop_performance: list[TicketingFopPerformanceItem] = []
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```powershell
python -m unittest tests.test_ticketing_metrics -v
python -m unittest tests.test_ticketing_contract -v
```

Expected: helper tests PASS; existing contract tests may fail only where they still assert old model names, which Task 2 updates.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- backend/ticketing_metrics.py backend/tests/test_ticketing_metrics.py backend/models/ticketing.py
git commit -m "feat: add ticketing performance metric helpers"
```

---

### Task 2: Ticketing Router Aggregates and Filter Contract

**Files:**
- Modify: `backend/routers/ticketing.py`
- Modify: `backend/tests/test_ticketing_contract.py`

**Interfaces:**
- Consumes: `resolve_trend_granularity` and `rank_fop_performance` from Task 1.
- Produces: one `/ticketing/dashboard` payload with `average_mttr_hours`, `trend_granularity`, four location metrics, and ranked `fop_performance`.
- Produces: shared `takeover` filtering for dashboard, paginated tickets, and CSV export.

- [ ] **Step 1: Update backend contract tests first**

Replace old advanced-SLA expectations and add assertions equivalent to:

```python
self.assertIn("takeover: str | None = Query(None", source)
self.assertIn("UPPER(TRIM(t.takeover)) = UPPER(TRIM(:takeover))", source)
self.assertIn("takeovers: list[str]", models)
self.assertIn("average_mttr_hours: float | None", models)
self.assertIn("trend_granularity", models)
self.assertIn("TicketingLocationBreakdownItem", models)
self.assertIn("TicketingFopPerformanceItem", models)
self.assertIn("FOP_PERFORMANCE_QUERY", source)
self.assertIn("rank_fop_performance", source)
```

Assert the location query contains all four requested conditional counts and no `LIMIT 12`. Assert trend SQL contains structural placeholders for the whitelisted unit and label format.

- [ ] **Step 2: Run router contract tests and verify RED**

Run: `python -m unittest tests.test_ticketing_contract -v` from `backend/`.

Expected: FAIL on takeover, Average MTTR, adaptive trend, location metrics, and FOP query expectations.

- [ ] **Step 3: Replace the advanced filter contract**

In `backend/routers/ticketing.py`:

- replace `sla_status` arguments/params/clauses with `takeover`;
- replace the filter-options SLA array with a distinct normalized takeover array;
- retain every SLA query used for charts and ticket display;
- ensure list and export endpoints accept the same `takeover` parameter through `shared_query_params`.

Use:

```python
if params.get("takeover"):
    clauses.append("UPPER(TRIM(t.takeover)) = UPPER(TRIM(:takeover))")
```

- [ ] **Step 4: Add Average MTTR and adaptive trend SQL**

Add `average_mttr_hours` to `DASHBOARD_SUMMARY_QUERY` using filtered nonnegative `mttr` intervals.

Define a whitelist:

```python
TREND_BUCKET_SQL = {
    "day": ("day", "DD Mon"),
    "week": ("week", "DD Mon"),
    "month": ("month", "Mon YYYY"),
}
```

Format `TREND_QUERY` only with values selected from this constant. For canonical filters pass `params["_period"].month_count`; for custom filters pass `start_date` and `end_date` to `resolve_trend_granularity`.

- [ ] **Step 5: Replace location aggregation and add the FOP query**

Make `LOCATION_BREAKDOWN_QUERY` return all grouped Kabupaten/Kota rows with:

```sql
COUNT(*) FILTER (WHERE UPPER(TRIM(t.takeover)) = 'TAKE OVER') AS takeover_tickets,
COUNT(*) FILTER (WHERE TRIM(t.visitation) = 'Visit site') AS visitation_tickets,
COUNT(*) FILTER (WHERE TRIM(t.backup_sukses) = 'BU Genset') AS backup_sukses_tickets,
COUNT(*) FILTER (WHERE t.is_escalate IS TRUE) AS escalated_tickets
```

Add `FOP_PERFORMANCE_QUERY`, grouping by nonblank `TRIM(t.pic_take_over_ticket)` and computing the three counts plus filtered average response minutes. Pass its rows to `rank_fop_performance` before building `TicketingDashboard`.

- [ ] **Step 6: Wire the dashboard response**

Return:

```python
TicketingDashboard(
    summary=summary,
    trend=trend,
    trend_granularity=trend_granularity,
    location_breakdown_title="Kabupaten/Kota Distribution",
    location_breakdown=location_rows,
    fop_performance=fop_performance,
    # retain existing distributions, top sites, and period metadata
)
```

- [ ] **Step 7: Run backend tests and verify GREEN**

Run:

```powershell
python -m unittest tests.test_ticketing_metrics -v
python -m unittest tests.test_ticketing_contract -v
python -m unittest tests.test_period_router_params -v
```

Expected: all selected backend tests PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- backend/routers/ticketing.py backend/tests/test_ticketing_contract.py
git commit -m "feat: extend ticketing dashboard aggregates"
```

---

### Task 3: Ticketing Page Filter, Scorecards, and FOP Table

**Files:**
- Modify: `frontend/src/pages/TicketingPage.jsx`
- Modify: `frontend/src/__tests__/ticketingContracts.test.js`

**Interfaces:**
- Consumes: `takeovers`, `summary.average_mttr_hours`, and `dashboard.fop_performance` from Task 2.
- Produces: the takeover advanced filter, swapped scorecards, and responsive left-stack/right-list layout.

- [ ] **Step 1: Write failing page contract tests**

Update `ticketingContracts.test.js` to assert:

```javascript
assert.match(page, /label="Takeover"/);
assert.match(page, /advancedFilters\.takeover/);
assert.match(page, /filterOptions\.takeovers/);
assert.doesNotMatch(page, /label="SLA Status"/);
assert.match(page, /Scorecard title="Average MTTR"/);
assert.match(page, /summary\?\.average_mttr_hours/);
assert.doesNotMatch(page, /Scorecard title="Response P90"/);
assert.match(page, /Performance Tim FOP/);
assert.match(page, /dashboard\?\.fop_performance/);
assert.match(page, /Performance Score/);
```

Compare string indexes to prove `Manual Takeover` occupies the old OUT SLA position and `OUT SLA Rate` occupies the old Manual Takeover position.

- [ ] **Step 2: Run frontend contract tests and verify RED**

Run: `node --test src/__tests__/ticketingContracts.test.js` from `frontend/`.

Expected: FAIL on the new Takeover, Average MTTR, scorecard order, and FOP table contracts.

- [ ] **Step 3: Replace advanced filter state and request mapping**

In `TicketingPage.jsx`:

- replace `sla_status` with `takeover` in empty state, memoized params, filter control, chips, and reset behavior;
- use ID `ticketing-takeover`;
- use `filterOptions.takeovers` and `Semua Takeover`.

- [ ] **Step 4: Swap and replace scorecards**

Move `Manual Takeover` into the exact former `OUT SLA Rate` position and move `OUT SLA Rate` into the exact former Manual Takeover position.

Replace Response P90 with:

```jsx
<Scorecard title="Average MTTR" icon={Clock3} accent={TICKETING_CHART_COLORS.bps}>
  <div className="mt-2 flex items-center gap-2">
    <p className="truncate font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight">
      {formatHours(summary?.average_mttr_hours)}
    </p>
    <HelpHint text="Average MTTR menghitung rata-rata durasi MTTR valid pada filter aktif." />
  </div>
</Scorecard>
```

- [ ] **Step 5: Build the FOP table and responsive layout**

Wrap `Top Problem Sites` and `Performance Tim FOP` in a left-column `div` with `grid gap-4 content-start`. Keep Ticket List as the right-column sibling under the existing `xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]` section.

Render all `dashboard?.fop_performance || []` rows in a bounded scroll container. Use the exact columns Rank, PIC, Performance Score, Takeover, Visitation, Backup Sukses, and Average Response Time. Format score with two decimals and response with `formatMinutes`.

- [ ] **Step 6: Run frontend tests and verify GREEN**

Run:

```powershell
node --test src/__tests__/ticketingContracts.test.js
npx eslint src/pages/TicketingPage.jsx src/__tests__/ticketingContracts.test.js
```

Expected: selected tests and scoped lint PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- frontend/src/pages/TicketingPage.jsx frontend/src/__tests__/ticketingContracts.test.js
git commit -m "feat: add ticketing FOP performance table"
```

---

### Task 4: Adaptive Trend Title and Kabupaten/Kota Metric Dropdown

**Files:**
- Create: `frontend/src/features/ticketing/ticketingChartUtils.js`
- Create: `frontend/src/__tests__/ticketingChartUtils.test.js`
- Modify: `frontend/src/features/ticketing/TicketingCharts.jsx`
- Modify: `frontend/src/features/ticketing/ticketingChartConfig.js`
- Modify: `frontend/src/__tests__/ticketingContracts.test.js`

**Interfaces:**
- Consumes: `dashboard.trend_granularity` and every `dashboard.location_breakdown` metric from Task 2.
- Produces: `getTicketTrendTitle(granularity)` and `getTopLocationRows(rows, metric, limit=12)` pure utilities.
- Produces: local `locationMetric` state with no network request.

- [ ] **Step 1: Write failing chart utility tests**

Create `frontend/src/__tests__/ticketingChartUtils.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTicketTrendTitle,
  getTopLocationRows,
} from '../features/ticketing/ticketingChartUtils.js';

describe('Ticketing chart utilities', () => {
  it('maps backend trend granularity to business titles with a daily fallback', () => {
    assert.equal(getTicketTrendTitle('day'), 'Daily Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('week'), 'Weekly Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('month'), 'Monthly Trend Ticket by Kategori');
    assert.equal(getTicketTrendTitle('unexpected'), 'Daily Trend Ticket by Kategori');
  });

  it('sorts a copy by the active metric and keeps deterministic top rows', () => {
    const rows = [
      { label: 'Zulu', takeover_tickets: 2, escalated_tickets: 9 },
      { label: 'Alpha', takeover_tickets: 2, escalated_tickets: 1 },
      { label: 'Beta', takeover_tickets: 5, escalated_tickets: 3 },
    ];
    assert.deepEqual(
      getTopLocationRows(rows, 'takeover_tickets', 2).map((row) => row.label),
      ['Beta', 'Alpha'],
    );
    assert.deepEqual(rows.map((row) => row.label), ['Zulu', 'Alpha', 'Beta']);
    assert.deepEqual(
      getTopLocationRows(rows, 'escalated_tickets', 2).map((row) => row.label),
      ['Zulu', 'Beta'],
    );
  });
});
```

- [ ] **Step 2: Run chart utility tests and verify RED**

Run: `node --test src/__tests__/ticketingChartUtils.test.js` from `frontend/`.

Expected: FAIL because `ticketingChartUtils.js` does not exist.

- [ ] **Step 3: Implement pure chart utilities**

Create `ticketingChartUtils.js` with a closed title map, a daily fallback, a copied descending numeric sort, an ascending `label.localeCompare` tie-breaker, and `slice(0, limit)`. Export the four frozen location options from this file so UI options and behavior tests share one contract.

- [ ] **Step 4: Write failing chart integration contracts**

Add expectations for:

```javascript
assert.match(charts, /trend_granularity/);
assert.match(charts, /Weekly Trend Ticket by Kategori/);
assert.match(charts, /Monthly Trend Ticket by Kategori/);
assert.match(charts, /locationMetric/);
for (const key of ['takeover_tickets', 'visitation_tickets', 'backup_sukses_tickets', 'escalated_tickets']) {
  assert.ok(charts.includes(key), key);
}
assert.match(charts, /SelectTrigger/);
assert.match(charts, /Kabupaten\/Kota metric/);
```

- [ ] **Step 5: Run frontend contract tests and verify RED**

Run: `node --test src/__tests__/ticketingContracts.test.js` from `frontend/`.

Expected: FAIL on adaptive title, dropdown, and metric mapping.

- [ ] **Step 6: Add chart config entries**

Extend `ticketingChartConfig` with labels/colors for the four location data keys. Use existing Ticketing chart colors; do not introduce raw hex colors.

- [ ] **Step 7: Implement adaptive title and local metric selection**

Import Radix wrappers from `@/components/ui/select` and the utility exports. The utility module owns this frozen option list:

```javascript
const LOCATION_METRICS = [
  { value: 'takeover_tickets', label: 'Takeover' },
  { value: 'visitation_tickets', label: 'Visitation' },
  { value: 'backup_sukses_tickets', label: 'Backup Sukses' },
  { value: 'escalated_tickets', label: 'Escalate' },
];
```

Default `locationMetric` to `takeover_tickets`. Call `getTopLocationRows` so props are never mutated. Use the active data key for `<Bar>` and `<LabelList>`. Put the `Select` in the chart panel action slot with `aria-label="Kabupaten/Kota metric"`.

Call `getTicketTrendTitle(dashboard?.trend_granularity)` for the panel title.

- [ ] **Step 8: Run chart tests, lint, and build**

Run:

```powershell
node --test src/__tests__/ticketingContracts.test.js
node --test src/__tests__/ticketingChartUtils.test.js
npx eslint src/features/ticketing/TicketingCharts.jsx src/features/ticketing/ticketingChartConfig.js src/features/ticketing/ticketingChartUtils.js src/__tests__/ticketingContracts.test.js src/__tests__/ticketingChartUtils.test.js
npm run build
```

Expected: tests PASS, lint exits 0, Vite production build exits 0.

- [ ] **Step 9: Commit Task 4**

```powershell
git add -- frontend/src/features/ticketing/TicketingCharts.jsx frontend/src/features/ticketing/ticketingChartConfig.js frontend/src/features/ticketing/ticketingChartUtils.js frontend/src/__tests__/ticketingContracts.test.js frontend/src/__tests__/ticketingChartUtils.test.js
git commit -m "feat: add adaptive ticketing chart breakdowns"
```

---

### Task 5: Integrated Data, Browser, and Graph Verification

**Files:**
- Modify only if verification exposes a scoped regression in the Task 1-4 files.
- Refresh: `graphify-out/graph.json`
- Refresh: `graphify-out/GRAPH_REPORT.md`

**Interfaces:**
- Consumes: completed backend and frontend implementation.
- Produces: fresh test/build/browser/Neon/Graphify evidence and a clean scoped branch.

- [ ] **Step 1: Run the complete scoped verification suite**

Run:

```powershell
python -m unittest tests.test_ticketing_metrics tests.test_ticketing_contract tests.test_period_router_params -v
node --test src/__tests__/ticketingContracts.test.js
node --test src/__tests__/ticketingChartUtils.test.js
npm run lint -- --quiet
npm run build
```

Run backend commands from `backend/` and frontend commands from `frontend/`. Expected: zero failures and exit code 0 for every command.

- [ ] **Step 2: Verify current Neon aggregates independently**

Use a read-only Neon query for a representative active period to compare:

- Average MTTR;
- each of the four Kabupaten/Kota counts;
- raw FOP rows used by the scorer.

Do not write data or schema. Confirm API values are within rounding precision of the independent SQL result.

- [ ] **Step 3: Start and live-check the app**

Start Vite with `npm run dev -- --host 127.0.0.1 --strictPort` and start the backend with process-only development security settings, including a `PUBLIC_APP_ORIGIN` that exactly matches the browser origin. Do not persist secrets.

Verify in a real authenticated browser:

- one month displays Daily Trend;
- two and three months display Weekly Trend;
- four or more months display Monthly Trend;
- all four Kabupaten/Kota dropdown options switch the bars and tooltip;
- the FOP table is ordered by descending score and the worst row is reachable;
- desktop shows left stacked panels beside Ticket List;
- mobile stacks all three panels vertically;
- Takeover filters dashboard, Ticket List, and export parameters consistently.

- [ ] **Step 4: Refresh Graphify**

Run `graphify update .` from the worktree. If the isolated worktree lacks the existing graph baseline, seed it from the root checkout's generated `graphify-out` artifacts or run the full graph build as required by Graphify. Verify both `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` have current timestamps and include the new Ticketing helper/model/router/component relationships.

- [ ] **Step 5: Run final branch checks**

```powershell
git diff --check origin/main...HEAD
git status --short --branch
git log --oneline --decorate origin/main..HEAD
```

Expected: no whitespace errors, only intentional generated/untracked artifacts, and all implementation commits present.

- [ ] **Step 6: Commit any scoped verification fix**

Only when Step 1-4 required a code correction:

```powershell
git add -- backend/ticketing_metrics.py backend/tests/test_ticketing_metrics.py backend/models/ticketing.py backend/routers/ticketing.py backend/tests/test_ticketing_contract.py frontend/src/pages/TicketingPage.jsx frontend/src/features/ticketing/TicketingCharts.jsx frontend/src/features/ticketing/ticketingChartConfig.js frontend/src/features/ticketing/ticketingChartUtils.js frontend/src/__tests__/ticketingContracts.test.js frontend/src/__tests__/ticketingChartUtils.test.js
git diff --cached --name-only
git commit -m "fix: resolve ticketing verification regressions"
```

Do not commit unrelated files or generated artifacts that are not already tracked.
