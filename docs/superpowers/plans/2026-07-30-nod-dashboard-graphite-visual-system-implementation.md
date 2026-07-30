# NOD Dashboard Graphite Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Matte Graphite + Telkomsel Red Edge visual system, Operational Precision icon language, and consistent chart/panel treatment across every NOD Dashboard route in dark and light mode.

**Architecture:** Centralize palette and density decisions in CSS semantic tokens, then make the shared dashboard primitives and sidebar the only source of panel/header/icon chrome. Migrate page groups onto those primitives and semantic chart colors while leaving Mapbox layers, RF Tilt geometry, tower geometry, and exported tower artwork untouched.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, shadcn/ui, Lucide React, Recharts 3, Node test runner, Playwright.

---

## Scope and dependency

This is implementation track 1 of 3 and should run first. The Command
Center/Reporting reliability plan and Tower Visualizer mobile/density plan may
then consume the tokens and shared header primitives introduced here.

The protected visual-core files are:

- `frontend/src/components/MapboxMap.jsx` for data-layer rendering;
- `frontend/src/features/rf-tilt/RfTiltMap.jsx`;
- `frontend/src/features/rf-tilt/rfTiltChartConfig.js` beam, terrain, footprint,
  sector, link, and tower colors;
- `frontend/src/features/tower-plan/towerPlanGeometry.js`;
- `frontend/src/features/tower-plan/towerPlanSvg.js`;
- `frontend/src/features/tower-plan/towerPlanDocument.js`.

This track may style the surrounding cards and controls, but it must not change
the protected data geometry or export rendering.

## File map

### Global foundation

- Modify `frontend/src/index.css`: dark/light tokens, canvas gradient, matte
  surfaces, borders, controls, tables, chart roles, and print bridges.
- Modify `frontend/src/hooks/useDashboardThemeTokens.js`: expose semantic chart
  and surface roles.
- Modify `frontend/src/components/ui/DashboardPrimitives.jsx`: shared panel
  header, compact density, KPI icon container, chart/table shells, and tooltip.
- Modify `frontend/src/components/DashboardSidebar.jsx`: graphite sidebar,
  red-edge active state, neutral hover state, and canvas shell.

### Chart foundation

- Modify `frontend/src/components/dashboard-charts/dashboardChartUtils.js`.
- Modify `frontend/src/components/dashboard-charts/DashboardChartEmpty.jsx`.
- Create `frontend/src/components/dashboard-charts/DashboardChartError.jsx`.
- Modify `frontend/src/components/dashboard-charts/DashboardChartLegend.jsx`.
- Modify `frontend/src/components/dashboard-charts/DashboardChartTooltipContent.jsx`.
- Modify `frontend/src/features/activity-enom/activityEnomChartConfig.js`.
- Modify `frontend/src/features/transport-quality/transportQualityChartConfig.js`.
- Modify `frontend/src/features/ticketing/ticketingChartConfig.js`.
- Modify `frontend/src/features/impact-service/impactServiceChartConfig.js`.
- Create `frontend/src/features/home/homeChartConfig.js`.
- Create `frontend/src/features/reporting/reportingChartConfig.js`.
- Create `frontend/src/features/data-potensi/dataPotensiChartConfig.js`.

### Route surfaces

- Modify `frontend/src/pages/HomePage.jsx`.
- Modify `frontend/src/pages/NetworkReportingPage.jsx`.
- Modify `frontend/src/pages/DataPotensiPage.jsx`.
- Modify `frontend/src/pages/ActivityEnomPage.jsx`.
- Modify `frontend/src/pages/ImpactServicePage.jsx`.
- Modify `frontend/src/pages/TransportQualityPage.jsx`.
- Modify `frontend/src/pages/TicketingPage.jsx`.
- Modify `frontend/src/pages/SiteMapPage.jsx`.
- Modify `frontend/src/pages/DashboardPage.jsx`.
- Modify `frontend/src/pages/RfTiltAnalysisPage.jsx`.
- Modify `frontend/src/pages/TowerPlanGeneratorPage.jsx`.
- Modify `frontend/src/pages/LoginPage.jsx`.
- Modify the feature and component files listed in Tasks 6-8 only where they
  render dashboard chrome, icons, supporting charts, tables, tooltips, or
  controls.

### Tests

- Modify `frontend/src/__tests__/themeRedesignContracts.test.js`.
- Modify `frontend/src/__tests__/dashboardChartContracts.test.js`.
- Modify existing page contract tests named in each task.
- Modify `e2e-playwright.spec.js` for cross-route theme smoke coverage.

## Task 1: Establish the graphite/red semantic tokens

**Files:**

- Modify: `frontend/src/index.css`
- Modify: `frontend/src/hooks/useDashboardThemeTokens.js`
- Test: `frontend/src/__tests__/themeRedesignContracts.test.js`

- [ ] **Step 1: Replace the old color assertions with failing graphite-token assertions**

Replace the first theme-token test with:

```js
it('uses Matte Graphite and Telkomsel Red Edge as the global token source', () => {
  const css = src('index.css');

  for (const token of [
    '--brand-red: #E60012',
    '--bg-base: #0D1015',
    '--bg-surface: #171B23',
    '--bg-elevated: #1D222B',
    '--text-primary: #EEF2F7',
    '--border-strong: rgba(255, 255, 255, 0.10)',
    '--chart-accent: var(--brand-red)',
    '--chart-neutral-1',
    '--chart-neutral-2',
    '--sidebar-active',
    '--canvas-background',
    '[data-theme="light"]',
    '--bg-base: #D9DEE5',
    '--bg-sidebar: #CBD1D9',
    '--bg-surface: #F8FAFC',
    '--border: #C2C9D2',
    '--border-strong: #AEB7C3',
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(css, /--primary:\s*#0EA5E9/i);
  assert.doesNotMatch(css, /--shadow-glow:\s*0 0 24px rgba\(14,\s*165,\s*233/);
});
```

Extend the hook assertion list with:

```js
for (const name of [
  'chartAccent',
  'chartNeutral1',
  'chartNeutral2',
  'borderStrong',
  'surfaceElevated',
]) {
  assert.match(hook, new RegExp(name));
}
```

- [ ] **Step 2: Run the contract and verify that it fails on the old cyan/light tokens**

Run from `frontend`:

```powershell
node --test src/__tests__/themeRedesignContracts.test.js
```

Expected: FAIL mentioning `--brand-red`, `#0D1015`, or the stronger light
border tokens.

- [ ] **Step 3: Replace the global palette and matte-surface rules**

Use this semantic core in `:root`:

```css
:root {
  --brand-red: #E60012;
  --brand-red-hover: #FF2638;
  --brand-red-deep: #B8000E;

  --primary: var(--brand-red);
  --primary-light: #FF5261;
  --primary-dark: var(--brand-red-deep);
  --accent: #242A33;

  --success: #22A06B;
  --warning: #D99A2B;
  --danger: #E5484D;
  --info: #7890A8;

  --bg-base: #0D1015;
  --bg-surface: #171B23;
  --bg-elevated: #1D222B;
  --bg-hover: #252B35;
  --bg-glass: rgba(23, 27, 35, 0.96);
  --bg-header: rgba(18, 22, 29, 0.96);
  --bg-sidebar: rgba(13, 16, 21, 0.98);
  --surface-soft: rgba(255, 255, 255, 0.035);
  --surface-muted: rgba(255, 255, 255, 0.06);
  --sidebar-active: rgba(230, 0, 18, 0.11);

  --text-primary: #EEF2F7;
  --text-secondary: #AAB4C2;
  --text-muted: #8994A3;

  --border: rgba(255, 255, 255, 0.065);
  --border-light: rgba(255, 255, 255, 0.085);
  --border-strong: rgba(255, 255, 255, 0.10);
  --border-focus: rgba(230, 0, 18, 0.48);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.24);
  --shadow-md: 0 8px 22px rgba(0, 0, 0, 0.20);
  --shadow-lg: 0 18px 42px rgba(0, 0, 0, 0.28);
  --shadow-card: 0 10px 28px rgba(0, 0, 0, 0.18);
  --shadow-glow: none;

  --canvas-background:
    radial-gradient(circle at 2% -6%, rgba(230, 0, 18, 0.10), transparent 27%),
    radial-gradient(circle at 92% 108%, rgba(100, 116, 139, 0.10), transparent 36%),
    linear-gradient(145deg, #0D1015 0%, #12161D 58%, #171B23 100%);

  --chart-accent: var(--brand-red);
  --chart-neutral-1: #AAB4C2;
  --chart-neutral-2: #6F7B89;
  --chart-success: var(--success);
  --chart-warning: var(--warning);
  --chart-danger: var(--danger);
  --chart-info: var(--info);
  --chart-grid: rgba(255, 255, 255, 0.055);
  --chart-grid-strong: rgba(255, 255, 255, 0.095);
  --chart-axis: #8994A3;
  --chart-tooltip-bg: #12161D;
  --chart-tooltip-border: var(--border-strong);
  --chart-cursor: rgba(230, 0, 18, 0.055);
  --chart-area-primary: rgba(230, 0, 18, 0.10);

  --chart-1: var(--chart-accent);
  --chart-2: var(--chart-danger);
  --chart-3: var(--chart-success);
  --chart-4: var(--chart-warning);
  --chart-5: var(--chart-neutral-1);
}
```

Use this light override:

```css
[data-theme="light"] {
  --primary: #D40012;
  --primary-light: #B8000E;
  --primary-dark: #99000C;
  --accent: #D7DCE3;

  --success: #147D52;
  --warning: #9A6700;
  --danger: #C9363E;
  --info: #526B82;

  --bg-base: #D9DEE5;
  --bg-surface: #F8FAFC;
  --bg-elevated: #EEF1F4;
  --bg-hover: #E4E8ED;
  --bg-glass: rgba(248, 250, 252, 0.97);
  --bg-header: rgba(238, 241, 244, 0.97);
  --bg-sidebar: #CBD1D9;
  --surface-soft: rgba(23, 27, 34, 0.045);
  --surface-muted: rgba(23, 27, 34, 0.075);
  --sidebar-active: rgba(212, 0, 18, 0.10);

  --text-primary: #171B22;
  --text-secondary: #46515F;
  --text-muted: #667180;

  --border: #C2C9D2;
  --border-light: #B8C1CC;
  --border-strong: #AEB7C3;
  --border-focus: rgba(212, 0, 18, 0.46);

  --shadow-sm: 0 1px 2px rgba(31, 41, 55, 0.08);
  --shadow-md: 0 7px 20px rgba(31, 41, 55, 0.08);
  --shadow-lg: 0 18px 38px rgba(31, 41, 55, 0.13);
  --shadow-card: 0 5px 14px rgba(31, 41, 55, 0.07);
  --shadow-glow: none;

  --canvas-background:
    radial-gradient(circle at 2% -6%, rgba(230, 0, 18, 0.065), transparent 25%),
    linear-gradient(145deg, #D2D8E0 0%, #D9DEE5 100%);

  --chart-neutral-1: #5E6977;
  --chart-neutral-2: #8994A3;
  --chart-grid: rgba(55, 65, 81, 0.11);
  --chart-grid-strong: rgba(55, 65, 81, 0.16);
  --chart-axis: #667180;
  --chart-tooltip-bg: #F8FAFC;
  --chart-tooltip-border: var(--border-strong);
  --chart-cursor: rgba(212, 0, 18, 0.05);
  --chart-area-primary: rgba(212, 0, 18, 0.08);
}
```

Replace the glass rules with matte rules:

```css
.dashboard-canvas {
  background-color: var(--bg-base);
  background-image: var(--canvas-background);
  background-attachment: fixed;
}

.glass-card,
.dashboard-panel {
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: var(--noc-radius-lg);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: border-color 160ms ease, background-color 160ms ease;
}

.glass-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-card);
}
```

Keep print-mode white overrides and map-specific domain colors. Replace
cyan-specific generic hover/glow declarations with the semantic variables, but
do not recolor Mapbox data layers or RF beam/terrain colors.

Expose the roles in `useDashboardThemeTokens()`:

```js
surfaceElevated: 'var(--bg-elevated)',
borderStrong: 'var(--border-strong)',
chartAccent: 'var(--chart-accent)',
chartNeutral1: 'var(--chart-neutral-1)',
chartNeutral2: 'var(--chart-neutral-2)',
chartSuccess: 'var(--chart-success)',
chartWarning: 'var(--chart-warning)',
chartDanger: 'var(--chart-danger)',
chartInfo: 'var(--chart-info)',
```

- [ ] **Step 4: Run the token contract**

Run:

```powershell
node --test src/__tests__/themeRedesignContracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit the token foundation**

Run from the repository root:

```powershell
git add frontend/src/index.css frontend/src/hooks/useDashboardThemeTokens.js frontend/src/__tests__/themeRedesignContracts.test.js
git commit -m "feat: add graphite dashboard theme tokens"
```

## Task 2: Make shared panels, KPI icons, headers, and sidebar operational

**Files:**

- Modify: `frontend/src/components/ui/DashboardPrimitives.jsx`
- Modify: `frontend/src/components/DashboardSidebar.jsx`
- Modify: `frontend/src/__tests__/themeRedesignContracts.test.js`
- Test: `frontend/src/__tests__/homePageContracts.test.js`

- [ ] **Step 1: Add failing contracts for compact headers and restrained icon chrome**

Add:

```js
it('uses compact shared headers and restrained operational icon chrome', () => {
  const primitives = src('components', 'ui', 'DashboardPrimitives.jsx');
  const sidebar = src('components', 'DashboardSidebar.jsx');

  assert.match(primitives, /export function DashboardPanelHeader/);
  assert.match(primitives, /data-density=\{description \? 'normal' : 'compact'\}/);
  assert.match(primitives, /rounded-lg border border-\[var\(--border\)\] bg-\[var\(--surface-soft\)\]/);
  assert.doesNotMatch(primitives, /boxShadow:\s*`0 0 18px/);
  assert.doesNotMatch(primitives, /rounded-full border border-\[var\(--border-light\)\]/);

  assert.match(sidebar, /dashboard-canvas/);
  assert.match(sidebar, /border-l-\[3px\]/);
  assert.match(sidebar, /var\(--sidebar-active\)/);
  assert.doesNotMatch(sidebar, /hover:bg-\[var\(--primary\)\]\/10/);
});
```

- [ ] **Step 2: Run the contracts and verify failure**

Run:

```powershell
node --test src/__tests__/themeRedesignContracts.test.js src/__tests__/homePageContracts.test.js
```

Expected: FAIL because `DashboardPanelHeader`, `dashboard-canvas`, and the
red-edge active navigation do not exist.

- [ ] **Step 3: Introduce one shared panel-header component**

Add this component and use it inside `DashboardChartPanel` and
`DashboardTableShell`:

```jsx
export function DashboardPanelHeader({
  title,
  description,
  icon: Icon,
  action,
  className = '',
}) {
  return (
    <div
      data-density={description ? 'normal' : 'compact'}
      className={[
        'flex min-w-0 flex-wrap items-start justify-between gap-3',
        description ? 'pb-4' : 'pb-3',
        className,
      ].join(' ')}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]">
            <Icon className="size-4" strokeWidth={1.8} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-[0.01em] text-[var(--text-primary)]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}
```

Update the two shells:

```jsx
export function DashboardChartPanel({
  title,
  description,
  icon,
  children,
  action,
  className = '',
  style,
}) {
  return (
    <section className={`glass-card min-w-0 p-5 ${className}`} style={style}>
      <DashboardPanelHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
      />
      {children}
    </section>
  );
}

export function DashboardTableShell({
  title,
  description,
  icon,
  count,
  action,
  children,
  className = '',
}) {
  const countAction = (
    <div className="flex items-center gap-2">
      {count != null && (
        <span className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
          {count}
        </span>
      )}
      {action}
    </div>
  );

  return (
    <section className={`glass-card overflow-hidden ${className}`}>
      {(title || action || count != null) && (
        <div className="border-b border-[var(--border)] px-5 pt-4">
          <DashboardPanelHeader
            title={title}
            description={description}
            icon={icon}
            action={countAction}
          />
        </div>
      )}
      {children}
    </section>
  );
}
```

Replace the KPI icon treatment with:

```jsx
{Icon && (
  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)]">
    <Icon className="size-[18px]" strokeWidth={1.8} style={{ color: iconColor }} />
  </span>
)}
```

Remove the `boxShadow` style. Retain `accent` temporarily for compatibility;
page migrations later in this plan remove decorative per-card `glow` props.

Make `DashboardPageHeader` use conditional padding:

```jsx
<header
  data-density={subtitle ? 'normal' : 'compact'}
  className={[
    'border-b border-[var(--border)] bg-[var(--bg-header)] px-4 backdrop-blur-lg sm:px-6',
    subtitle ? 'py-4' : 'py-3',
  ].join(' ')}
>
```

- [ ] **Step 4: Apply the red-edge sidebar and canvas**

Use:

```jsx
const baseClass = 'group relative flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors';

className={({ isActive }) => [
  baseClass,
  isActive
    ? 'border-y-[var(--border)] border-r-[var(--border)] border-l-[3px] border-l-[var(--primary)] bg-[var(--sidebar-active)] text-[var(--text-primary)]'
    : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]',
  collapsed ? 'justify-center px-2' : '',
].join(' ')}
```

Change the app shell root to:

```jsx
<div className="dashboard-canvas min-h-screen text-[var(--text-primary)]">
```

Use neutral hover styling for collapse, theme, and ordinary sidebar controls.
Keep logout destructive styling.

- [ ] **Step 5: Run the shared-shell contracts**

Run:

```powershell
node --test src/__tests__/themeRedesignContracts.test.js src/__tests__/homePageContracts.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit shared chrome**

Run from the repository root:

```powershell
git add frontend/src/components/ui/DashboardPrimitives.jsx frontend/src/components/DashboardSidebar.jsx frontend/src/__tests__/themeRedesignContracts.test.js frontend/src/__tests__/homePageContracts.test.js
git commit -m "feat: refine dashboard panels and sidebar"
```

## Task 3: Centralize the Operational Precision chart palette and states

**Files:**

- Modify: `frontend/src/components/dashboard-charts/dashboardChartUtils.js`
- Modify: `frontend/src/components/dashboard-charts/DashboardChartEmpty.jsx`
- Create: `frontend/src/components/dashboard-charts/DashboardChartError.jsx`
- Modify: `frontend/src/components/dashboard-charts/DashboardChartLegend.jsx`
- Modify: `frontend/src/components/dashboard-charts/DashboardChartTooltipContent.jsx`
- Modify: `frontend/src/features/activity-enom/activityEnomChartConfig.js`
- Modify: `frontend/src/features/transport-quality/transportQualityChartConfig.js`
- Modify: `frontend/src/features/ticketing/ticketingChartConfig.js`
- Modify: `frontend/src/features/impact-service/impactServiceChartConfig.js`
- Create: `frontend/src/features/home/homeChartConfig.js`
- Create: `frontend/src/features/reporting/reportingChartConfig.js`
- Create: `frontend/src/features/data-potensi/dataPotensiChartConfig.js`
- Test: `frontend/src/__tests__/dashboardChartContracts.test.js`
- Test: `frontend/src/__tests__/themeRedesignContracts.test.js`

- [ ] **Step 1: Add failing semantic-palette contracts**

Add:

```js
it('exports one Operational Precision chart palette', () => {
  const utils = src('components', 'dashboard-charts', 'dashboardChartUtils.js');
  const configPaths = [
    ['features', 'activity-enom', 'activityEnomChartConfig.js'],
    ['features', 'transport-quality', 'transportQualityChartConfig.js'],
    ['features', 'ticketing', 'ticketingChartConfig.js'],
    ['features', 'impact-service', 'impactServiceChartConfig.js'],
    ['features', 'home', 'homeChartConfig.js'],
    ['features', 'reporting', 'reportingChartConfig.js'],
    ['features', 'data-potensi', 'dataPotensiChartConfig.js'],
  ];

  assert.match(utils, /export const DASHBOARD_CHART_COLORS/);
  for (const key of ['accent', 'neutral', 'neutralMuted', 'success', 'warning', 'danger', 'info']) {
    assert.match(utils, new RegExp(`${key}:`));
  }

  for (const path of configPaths) {
    const config = src(...path);
    assert.match(config, /DASHBOARD_CHART_COLORS/);
    assert.doesNotMatch(config, /#22D3EE|#0EA5E9|#38BDF8/i);
  }
});
```

Extend the empty-state contract:

```js
assert.match(empty, /data-chart-state="empty"/);
assert.match(empty, /border-\[var\(--border\)\]/);

const errorState = src('components', 'dashboard-charts', 'DashboardChartError.jsx');
assert.match(errorState, /data-chart-state="error"/);
assert.match(errorState, /role="status"/);
```

- [ ] **Step 2: Run the chart contracts and verify failure**

Run:

```powershell
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: FAIL because the unified palette and the three new page configs do
not exist.

- [ ] **Step 3: Add the shared palette**

Add to `dashboardChartUtils.js`:

```js
export const DASHBOARD_CHART_COLORS = Object.freeze({
  accent: 'var(--chart-accent)',
  neutral: 'var(--chart-neutral-1)',
  neutralMuted: 'var(--chart-neutral-2)',
  success: 'var(--chart-success)',
  warning: 'var(--chart-warning)',
  danger: 'var(--chart-danger)',
  info: 'var(--chart-info)',
});

export const DASHBOARD_CHART_MARGIN = { top: 16, right: 24, left: 0, bottom: 0 };
export const DASHBOARD_BAR_RADIUS = [6, 6, 6, 6];
```

Change `DashboardChartEmpty` to:

```jsx
<Empty
  data-chart-state="empty"
  className={cn(
    'border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-6',
    className,
  )}
>
```

Create `DashboardChartError.jsx`:

```jsx
import { CircleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

export function DashboardChartError({
  label = 'Chart gagal dimuat.',
  className = 'h-[220px]',
}) {
  return (
    <div
      data-chart-state="error"
      className={cn(
        'flex items-center justify-center rounded-lg border border-[var(--danger)]/25 bg-[var(--badge-critical-bg)] p-6 text-center',
        className,
      )}
      role="status"
    >
      <div className="space-y-2 text-xs text-[var(--danger)]">
        <CircleAlert className="mx-auto size-5" />
        <p>{label}</p>
      </div>
    </div>
  );
}
```

Use `border-[var(--border-strong)]`, `bg-[var(--chart-tooltip-bg)]`,
`text-[var(--text-primary)]`, and tabular values in the shared tooltip. Keep
legend markers small and rectangular rather than glowing circles.

- [ ] **Step 4: Replace page chart configs with semantic roles**

Every config imports:

```js
import { DASHBOARD_CHART_COLORS } from '@/components/dashboard-charts/dashboardChartUtils';
```

Use these complete role maps:

```js
// activityEnomChartConfig.js
export const ACTIVITY_CHART_COLORS = {
  total: DASHBOARD_CHART_COLORS.neutral,
  open: DASHBOARD_CHART_COLORS.danger,
  close: DASHBOARD_CHART_COLORS.success,
  sites: DASHBOARD_CHART_COLORS.neutralMuted,
  category: DASHBOARD_CHART_COLORS.accent,
};
```

```js
// transportQualityChartConfig.js
export const TRANSPORT_CHART_COLORS = {
  packetLoss: DASHBOARD_CHART_COLORS.danger,
  latency: DASHBOARD_CHART_COLORS.warning,
  jitter: DASHBOARD_CHART_COLORS.info,
  p1: DASHBOARD_CHART_COLORS.danger,
  p2: DASHBOARD_CHART_COLORS.warning,
  normal: DASHBOARD_CHART_COLORS.success,
  total: DASHBOARD_CHART_COLORS.neutral,
  thi: DASHBOARD_CHART_COLORS.accent,
};
```

```js
// ticketingChartConfig.js
export const TICKETING_CHART_COLORS = {
  bps: DASHBOARD_CHART_COLORS.accent,
  ts: DASHBOARD_CHART_COLORS.neutral,
  total: DASHBOARD_CHART_COLORS.neutralMuted,
  tickets: DASHBOARD_CHART_COLORS.neutral,
  cumulative: DASHBOARD_CHART_COLORS.accent,
  danger: DASHBOARD_CHART_COLORS.danger,
  warning: DASHBOARD_CHART_COLORS.warning,
  success: DASHBOARD_CHART_COLORS.success,
  violet: DASHBOARD_CHART_COLORS.neutralMuted,
  incident: DASHBOARD_CHART_COLORS.accent,
  event: DASHBOARD_CHART_COLORS.neutral,
  fallback: DASHBOARD_CHART_COLORS.neutralMuted,
};
```

```js
// impactServiceChartConfig.js
export const STATUS_COLORS = {
  total: DASHBOARD_CHART_COLORS.neutral,
  open: DASHBOARD_CHART_COLORS.danger,
  clear: DASHBOARD_CHART_COLORS.success,
  warning: DASHBOARD_CHART_COLORS.warning,
  impacted: DASHBOARD_CHART_COLORS.accent,
};
```

Keep status meaning stable. Replace decorative categorical cyan/purple/pink
arrays with a restrained sequence of neutral, accent, warning, success, info,
and danger roles.

Create the three new config files with:

```js
import { DASHBOARD_CHART_COLORS } from '@/components/dashboard-charts/dashboardChartUtils';

export const homeChartConfig = {
  total_revenue: { label: 'Revenue', color: DASHBOARD_CHART_COLORS.neutral },
  total_payload: { label: 'Payload', color: DASHBOARD_CHART_COLORS.info },
  avg_availability: { label: 'Availability', color: DASHBOARD_CHART_COLORS.warning },
};
```

```js
import { DASHBOARD_CHART_COLORS } from '@/components/dashboard-charts/dashboardChartUtils';

export const reportingChartConfig = {
  total_revenue: { label: 'Revenue', color: DASHBOARD_CHART_COLORS.neutral },
  total_payload: { label: 'Payload', color: DASHBOARD_CHART_COLORS.accent },
  avg_availability: { label: 'Availability', color: DASHBOARD_CHART_COLORS.warning },
};
```

```js
import { DASHBOARD_CHART_COLORS } from '@/components/dashboard-charts/dashboardChartUtils';

export const dataPotensiChartConfig = {
  total: { label: 'Total Site', color: DASHBOARD_CHART_COLORS.neutral },
  percentage: { label: 'Share', color: DASHBOARD_CHART_COLORS.accent },
  lithium: { label: 'Lithium', color: DASHBOARD_CHART_COLORS.success },
  vrla: { label: 'VRLA', color: DASHBOARD_CHART_COLORS.neutralMuted },
};
```

- [ ] **Step 5: Run chart tests**

Run:

```powershell
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the chart language**

Run from the repository root:

```powershell
git add frontend/src/components/dashboard-charts/dashboardChartUtils.js frontend/src/components/dashboard-charts/DashboardChartEmpty.jsx frontend/src/components/dashboard-charts/DashboardChartError.jsx frontend/src/components/dashboard-charts/DashboardChartLegend.jsx frontend/src/components/dashboard-charts/DashboardChartTooltipContent.jsx frontend/src/features/activity-enom/activityEnomChartConfig.js frontend/src/features/transport-quality/transportQualityChartConfig.js frontend/src/features/ticketing/ticketingChartConfig.js frontend/src/features/impact-service/impactServiceChartConfig.js frontend/src/features/home/homeChartConfig.js frontend/src/features/reporting/reportingChartConfig.js frontend/src/features/data-potensi/dataPotensiChartConfig.js frontend/src/__tests__/dashboardChartContracts.test.js frontend/src/__tests__/themeRedesignContracts.test.js
git commit -m "feat: standardize dashboard chart language"
```

## Task 4: Standardize the complete icon family on Lucide

**Files:**

- Modify: all files returned by `rg -l "@phosphor-icons/react" frontend/src`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Test: `frontend/src/__tests__/themeRedesignContracts.test.js`

- [ ] **Step 1: Add a failing one-family icon contract**

Add:

```js
it('uses Lucide as the single dashboard icon family', () => {
  const sourceFiles = [
    'components/Header.jsx',
    'components/dashboard-filters/DashboardFilters.jsx',
    'components/ui/calendar.jsx',
    'components/ui/checkbox.jsx',
    'components/ui/command.jsx',
    'components/ui/dialog.jsx',
    'components/ui/pagination.jsx',
    'components/ui/select.jsx',
    'components/ui/sheet.jsx',
    'features/data-potensi/DataPotensiSiteTable.jsx',
    'features/impact-service/ImpactServiceAlarmDialog.jsx',
    'features/impact-service/ImpactServiceAlarmTable.jsx',
    'features/impact-service/ImpactServiceCharts.jsx',
    'features/impact-service/ImpactServiceFilters.jsx',
    'features/impact-service/ImpactServiceHeader.jsx',
    'features/impact-service/ImpactServiceKpiGrid.jsx',
    'features/impact-service/ImpactServiceStates.jsx',
    'features/impact-service/ImpactServiceTopAlarms.jsx',
    'features/rf-tilt/RfTiltAntennaSpecPanel.jsx',
    'features/rf-tilt/RfTiltExportButton.jsx',
    'features/rf-tilt/RfTiltParamForm.jsx',
    'pages/ActivityEnomPage.jsx',
    'pages/TicketingPage.jsx',
    'pages/TransportQualityPage.jsx',
  ];

  for (const file of sourceFiles) {
    const source = src(...file.split('/'));
    assert.doesNotMatch(source, /@phosphor-icons\/react/, file);
  }
});
```

- [ ] **Step 2: Run the contract and verify failure**

Run:

```powershell
node --test src/__tests__/themeRedesignContracts.test.js
```

Expected: FAIL on the first remaining Phosphor import.

- [ ] **Step 3: Replace imports and component names mechanically**

Use this mapping, removing all Phosphor `weight` props:

| Phosphor | Lucide |
| --- | --- |
| `ArrowCounterClockwiseIcon` | `RotateCcw` |
| `ArrowClockwiseIcon` | `RefreshCw` |
| `CalendarBlankIcon` | `CalendarDays` |
| `CaretLeftIcon` | `ChevronLeft` |
| `CaretRightIcon` | `ChevronRight` |
| `CaretUpIcon` | `ChevronUp` |
| `CaretDownIcon` | `ChevronDown` |
| `CaretUpDownIcon` | `ChevronsUpDown` |
| `FunnelIcon` | `Funnel` |
| `MagnifyingGlassIcon` | `Search` |
| `XIcon` | `X` |
| `CheckIcon` | `Check` |
| `CircleNotchIcon` | `LoaderCircle` |
| `InfoIcon` | `Info` |
| `MapPinIcon` | `MapPin` |
| `WarningCircleIcon` | `CircleAlert` |
| `WarningIcon` | `TriangleAlert` |
| `FileImageIcon` | `FileImage` |
| `LinkIcon` | `Link` |
| `RadioIcon` | `Radio` |
| `ArrowDownIcon` | `ArrowDown` |
| `ArrowUpIcon` | `ArrowUp` |
| `DatabaseIcon` | `Database` |
| `TrayIcon` | `Inbox` |
| `SirenIcon` | `Siren` |
| `BellRingingIcon` | `BellRing` |
| `ActivityIcon` | `Activity` |
| `ClockIcon` | `Clock3` |
| `ListChecksIcon` | `ListChecks` |
| `ShieldWarningIcon` | `ShieldAlert` |
| `UsersIcon` | `Users` |
| `ArrowLeftIcon` | `ArrowLeft` |
| `PrinterIcon` | `Printer` |
| `BroadcastIcon` | `RadioTower` |
| `CheckCircleIcon` | `CircleCheck` |
| `ChartBarIcon` | `BarChart3` |
| `DotsThreeIcon` | `MoreHorizontal` |

Every new import comes from:

```js
import { IconName } from 'lucide-react';
```

Use regular stroke icons. Do not replace RF illustrations, Mapbox symbols,
tower SVG elements, or chart marks with Lucide icons.

- [ ] **Step 4: Remove the unused dependency**

Run from `frontend`:

```powershell
npm uninstall @phosphor-icons/react --ignore-scripts
rg -n "@phosphor-icons/react" src package.json
```

Expected: `rg` returns no matches.

- [ ] **Step 5: Run icon and component contracts**

Run:

```powershell
node --test src/__tests__/themeRedesignContracts.test.js src/__tests__/dashboardFilterContracts.test.js src/__tests__/impactServiceShadcnContracts.test.js src/__tests__/rfTiltContracts.test.js
npx eslint src/components src/features src/pages/ActivityEnomPage.jsx src/pages/TicketingPage.jsx src/pages/TransportQualityPage.jsx
```

Expected: tests and lint PASS.

- [ ] **Step 6: Commit icon standardization**

Run from the repository root:

```powershell
git add frontend/src/components/Header.jsx frontend/src/components/dashboard-filters/DashboardFilters.jsx frontend/src/components/ui/calendar.jsx frontend/src/components/ui/checkbox.jsx frontend/src/components/ui/command.jsx frontend/src/components/ui/dialog.jsx frontend/src/components/ui/pagination.jsx frontend/src/components/ui/select.jsx frontend/src/components/ui/sheet.jsx frontend/src/features/data-potensi/DataPotensiSiteTable.jsx frontend/src/features/impact-service/ImpactServiceAlarmDialog.jsx frontend/src/features/impact-service/ImpactServiceAlarmTable.jsx frontend/src/features/impact-service/ImpactServiceCharts.jsx frontend/src/features/impact-service/ImpactServiceFilters.jsx frontend/src/features/impact-service/ImpactServiceHeader.jsx frontend/src/features/impact-service/ImpactServiceKpiGrid.jsx frontend/src/features/impact-service/ImpactServiceStates.jsx frontend/src/features/impact-service/ImpactServiceTopAlarms.jsx frontend/src/features/rf-tilt/RfTiltAntennaSpecPanel.jsx frontend/src/features/rf-tilt/RfTiltExportButton.jsx frontend/src/features/rf-tilt/RfTiltParamForm.jsx frontend/src/pages/ActivityEnomPage.jsx frontend/src/pages/TicketingPage.jsx frontend/src/pages/TransportQualityPage.jsx frontend/src/__tests__/themeRedesignContracts.test.js frontend/package.json frontend/package-lock.json
git commit -m "refactor: standardize dashboard icons on Lucide"
```

## Task 5: Migrate Command Center, Reporting, and Data Potensi visual surfaces

**Files:**

- Modify: `frontend/src/pages/HomePage.jsx`
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Modify: `frontend/src/pages/DataPotensiPage.jsx`
- Modify: `frontend/src/features/data-potensi/DataPotensiSiteTable.jsx`
- Modify: `frontend/src/__tests__/homePageContracts.test.js`
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Modify: `frontend/src/__tests__/dataPotensiContracts.test.js`
- Modify: `frontend/src/__tests__/themeRedesignContracts.test.js`

- [ ] **Step 1: Add failing visual contracts for the three executive pages**

Add assertions to each page contract:

```js
assert.doesNotMatch(page, /text-cyan-|bg-cyan-|border-cyan-|#22D3EE|#0EA5E9|#38BDF8/i);
assert.doesNotMatch(page, /shadow-\[0_0_|blur-sm/);
assert.match(page, /DashboardChartPanel|DashboardTableShell/);
```

For Home and Reporting also assert their config imports:

```js
assert.match(page, /homeChartConfig/);       // Home
assert.match(page, /reportingChartConfig/);  // Reporting
```

For Data Potensi:

```js
assert.match(page, /dataPotensiChartConfig/);
```

- [ ] **Step 2: Run the three page contracts and verify failure**

Run:

```powershell
node --test src/__tests__/homePageContracts.test.js src/__tests__/dashboardReportingContracts.test.js src/__tests__/dataPotensiContracts.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: FAIL on old cyan classes, direct hex series, or missing config imports.

- [ ] **Step 3: Apply semantic chart roles and shared chrome**

Import the page configs:

```js
import { homeChartConfig } from '../features/home/homeChartConfig';
import { reportingChartConfig } from '../features/reporting/reportingChartConfig';
import { dataPotensiChartConfig } from '../features/data-potensi/dataPotensiChartConfig';
```

Use config colors by data key:

```jsx
stroke={homeChartConfig.total_revenue.color}
fill={homeChartConfig.total_revenue.color}
```

Use restrained gradient stops:

```jsx
<stop offset="5%" stopColor={config.color} stopOpacity={0.14} />
<stop offset="95%" stopColor={config.color} stopOpacity={0} />
```

Replace page-local panel title rows with `DashboardChartPanel`,
`DashboardTableShell`, or `DashboardPanelHeader`. Replace cyan text with
`text-[var(--text-primary)]`, `text-[var(--text-secondary)]`, or the correct
semantic success/warning/danger role.

Do not implement the functional Trend, Proker, Backup Sukses, or Battery Type
changes here; those belong to implementation track 2.

- [ ] **Step 4: Preserve tables and print behavior**

Keep Reporting’s `reporting-export-root`, print metadata, `@media print`
behavior, filters, sorting, and table data. Apply the new visual tokens to the
screen surface, but leave print overrides explicitly white.

Use local table scrolling:

```jsx
<div className="max-w-full overflow-x-auto overscroll-x-contain">
  <table className="min-w-max text-left">
    {children}
  </table>
</div>
```

- [ ] **Step 5: Run the executive-page contracts**

Run:

```powershell
node --test src/__tests__/homePageContracts.test.js src/__tests__/dashboardReportingContracts.test.js src/__tests__/dataPotensiContracts.test.js src/__tests__/themeRedesignContracts.test.js
npx eslint src/pages/HomePage.jsx src/pages/NetworkReportingPage.jsx src/pages/DataPotensiPage.jsx src/features/data-potensi
```

Expected: PASS.

- [ ] **Step 6: Commit executive-page styling**

Run from the repository root:

```powershell
git add frontend/src/pages/HomePage.jsx frontend/src/pages/NetworkReportingPage.jsx frontend/src/pages/DataPotensiPage.jsx frontend/src/features/data-potensi/DataPotensiSiteTable.jsx frontend/src/__tests__/homePageContracts.test.js frontend/src/__tests__/dashboardReportingContracts.test.js frontend/src/__tests__/dataPotensiContracts.test.js frontend/src/__tests__/themeRedesignContracts.test.js
git commit -m "feat: restyle executive dashboard surfaces"
```

## Task 6: Migrate Activity, Impact Service, Transport Quality, and Ticketing

**Files:**

- Modify: `frontend/src/pages/ActivityEnomPage.jsx`
- Modify: `frontend/src/features/activity-enom/ActivityEnomCharts.jsx`
- Modify: `frontend/src/pages/ImpactServicePage.jsx`
- Modify: all `frontend/src/features/impact-service/*.jsx` chrome files
- Modify: `frontend/src/pages/TransportQualityPage.jsx`
- Modify: `frontend/src/features/transport-quality/TransportQualityCharts.jsx`
- Modify: `frontend/src/pages/TicketingPage.jsx`
- Modify: `frontend/src/features/ticketing/TicketingCharts.jsx`
- Modify: the four corresponding contract-test files

- [ ] **Step 1: Add failing anti-cyan and shared-state assertions**

For each page plus chart module:

```js
assert.doesNotMatch(surface, /#22D3EE|#0EA5E9|#38BDF8|text-cyan-|bg-cyan-/i);
assert.match(surface, /DashboardChartPanel/);
assert.match(surface, /DashboardChartTooltipContent/);
assert.match(surface, /DashboardChartEmpty|ChartEmptyState/);
assert.doesNotMatch(surface, /box-shadow:\s*0 0|shadow-\[0_0_/i);
```

Keep the existing data-key and chart-type assertions.

- [ ] **Step 2: Run the domain contracts and verify failure**

Run:

```powershell
node --test src/__tests__/activityEnomContracts.test.js src/__tests__/impactServiceShadcnContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js
```

Expected: FAIL on direct colors or old card/icon treatments.

- [ ] **Step 3: Apply the shared chart and panel language**

For every Cartesian chart use:

```jsx
<CartesianGrid
  vertical={false}
  stroke="var(--chart-grid)"
  strokeDasharray="3 5"
/>
<XAxis
  tickLine={false}
  axisLine={false}
  tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
/>
```

Use `DashboardChartTooltipContent`, compact legends, `accessibilityLayer`, and
explicit `h-[220px] w-full aspect-auto` chart containers. Keep success, warning,
and danger colors attached to their existing business meaning.

Replace one-off chart-card headers and KPI icon glows with shared primitives.
Preserve filters, API calls, table columns, sorting, dialogs, print behavior,
and business labels.

- [ ] **Step 4: Run domain tests and lint**

Run:

```powershell
node --test src/__tests__/activityEnomContracts.test.js src/__tests__/impactServiceShadcnContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js src/__tests__/dashboardChartContracts.test.js
npx eslint src/pages/ActivityEnomPage.jsx src/pages/ImpactServicePage.jsx src/pages/TransportQualityPage.jsx src/pages/TicketingPage.jsx src/features/activity-enom src/features/impact-service src/features/transport-quality src/features/ticketing
```

Expected: PASS.

- [ ] **Step 5: Commit operational-domain styling**

Run from the repository root:

```powershell
git add frontend/src/pages/ActivityEnomPage.jsx frontend/src/features/activity-enom/ActivityEnomCharts.jsx frontend/src/pages/ImpactServicePage.jsx frontend/src/features/impact-service/ImpactServiceAlarmDialog.jsx frontend/src/features/impact-service/ImpactServiceAlarmTable.jsx frontend/src/features/impact-service/ImpactServiceCharts.jsx frontend/src/features/impact-service/ImpactServiceFilters.jsx frontend/src/features/impact-service/ImpactServiceHeader.jsx frontend/src/features/impact-service/ImpactServiceKpiGrid.jsx frontend/src/features/impact-service/ImpactServiceStates.jsx frontend/src/features/impact-service/ImpactServiceTopAlarms.jsx frontend/src/pages/TransportQualityPage.jsx frontend/src/features/transport-quality/TransportQualityCharts.jsx frontend/src/pages/TicketingPage.jsx frontend/src/features/ticketing/TicketingCharts.jsx frontend/src/__tests__/activityEnomContracts.test.js frontend/src/__tests__/impactServiceShadcnContracts.test.js frontend/src/__tests__/transportQualityContracts.test.js frontend/src/__tests__/ticketingContracts.test.js frontend/src/__tests__/dashboardChartContracts.test.js
git commit -m "feat: align operational pages with graphite visual system"
```

## Task 7: Restyle Site Map chrome without changing the map core

**Files:**

- Modify: `frontend/src/pages/SiteMapPage.jsx`
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/components/Header.jsx`
- Modify: `frontend/src/components/Breadcrumb.jsx`
- Modify: `frontend/src/components/AvailabilityChart.jsx`
- Modify: `frontend/src/components/SiteDetailModal.jsx`
- Modify: `frontend/src/components/SiteTable.jsx`
- Modify: `frontend/src/components/SummaryCards.jsx`
- Modify: `frontend/src/components/WorstSitesPanel.jsx`
- Modify: `frontend/src/components/FilterPanel.jsx`
- Do not modify map-layer logic in: `frontend/src/components/MapboxMap.jsx`
- Test: `frontend/src/__tests__/mapResilienceContracts.test.js`
- Test: `frontend/src/__tests__/mapDomSecurity.test.js`
- Test: `frontend/src/__tests__/themeRedesignContracts.test.js`

- [ ] **Step 1: Capture the protected Mapbox file checksum**

Run from the repository root:

```powershell
$mapHashBefore = (Get-FileHash frontend/src/components/MapboxMap.jsx -Algorithm SHA256).Hash
$mapHashBefore | Set-Content .git/mapbox-core-before.txt
```

Expected: one SHA-256 value stored inside `.git`, not the worktree.

- [ ] **Step 2: Add failing chrome contracts**

Extend the map/theme tests:

```js
for (const componentName of [
  'Header.jsx',
  'Breadcrumb.jsx',
  'AvailabilityChart.jsx',
  'SiteDetailModal.jsx',
  'SiteTable.jsx',
  'SummaryCards.jsx',
  'WorstSitesPanel.jsx',
]) {
  const component = src('components', componentName);
  assert.doesNotMatch(component, /#22D3EE|#0EA5E9|#38BDF8|shadow-\[0_0_/i, componentName);
}
```

- [ ] **Step 3: Run the map contracts and verify failure**

Run from `frontend`:

```powershell
node --test src/__tests__/mapResilienceContracts.test.js src/__tests__/mapDomSecurity.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: FAIL on legacy chrome colors; map security/resilience tests remain
unchanged.

- [ ] **Step 4: Restyle only surrounding map UI**

Use shared panels, semantic controls, graphite tooltips, stronger light borders,
and Lucide icons in the listed files. Keep map sources, layers, filters,
coordinates, markers, popups’ business content, and interaction logic intact.

Map toggles use:

```css
.nod-map-toggle {
  border: 1px solid var(--border-strong);
  background: var(--bg-glass);
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
}

.nod-map-toggle--active {
  border-color: color-mix(in srgb, var(--primary) 42%, var(--border-strong));
  background: var(--sidebar-active);
  color: var(--text-primary);
}
```

- [ ] **Step 5: Prove the map core is unchanged**

Run from the repository root:

```powershell
$mapHashAfter = (Get-FileHash frontend/src/components/MapboxMap.jsx -Algorithm SHA256).Hash
$mapHashBefore = Get-Content .git/mapbox-core-before.txt
if ($mapHashAfter -ne $mapHashBefore) { throw "Protected Mapbox core changed" }
```

Expected: no output and exit code 0.

- [ ] **Step 6: Run map tests and commit**

Run from `frontend`:

```powershell
node --test src/__tests__/mapResilienceContracts.test.js src/__tests__/mapDomSecurity.test.js src/__tests__/themeRedesignContracts.test.js
npx eslint src/pages/SiteMapPage.jsx src/pages/DashboardPage.jsx src/components
```

Expected: PASS.

Then from the repository root:

```powershell
git add frontend/src/pages/SiteMapPage.jsx frontend/src/pages/DashboardPage.jsx frontend/src/components/Header.jsx frontend/src/components/Breadcrumb.jsx frontend/src/components/AvailabilityChart.jsx frontend/src/components/SiteDetailModal.jsx frontend/src/components/SiteTable.jsx frontend/src/components/SummaryCards.jsx frontend/src/components/WorstSitesPanel.jsx frontend/src/components/FilterPanel.jsx frontend/src/index.css frontend/src/__tests__/mapResilienceContracts.test.js frontend/src/__tests__/mapDomSecurity.test.js frontend/src/__tests__/themeRedesignContracts.test.js
git commit -m "feat: refine site map dashboard chrome"
```

## Task 8: Restyle RF Tilt, Tower Visualizer chrome, and Login while preserving engineering output

**Files:**

- Modify: `frontend/src/pages/RfTiltAnalysisPage.jsx`
- Modify: `frontend/src/features/rf-tilt/RfTiltAntennaSpecPanel.jsx`
- Modify: `frontend/src/features/rf-tilt/RfTiltExportButton.jsx`
- Modify: `frontend/src/features/rf-tilt/RfTiltParamForm.jsx`
- Modify: `frontend/src/features/rf-tilt/RfTiltResultPanel.jsx`
- Modify: `frontend/src/pages/TowerPlanGeneratorPage.jsx` chrome only
- Modify: `frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx` chrome only
- Modify: `frontend/src/features/tower-plan/TowerPlanAutofillDialog.jsx` chrome only
- Modify: `frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx` chrome only
- Modify: `frontend/src/features/tower-plan/TowerPlanPreview.jsx` shell only
- Modify: `frontend/src/features/tower-plan/TowerPlanPreviewDialog.jsx` shell only
- Modify: `frontend/src/pages/LoginPage.jsx`
- Do not modify the protected RF/tower files listed in Scope.
- Test: `frontend/src/__tests__/rfTiltContracts.test.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`
- Test: `frontend/src/__tests__/authSecurityContracts.test.js`

- [ ] **Step 1: Capture protected RF/tower checksums**

Run from the repository root:

```powershell
$protected = @(
  'frontend/src/features/rf-tilt/RfTiltMap.jsx',
  'frontend/src/features/rf-tilt/rfTiltChartConfig.js',
  'frontend/src/features/tower-plan/towerPlanGeometry.js',
  'frontend/src/features/tower-plan/towerPlanSvg.js',
  'frontend/src/features/tower-plan/towerPlanDocument.js'
)
$protected | ForEach-Object {
  "$_`t$((Get-FileHash $_ -Algorithm SHA256).Hash)"
} | Set-Content .git/protected-engineering-before.txt
```

- [ ] **Step 2: Add failing chrome-only contracts**

Add:

```js
assert.doesNotMatch(pageChrome, /#22D3EE|#0EA5E9|#38BDF8|shadow-\[0_0_/i);
assert.match(pageChrome, /var\(--border-strong\)|DashboardPanelHeader|DashboardPageHeader/);
```

Retain all geometry, SVG, export, antenna, RF calculation, and map contracts
already present.

- [ ] **Step 3: Apply graphite styling to chrome only**

Use shared page/panel headers, semantic form controls, clear light-mode borders,
neutral icon containers, and no glow. Do not change `RF_COLORS`, RF map layers,
tower drawing coordinates, persisted plan schema, or export functions.

Login uses the same canvas and one strong authentication panel:

```jsx
<div className="dashboard-canvas flex min-h-screen items-center justify-center p-4">
  <section className="w-full max-w-md rounded-[var(--noc-radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-glass)] p-6 shadow-[var(--shadow-lg)]">
    {children}
  </section>
</div>
```

- [ ] **Step 4: Prove protected engineering files are unchanged**

Run from the repository root:

```powershell
Get-Content .git/protected-engineering-before.txt | ForEach-Object {
  $path, $before = $_ -split "`t", 2
  $after = (Get-FileHash $path -Algorithm SHA256).Hash
  if ($after -ne $before) { throw "Protected engineering file changed: $path" }
}
```

Expected: no output and exit code 0.

- [ ] **Step 5: Run focused tests and commit**

Run from `frontend`:

```powershell
node --test src/__tests__/rfTiltContracts.test.js src/__tests__/towerPlanContracts.test.js src/__tests__/authSecurityContracts.test.js src/__tests__/themeRedesignContracts.test.js
npx eslint src/pages/RfTiltAnalysisPage.jsx src/pages/TowerPlanGeneratorPage.jsx src/pages/LoginPage.jsx src/features/rf-tilt src/features/tower-plan
```

Expected: PASS.

Then from the repository root:

```powershell
git add frontend/src/pages/RfTiltAnalysisPage.jsx frontend/src/features/rf-tilt/RfTiltAntennaSpecPanel.jsx frontend/src/features/rf-tilt/RfTiltExportButton.jsx frontend/src/features/rf-tilt/RfTiltParamForm.jsx frontend/src/features/rf-tilt/RfTiltResultPanel.jsx frontend/src/pages/TowerPlanGeneratorPage.jsx frontend/src/features/tower-plan/TowerPlanAntennaEditor.jsx frontend/src/features/tower-plan/TowerPlanAutofillDialog.jsx frontend/src/features/tower-plan/TowerPlanDocumentEditor.jsx frontend/src/features/tower-plan/TowerPlanPreview.jsx frontend/src/features/tower-plan/TowerPlanPreviewDialog.jsx frontend/src/pages/LoginPage.jsx frontend/src/__tests__/rfTiltContracts.test.js frontend/src/__tests__/towerPlanContracts.test.js frontend/src/__tests__/authSecurityContracts.test.js frontend/src/__tests__/themeRedesignContracts.test.js
git commit -m "feat: align engineering tools with graphite chrome"
```

## Task 9: Run full visual verification in dark/light and desktop/mobile

**Files:**

- Modify: `e2e-playwright.spec.js`
- Test: all frontend contract tests

- [ ] **Step 1: Add a cross-route visual-system smoke test**

Add:

```js
test('graphite visual system separates panels in both themes and mobile', async ({ page }) => {
  const routes = [
    '/home',
    '/site-map',
    '/reporting',
    '/impact-service',
    '/activity-enom',
    '/transport-quality',
    '/ticketing',
    '/data-potensi',
    '/rf-tilt-analysis',
    '/tower-plan-generator',
  ];

  for (const theme of ['dark', 'light']) {
    await authenticate(page, theme);
    for (const route of routes) {
      await page.goto(`${E2E_BASE_URL}${route}`);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('dashboard-sidebar')).toBeVisible();
      const tokenSnapshot = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          canvas: root.getPropertyValue('--bg-base').trim(),
          panel: root.getPropertyValue('--bg-surface').trim(),
          border: root.getPropertyValue('--border-strong').trim(),
          accent: root.getPropertyValue('--brand-red').trim(),
        };
      });
      expect(tokenSnapshot.canvas).not.toBe(tokenSnapshot.panel);
      expect(tokenSnapshot.border).not.toBe('');
      expect(tokenSnapshot.accent.toUpperCase()).toBe('#E60012');
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${E2E_BASE_URL}/home`);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBeTruthy();
});
```

Use the existing request fixtures where a route needs deterministic API data.
Do not weaken authentication or map assertions to make the smoke test pass.

- [ ] **Step 2: Run the complete frontend contract suite**

Run from `frontend`:

```powershell
node --test src/__tests__/*.test.js
```

Expected: all contract/unit tests PASS.

- [ ] **Step 3: Run lint and production build**

Run:

```powershell
npm run lint
npm run build
```

Expected: both commands exit 0. If a pre-existing unrelated failure appears,
capture the exact command and output before deciding whether it belongs to this
track.

- [ ] **Step 4: Run authenticated browser checks**

Start backend and frontend using the repository’s established local
environment, then run from the repository root:

```powershell
npx playwright test e2e-playwright.spec.js -g "graphite visual system|Activity ENOM|Ticketing|Impact Service|Transport Quality"
```

Expected: PASS in dark/light and the 390×844 mobile viewport.

Additionally inspect representative screenshots at:

- 1440×900 dark;
- 1440×900 light;
- 390×844 dark;
- 390×844 light.

Confirm that light panels have visible boundaries, red is restrained, chart
labels remain readable, and protected map/tower visuals are unchanged.

- [ ] **Step 5: Commit visual verification**

Run from the repository root:

```powershell
git add e2e-playwright.spec.js
git commit -m "test: verify graphite dashboard visual system"
```

## Completion checkpoint

Before starting implementation track 2:

```powershell
git status --short
git log --oneline -9
```

Expected:

- no tracked uncommitted changes from this track;
- unrelated pre-existing untracked files remain untouched;
- nine focused commits or an equivalent reviewed commit sequence;
- full frontend tests, lint, build, and focused browser checks pass.
