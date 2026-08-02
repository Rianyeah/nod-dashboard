# Dashboard Visual Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memperbaiki Login, antenna Notes, mixed-scale Transport Quality chart, Home chart colors, dan light-mode sidebar tanpa mengubah API atau visual inti tower.

**Architecture:** Perubahan memakai targeted modular patch. Lifecycle Vanta diisolasi pada satu komponen auth, perhitungan axis Transport dibuat sebagai helper murni, sedangkan SVG Notes, chart colors, dan sidebar tetap memakai generator serta token existing. Setiap behavior dimulai dengan failing regression test dan diselesaikan dalam commit terpisah.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, Recharts 3, Three.js, Vanta.js, Lucide React, Node test runner, ESLint.

---

## File Map

- Create `frontend/src/features/auth/LoginFogBackground.jsx`: lifecycle, fallback, dan cleanup Vanta Fog.
- Modify `frontend/src/pages/LoginPage.jsx`: copy Login dan password visibility.
- Modify `frontend/src/__tests__/authSecurityContracts.test.js`: kontrak Login baru dan lazy Vanta integration.
- Modify `frontend/src/features/tower-plan/towerPlanSvg.js`: memasukkan Notes ke dynamic callout layout.
- Modify `frontend/src/__tests__/towerPlanContracts.test.js`: regression test Notes SVG.
- Create `frontend/src/features/transport-quality/transportQualityTrendAxes.js`: pure mixed-scale axis resolver.
- Modify `frontend/src/features/transport-quality/TransportQualityCharts.jsx`: dual Y-axis wiring.
- Modify `frontend/src/__tests__/transportQualityContracts.test.js`: unit dan integration contracts axis.
- Modify `frontend/src/features/home/homeChartConfig.js`: tiga warna chart yang berbeda.
- Modify `frontend/src/__tests__/homePageContracts.test.js`: color mapping contract.
- Modify `frontend/src/index.css`: sidebar background token dan light-mode scoped contrast.
- Modify `frontend/src/components/DashboardSidebar.jsx`: menggunakan CSS background owner.
- Modify `frontend/src/__tests__/themeRedesignContracts.test.js`: sidebar light-mode regression contract.

## Task 1: Login Copy, Password Visibility, dan Vanta Fog

**Files:**
- Create: `frontend/src/features/auth/LoginFogBackground.jsx`
- Modify: `frontend/src/pages/LoginPage.jsx`
- Test: `frontend/src/__tests__/authSecurityContracts.test.js`

- [ ] **Step 1: Write the failing Login contracts**

Tambahkan test berikut ke suite `cookie session authentication contracts`:

First change the existing file-system import to:

```js
import { existsSync, readFileSync } from 'node:fs';
```

Update the existing shared-canvas contract so it reads the new background owner:

```js
const fogPath = resolve(process.cwd(), 'src', 'features', 'auth', 'LoginFogBackground.jsx');

assert.equal(existsSync(fogPath), true);

const fog = readFileSync(fogPath, 'utf8');
const surface = `${login}\n${fog}`;

assert.match(surface, /dashboard-canvas/);
```

Then add:

```js

it('uses the approved NOD copy, password visibility, and isolated Vanta fog', () => {
  const login = src('pages', 'LoginPage.jsx');
  const fogPath = resolve(process.cwd(), 'src', 'features', 'auth', 'LoginFogBackground.jsx');

  assert.equal(existsSync(fogPath), true);

  const fog = readFileSync(fogPath, 'utf8');
  const surface = `${login}\n${fog}`;

  assert.match(login, />\s*NOD\s*</);
  assert.match(login, /All in one Dashboard ENOM and Tools/);
  assert.doesNotMatch(login, />\s*NOD Dashboard\s*</);
  assert.match(login, /showPassword/);
  assert.match(login, /type=\{showPassword \? 'text' : 'password'\}/);
  assert.match(login, /aria-pressed=\{showPassword\}/);
  assert.match(login, /Show password/);
  assert.match(login, /Hide password/);
  assert.match(login, /EyeOff/);
  assert.match(login, /Eye/);
  assert.match(fog, /import\('three'\)/);
  assert.match(fog, /import\('vanta\/dist\/vanta\.fog\.min\.js'\)/);
  assert.match(fog, /midtoneColor:\s*0xe60013/);
  assert.match(fog, /blurFactor:\s*0\.64/);
  assert.match(fog, /speed:\s*2\.6/);
  assert.match(fog, /zoom:\s*1\.3/);
  assert.match(fog, /prefers-reduced-motion:\s*reduce/);
  assert.match(fog, /fogEffect\?\.destroy\?\.\(\)/);
  assert.match(surface, /min-h-\[100dvh\]/);
});
```

- [ ] **Step 2: Run the Login contract and verify RED**

Run: `node --test src/__tests__/authSecurityContracts.test.js`

Expected: FAIL on `existsSync(fogPath)` because `LoginFogBackground.jsx` and the approved Login behavior are absent.

- [ ] **Step 3: Create the isolated Vanta component**

Create `frontend/src/features/auth/LoginFogBackground.jsx`:

```jsx
import { useEffect, useRef } from 'react';

export const VANTA_FOG_OPTIONS = Object.freeze({
  mouseControls: true,
  touchControls: true,
  gyroControls: false,
  minHeight: 200,
  minWidth: 200,
  highlightColor: 0x000000,
  midtoneColor: 0xe60013,
  lowlightColor: 0x000000,
  baseColor: 0x000000,
  blurFactor: 0.64,
  speed: 2.6,
  zoom: 1.3,
});

export default function LoginFogBackground({ children }) {
  const targetRef = useRef(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reducedMotion) return undefined;

    let cancelled = false;
    let fogEffect;

    async function mountFog() {
      try {
        const [THREE, fogModule] = await Promise.all([
          import('three'),
          import('vanta/dist/vanta.fog.min.js'),
        ]);
        if (cancelled || !targetRef.current) return;
        const createFog = fogModule.default ?? fogModule;
        fogEffect = createFog({ ...VANTA_FOG_OPTIONS, THREE, el: targetRef.current });
      } catch {
        // The static graphite-red background remains fully usable.
      }
    }

    mountFog();
    return () => {
      cancelled = true;
      fogEffect?.destroy?.();
    };
  }, []);

  return (
    <div
      ref={targetRef}
      className="dashboard-canvas relative min-h-[100dvh] overflow-hidden bg-[#090B0F]"
      data-testid="login-fog-background"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(9,11,15,0.18)_58%,rgba(9,11,15,0.62)_100%)]"
      />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Update LoginPage copy and password control**

Add the icon and component imports:

```jsx
import { ArrowRight, Eye, EyeOff, Lock, Moon, Sun, User } from 'lucide-react';
import LoginFogBackground from '../features/auth/LoginFogBackground';
```

Add `const [showPassword, setShowPassword] = useState(false);`. Replace the root `div` with `LoginFogBackground`, retain all current children, and close with `</LoginFogBackground>`. Replace the heading and footer with:

```jsx
<h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">NOD</h1>
<p className="mt-6 text-center text-[10px] tracking-wide text-[var(--text-muted)]">
  All in one Dashboard ENOM and Tools
</p>
```

Replace the complete password field content with:

```jsx
<div className="relative">
  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
  <input
    id="login-password"
    type={showPassword ? 'text' : 'password'}
    value={password}
    onChange={(event) => setPassword(event.target.value)}
    className="dashboard-control w-full rounded-lg py-2.5 pl-10 pr-11 outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/20"
    placeholder="Enter password"
    required
    autoComplete="current-password"
  />
  <button
    type="button"
    onClick={() => setShowPassword((visible) => !visible)}
    aria-label={showPassword ? 'Hide password' : 'Show password'}
    aria-pressed={showPassword}
    className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
  >
    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
  </button>
</div>
```

- [ ] **Step 5: Verify GREEN and commit Login behavior**

Run: `node --test src/__tests__/authSecurityContracts.test.js`

Expected: 4 tests pass and 0 fail.

```powershell
git add frontend/src/features/auth/LoginFogBackground.jsx frontend/src/pages/LoginPage.jsx frontend/src/__tests__/authSecurityContracts.test.js
git commit -m "feat: enhance login experience"
```

## Task 2: Antenna Notes in Tower SVG Callouts

**Files:**
- Modify: `frontend/src/features/tower-plan/towerPlanSvg.js`
- Test: `frontend/src/__tests__/towerPlanContracts.test.js`

- [ ] **Step 1: Write the failing Notes regression test**

```js
it('renders escaped antenna notes in dynamic callout height', () => {
  const base = createBlankTowerPlan();
  const antenna = {
    id: 'antenna-note',
    name: 'Sector Antenna',
    operator: 'TSEL',
    status: 'Existing',
    sector: '1',
    height: 42,
    azimuth: 120,
    mechanicalTilt: 1,
    leg: 'A',
    color: '#334155',
    cids: ['11'],
    note: 'Verify <bracket> & feeder route before installation and confirm final mounting clearance with the field team.',
  };
  const withNote = { ...base, towerHeight: 50, antennas: [antenna] };
  const withoutNote = { ...withNote, antennas: [{ ...antenna, note: '' }] };
  const notedSvg = renderTowerPlanSvg(withNote);
  const blankSvg = renderTowerPlanSvg(withoutNote);
  const notedHeight = Number(notedSvg.match(/data-callout-card="1"[^>]+height="([\d.]+)"/)[1]);
  const blankHeight = Number(blankSvg.match(/data-callout-card="1"[^>]+height="([\d.]+)"/)[1]);

  assert.match(notedSvg, /data-callout-note-line="1"/);
  assert.match(notedSvg, /NOTE: Verify &lt;bracket&gt; &amp; feeder route/);
  assert.ok((notedSvg.match(/data-callout-note-line=/g) || []).length <= 3);
  assert.doesNotMatch(notedSvg, /<bracket>/);
  assert.doesNotMatch(blankSvg, /data-callout-note-line=/);
  assert.ok(notedHeight > blankHeight);
});
```

- [ ] **Step 2: Run the Tower contract and verify RED**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: FAIL because antenna Notes are omitted from callout SVG.

- [ ] **Step 3: Include wrapped Notes in `antennaCallouts()`**

After `const cids = normalizeCids(...)`, add:

```js
const note = String(antenna.note || '').trim();
const noteLines = note
  ? wrapSvgText(`NOTE: ${note}`, typography.wrapCharacters, 3)
  : [];
```

Replace `details` and add its offset:

```js
const details = [
  `SECTOR: ${antenna.sector} \u00b7 ${positionLabel}: ${antenna.leg} \u00b7 ${displayNumber(antenna.height) || 'N/A'} m`,
  `AZIMUTH: ${displayNumber(antenna.azimuth) || 'N/A'}\u00b0`,
  `CID(S): ${cids.length ? cids.join(', ') : 'N/A'}`,
  ...(tiltText ? [tiltText] : []),
  ...noteLines,
];
const noteLineOffset = details.length - noteLines.length;
```

Add `noteLineOffset` to the arranged return object and both destructuring sites. Replace `detailMarkup` with:

```js
const detailMarkup = details.map((detail, detailIndex) => {
  const noteLineNumber = detailIndex >= noteLineOffset
    ? detailIndex - noteLineOffset + 1
    : null;
  const noteAttribute = noteLineNumber === null
    ? ''
    : ` data-callout-note-line="${noteLineNumber}"`;
  return `<text${noteAttribute} x="${cardX + 13}" y="${cardY + headerHeight + typography.size + 2 + detailIndex * detailLineHeight}" fill="#26384d" font-size="${typography.size}">${escapeXml(detail)}</text>`;
}).join('');
```

- [ ] **Step 4: Verify GREEN and commit Tower Notes**

Run: `node --test src/__tests__/towerPlanContracts.test.js`

Expected: all Tower tests pass, including overlap checks.

```powershell
git add frontend/src/features/tower-plan/towerPlanSvg.js frontend/src/__tests__/towerPlanContracts.test.js
git commit -m "fix: render antenna notes in tower preview"
```

## Task 3: Mixed-scale Resolver for Transport Quality

**Files:**
- Create: `frontend/src/features/transport-quality/transportQualityTrendAxes.js`
- Test: `frontend/src/__tests__/transportQualityContracts.test.js`

- [ ] **Step 1: Create a compile-safe placeholder and write failing resolver tests**

Create `frontend/src/features/transport-quality/transportQualityTrendAxes.js` with this deliberately incomplete behavior:

```js
const KEYS = [
  'pl_over_1_sites',
  'latency_over_5_sites',
  'jitter_not_clear_sites',
  'thi_fail_sites',
];

export function resolveTransportTrendAxes() {
  return {
    axisBySeries: Object.fromEntries(KEYS.map((key) => [key, 'small'])),
    hasLargeSeries: false,
  };
}
```

Then add:

Add:

```js
import { resolveTransportTrendAxes } from '../features/transport-quality/transportQualityTrendAxes.js';
```

```js
it('separates 0-50 trend series from large series without changing values', () => {
  const rows = [
    { pl_over_1_sites: 12, latency_over_5_sites: 1000, jitter_not_clear_sites: 4, thi_fail_sites: 2 },
    { pl_over_1_sites: 48, latency_over_5_sites: 1420, jitter_not_clear_sites: 7, thi_fail_sites: 3 },
  ];
  const result = resolveTransportTrendAxes(rows);
  assert.deepEqual(result.axisBySeries, {
    pl_over_1_sites: 'small',
    latency_over_5_sites: 'large',
    jitter_not_clear_sites: 'small',
    thi_fail_sites: 'small',
  });
  assert.equal(result.hasLargeSeries, true);
  assert.equal(rows[1].latency_over_5_sites, 1420);
});

it('handles all-small, all-large, and invalid trend values', () => {
  const allSmall = resolveTransportTrendAxes([{ pl_over_1_sites: 50 }]);
  const allLarge = resolveTransportTrendAxes([{
    pl_over_1_sites: 51,
    latency_over_5_sites: 60,
    jitter_not_clear_sites: 70,
    thi_fail_sites: 80,
  }]);
  const invalid = resolveTransportTrendAxes([{
    pl_over_1_sites: null,
    latency_over_5_sites: '',
    jitter_not_clear_sites: Number.NaN,
    thi_fail_sites: -5,
  }]);
  assert.equal(allSmall.hasLargeSeries, false);
  assert.ok(Object.values(allSmall.axisBySeries).every((axis) => axis === 'small'));
  assert.equal(allLarge.hasLargeSeries, true);
  assert.ok(Object.values(allLarge.axisBySeries).every((axis) => axis === 'large'));
  assert.ok(Object.values(invalid.axisBySeries).every((axis) => axis === 'small'));
});
```

- [ ] **Step 2: Run Transport contract and verify RED**

Run: `node --test src/__tests__/transportQualityContracts.test.js`

Expected: FAIL because the placeholder incorrectly classifies `latency_over_5_sites` as `small`.

- [ ] **Step 3: Implement the pure resolver**

Create `frontend/src/features/transport-quality/transportQualityTrendAxes.js`:

```js
export const TRANSPORT_TREND_SERIES = Object.freeze([
  'pl_over_1_sites',
  'latency_over_5_sites',
  'jitter_not_clear_sites',
  'thi_fail_sites',
]);

function maximumNonNegativeValue(rows, key) {
  return rows.reduce((maximum, row) => {
    const value = Number(row?.[key]);
    return Number.isFinite(value) && value >= 0
      ? Math.max(maximum, value)
      : maximum;
  }, 0);
}

export function resolveTransportTrendAxes(rows = []) {
  const axisBySeries = Object.fromEntries(
    TRANSPORT_TREND_SERIES.map((key) => [
      key,
      maximumNonNegativeValue(rows, key) <= 50 ? 'small' : 'large',
    ]),
  );
  return {
    axisBySeries,
    hasLargeSeries: Object.values(axisBySeries).includes('large'),
  };
}
```

- [ ] **Step 4: Verify GREEN and commit the resolver**

Run: `node --test src/__tests__/transportQualityContracts.test.js`

Expected: resolver tests pass.

```powershell
git add frontend/src/features/transport-quality/transportQualityTrendAxes.js frontend/src/__tests__/transportQualityContracts.test.js
git commit -m "feat: classify transport trend chart scales"
```

## Task 4: Wire Dual Y-axis into Weekly Quality Trend

**Files:**
- Modify: `frontend/src/features/transport-quality/TransportQualityCharts.jsx`
- Test: `frontend/src/__tests__/transportQualityContracts.test.js`

- [ ] **Step 1: Add the failing chart integration contract**

Extend the existing weekly trend test with:

```js
assert.match(charts, /resolveTransportTrendAxes/);
assert.match(trendSection, /yAxisId="small"/);
assert.match(trendSection, /domain=\{\[0, 50\]\}/);
assert.match(trendSection, /yAxisId="large"/);
assert.match(trendSection, /orientation="right"/);
assert.match(trendSection, /trendAxes\.axisBySeries\.pl_over_1_sites/);
assert.match(trendSection, /trendAxes\.axisBySeries\.latency_over_5_sites/);
assert.match(trendSection, /trendAxes\.axisBySeries\.jitter_not_clear_sites/);
assert.match(trendSection, /trendAxes\.axisBySeries\.thi_fail_sites/);
```

- [ ] **Step 2: Run Transport contract and verify RED**

Run: `node --test src/__tests__/transportQualityContracts.test.js`

Expected: FAIL because Weekly Quality Trend still has one unkeyed Y-axis.

- [ ] **Step 3: Wire the resolver into the chart**

Add:

```jsx
import { resolveTransportTrendAxes } from './transportQualityTrendAxes';
```

After the breakdown declarations, add:

```jsx
const trendAxes = resolveTransportTrendAxes(trend);
```

Replace the single weekly `YAxis` with:

```jsx
<YAxis
  yAxisId="small"
  domain={[0, 50]}
  tickCount={6}
  tickLine={false}
  axisLine={false}
  width={36}
  tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
/>
{trendAxes.hasLargeSeries ? (
  <YAxis
    yAxisId="large"
    orientation="right"
    domain={[0, 'auto']}
    tickLine={false}
    axisLine={false}
    width={42}
    tick={{ fill: 'var(--chart-axis)', fontSize: 10 }}
  />
) : null}
```

Replace the four weekly lines with:

```jsx
<Line yAxisId={trendAxes.axisBySeries.pl_over_1_sites} type="monotone" dataKey="pl_over_1_sites" stroke="var(--color-pl_over_1_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
<Line yAxisId={trendAxes.axisBySeries.latency_over_5_sites} type="monotone" dataKey="latency_over_5_sites" stroke="var(--color-latency_over_5_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
<Line yAxisId={trendAxes.axisBySeries.jitter_not_clear_sites} type="monotone" dataKey="jitter_not_clear_sites" stroke="var(--color-jitter_not_clear_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
<Line yAxisId={trendAxes.axisBySeries.thi_fail_sites} type="monotone" dataKey="thi_fail_sites" stroke="var(--color-thi_fail_sites)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
```

- [ ] **Step 4: Verify GREEN and commit chart wiring**

Run: `node --test src/__tests__/transportQualityContracts.test.js`

Expected: all Transport Quality tests pass.

```powershell
git add frontend/src/features/transport-quality/TransportQualityCharts.jsx frontend/src/__tests__/transportQualityContracts.test.js
git commit -m "feat: expose mixed transport trend scales"
```

## Task 5: Distinguish Home Performance Colors

**Files:**
- Modify: `frontend/src/features/home/homeChartConfig.js`
- Test: `frontend/src/__tests__/homePageContracts.test.js`

- [ ] **Step 1: Write the failing Home color contract**

Add to `uses the graphite executive chart language`:

```js
const config = src('features', 'home', 'homeChartConfig.js');

assert.match(config, /total_revenue:\s*\{[^}]*DASHBOARD_CHART_COLORS\.accent/s);
assert.match(config, /total_payload:\s*\{[^}]*DASHBOARD_CHART_COLORS\.info/s);
assert.match(config, /avg_availability:\s*\{[^}]*DASHBOARD_CHART_COLORS\.warning/s);
```

- [ ] **Step 2: Run Home contract and verify RED**

Run: `node --test src/__tests__/homePageContracts.test.js`

Expected: FAIL because Revenue still uses `DASHBOARD_CHART_COLORS.neutral`.

- [ ] **Step 3: Replace the complete Home chart config**

```js
import { DASHBOARD_CHART_COLORS } from '../../components/dashboard-charts/dashboardChartUtils.js';

export const homeChartConfig = {
  total_revenue: { label: 'Revenue', color: DASHBOARD_CHART_COLORS.accent },
  total_payload: { label: 'Payload', color: DASHBOARD_CHART_COLORS.info },
  avg_availability: { label: 'Availability', color: DASHBOARD_CHART_COLORS.warning },
};
```

- [ ] **Step 4: Verify GREEN and commit Home colors**

Run: `node --test src/__tests__/homePageContracts.test.js`

Expected: all Home tests pass.

```powershell
git add frontend/src/features/home/homeChartConfig.js frontend/src/__tests__/homePageContracts.test.js
git commit -m "fix: distinguish home performance series"
```

## Task 6: Strengthen the Light-mode Sidebar

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/DashboardSidebar.jsx`
- Test: `frontend/src/__tests__/themeRedesignContracts.test.js`

- [ ] **Step 1: Write the failing sidebar theme contract**

In the original token list replace `--bg-sidebar: #CBD1D9` with `--sidebar-background`, then add:

```js
it('uses a stronger cool graphite sidebar in light mode only', () => {
  const css = src('index.css');
  const sidebar = src('components', 'DashboardSidebar.jsx');

  assert.match(css, /--sidebar-background:\s*var\(--bg-sidebar\)/);
  assert.match(css, /\[data-theme="light"\][\s\S]*--sidebar-background:\s*linear-gradient\(180deg, #CDD4DE 0%, #B8C3D0 100%\)/);
  assert.match(css, /\[data-theme="light"\] \.dashboard-sidebar\s*\{[\s\S]*--text-primary:\s*#202A36/);
  assert.match(css, /\.dashboard-sidebar\s*\{[\s\S]*background:\s*var\(--sidebar-background\)/);
  assert.doesNotMatch(sidebar, /bg-\[var\(--bg-sidebar\)\]/);
});
```

- [ ] **Step 2: Run theme contract and verify RED**

Run: `node --test src/__tests__/themeRedesignContracts.test.js`

Expected: FAIL because the gradient and scoped sidebar contrast tokens are missing.

- [ ] **Step 3: Add the sidebar theme tokens and scoped CSS**

After the dark `--bg-sidebar`, add:

```css
--sidebar-background: var(--bg-sidebar);
```

Replace the light sidebar background line with:

```css
--bg-sidebar: #C2CBD6;
--sidebar-background: linear-gradient(180deg, #CDD4DE 0%, #B8C3D0 100%);
```

Add this scoped rule before the map styles:

```css
.dashboard-sidebar {
  background: var(--sidebar-background);
}

[data-theme="light"] .dashboard-sidebar {
  --text-primary: #202A36;
  --text-secondary: #3E4B5A;
  --text-muted: #526174;
  --border: rgba(61, 73, 89, 0.20);
  --border-strong: rgba(61, 73, 89, 0.30);
  --surface-soft: rgba(255, 255, 255, 0.24);
  --sidebar-active: rgba(212, 0, 18, 0.12);
}
```

- [ ] **Step 4: Remove the conflicting Tailwind background utility**

Replace the aside class string in `DashboardSidebar.jsx` with:

```jsx
'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--border)] backdrop-blur-xl transition-[width] duration-200',
```

- [ ] **Step 5: Verify GREEN and commit sidebar polish**

Run: `node --test src/__tests__/themeRedesignContracts.test.js`

Expected: all theme redesign tests pass.

```powershell
git add frontend/src/index.css frontend/src/components/DashboardSidebar.jsx frontend/src/__tests__/themeRedesignContracts.test.js
git commit -m "style: strengthen light mode sidebar"
```

## Task 7: Full Regression and Browser QA

**Files:**
- Verify all modified frontend files.
- Store screenshots outside the repository.

- [ ] **Step 1: Run the full contract suite**

Run: `node --test src/__tests__/*.test.js`

Expected: all tests pass, 0 fail.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

Run: `npm run build`

Expected: exit code 0. Existing chunk-size warnings may be recorded, but no compilation error is allowed.

- [ ] **Step 3: Start the frontend on an explicit strict port**

Run: `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`

Expected: Vite reports `http://127.0.0.1:5174/`. If occupied, inspect the process owner before choosing another explicit port.

- [ ] **Step 4: Validate Login in Browser**

Flow: `/login` -> verify NOD copy -> type password -> Show password -> Hide password.

Evidence: nonblank DOM, Vanta canvas when WebGL is available, unchanged password value, desktop/mobile screenshots, no relevant console error or framework overlay.

- [ ] **Step 5: Validate Tower Notes in Browser**

Flow: `/tower-plan-generator` -> add or select antenna -> type distinctive Notes -> open Preview -> locate `data-callout-note-line="1"` and visible note text.

Evidence: note visible, no tested callout overlap, screenshot of note callout.

- [ ] **Step 6: Validate Transport, Home, and light sidebar**

Flows:

- `/transport-quality`: left 0-50 ticks and right large-value ticks; tooltip values remain original.
- `/home`: Revenue red, Payload cool blue, Availability amber.
- light mode: sidebar gradient, readable metadata, clear active state.

Evidence: Transport, Home, and light-sidebar screenshots plus clean relevant console logs.

- [ ] **Step 7: Run final repository checks**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no QA artifacts in the repository, and only planned files changed.

- [ ] **Step 8: Request code review before integration**

Invoke `superpowers:requesting-code-review`. Address confirmed issues with a fresh failing test, rerun the relevant task verification, then rerun the full tests, lint, and build before presenting integration choices.
