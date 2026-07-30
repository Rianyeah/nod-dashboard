# Command Center and Reporting Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Command Center Performance Trend, expose correct Proker Activity values, add the approved BPS-relative Backup Sukses metric, remove the Battery Type frontend surface, and verify every value against the active period and NOP filters.

**Architecture:** Isolate Home trend rendering in a focused component that distinguishes ready, empty, and module-error states. Extend the Reporting aggregate and response model additively, version its cache resource, calculate weighted table totals in a pure frontend helper, and remove Battery Type only from the frontend request/render path.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/Neon, Pydantic 2, Redis cache, React 19, Recharts/shadcn Chart, Node test runner, pytest, Playwright.

---

## Dependency and protected behavior

Run after the graphite visual-system plan so this track can consume
`DashboardPanelHeader`, semantic chart configs, and shared chart states.

Preserve:

- `/api/v1/reporting/battery-by-kabupaten` and its backend model;
- reporting period/NOP filter semantics;
- Command Center module isolation;
- Reporting PDF export;
- Site Class table;
- all business labels not explicitly removed below.

## File map

### Command Center

- Create `frontend/src/features/home/homePerformanceTrendState.js`: pure state
  resolver.
- Create `frontend/src/features/home/HomePerformanceTrend.jsx`: chart/error/empty
  rendering.
- Modify `frontend/src/pages/HomePage.jsx`: use the focused component and remove
  the two badges.
- Modify `frontend/src/__tests__/homePageContracts.test.js`.
- Create `frontend/src/__tests__/homePerformanceTrendState.test.js`.

### Reporting backend

- Modify `backend/models/reporting.py`: add Backup Sukses response fields.
- Modify `backend/routers/reporting.py`: canonical location key, Backup Sukses
  aggregation, rate, payload serialization, and cache resource version.
- Modify `backend/tests/test_reporting_nop_contract.py`.
- Modify `backend/tests/test_reporting_redis_cache.py`.
- Create `backend/tests/test_reporting_performance_metrics.py`.

### Reporting frontend

- Create `frontend/src/features/reporting/reportingPerformanceMetrics.js`: safe
  rate and total aggregation.
- Create `frontend/src/__tests__/reportingPerformanceMetrics.test.js`.
- Modify `frontend/src/pages/NetworkReportingPage.jsx`.
- Modify `frontend/src/services/api.js`.
- Modify `frontend/src/__tests__/dashboardReportingContracts.test.js`.
- Modify `frontend/src/__tests__/dashboardFilterContracts.test.js` only if its
  request list mentions Battery Type.
- Modify `e2e-playwright.spec.js`.

## Task 1: Lock the Command Center trend and badge contracts

**Files:**

- Modify: `frontend/src/__tests__/homePageContracts.test.js`
- Create: `frontend/src/__tests__/homePerformanceTrendState.test.js`
- Create: `frontend/src/features/home/homePerformanceTrendState.js`

- [ ] **Step 1: Update the badge contract to require their removal**

Replace the old badge-presence assertions with:

```js
it('keeps latest Impact data while removing redundant live and snapshot badges', () => {
  const page = src('pages', 'HomePage.jsx');

  assert.match(page, /title: 'Today Impact Service'/);
  assert.match(page, /latestImpactDaily\?\.open/);
  assert.doesNotMatch(page, /Latest \/ live/i);
  assert.doesNotMatch(page, /Snapshot master/);
  assert.doesNotMatch(page, /tidak dipengaruhi periode/);
});
```

Add a focused component contract:

```js
it('isolates Performance Trend and distinguishes module errors from empty data', () => {
  const page = src('pages', 'HomePage.jsx');
  const chart = src('features', 'home', 'HomePerformanceTrend.jsx');
  const state = src('features', 'home', 'homePerformanceTrendState.js');

  assert.match(page, /HomePerformanceTrend/);
  assert.match(page, /overview\?\.errors\?\.reporting/);
  assert.match(chart, /data-testid="home-performance-trend"/);
  assert.match(chart, /DashboardChartError/);
  assert.match(chart, /DashboardChartEmpty/);
  assert.match(chart, /ChartContainer/);
  assert.doesNotMatch(chart, /ResponsiveContainer/);
  assert.match(state, /resolveHomePerformanceTrendState/);
});
```

- [ ] **Step 2: Write failing pure-state tests**

Create:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveHomePerformanceTrendState } from '../features/home/homePerformanceTrendState.js';

describe('Home Performance Trend state', () => {
  it('returns error when the reporting overview module failed', () => {
    assert.deepEqual(
      resolveHomePerformanceTrendState({
        rows: [],
        moduleError: 'reporting query failed',
      }),
      { status: 'error', rows: [], message: 'reporting query failed' },
    );
  });

  it('returns empty only for a valid response without rows', () => {
    assert.deepEqual(
      resolveHomePerformanceTrendState({ rows: [], moduleError: '' }),
      { status: 'empty', rows: [], message: '' },
    );
  });

  it('keeps valid rows even when availability is null', () => {
    const rows = [
      {
        trx_month: '2026-06',
        total_revenue: 100,
        total_payload: 50,
        avg_availability: null,
      },
    ];

    assert.deepEqual(
      resolveHomePerformanceTrendState({ rows, moduleError: '' }),
      { status: 'ready', rows, message: '' },
    );
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run from `frontend`:

```powershell
node --test src/__tests__/homePageContracts.test.js src/__tests__/homePerformanceTrendState.test.js
```

Expected: FAIL because the resolver and chart component do not exist and the
old badges remain.

- [ ] **Step 4: Implement the pure state resolver**

Create:

```js
export function resolveHomePerformanceTrendState({ rows, moduleError }) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const message = typeof moduleError === 'string' ? moduleError.trim() : '';

  if (message) {
    return { status: 'error', rows: normalizedRows, message };
  }
  if (normalizedRows.length === 0) {
    return { status: 'empty', rows: [], message: '' };
  }
  return { status: 'ready', rows: normalizedRows, message: '' };
}
```

- [ ] **Step 5: Run the pure test**

Run:

```powershell
node --test src/__tests__/homePerformanceTrendState.test.js
```

Expected: PASS while the Home component contract still fails.

- [ ] **Step 6: Commit the failing UI contract and passing state helper**

Run from the repository root:

```powershell
git add frontend/src/features/home/homePerformanceTrendState.js frontend/src/__tests__/homePerformanceTrendState.test.js frontend/src/__tests__/homePageContracts.test.js
git commit -m "test: define home performance trend states"
```

## Task 2: Render the Command Center trend through a focused chart component

**Files:**

- Create: `frontend/src/features/home/HomePerformanceTrend.jsx`
- Modify: `frontend/src/pages/HomePage.jsx`
- Test: `frontend/src/__tests__/homePageContracts.test.js`
- Test: `frontend/src/__tests__/homePerformanceTrendState.test.js`

- [ ] **Step 1: Implement the complete focused chart**

Create:

```jsx
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  XAxis,
  YAxis,
} from 'recharts';

import { DashboardChartEmpty } from '@/components/dashboard-charts/DashboardChartEmpty';
import { DashboardChartError } from '@/components/dashboard-charts/DashboardChartError';
import { DashboardChartTooltipContent } from '@/components/dashboard-charts/DashboardChartTooltipContent';
import { ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { formatPayload, formatPercent, formatRevenue } from '@/utils/formatters';

import { homeChartConfig } from './homeChartConfig';
import { resolveHomePerformanceTrendState } from './homePerformanceTrendState';

function formatMonth(value) {
  if (!value) return '';
  const [year, month] = String(value).split('-');
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${labels[Number(month) - 1] || month} ${year}`;
}

export function HomePerformanceTrend({
  rows,
  moduleError,
  selectedPeriod,
  revenueDomain,
  payloadDomain,
  availabilityDomain,
}) {
  const state = resolveHomePerformanceTrendState({ rows, moduleError });

  if (state.status === 'error') {
    return (
      <DashboardChartError
        label="Performance Trend gagal dimuat dari modul Reporting."
        className="h-[260px]"
      />
    );
  }
  if (state.status === 'empty') {
    return (
      <DashboardChartEmpty
        label="Performance trend belum tersedia untuk filter ini."
        className="h-[260px]"
      />
    );
  }

  return (
    <ChartContainer
      config={homeChartConfig}
      className="h-[260px] min-w-0 w-full aspect-auto"
      data-testid="home-performance-trend"
    >
      <ComposedChart
        accessibilityLayer
        data={state.rows}
        margin={{ top: 8, right: 48, left: 4, bottom: 0 }}
      >
        <defs>
          <linearGradient id="homeRevenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={homeChartConfig.total_revenue.color} stopOpacity={0.14} />
            <stop offset="95%" stopColor={homeChartConfig.total_revenue.color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="homePayloadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={homeChartConfig.total_payload.color} stopOpacity={0.10} />
            <stop offset="95%" stopColor={homeChartConfig.total_payload.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
        <ReferenceArea
          x1={selectedPeriod?.start}
          x2={selectedPeriod?.end}
          fill="var(--chart-accent)"
          fillOpacity={0.045}
          strokeOpacity={0}
        />
        <XAxis
          dataKey="trx_month"
          axisLine={false}
          tickLine={false}
          tickFormatter={formatMonth}
          tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
        />
        <YAxis yAxisId="revenue" hide domain={revenueDomain} />
        <YAxis yAxisId="payload" hide domain={payloadDomain} />
        <YAxis
          yAxisId="availability"
          orientation="right"
          domain={availabilityDomain}
          tickCount={5}
          axisLine={false}
          tickLine={false}
          tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
          tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
          width={48}
        />
        <ChartTooltip
          content={(
            <DashboardChartTooltipContent
              config={homeChartConfig}
              labelFormatter={formatMonth}
              valueFormatter={(value, key) => {
                if (key === 'total_revenue') return formatRevenue(value);
                if (key === 'total_payload') return formatPayload(value);
                return formatPercent(value);
              }}
            />
          )}
        />
        <Area
          yAxisId="revenue"
          type="monotone"
          dataKey="total_revenue"
          stroke={homeChartConfig.total_revenue.color}
          strokeWidth={2}
          fill="url(#homeRevenueGradient)"
          isAnimationActive={false}
        />
        <Area
          yAxisId="payload"
          type="monotone"
          dataKey="total_payload"
          stroke={homeChartConfig.total_payload.color}
          strokeWidth={2}
          fill="url(#homePayloadGradient)"
          isAnimationActive={false}
        />
        <Line
          yAxisId="availability"
          type="monotone"
          dataKey="avg_availability"
          stroke={homeChartConfig.avg_availability.color}
          strokeWidth={2.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 2: Wire the component and remove the badges**

In `HomePage.jsx`, import:

```js
import { HomePerformanceTrend } from '../features/home/HomePerformanceTrend';
```

Replace the inline main Performance Trend chart body with:

```jsx
<HomePerformanceTrend
  rows={trendRows}
  moduleError={overview?.errors?.reporting || ''}
  selectedPeriod={selectedPeriod}
  revenueDomain={homeRevenueDomain}
  payloadDomain={homePayloadDomain}
  availabilityDomain={homeAvailabilityDomain}
/>
```

Delete:

```js
badge: 'Latest / live',
```

Delete the Data Potensi Site badge node containing:

```jsx
Snapshot master · tidak dipengaruhi periode
```

Keep Today Impact Service’s current value/subtitle and Data Potensi Site’s
actual metrics.

- [ ] **Step 3: Run Home tests and lint**

Run from `frontend`:

```powershell
node --test src/__tests__/homePageContracts.test.js src/__tests__/homePerformanceTrendState.test.js src/__tests__/dashboardChartContracts.test.js
npx eslint src/pages/HomePage.jsx src/features/home src/components/dashboard-charts/DashboardChartError.jsx
```

Expected: PASS.

- [ ] **Step 4: Commit the Command Center repair**

Run from the repository root:

```powershell
git add frontend/src/features/home/HomePerformanceTrend.jsx frontend/src/features/home/homePerformanceTrendState.js frontend/src/pages/HomePage.jsx frontend/src/__tests__/homePageContracts.test.js frontend/src/__tests__/homePerformanceTrendState.test.js
git commit -m "fix: restore command center performance trend"
```

## Task 3: Add backend Proker and Backup Sukses contracts

**Files:**

- Modify: `backend/models/reporting.py`
- Modify: `backend/tests/test_reporting_nop_contract.py`
- Modify: `backend/tests/test_reporting_redis_cache.py`
- Create: `backend/tests/test_reporting_performance_metrics.py`

- [ ] **Step 1: Add failing model and SQL contracts**

Extend `test_performance_table_includes_ticket_and_proker_breakdowns`:

```python
for model_contract in [
    "backup_sukses_bps: int = 0",
    "backup_sukses_rate: float = 0.0",
]:
    self.assertIn(model_contract, model_source)

for query_contract in [
    "backup_sukses_bps",
    "backup_sukses_rate",
    "TRIM(tfc.backup_sukses) = 'BU Genset'",
    "UPPER(TRIM(tfc.kabupaten_kota)) AS kabupaten_key",
    "UPPER(TRIM(p.kabupaten)) AS kabupaten_key",
    'UPPER(TRIM(d."Kabupaten/KOTA"))',
]:
    self.assertIn(query_contract, self.source)
```

Add a cache-version contract:

```python
def test_performance_table_cache_resource_is_schema_versioned(self):
    source = REPORTING_ROUTER.read_text(encoding="utf-8")
    self.assertIn('REPORTING_PERFORMANCE_CACHE_RESOURCE = "revenue-by-kabupaten-v2"', source)
    self.assertIn(
        'redis_cache.make_key(\n        "reporting",\n        REPORTING_PERFORMANCE_CACHE_RESOURCE,',
        source,
    )
```

- [ ] **Step 2: Add executable model/rate tests**

Create:

```python
from models.reporting import RevenueByKabupaten


def test_revenue_row_accepts_bps_backup_success_fields():
    row = RevenueByKabupaten(
        kabupaten="SIDOARJO",
        ticket_swfm_bps=20,
        backup_sukses_bps=5,
        backup_sukses_rate=25.0,
    )

    assert row.backup_sukses_bps == 5
    assert row.backup_sukses_rate == 25.0


def test_revenue_row_defaults_backup_success_safely():
    row = RevenueByKabupaten(kabupaten="SIDOARJO")

    assert row.backup_sukses_bps == 0
    assert row.backup_sukses_rate == 0.0
```

- [ ] **Step 3: Run backend tests and verify failure**

Run from `backend`:

```powershell
python -m pytest tests/test_reporting_nop_contract.py tests/test_reporting_redis_cache.py tests/test_reporting_performance_metrics.py -q
```

Expected: FAIL on missing fields, SQL aggregation, and cache resource constant.

- [ ] **Step 4: Add response fields**

In `RevenueByKabupaten` add:

```python
backup_sukses_bps: int = 0
backup_sukses_rate: float = 0.0
```

- [ ] **Step 5: Run the model test**

Run:

```powershell
python -m pytest tests/test_reporting_performance_metrics.py -q
```

Expected: PASS; SQL contracts still fail.

- [ ] **Step 6: Commit the backend contract**

Run from the repository root:

```powershell
git add backend/models/reporting.py backend/tests/test_reporting_nop_contract.py backend/tests/test_reporting_redis_cache.py backend/tests/test_reporting_performance_metrics.py
git commit -m "test: define reporting backup success contract"
```

## Task 4: Implement canonical Reporting aggregation and cache compatibility

**Files:**

- Modify: `backend/routers/reporting.py`
- Modify: `backend/tests/test_reporting_nop_contract.py`
- Modify: `backend/tests/test_reporting_redis_cache.py`
- Test: `backend/tests/test_reporting_performance_metrics.py`

- [ ] **Step 1: Version the Performance Table cache resource**

Add near the query constants:

```python
REPORTING_PERFORMANCE_CACHE_RESOURCE = "revenue-by-kabupaten-v2"
```

Use it only in `get_revenue_by_kabupaten`:

```python
cache_key = redis_cache.make_key(
    "reporting",
    REPORTING_PERFORMANCE_CACHE_RESOURCE,
    period_start=period.period_start,
    period_end=period.period_end,
    nop=nop or "",
)
```

- [ ] **Step 2: Canonicalize location keys in the query**

Change the ticket aggregate key to:

```sql
UPPER(TRIM(tfc.kabupaten_kota)) AS kabupaten_key
```

Change the Proker aggregate key to:

```sql
UPPER(TRIM(p.kabupaten)) AS kabupaten_key
```

Join with:

```sql
LEFT JOIN ticket_aggregate tickets
  ON tickets.kabupaten_key = UPPER(TRIM(d."Kabupaten/KOTA"))
LEFT JOIN proker_aggregate proker
  ON proker.kabupaten_key = UPPER(TRIM(d."Kabupaten/KOTA"))
```

Keep the displayed `kabupaten` value from `data_site_master`.

- [ ] **Step 3: Add the approved BPS numerator and row rate**

Inside `ticket_aggregate` use:

```sql
COUNT(*) FILTER (
    WHERE UPPER(TRIM(tfc.kategori_tt)) = 'BPS'
      AND TRIM(tfc.backup_sukses) = 'BU Genset'
) AS backup_sukses_bps
```

Add to the final select:

```sql
COALESCE(MAX(tickets.backup_sukses_bps), 0) AS backup_sukses_bps,
COALESCE(
    ROUND(
        100.0 * MAX(tickets.backup_sukses_bps)
        / NULLIF(MAX(tickets.ticket_swfm_bps), 0),
        2
    ),
    0
)::float AS backup_sukses_rate,
```

The numerator and denominator use the same BPS predicate. Keep existing date
and NOP filters inside the aggregate.

- [ ] **Step 4: Serialize the fields**

Add to the `RevenueByKabupaten(...)` construction:

```python
backup_sukses_bps=int(row.get("backup_sukses_bps") or 0),
backup_sukses_rate=float(row.get("backup_sukses_rate") or 0.0),
```

- [ ] **Step 5: Run focused backend tests**

Run from `backend`:

```powershell
python -m pytest tests/test_reporting_nop_contract.py tests/test_reporting_redis_cache.py tests/test_reporting_performance_metrics.py -q
```

Expected: PASS.

- [ ] **Step 6: Run a read-only latest-period verification**

Run from `backend` with the existing environment:

```powershell
@'
import asyncio
from database import async_session, engine
from routers.reporting import get_revenue_by_kabupaten

async def main():
    try:
        async with async_session() as session:
            rows = await get_revenue_by_kabupaten(
                trx_month=None,
                period_start="2026-06",
                period_end="2026-06",
                nop=None,
                session=session,
                response=None,
            )
            assert rows
            assert any(row.proker_open > 0 or row.proker_closed > 0 for row in rows)
            for row in rows:
                expected = round(
                    100.0 * row.backup_sukses_bps / row.ticket_swfm_bps,
                    2,
                ) if row.ticket_swfm_bps else 0.0
                assert row.backup_sukses_rate == expected
            print("rows", len(rows), "verified")
    finally:
        await engine.dispose()

asyncio.run(main())
'@ | python -
```

Expected: `rows <n> verified` and no data mutation.

- [ ] **Step 7: Commit backend aggregation**

Run from the repository root:

```powershell
git add backend/routers/reporting.py backend/tests/test_reporting_nop_contract.py backend/tests/test_reporting_redis_cache.py backend/tests/test_reporting_performance_metrics.py
git commit -m "feat: add BPS backup success to reporting"
```

## Task 5: Add pure weighted totals on the Reporting frontend

**Files:**

- Create: `frontend/src/features/reporting/reportingPerformanceMetrics.js`
- Create: `frontend/src/__tests__/reportingPerformanceMetrics.test.js`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`

- [ ] **Step 1: Write failing rate and weighted-total tests**

Create:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRevenueTotals,
  calculateBackupSuksesRate,
} from '../features/reporting/reportingPerformanceMetrics.js';

describe('Reporting Performance Table metrics', () => {
  it('returns zero when the BPS denominator is zero', () => {
    assert.equal(calculateBackupSuksesRate(4, 0), 0);
  });

  it('calculates the row rate against BPS tickets', () => {
    assert.equal(calculateBackupSuksesRate(5, 20), 25);
  });

  it('calculates Total from summed counts instead of averaging row percentages', () => {
    const total = buildRevenueTotals([
      {
        total_sites: 2,
        avg_availability: 99,
        ticket_swfm_bps: 10,
        backup_sukses_bps: 5,
        backup_sukses_rate: 50,
        proker_open: 2,
        proker_closed: 1,
      },
      {
        total_sites: 8,
        avg_availability: 100,
        ticket_swfm_bps: 30,
        backup_sukses_bps: 3,
        backup_sukses_rate: 10,
        proker_open: 4,
        proker_closed: 3,
      },
    ]);

    assert.equal(total.backup_sukses_bps, 8);
    assert.equal(total.ticket_swfm_bps, 40);
    assert.equal(total.backup_sukses_rate, 20);
    assert.equal(total.proker_open, 6);
    assert.equal(total.proker_closed, 4);
    assert.equal(total.avg_availability, 99.8);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run from `frontend`:

```powershell
node --test src/__tests__/reportingPerformanceMetrics.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the complete total helper**

Create:

```js
const SUM_FIELDS = [
  'total_sites',
  'rev',
  'rev_voice',
  'rev_bb',
  'rev_dig',
  'rev_sms',
  'rev_ir',
  'payload',
  'traffic',
  'ticket_swfm_bps',
  'ticket_swfm_ts',
  'backup_sukses_bps',
  'proker_open',
  'proker_closed',
];

export function calculateBackupSuksesRate(successCount, bpsCount) {
  const success = Number(successCount);
  const bps = Number(bpsCount);
  if (!Number.isFinite(success) || !Number.isFinite(bps) || bps <= 0) return 0;
  return Math.round((10000 * success) / bps) / 100;
}

export function buildRevenueTotals(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const totals = Object.fromEntries(SUM_FIELDS.map((field) => [field, 0]));
  let weightedAvailability = 0;
  let availabilitySites = 0;

  for (const row of rows) {
    for (const field of SUM_FIELDS) {
      const value = Number(row?.[field]);
      totals[field] += Number.isFinite(value) ? value : 0;
    }
    const availability = Number(row?.avg_availability);
    const sites = Number(row?.total_sites);
    if (Number.isFinite(availability) && Number.isFinite(sites) && sites > 0) {
      weightedAvailability += availability * sites;
      availabilitySites += sites;
    }
  }

  totals.avg_availability = availabilitySites > 0
    ? weightedAvailability / availabilitySites
    : null;
  totals.backup_sukses_rate = calculateBackupSuksesRate(
    totals.backup_sukses_bps,
    totals.ticket_swfm_bps,
  );
  return totals;
}
```

- [ ] **Step 4: Use the helper in the page**

Import:

```js
import { buildRevenueTotals } from '../features/reporting/reportingPerformanceMetrics';
```

Delete the page-local `buildRevenueTotals` function. Keep both current and
previous totals using the imported helper.

- [ ] **Step 5: Run tests and lint**

Run:

```powershell
node --test src/__tests__/reportingPerformanceMetrics.test.js
npx eslint src/features/reporting/reportingPerformanceMetrics.js src/pages/NetworkReportingPage.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit weighted totals**

Run from the repository root:

```powershell
git add frontend/src/features/reporting/reportingPerformanceMetrics.js frontend/src/__tests__/reportingPerformanceMetrics.test.js frontend/src/pages/NetworkReportingPage.jsx
git commit -m "feat: calculate weighted reporting backup totals"
```

## Task 6: Render Proker and Backup Sukses and remove Battery Type frontend work

**Files:**

- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Modify: `frontend/src/__tests__/dashboardFilterContracts.test.js` if needed
- Modify: `e2e-playwright.spec.js`

- [ ] **Step 1: Add failing frontend contracts**

Update the Performance Table contract:

```js
for (const contract of [
  'Proker Activity',
  'proker_open',
  'proker_closed',
  'Backup Sukses',
  'backup_sukses_bps',
  'backup_sukses_rate',
  'formatPercent',
]) {
  assert.match(page, new RegExp(contract));
}

assert.doesNotMatch(page, /Battery Type/);
assert.doesNotMatch(page, /batteryData|batteryTotals|fetchBatteryByKabupaten/);
assert.doesNotMatch(api, /export async function fetchBatteryByKabupaten/);
assert.match(page, /min-w-\[.*\].*text-left/);
```

Update the NOP request test in `e2e-playwright.spec.js` to expect:

```js
await expect.poll(() => Array.from(filteredRequests).sort()).toEqual([
  'revenue-by-kabupaten',
  'scorecards',
  'site-class-by-kabupaten',
  'trend',
]);
```

- [ ] **Step 2: Run and verify failure**

Run from `frontend`:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js src/__tests__/dashboardFilterContracts.test.js src/__tests__/reportingPerformanceMetrics.test.js
```

Expected: FAIL because the new column is absent and Battery Type is still
requested/rendered.

- [ ] **Step 3: Remove Battery Type from the page request path**

Delete:

```js
fetchBatteryByKabupaten,
```

Delete:

```js
const [batteryData, setBatteryData] = useState([]);
```

Change the request batch to:

```js
Promise.all([
  fetchReportingScorecards(selectedPeriod, selectedNop),
  fetchRevenueByKabupaten(selectedPeriod, selectedNop),
  fetchSiteClassByKabupaten(selectedPeriod, selectedNop),
  fetchRevenueTrend(selectedPeriod, selectedNop),
  previousPeriod ? fetchReportingScorecards(previousPeriod, selectedNop) : Promise.resolve(null),
  previousPeriod ? fetchRevenueByKabupaten(previousPeriod, selectedNop) : Promise.resolve([]),
])
  .then(([sc, rev, cls, trend, prevSc, prevRev]) => {
    if (cancelled) return;
    setScorecards(sc);
    setRevenueData(rev);
    setSiteClassData(cls);
    setTrendData(trend);
    setPreviousScorecards(prevSc);
    setPreviousRevenueData(prevRev);
  })
```

Delete battery totals, badge helper, tab entry, and table block. Remove the
frontend API wrapper:

```js
export async function fetchBatteryByKabupaten(period, nop) {
  // remove this complete function
}
```

Do not delete the backend endpoint.

- [ ] **Step 4: Add the Backup Sukses column**

Use a small cell component:

```jsx
function BackupSuksesCell({ count, rate, strong = false }) {
  return (
    <div className={strong ? 'font-bold' : ''}>
      <span className="font-mono tabular-nums text-[var(--text-primary)]">
        {formatNumber(count)}
      </span>
      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">
        {formatPercent(rate)}
      </span>
    </div>
  );
}
```

Add the header after Ticket SWFM:

```jsx
<th className={`${thClass} text-right`}>Backup Sukses</th>
```

Add each row:

```jsx
<td className={`${tdClass} text-right`}>
  <BackupSuksesCell
    count={row.backup_sukses_bps}
    rate={row.backup_sukses_rate}
  />
</td>
```

Add Total:

```jsx
<td className={`${tdClass} text-right`}>
  <BackupSuksesCell
    count={revenueTotals.backup_sukses_bps}
    rate={revenueTotals.backup_sukses_rate}
    strong
  />
</td>
```

Keep Proker directly adjacent and ensure it renders:

```jsx
<td className={`${tdClass} text-right`}>
  <span className="text-[var(--text-primary)]">Open: {formatNumber(row.proker_open)}</span>
  <span className="ml-2 text-[var(--text-muted)]">Close: {formatNumber(row.proker_closed)}</span>
</td>
```

Use a table width that prevents destructive compression:

```jsx
<table className="min-w-[1180px] w-full text-left">
```

- [ ] **Step 5: Run frontend tests and lint**

Run:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js src/__tests__/dashboardFilterContracts.test.js src/__tests__/reportingPerformanceMetrics.test.js
npx eslint src/pages/NetworkReportingPage.jsx src/services/api.js src/features/reporting
```

Expected: PASS.

- [ ] **Step 6: Commit Reporting frontend**

Run from the repository root:

```powershell
git add frontend/src/pages/NetworkReportingPage.jsx frontend/src/services/api.js frontend/src/features/reporting/reportingPerformanceMetrics.js frontend/src/__tests__/dashboardReportingContracts.test.js frontend/src/__tests__/dashboardFilterContracts.test.js frontend/src/__tests__/reportingPerformanceMetrics.test.js e2e-playwright.spec.js
git commit -m "feat: show Proker and BPS backup success in reporting"
```

## Task 7: Verify actual Command Center and Reporting behavior

**Files:**

- Modify: `e2e-playwright.spec.js`

- [ ] **Step 1: Add an authenticated Command Center trend test**

Add:

```js
test('Command Center renders reporting trend and removes redundant badges', async ({ page }) => {
  await authenticate(page, 'light');
  await page.goto(`${E2E_BASE_URL}/home`);

  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible({ timeout: 20000 });
  const chart = page.getByTestId('home-performance-trend');
  await expect(chart).toBeVisible({ timeout: 20000 });
  await expect(chart.locator('path.recharts-area-curve').first()).toHaveAttribute('d', /[LC]/);
  await expect(page.getByText(/Latest\s*\/\s*live/i)).toHaveCount(0);
  await expect(page.getByText(/Snapshot master/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Add an authenticated Reporting value test**

Add:

```js
test('Reporting shows Proker and weighted BPS Backup Sukses values', async ({ page }) => {
  await authenticate(page, 'light');
  await page.goto(`${E2E_BASE_URL}/reporting`);

  await expect(page.getByRole('button', { name: /Performance Table/i })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('columnheader', { name: 'Proker Activity' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Backup Sukses' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Battery Type/i })).toHaveCount(0);

  const response = await page.request.get(`${E2E_BASE_URL}/api/v1/reporting/revenue-by-kabupaten`, {
    params: { period_start: '2026-06', period_end: '2026-06' },
  });
  expect(response.ok()).toBeTruthy();
  const rows = await response.json();
  const expectedTotalBps = rows.reduce((sum, row) => sum + row.ticket_swfm_bps, 0);
  const expectedTotalSuccess = rows.reduce((sum, row) => sum + row.backup_sukses_bps, 0);
  const expectedRate = expectedTotalBps
    ? Math.round((10000 * expectedTotalSuccess) / expectedTotalBps) / 100
    : 0;
  const expectedRateLabel = `${expectedRate.toFixed(2).replace('.', ',')}%`;

  const totalRow = page.getByRole('row').filter({ hasText: 'TOTAL' });
  await expect(totalRow).toContainText(String(expectedTotalSuccess));
  await expect(totalRow).toContainText(expectedRateLabel);
  expect(rows.some((row) => row.proker_open > 0 || row.proker_closed > 0)).toBeTruthy();
});
```

If the page defaults to another available period, select June 2026 explicitly
before comparing the DOM to the endpoint response.

- [ ] **Step 3: Run backend suites**

Run from `backend`:

```powershell
python -m pytest tests/test_reporting_nop_contract.py tests/test_reporting_redis_cache.py tests/test_reporting_performance_metrics.py tests/test_overview_contract.py tests/test_dashboard_redis_cache.py -q
```

Expected: PASS.

- [ ] **Step 4: Run frontend suites and build**

Run from `frontend`:

```powershell
node --test src/__tests__/homePageContracts.test.js src/__tests__/homePerformanceTrendState.test.js src/__tests__/dashboardReportingContracts.test.js src/__tests__/dashboardFilterContracts.test.js src/__tests__/reportingPerformanceMetrics.test.js src/__tests__/dashboardChartContracts.test.js
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run browser verification**

Run from the repository root with backend and frontend active:

```powershell
npx playwright test e2e-playwright.spec.js -g "Command Center renders reporting trend|Reporting shows Proker|Reporting NOP filter"
```

Expected: PASS in the authenticated local app.

- [ ] **Step 6: Commit browser coverage**

Run:

```powershell
git add e2e-playwright.spec.js
git commit -m "test: verify command center and reporting reliability"
```

## Completion checkpoint

Run:

```powershell
git status --short
git log --oneline -7
```

Expected:

- tracked changes from this track are committed;
- old unrelated untracked files remain untouched;
- Command Center trend is visible with real data;
- Proker values are non-zero where the filtered source is non-zero;
- Backup Sukses count/rate is correct per row and weighted in Total;
- Reporting does not make a Battery Type request.
