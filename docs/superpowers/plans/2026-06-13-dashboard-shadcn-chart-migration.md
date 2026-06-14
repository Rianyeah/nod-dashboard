# Dashboard shadcn/ui Chart Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 14 charts on Activity ENOM, Transport Quality, and Ticketing to the shared shadcn/ui Chart foundation, with adaptive chart types and series-colored tooltip text.

**Architecture:** Keep Recharts as the renderer and the existing `DashboardChartPanel` as the card shell. Add small shared chart helpers under `src/components/dashboard-charts/`, then move each page's chart JSX and domain chart config into a focused feature module while leaving page data fetching, filters, tables, and dialogs unchanged.

**Tech Stack:** React 19, Vite 8, JavaScript, Recharts 3, shadcn/ui Chart, Tailwind CSS 4, Node test runner, ESLint, Playwright.

---

## File Structure

**Create**

- `frontend/src/components/dashboard-charts/dashboardChartUtils.js`: pure color, total, and label visibility utilities.
- `frontend/src/components/dashboard-charts/DashboardChartTooltipContent.jsx`: shadcn tooltip wrapper with series-colored text.
- `frontend/src/components/dashboard-charts/DashboardChartLegend.jsx`: shared shadcn legend composition.
- `frontend/src/components/dashboard-charts/DashboardChartEmpty.jsx`: compact shadcn empty state.
- `frontend/src/components/dashboard-charts/DashboardChartLabels.jsx`: reusable inside, top, and end value labels.
- `frontend/src/features/activity-enom/activityEnomChartConfig.js`: Activity chart labels and colors.
- `frontend/src/features/activity-enom/ActivityEnomCharts.jsx`: four Activity charts and unchanged ranking panel.
- `frontend/src/features/transport-quality/transportQualityChartConfig.js`: Transport chart labels and colors.
- `frontend/src/features/transport-quality/TransportQualityCharts.jsx`: five Transport chart components.
- `frontend/src/features/ticketing/ticketingChartConfig.js`: Ticketing labels, colors, and stable SLA status mapping.
- `frontend/src/features/ticketing/TicketingCharts.jsx`: five Ticketing charts, donut, and Pareto composition.
- `frontend/src/__tests__/dashboardChartContracts.test.js`: pure utility and shared source contracts.

**Modify**

- `frontend/src/pages/ActivityEnomPage.jsx`: remove direct Recharts chart composition and render feature charts.
- `frontend/src/pages/TransportQualityPage.jsx`: remove direct Recharts chart composition and render feature charts.
- `frontend/src/pages/TicketingPage.jsx`: remove direct Recharts chart composition and render feature charts.
- `frontend/src/__tests__/activityEnomContracts.test.js`: read feature chart source and assert shadcn contracts.
- `frontend/src/__tests__/transportQualityContracts.test.js`: read feature chart source and assert shadcn contracts.
- `frontend/src/__tests__/ticketingContracts.test.js`: read feature chart source and assert donut/Pareto contracts.
- `frontend/src/__tests__/themeRedesignContracts.test.js`: recognize feature-level shadcn chart ownership.
- `e2e-playwright.spec.js`: add mocked chart rendering, tooltip color, responsive donut, and Pareto checks.

`frontend/src/components/ui/chart.jsx` is intentionally not modified. The requested tooltip behavior is implemented through the public `formatter` API of `ChartTooltipContent`.

---

### Task 1: Lock Shared Chart Contracts

**Files:**
- Create: `frontend/src/__tests__/dashboardChartContracts.test.js`
- Test: `frontend/src/__tests__/dashboardChartContracts.test.js`

- [ ] **Step 1: Refresh the installed shadcn Chart context**

Run:

```powershell
cd frontend
npx shadcn@latest info --json
npx shadcn@latest docs chart
```

Expected: `chart` remains installed, JavaScript mode is enabled, aliases resolve to `@/*`, and the official Chart docs URL is returned. Do not run `add chart` or overwrite `src/components/ui/chart.jsx`.

- [ ] **Step 2: Write failing shared utility and source contracts**

Create `frontend/src/__tests__/dashboardChartContracts.test.js`:

```js
/* global process */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveSeriesColor,
  shouldRenderChartValue,
  sumChartValues,
} from '../components/dashboard-charts/dashboardChartUtils.js';

const src = (...parts) => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8');
const srcPath = (...parts) => resolve(process.cwd(), 'src', ...parts);

describe('shared dashboard chart contracts', () => {
  it('resolves payload colors before static config colors', () => {
    const config = {
      tickets: { color: '#111111', tooltipColor: '#222222' },
    };

    assert.equal(
      resolveSeriesColor({ dataKey: 'tickets', color: '#333333', payload: { fill: '#444444' } }, config),
      '#444444',
    );
    assert.equal(resolveSeriesColor({ dataKey: 'tickets', color: '#333333' }, config), '#333333');
    assert.equal(resolveSeriesColor({ dataKey: 'tickets' }, config), '#222222');
    assert.equal(resolveSeriesColor({ dataKey: 'missing' }, config), 'var(--foreground)');
  });

  it('hides zero labels and totals numeric chart values', () => {
    assert.equal(shouldRenderChartValue(0), false);
    assert.equal(shouldRenderChartValue('0'), false);
    assert.equal(shouldRenderChartValue(12), true);
    assert.equal(shouldRenderChartValue('invalid'), false);
    assert.equal(sumChartValues([{ total: 4 }, { total: '6' }, { total: null }], 'total'), 10);
  });

  it('provides focused shadcn chart helpers without changing the generated primitive', () => {
    for (const file of [
      'dashboardChartUtils.js',
      'DashboardChartTooltipContent.jsx',
      'DashboardChartLegend.jsx',
      'DashboardChartEmpty.jsx',
      'DashboardChartLabels.jsx',
    ]) {
      assert.equal(existsSync(srcPath('components', 'dashboard-charts', file)), true, file);
    }

    const tooltip = src('components', 'dashboard-charts', 'DashboardChartTooltipContent.jsx');
    const legend = src('components', 'dashboard-charts', 'DashboardChartLegend.jsx');
    const empty = src('components', 'dashboard-charts', 'DashboardChartEmpty.jsx');
    const labels = src('components', 'dashboard-charts', 'DashboardChartLabels.jsx');

    assert.match(tooltip, /ChartTooltipContent/);
    assert.match(tooltip, /resolveSeriesColor/);
    assert.match(tooltip, /data-series-name/);
    assert.match(tooltip, /data-series-value/);
    assert.match(legend, /ChartLegend/);
    assert.match(legend, /ChartLegendContent/);
    assert.match(empty, /<Empty/);
    assert.match(labels, /InsideBarValueLabel/);
    assert.match(labels, /TopBarValueLabel/);
    assert.match(labels, /EndBarValueLabel/);
    assert.doesNotMatch(labels, /stroke=/);
  });
});
```

- [ ] **Step 3: Run the new test and verify it fails**

Run:

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `dashboardChartUtils.js`.

- [ ] **Step 4: Commit the failing contract**

```powershell
git add -- frontend/src/__tests__/dashboardChartContracts.test.js
git commit -m "test: define shared dashboard chart contracts"
```

---

### Task 2: Build the Shared shadcn Chart Foundation

**Files:**
- Create: `frontend/src/components/dashboard-charts/dashboardChartUtils.js`
- Create: `frontend/src/components/dashboard-charts/DashboardChartTooltipContent.jsx`
- Create: `frontend/src/components/dashboard-charts/DashboardChartLegend.jsx`
- Create: `frontend/src/components/dashboard-charts/DashboardChartEmpty.jsx`
- Create: `frontend/src/components/dashboard-charts/DashboardChartLabels.jsx`
- Test: `frontend/src/__tests__/dashboardChartContracts.test.js`

- [ ] **Step 1: Implement pure chart utilities**

Create `dashboardChartUtils.js` with this public API:

```js
export const DASHBOARD_CHART_MARGIN = { top: 20, right: 28, left: 0, bottom: 0 };
export const DASHBOARD_BAR_RADIUS = [8, 8, 8, 8];

export function resolveSeriesColor(item = {}, config = {}) {
  const key = String(item.dataKey ?? item.name ?? '');
  const itemConfig = config[key] ?? config[item.name] ?? {};
  return (
    item.payload?.fill
    ?? item.color
    ?? itemConfig.tooltipColor
    ?? itemConfig.color
    ?? 'var(--foreground)'
  );
}

export function shouldRenderChartValue(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue !== 0;
}

export function sumChartValues(rows = [], key) {
  return rows.reduce((total, row) => {
    const value = Number(row?.[key]);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}
```

- [ ] **Step 2: Implement the colored tooltip wrapper**

Create `DashboardChartTooltipContent.jsx`. It must pass layout props through to `ChartTooltipContent`, keep the header label neutral, and color both series name and value:

```jsx
import { ChartTooltipContent } from '@/components/ui/chart';
import { formatNumber } from '@/utils/formatters';
import { resolveSeriesColor } from './dashboardChartUtils';

export function DashboardChartTooltipContent({
  config,
  valueFormatter = formatNumber,
  seriesLabelFormatter,
  formatter,
  ...props
}) {
  return (
    <ChartTooltipContent
      {...props}
      formatter={(value, name, item, index, payload) => {
        if (formatter) {
          return formatter(value, name, item, index, payload);
        }

        const color = resolveSeriesColor(item, config);
        const dataKey = String(item?.dataKey ?? name);
        const label = seriesLabelFormatter
          ? seriesLabelFormatter(dataKey, item)
          : config?.[dataKey]?.label ?? name;

        return (
          <div className="flex w-full min-w-32 items-center gap-3" style={{ color }}>
            <span data-series-name className="min-w-0 flex-1 truncate font-medium">
              {label}
            </span>
            <span data-series-value className="font-mono font-semibold tabular-nums">
              {valueFormatter(value, dataKey, item)}
            </span>
          </div>
        );
      }}
    />
  );
}
```

- [ ] **Step 3: Implement legend and compact empty state**

Create `DashboardChartLegend.jsx`:

```jsx
import { ChartLegend, ChartLegendContent } from '@/components/ui/chart';

export function DashboardChartLegend({ className, ...props }) {
  return (
    <ChartLegend
      content={<ChartLegendContent className={className} {...props} />}
    />
  );
}
```

Create `DashboardChartEmpty.jsx`:

```jsx
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export function DashboardChartEmpty({
  label = 'Data belum tersedia untuk filter ini.',
  className = 'h-[220px]',
}) {
  return (
    <Empty className={cn('border border-dashed border-border bg-muted/20 p-6', className)}>
      <EmptyHeader>
        <EmptyDescription className="text-xs">{label}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
```

- [ ] **Step 4: Implement reusable no-stroke value labels**

Create `DashboardChartLabels.jsx` with three exported components. All must call `shouldRenderChartValue`, use `formatNumber`, and render `<text>` without `stroke`:

```jsx
import { formatNumber } from '@/utils/formatters';
import { shouldRenderChartValue } from './dashboardChartUtils';

export function InsideBarValueLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  color = '#FFFFFF',
}) {
  if (!shouldRenderChartValue(value) || Number(width) < 28 || Number(height) < 18) return null;
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) + Number(height) / 2}
      fill={color}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={800}
      className="pointer-events-none font-mono"
    >
      {formatNumber(value)}
    </text>
  );
}

export function TopBarValueLabel({ x = 0, y = 0, width = 0, value }) {
  if (!shouldRenderChartValue(value)) return null;
  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 7}
      fill="var(--foreground)"
      textAnchor="middle"
      fontSize={12}
      fontWeight={700}
      className="pointer-events-none font-mono"
    >
      {formatNumber(value)}
    </text>
  );
}

export function EndBarValueLabel({ x = 0, y = 0, width = 0, height = 0, value }) {
  if (!shouldRenderChartValue(value)) return null;
  return (
    <text
      x={Number(x) + Number(width) + 8}
      y={Number(y) + Number(height) / 2}
      fill="var(--foreground)"
      textAnchor="start"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={700}
      className="pointer-events-none font-mono"
    >
      {formatNumber(value)}
    </text>
  );
}
```

- [ ] **Step 5: Run shared tests and targeted lint**

Run:

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js
npx eslint src/components/dashboard-charts src/__tests__/dashboardChartContracts.test.js
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the shared foundation**

```powershell
git add -- frontend/src/components/dashboard-charts frontend/src/__tests__/dashboardChartContracts.test.js
git commit -m "feat: add shared shadcn chart foundation"
```

---

### Task 3: Migrate Activity ENOM Charts

**Files:**
- Create: `frontend/src/features/activity-enom/activityEnomChartConfig.js`
- Create: `frontend/src/features/activity-enom/ActivityEnomCharts.jsx`
- Modify: `frontend/src/pages/ActivityEnomPage.jsx`
- Modify: `frontend/src/__tests__/activityEnomContracts.test.js`
- Test: `frontend/src/__tests__/activityEnomContracts.test.js`

- [ ] **Step 1: Update Activity contracts to read the feature file**

Add:

```js
const charts = src('features', 'activity-enom', 'ActivityEnomCharts.jsx');
const config = src('features', 'activity-enom', 'activityEnomChartConfig.js');
const feature = `${page}\n${charts}\n${config}`;
```

Run business-label and chart assertions against `feature`, then add:

```js
assert.match(page, /ActivityEnomCharts/);
assert.doesNotMatch(page, /ResponsiveContainer/);
assert.match(charts, /ChartContainer/g);
assert.match(charts, /DashboardChartTooltipContent/);
assert.match(charts, /DashboardChartLegend/);
assert.match(charts, /accessibilityLayer/g);
assert.match(charts, /radius=\{DASHBOARD_BAR_RADIUS\}/);
assert.match(charts, /dataKey="open"/);
assert.match(charts, /dataKey="close"/);
assert.match(charts, /dataKey="total"/);
assert.match(charts, /layout="vertical"/);
```

- [ ] **Step 2: Run the Activity contract and verify it fails**

```powershell
cd frontend
node --test src/__tests__/activityEnomContracts.test.js
```

Expected: FAIL because `ActivityEnomCharts.jsx` does not exist.

- [ ] **Step 3: Add Activity chart config**

Create:

```js
export const ACTIVITY_CHART_COLORS = {
  total: 'var(--chart-1)',
  open: 'var(--chart-2)',
  close: 'var(--chart-3)',
  sites: 'var(--chart-5)',
  category: 'var(--chart-4)',
};

export const activityEnomChartConfig = {
  open: { label: 'OPEN', color: ACTIVITY_CHART_COLORS.open },
  close: { label: 'CLOSE', color: ACTIVITY_CHART_COLORS.close },
  total: { label: 'Total Trend', color: ACTIVITY_CHART_COLORS.total },
  category: { label: 'Total', color: ACTIVITY_CHART_COLORS.category },
};
```

- [ ] **Step 4: Build `ActivityEnomCharts.jsx`**

Export one `ActivityEnomCharts` component with the props `trend`,
`breakdowns`, `selectedNop`, `rankingTitle`, `contributionTitle`, and
`formatMonthLabel`.

Implement these exact compositions:

- Monthly: `ChartContainer` height `260px`, `ComposedChart accessibilityLayer`, stacked `open`/`close`, `total` line, `TopBarValueLabel` on the close bar using `dataKey="total"`.
- Contribution: horizontal stacked bar, first ten rows, inside labels, `DASHBOARD_BAR_RADIUS`.
- Week Done: vertical `close` bar with `TopBarValueLabel`.
- Category: horizontal `total` bar with `EndBarValueLabel`.
- Ranking panel: move its current markup unchanged into this file so the page layout remains identical.
- Every chart uses `ChartTooltip` with `DashboardChartTooltipContent`, `isAnimationActive={false}`, semantic grid tokens, hidden axis lines, and explicit `data-testid`.
- Horizontal charts with end labels reserve at least 48px right margin so the value is not clipped.

Use these test IDs:

```text
activity-monthly-trend-chart
activity-contribution-chart
activity-week-done-chart
activity-category-chart
```

- [ ] **Step 5: Replace direct Activity chart JSX**

In `ActivityEnomPage.jsx`:

- remove Recharts imports;
- remove `ActivityTooltip`, `ChartEmpty`, `RankingPanel`, and `useDashboardThemeTokens`;
- import `ActivityEnomCharts` and `ACTIVITY_CHART_COLORS`;
- remove the page-local `COLORS` object;
- retain data fetching, filters, KPI cards, Top Activity, table, and detail modal;
- replace the chart grids with:

```jsx
<ActivityEnomCharts
  trend={trend}
  breakdowns={breakdowns}
  selectedNop={selectedNop}
  rankingTitle={rankingTitle}
  contributionTitle={contributionTitle}
  formatMonthLabel={formatMonthLabel}
/>
```

Use `ACTIVITY_CHART_COLORS` for KPI accents so the page no longer owns duplicate chart colors.

- [ ] **Step 6: Verify Activity migration**

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/activityEnomContracts.test.js
npx eslint src/pages/ActivityEnomPage.jsx src/features/activity-enom src/components/dashboard-charts
```

Expected: PASS, and `rg "ResponsiveContainer|DashboardChartTooltip" src/pages/ActivityEnomPage.jsx` returns no matches.

- [ ] **Step 7: Commit Activity migration**

```powershell
git add -- frontend/src/features/activity-enom frontend/src/pages/ActivityEnomPage.jsx frontend/src/__tests__/activityEnomContracts.test.js
git commit -m "feat: migrate Activity ENOM charts to shadcn"
```

---

### Task 4: Migrate Transport Quality Charts

**Files:**
- Create: `frontend/src/features/transport-quality/transportQualityChartConfig.js`
- Create: `frontend/src/features/transport-quality/TransportQualityCharts.jsx`
- Modify: `frontend/src/pages/TransportQualityPage.jsx`
- Modify: `frontend/src/__tests__/transportQualityContracts.test.js`
- Test: `frontend/src/__tests__/transportQualityContracts.test.js`

- [ ] **Step 1: Write failing Transport chart contracts**

Read page and feature sources together. Replace the old `ResponsiveContainer` requirement with:

```js
assert.match(page, /TransportQualityCharts/);
assert.doesNotMatch(page, /ResponsiveContainer/);
assert.match(charts, /ChartContainer/g);
assert.match(charts, /DashboardChartTooltipContent/);
assert.match(charts, /accessibilityLayer/g);
assert.match(charts, /pl_over_1_sites/);
assert.match(charts, /latency_over_5_sites/);
assert.match(charts, /jitter_not_clear_sites/);
assert.match(charts, /thi_fail_sites/);
assert.match(charts, /p1_sites/);
assert.match(charts, /p2_sites/);
assert.match(charts, /radius=\{DASHBOARD_BAR_RADIUS\}/);
```

- [ ] **Step 2: Run the Transport contract and verify it fails**

```powershell
cd frontend
node --test src/__tests__/transportQualityContracts.test.js
```

Expected: FAIL because the feature file is absent.

- [ ] **Step 3: Add Transport config**

Define `TRANSPORT_CHART_COLORS` and `transportQualityChartConfig` for:

```js
{
  pl_over_1_sites: 'PL >1%',
  latency_over_5_sites: 'Latency >5ms',
  jitter_not_clear_sites: 'Jitter NOT-CLEAR',
  thi_fail_sites: 'THI Fail',
  records: 'Records',
  p1_sites: 'P1',
  p2_sites: 'P2',
}
```

Use `var(--chart-2)` for packet loss/P1, `var(--chart-4)` for latency/P2, `#22D3EE` for jitter, and `var(--chart-5)` for THI fail.

- [ ] **Step 4: Build `TransportQualityCharts.jsx`**

Export one `TransportQualityCharts` component with the props `trend`,
`distributions`, `breakdowns`, `latestPriority`, and `formatDateLabel`.

Implement:

- Weekly trend: four-line `LineChart`, height `300px`, active dots, shadcn legend and colored tooltip.
- High Priority Transport: move current non-chart panel markup unchanged.
- PL distribution: vertical `records` bars with top labels.
- Latency distribution: vertical `records` bars with top labels.
- NOP breakdown: horizontal stacked P1/P2 with inside labels.
- Kabupaten breakdown: grouped horizontal PL/latency bars with end labels.
- Horizontal grouped bars reserve at least 48px right margin for labels.

All five chart containers use `accessibilityLayer`, `isAnimationActive={false}`, semantic tokens, radius 8, and test IDs:

```text
transport-weekly-trend-chart
transport-packet-loss-chart
transport-latency-chart
transport-nop-breakdown-chart
transport-kabupaten-breakdown-chart
```

- [ ] **Step 5: Integrate with `TransportQualityPage.jsx`**

Remove direct Recharts imports, `TransportTooltip`, `ChartEmpty`, chart-only
`ChartCard`, `useDashboardThemeTokens`, and the page-local `QUALITY_COLORS`.
Import `TRANSPORT_CHART_COLORS` for the existing scorecard accents. Render:

```jsx
<TransportQualityCharts
  trend={trend}
  distributions={distributions}
  breakdowns={breakdowns}
  latestPriority={latestPriority}
  formatDateLabel={formatDateLabel}
/>
```

Keep scorecards, threshold constants, filters, priority table, request separation, and badges unchanged.

- [ ] **Step 6: Verify Transport migration**

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/transportQualityContracts.test.js
npx eslint src/pages/TransportQualityPage.jsx src/features/transport-quality src/components/dashboard-charts
```

Expected: PASS and no direct `ResponsiveContainer` remains in the page.

- [ ] **Step 7: Commit Transport migration**

```powershell
git add -- frontend/src/features/transport-quality frontend/src/pages/TransportQualityPage.jsx frontend/src/__tests__/transportQualityContracts.test.js
git commit -m "feat: migrate Transport Quality charts to shadcn"
```

---

### Task 5: Migrate Ticketing Charts and Implement True Pareto

**Files:**
- Create: `frontend/src/features/ticketing/ticketingChartConfig.js`
- Create: `frontend/src/features/ticketing/TicketingCharts.jsx`
- Modify: `frontend/src/pages/TicketingPage.jsx`
- Modify: `frontend/src/__tests__/ticketingContracts.test.js`
- Test: `frontend/src/__tests__/ticketingContracts.test.js`
- Test: `frontend/src/__tests__/dashboardChartContracts.test.js`

- [ ] **Step 1: Extend failing pure tests for stable SLA colors**

Add a static import for `getSlaStatusColor` from the not-yet-created Ticketing
chart config, then assert:

```js
assert.equal(getSlaStatusColor('IN SLA'), 'var(--chart-3)');
assert.equal(getSlaStatusColor('OUT SLA'), 'var(--chart-2)');
assert.equal(getSlaStatusColor('PENDING'), 'var(--chart-4)');
assert.equal(getSlaStatusColor('UNKNOWN'), 'var(--chart-5)');
```

Update Ticketing source contracts:

```js
assert.match(page, /TicketingCharts/);
assert.doesNotMatch(page, /ResponsiveContainer/);
assert.match(charts, /PieChart/);
assert.match(charts, /dataKey="tickets"/);
assert.match(charts, /nameKey="label"/);
assert.match(charts, /DonutCenterLabel/);
assert.match(charts, /getSlaStatusColor/);
assert.match(charts, /ComposedChart/);
assert.match(charts, /dataKey="cumulative_rate"/);
assert.match(charts, /yAxisId="percentage"/);
assert.match(charts, /domain=\{\[0,\s*100\]\}/);
assert.match(charts, /DashboardChartTooltipContent/);
assert.match(charts, /accessibilityLayer/g);
```

- [ ] **Step 2: Run Ticketing tests and verify they fail**

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/ticketingContracts.test.js
```

Expected: FAIL because Ticketing chart config and feature files are absent.

- [ ] **Step 3: Add Ticketing config and SLA mapping**

Create:

```js
export const TICKETING_CHART_COLORS = {
  bps: 'var(--chart-1)',
  ts: 'var(--chart-3)',
  total: 'var(--chart-4)',
  tickets: 'var(--chart-1)',
  cumulative: 'var(--chart-4)',
  danger: 'var(--chart-2)',
  warning: 'var(--chart-4)',
  success: 'var(--chart-3)',
  violet: 'var(--chart-5)',
  fallback: 'var(--chart-5)',
};

export const ticketingChartConfig = {
  bps: { label: 'BPS', color: TICKETING_CHART_COLORS.bps },
  ts: { label: 'TS', color: TICKETING_CHART_COLORS.ts },
  tickets: { label: 'Tickets', color: TICKETING_CHART_COLORS.tickets },
  visiting_site: { label: 'Visiting Site', color: TICKETING_CHART_COLORS.bps },
  backup_genset: { label: 'Backup Genset', color: TICKETING_CHART_COLORS.success },
  cumulative_rate: { label: 'Cumulative Rate', color: TICKETING_CHART_COLORS.cumulative },
};

export function getSlaStatusColor(label) {
  const status = String(label || '').trim().toUpperCase();
  if (status === 'IN SLA') return TICKETING_CHART_COLORS.success;
  if (status === 'OUT SLA') return TICKETING_CHART_COLORS.danger;
  if (status === 'PENDING') return TICKETING_CHART_COLORS.warning;
  return TICKETING_CHART_COLORS.fallback;
}
```

- [ ] **Step 4: Build `TicketingCharts.jsx`**

Export `TicketingCharts({ dashboard })`; keep `activeSlaIndex` inside the feature component. Implement:

- Daily trend: BPS and TS line chart.
- SLA donut: dynamic `Cell` colors from labels, center total from `sumChartValues`, existing active `Sector`, right-side value list on desktop, bottom list on mobile.
- Visiting vs Backup: grouped horizontal bars.
- Kabupaten/Kota: ranked horizontal tickets bars.
- RC Pareto: `ComposedChart` with `tickets` bars on `yAxisId="tickets"` and `cumulative_rate` line on `yAxisId="percentage"`; percentage axis domain `[0, 100]`.
- Horizontal Ticketing bars reserve at least 48px right margin for labels.

Each SLA `Cell` must support pointer and keyboard focus:

```jsx
<Cell
  key={entry.label}
  fill={getSlaStatusColor(entry.label)}
  tabIndex={0}
  onFocus={() => setActiveSlaIndex(index)}
  onBlur={() => setActiveSlaIndex(null)}
/>
```

The Pareto tooltip must format by data key:

```jsx
valueFormatter={(value, name) => (
  name === 'cumulative_rate'
    ? `${Number(value).toFixed(1).replace('.', ',')}%`
    : formatNumber(value)
)}
```

Use test IDs:

```text
ticketing-daily-trend-chart
ticketing-sla-donut-chart
ticketing-visiting-backup-chart
ticketing-location-chart
ticketing-pareto-chart
```

- [ ] **Step 5: Integrate Ticketing feature charts**

In `TicketingPage.jsx`:

- remove Recharts imports, `renderActivePieShape`, `TicketingTooltip`, `ChartEmpty`, `ChartCard`, `activeSlaIndex`, `useDashboardThemeTokens`, and the page-local `COLORS`;
- import `TicketingCharts` and `TICKETING_CHART_COLORS`;
- replace both chart section grids with:

```jsx
<TicketingCharts dashboard={dashboard} />
```

- keep `HelpHint` available to the feature component by moving it unchanged into `TicketingCharts.jsx`;
- keep filters, scorecards, top sites, ticket table, detail request, and table-local state untouched.

- [ ] **Step 6: Verify Ticketing migration**

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/ticketingContracts.test.js
npx eslint src/pages/TicketingPage.jsx src/features/ticketing src/components/dashboard-charts
```

Expected: PASS and no direct `ResponsiveContainer` remains in the page.

- [ ] **Step 7: Commit Ticketing migration**

```powershell
git add -- frontend/src/features/ticketing frontend/src/pages/TicketingPage.jsx frontend/src/__tests__/ticketingContracts.test.js frontend/src/__tests__/dashboardChartContracts.test.js
git commit -m "feat: migrate Ticketing charts to shadcn"
```

---

### Task 6: Update Cross-Page Contracts and Browser Coverage

**Files:**
- Modify: `frontend/src/__tests__/themeRedesignContracts.test.js`
- Modify: `e2e-playwright.spec.js`
- Test: all targeted frontend contract tests
- Test: focused Playwright chart tests

- [ ] **Step 1: Update theme contracts for feature-owned charts**

Replace the requirement that Transport and Ticketing pages directly use `useDashboardThemeTokens`. Assert:

```js
for (const [pageName, featurePath] of [
  ['ActivityEnomPage.jsx', ['features', 'activity-enom', 'ActivityEnomCharts.jsx']],
  ['TransportQualityPage.jsx', ['features', 'transport-quality', 'TransportQualityCharts.jsx']],
  ['TicketingPage.jsx', ['features', 'ticketing', 'TicketingCharts.jsx']],
]) {
  const page = src('pages', pageName);
  const charts = src(...featurePath);
  assert.match(page, /DashboardKpiCard|DashboardStatusBadge/);
  assert.match(charts, /ChartContainer/);
  assert.match(charts, /var\(--chart-/);
  assert.doesNotMatch(page + charts, /ResponsiveContainer/);
  assert.doesNotMatch(page + charts, /stroke="rgba\(148,163,184,0\.16\)"/);
}
```

- [ ] **Step 2: Run contract tests**

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/activityEnomContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: PASS.

- [ ] **Step 3: Add deterministic mocked Playwright chart fixtures**

Reuse the existing authentication helper and add these route helpers:

```js
async function fulfillJson(route, body) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockActivityEnomCharts(page) {
  await page.route('**/api/v1/activity-enom/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1/activity-enom/', '');
    const responses = {
      filters: {
        default_month: '2026-06-01',
        months: [{ value: '2026-06-01', label: 'Juni 2026' }],
        nops: ['SIDOARJO'],
        categories: ['POWER'],
      },
      summary: {
        total_activity: 18,
        impacted_sites: 7,
        open_activity: 8,
        close_activity: 10,
        completion_rate: 55.6,
      },
      trend: [
        { create_date: '2026-05-01', open: 4, close: 5, total: 9 },
        { create_date: '2026-06-01', open: 4, close: 5, total: 9 },
      ],
      breakdowns: {
        contribution: [
          { label: 'SIDOARJO', open: 4, close: 6, total: 10 },
          { label: 'SURABAYA', open: 4, close: 4, total: 8 },
        ],
        ranking: [
          { label: 'SIDOARJO', sites: 4, open: 4, close: 6, total: 10 },
        ],
        by_week_done: [
          { label: 'W1', close: 4 },
          { label: 'W2', close: 6 },
        ],
        by_category: [
          { label: 'POWER', total: 11 },
          { label: 'TRANSPORT', total: 7 },
        ],
      },
      'top-activities': [],
      activities: { items: [], total: 0, page: 1, limit: 20, total_pages: 0 },
    };
    await fulfillJson(route, responses[endpoint] ?? {});
  });
}

async function mockTransportQualityCharts(page) {
  await page.route('**/api/v1/transport-quality/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1/transport-quality/', '');
    const responses = {
      filters: {
        max_date: '2026-06-12',
        periods: [{ date: '2026-06-12', label: '12 Jun 2026' }],
        nops: ['SIDOARJO'],
        kabupaten: [],
        transport_types: [],
        thi_statuses: [],
        distribution_pl: [],
        pl_status_0_1_pct: [],
        distribution_lat: [],
        jitter_statuses: [],
      },
      summary: {
        total_sites: 20,
        total_records: 20,
        pl_over_1_sites: 6,
        latency_over_5_sites: 5,
        flag_pl_fail_sites: 4,
        thi_fail_sites: 3,
        p1_sites: 2,
        p2_sites: 4,
      },
      trend: [
        { date: '2026-06-11', pl_over_1_sites: 4, latency_over_5_sites: 3, jitter_not_clear_sites: 2, thi_fail_sites: 1 },
        { date: '2026-06-12', pl_over_1_sites: 6, latency_over_5_sites: 5, jitter_not_clear_sites: 3, thi_fail_sites: 2 },
      ],
      distributions: {
        by_packet_loss: [{ label: '0-1%', records: 14 }, { label: '>1%', records: 6 }],
        by_latency: [{ label: '0-5ms', records: 15 }, { label: '>5ms', records: 5 }],
        by_jitter: [],
      },
      breakdowns: {
        by_nop: [{ label: 'SIDOARJO', p1_sites: 2, p2_sites: 4 }],
        by_kabupaten: [{ label: 'SIDOARJO', pl_over_1_sites: 6, latency_over_5_sites: 5 }],
        by_transport_type: [],
      },
      'priority-sites': {
        items: [{ site_id: 'SDA001', site_name: 'Test Site', priority_level: 'P1', priority_score: 9 }],
        total: 1,
        page: 1,
        limit: 20,
        total_pages: 1,
      },
    };
    await fulfillJson(route, responses[endpoint] ?? {});
  });
}

async function mockTicketingCharts(page) {
  await page.route('**/api/v1/ticketing/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1/ticketing/', '');
    const responses = {
      filters: {
        default_start_date: '2026-06-01',
        default_end_date: '2026-06-13',
        years: [],
        months: [],
        nops: ['SIDOARJO'],
        clusters: [],
        categories: [],
        sla_statuses: [],
        ticket_statuses: [],
        backup_sukses: [],
        rc_categories: [],
      },
      dashboard: {
        summary: {
          total_tickets: 16,
          ticket_category: { bps: 10, ts: 6, total: 16 },
        },
        trend: [
          { label: '01 Jun', bps: 8, ts: 5 },
          { label: '02 Jun', bps: 10, ts: 6 },
        ],
        sla_distribution: [
          { label: 'IN SLA', tickets: 12 },
          { label: 'OUT SLA', tickets: 4 },
        ],
        visiting_backup_distribution: [
          { label: 'YES', visiting_site: 9, backup_genset: 5 },
          { label: 'NO', visiting_site: 3, backup_genset: 2 },
        ],
        location_breakdown_title: 'Kabupaten/Kota Distribution',
        location_breakdown: [
          { label: 'SIDOARJO', tickets: 10 },
          { label: 'SURABAYA', tickets: 6 },
        ],
        rc_category_pareto: [
          { label: 'POWER', tickets: 8, cumulative_rate: 66.7 },
          { label: 'TRANSPORT', tickets: 4, cumulative_rate: 100 },
        ],
        top_sites: [],
      },
      tickets: { items: [], total: 0, page: 1, limit: 20, total_pages: 0 },
    };
    await fulfillJson(route, responses[endpoint] ?? {});
  });
}
```

- [ ] **Step 4: Add tooltip color and rendering assertions**

For each page:

1. navigate after mocked responses;
2. wait for every chart `data-testid`;
3. hover a visible SVG bar, line dot, or donut sector;
4. read computed colors from `[data-series-name]` and `[data-series-value]`;
5. assert the two colors match and are not the muted foreground;
6. assert the page has no horizontal overflow.

For Ticketing, additionally assert:

```js
await expect(page.getByTestId('ticketing-sla-donut-chart')).toBeVisible();
await expect(page.getByTestId('ticketing-sla-donut-chart').getByText('16', { exact: true })).toBeVisible();
await expect(page.getByTestId('ticketing-pareto-chart').locator('.recharts-bar-rectangle')).toHaveCount(2);
await expect(page.getByTestId('ticketing-pareto-chart').locator('.recharts-line-curve')).toBeVisible();
```

Repeat the donut visibility and overflow assertions with a mobile viewport:

```js
await page.setViewportSize({ width: 390, height: 844 });
```

- [ ] **Step 5: Run focused Playwright tests**

Start the backend and frontend if they are not already running, with Vite fixed to port 5173:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Then run:

```powershell
npx playwright test e2e-playwright.spec.js -g "Activity ENOM charts|Transport Quality charts|Ticketing charts"
```

Expected: all three chart scenarios PASS in dark theme, plus Ticketing mobile donut coverage.

- [ ] **Step 6: Commit cross-page tests**

```powershell
git add -- frontend/src/__tests__/themeRedesignContracts.test.js e2e-playwright.spec.js
git commit -m "test: cover shared shadcn dashboard charts"
```

---

### Task 7: Final Verification and Graph Refresh

**Files:**
- Modify only if verification exposes a migration defect.
- Update generated graph artifacts through `graphify update .`.

- [ ] **Step 1: Run all targeted Node tests**

```powershell
cd frontend
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/activityEnomContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js src/__tests__/themeRedesignContracts.test.js src/__tests__/dashboardReportingContracts.test.js
```

Expected: PASS.

- [ ] **Step 2: Run targeted ESLint**

```powershell
npx eslint src/components/dashboard-charts src/features/activity-enom src/features/transport-quality src/features/ticketing src/pages/ActivityEnomPage.jsx src/pages/TransportQualityPage.jsx src/pages/TicketingPage.jsx src/__tests__/dashboardChartContracts.test.js src/__tests__/activityEnomContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: PASS with no new warnings or errors.

- [ ] **Step 3: Build with the project Node version**

```powershell
npm run build
```

Expected: Vite build succeeds. If Node 24 crashes during chunk rendering, rerun the verified machine fallback:

```powershell
npx --yes --package node@22 node --max-old-space-size=4096 .\node_modules\vite\bin\vite.js build
```

- [ ] **Step 4: Run focused browser validation**

```powershell
npx playwright test e2e-playwright.spec.js -g "Activity ENOM charts|Transport Quality charts|Ticketing charts"
```

Expected: PASS.

- [ ] **Step 5: Check the migration surface**

```powershell
rg -n "ResponsiveContainer|DashboardChartTooltip" src/pages/ActivityEnomPage.jsx src/pages/TransportQualityPage.jsx src/pages/TicketingPage.jsx
rg -n "ChartContainer|DashboardChartTooltipContent|accessibilityLayer" src/features/activity-enom src/features/transport-quality src/features/ticketing
git diff --check
```

Expected:

- first command returns no matches;
- second command shows all three feature chart modules;
- `git diff --check` returns no output.

- [ ] **Step 6: Refresh Graphify**

From repository root:

```powershell
graphify update .
```

Expected: graph refresh completes and includes the new dashboard chart feature modules.

- [ ] **Step 7: Commit final verification fixes and graph updates**

Stage only files changed by this implementation and the intended Graphify outputs:

```powershell
git status --short
git add -- frontend/src/components/dashboard-charts frontend/src/features/activity-enom frontend/src/features/transport-quality frontend/src/features/ticketing frontend/src/pages/ActivityEnomPage.jsx frontend/src/pages/TransportQualityPage.jsx frontend/src/pages/TicketingPage.jsx frontend/src/__tests__/dashboardChartContracts.test.js frontend/src/__tests__/activityEnomContracts.test.js frontend/src/__tests__/transportQualityContracts.test.js frontend/src/__tests__/ticketingContracts.test.js frontend/src/__tests__/themeRedesignContracts.test.js e2e-playwright.spec.js graphify-out
git diff --cached --check
git commit -m "feat: complete dashboard shadcn chart migration"
```

If all implementation files were already committed in prior tasks and Graphify produced no tracked changes, skip this final commit rather than creating an empty commit.
