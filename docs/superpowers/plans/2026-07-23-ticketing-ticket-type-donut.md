# Ticketing Ticket Type Donut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filter-aware `Tipe Ticket INAP` Incident-versus-Event donut chart and integrate it into the approved responsive Ticketing chart grid.

**Architecture:** Extend the existing `/api/v1/ticketing/dashboard` response with a deterministic two-row `type_ticket_distribution` aggregation. Render that field through the existing Recharts and dashboard primitives, reusing donut interactions while adding focused helpers for ticket-type colors and compact Pareto labels. Keep the change inside the existing Ticketing model, router, chart configuration, chart component, and contract tests.

**Tech Stack:** FastAPI, SQLAlchemy text queries, Pydantic, PostgreSQL/Neon, React 19, Recharts 3, Tailwind CSS 4, Node test runner, Python unittest/pytest, Playwright CLI.

## Global Constraints

- The panel title is exactly `Tipe Ticket INAP`.
- Normalize source values with `UPPER(TRIM(type_ticket))` and expose only Incident and Event.
- Every existing Ticketing dashboard filter must affect the new aggregation.
- Return Incident and Event in deterministic order and include a zero row when one category is absent.
- Use existing chart dependencies, theme tokens, panel primitives, empty state, tooltip, and active-donut behavior.
- Use a single-column grid below 1280 pixels, three equal columns from 1280 through 1535 pixels, and `2fr 1fr 1fr` at 1536 pixels and above.
- Keep every chart at the established 220-pixel content height.
- Use a vertically stacked donut and legend inside the narrow panel.
- Preserve full RC Category business labels in data, tooltip, and SVG title while limiting visible tick text to ten characters.
- Do not add a `type_ticket` filter, click-to-filter behavior, table changes, new dependencies, or unrelated header/scorecard redesigns.

---

### Task 1: Backend dashboard distribution contract

**Files:**
- Modify: `backend/tests/test_ticketing_contract.py`
- Modify: `backend/models/ticketing.py`
- Modify: `backend/routers/ticketing.py`

**Interfaces:**
- Consumes: `build_filter_clause(params) -> str`, `rows_to_dicts(session, query, params) -> list[dict]`, and the existing `TicketingDistributionItem` response shape.
- Produces: `TYPE_TICKET_DISTRIBUTION_QUERY` and `TicketingDashboard.type_ticket_distribution: list[TicketingDistributionItem]`.

- [ ] **Step 1: Write the failing backend contract test**

Add this method to `TicketingContractTest` in `backend/tests/test_ticketing_contract.py`:

```python
def test_type_ticket_distribution_is_filter_aware_and_deterministic(self):
    source = self.read_router_source()
    models = MODELS.read_text(encoding="utf-8")

    self.assertIn(
        "type_ticket_distribution: list[TicketingDistributionItem] = []",
        models,
    )
    self.assertIn('TYPE_TICKET_DISTRIBUTION_QUERY = """', source)

    query = source.split('TYPE_TICKET_DISTRIBUTION_QUERY = """', 1)[1].split('"""', 1)[0]
    normalized = " ".join(query.split()).upper()
    for contract in [
        "UPPER(TRIM(T.TYPE_TICKET))",
        "{FILTER_CLAUSE}",
        "'INCIDENT'",
        "'EVENT'",
        "LEFT JOIN",
        "ORDER BY C.SORT_ORDER",
    ]:
        with self.subTest(contract=contract):
            self.assertIn(contract, normalized)

    self.assertIn("type_ticket_distribution = await rows_to_dicts(", source)
    self.assertIn("TYPE_TICKET_DISTRIBUTION_QUERY.format(filter_clause=filter_clause)", source)
    self.assertIn("type_ticket_distribution=type_ticket_distribution", source)
```

- [ ] **Step 2: Run the test and verify the RED state**

Run from `backend/`:

```powershell
python -m unittest tests.test_ticketing_contract.TicketingContractTest.test_type_ticket_distribution_is_filter_aware_and_deterministic -v
```

Expected: FAIL because `type_ticket_distribution` and `TYPE_TICKET_DISTRIBUTION_QUERY` do not exist.

- [ ] **Step 3: Add the response-model field**

Add this field to `TicketingDashboard` after `rc_category_pareto` in `backend/models/ticketing.py`:

```python
type_ticket_distribution: list[TicketingDistributionItem] = []
```

- [ ] **Step 4: Add the deterministic filtered SQL query**

Insert this constant after `RC_CATEGORY_PARETO_QUERY` in `backend/routers/ticketing.py`:

```python
TYPE_TICKET_DISTRIBUTION_QUERY = """
WITH categories(sort_order, normalized_label, label) AS (
    VALUES
        (1, 'INCIDENT', 'Incident'),
        (2, 'EVENT', 'Event')
),
base AS (
    SELECT UPPER(TRIM(t.type_ticket)) AS normalized_label
    FROM public.ticketing_fault_center t
    WHERE 1=1
    {filter_clause}
)
SELECT
    c.label,
    COUNT(b.normalized_label)::int AS tickets
FROM categories c
LEFT JOIN base b ON b.normalized_label = c.normalized_label
GROUP BY c.sort_order, c.label
ORDER BY c.sort_order
"""
```

- [ ] **Step 5: Execute the query and return it from the dashboard endpoint**

Add this query call after `rc_category_pareto` is loaded:

```python
type_ticket_distribution = await rows_to_dicts(
    session,
    TYPE_TICKET_DISTRIBUTION_QUERY.format(filter_clause=filter_clause),
    sql_params,
)
```

Add this keyword to the `TicketingDashboard(...)` return after `rc_category_pareto`:

```python
type_ticket_distribution=type_ticket_distribution,
```

- [ ] **Step 6: Run the focused backend test and verify GREEN**

Run from `backend/`:

```powershell
python -m unittest tests.test_ticketing_contract.TicketingContractTest.test_type_ticket_distribution_is_filter_aware_and_deterministic -v
```

Expected: PASS.

- [ ] **Step 7: Run the complete Ticketing backend contract suite**

Run from `backend/`:

```powershell
python -m unittest tests.test_ticketing_contract -v
```

Expected: all Ticketing backend contract tests PASS.

- [ ] **Step 8: Commit the backend contract**

```powershell
git add backend/tests/test_ticketing_contract.py backend/models/ticketing.py backend/routers/ticketing.py
git commit -m "feat: expose ticket type distribution"
```

---

### Task 2: Ticket-type chart helpers and frontend contract

**Files:**
- Modify: `frontend/src/__tests__/dashboardChartContracts.test.js`
- Modify: `frontend/src/__tests__/ticketingContracts.test.js`
- Modify: `frontend/src/features/ticketing/ticketingChartConfig.js`
- Modify: `frontend/src/features/ticketing/TicketingCharts.jsx`

**Interfaces:**
- Consumes: `dashboard.type_ticket_distribution`, `sumChartValues(rows, key)`, `DashboardChartPanel`, `DashboardChartEmpty`, `DashboardChartTooltipContent`, `ChartContainer`, and the existing active Pie shape.
- Produces: `getTicketTypeColor(label) -> CSS color token`, `formatCompactParetoLabel(label) -> string`, `CompactParetoTick`, and the `ticketing-type-ticket-donut-chart` DOM contract.

- [ ] **Step 1: Write failing pure-helper tests**

Change the Ticketing config import in `frontend/src/__tests__/dashboardChartContracts.test.js` to:

```javascript
import {
  formatCompactParetoLabel,
  getSlaStatusColor,
  getTicketTypeColor,
} from '../features/ticketing/ticketingChartConfig.js';
```

Add these tests after the SLA color test:

```javascript
it('maps ticket types to existing chart tokens', () => {
  assert.equal(getTicketTypeColor('Incident'), 'var(--chart-1)');
  assert.equal(getTicketTypeColor(' EVENT '), 'var(--chart-4)');
  assert.equal(getTicketTypeColor('UNKNOWN'), 'var(--chart-5)');
});

it('compacts only long Pareto tick labels', () => {
  assert.equal(formatCompactParetoLabel('Power'), 'Power');
  assert.equal(formatCompactParetoLabel('Unclassified'), 'Unclassif…');
  assert.equal(formatCompactParetoLabel(null), '');
});
```

- [ ] **Step 2: Write the failing Ticketing chart source contract**

Add this test to `frontend/src/__tests__/ticketingContracts.test.js`:

```javascript
it('renders the filtered ticket type donut in the approved responsive grid', () => {
  const charts = src('features', 'ticketing', 'TicketingCharts.jsx');

  for (const contract of [
    'Tipe Ticket INAP',
    'type_ticket_distribution',
    'ticketing-type-ticket-donut-chart',
    'Ticket type values',
    'activeTicketTypeIndex',
    'getTicketTypeColor',
    'CompactParetoTick',
    'xl:grid-cols-3',
    '2xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)_minmax(260px,1fr)]',
  ]) {
    assert.ok(charts.includes(contract), contract);
  }

  assert.match(charts, /typeTicketTotal\s*>\s*0/);
  assert.match(charts, /entry\.share/);
  assert.match(charts, /<title>\{fullLabel\}<\/title>/);
});
```

Update the existing required-label list to include:

```javascript
'Tipe Ticket INAP',
```

Update the compact-layout test by replacing the old second-row assertion:

```javascript
assert.match(charts, /xl:grid-cols-2/);
```

with:

```javascript
assert.match(charts, /xl:grid-cols-3/);
assert.ok(charts.includes('2xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)_minmax(260px,1fr)]'));
```

- [ ] **Step 3: Run both frontend tests and verify the RED state**

Run from `frontend/`:

```powershell
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/ticketingContracts.test.js
```

Expected: FAIL because the helpers, donut, test ID, and responsive grid do not exist.

- [ ] **Step 4: Add ticket-type tokens and pure helpers**

Add these entries to `TICKETING_CHART_COLORS` in `ticketingChartConfig.js`:

```javascript
incident: 'var(--chart-1)',
event: 'var(--chart-4)',
```

Add these entries to `ticketingChartConfig`:

```javascript
incident: { label: 'Incident', color: TICKETING_CHART_COLORS.incident },
event: { label: 'Event', color: TICKETING_CHART_COLORS.event },
```

Append these helpers:

```javascript
export function getTicketTypeColor(label) {
  const type = String(label || '').trim().toUpperCase();
  if (type === 'INCIDENT') return TICKETING_CHART_COLORS.incident;
  if (type === 'EVENT') return TICKETING_CHART_COLORS.event;
  return TICKETING_CHART_COLORS.fallback;
}

export function formatCompactParetoLabel(label) {
  const value = String(label || '');
  return value.length > 10 ? `${value.slice(0, 9)}…` : value;
}
```

- [ ] **Step 5: Add compact Pareto tick rendering**

Replace the existing `lucide-react` import with:

```javascript
import {
  BarChart3,
  HelpCircle,
  ListChecks,
  ShieldCheck,
  TicketCheck,
  TrendingUp,
} from 'lucide-react';
```

Replace the local Ticketing config import with:

```javascript
import {
  formatCompactParetoLabel,
  getSlaStatusColor,
  getTicketTypeColor,
  ticketingChartConfig,
} from './ticketingChartConfig';
```

Add this component below `DonutCenterLabel`:

```jsx
function CompactParetoTick({ x, y, payload }) {
  const fullLabel = String(payload?.value || '');
  return (
    <text
      x={x}
      y={y}
      dy={16}
      textAnchor="middle"
      fill="var(--muted-foreground)"
      fontSize={12}
    >
      <title>{fullLabel}</title>
      {formatCompactParetoLabel(fullLabel)}
    </text>
  );
}
```

Replace the RC Pareto `XAxis` with:

```jsx
<XAxis
  dataKey="label"
  tick={<CompactParetoTick />}
  tickLine={false}
  axisLine={false}
  interval={0}
/>
```

- [ ] **Step 6: Prepare ticket-type chart data and state**

Add state and derived data near the SLA derivations in `TicketingCharts`:

```javascript
const [activeTicketTypeIndex, setActiveTicketTypeIndex] = useState(null);
const rawTypeTicketDistribution = dashboard?.type_ticket_distribution || [];
const typeTicketTotal = sumChartValues(rawTypeTicketDistribution, 'tickets');
const typeTicketDistribution = rawTypeTicketDistribution.map((entry) => ({
  ...entry,
  share: typeTicketTotal > 0 ? (Number(entry.tickets || 0) / typeTicketTotal) * 100 : 0,
}));
```

- [ ] **Step 7: Replace the second-row grid and add the donut panel**

Change the second-row section class to:

```jsx
<section className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)_minmax(260px,1fr)]">
```

Add this panel after RC Category Pareto and before the closing section tag:

```jsx
<ChartCard title="Tipe Ticket INAP" icon={TicketCheck}>
  {typeTicketDistribution.length && typeTicketTotal > 0 ? (
    <div className="grid min-h-[220px] grid-rows-[150px_auto] items-center gap-1">
      <ChartContainer
        config={ticketingChartConfig}
        className="mx-auto h-[150px] w-full max-w-[180px] overflow-visible aspect-auto"
        data-testid="ticketing-type-ticket-donut-chart"
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={(
              <DashboardChartTooltipContent
                config={ticketingChartConfig}
                hideLabel
                seriesLabelFormatter={(_, item) => item?.payload?.label ?? item?.name}
                valueFormatter={(value, _name, item) => {
                  const share = Number(item?.payload?.share || 0)
                    .toFixed(1)
                    .replace('.', ',');
                  return `${formatNumber(value)} (${share}%)`;
                }}
              />
            )}
          />
          <Pie
            data={typeTicketDistribution}
            dataKey="tickets"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={38}
            outerRadius={58}
            paddingAngle={2}
            cornerRadius={8}
            strokeWidth={0}
            activeIndex={activeTicketTypeIndex}
            activeShape={renderActivePieShape}
            onMouseEnter={(_, index) => setActiveTicketTypeIndex(index)}
            onMouseLeave={() => setActiveTicketTypeIndex(null)}
            isAnimationActive={false}
          >
            {typeTicketDistribution.map((entry, index) => (
              <Cell
                key={entry.label}
                fill={getTicketTypeColor(entry.label)}
                tabIndex={0}
                onFocus={() => setActiveTicketTypeIndex(index)}
                onBlur={() => setActiveTicketTypeIndex(null)}
              />
            ))}
            <Label content={<DonutCenterLabel total={typeTicketTotal} />} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div aria-label="Ticket type values" className="grid gap-1.5">
        {typeTicketDistribution.map((entry) => (
          <div key={entry.label} className="flex min-w-0 items-center gap-2 text-xs">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: getTicketTypeColor(entry.label) }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {entry.label}
            </span>
            <span className="font-mono font-semibold tabular-nums text-muted-foreground">
              {Number(entry.share || 0).toFixed(1).replace('.', ',')}%
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-foreground">
              {formatNumber(entry.tickets)}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : <DashboardChartEmpty />}
</ChartCard>
```

- [ ] **Step 8: Run both frontend tests and verify GREEN**

Run from `frontend/`:

```powershell
node --test src/__tests__/dashboardChartContracts.test.js src/__tests__/ticketingContracts.test.js
```

Expected: all shared chart and Ticketing contract tests PASS.

- [ ] **Step 9: Run focused lint**

Run from `frontend/`:

```powershell
npx eslint src/features/ticketing/TicketingCharts.jsx src/features/ticketing/ticketingChartConfig.js src/__tests__/dashboardChartContracts.test.js src/__tests__/ticketingContracts.test.js
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 10: Commit the frontend chart**

```powershell
git add frontend/src/__tests__/dashboardChartContracts.test.js frontend/src/__tests__/ticketingContracts.test.js frontend/src/features/ticketing/ticketingChartConfig.js frontend/src/features/ticketing/TicketingCharts.jsx
git commit -m "feat: add ticket type donut chart"
```

---

### Task 3: Integrated verification

**Files:**
- Verify: `backend/models/ticketing.py`
- Verify: `backend/routers/ticketing.py`
- Verify: `frontend/src/features/ticketing/TicketingCharts.jsx`
- Verify: `frontend/src/features/ticketing/ticketingChartConfig.js`

**Interfaces:**
- Consumes: the completed dashboard API and frontend chart.
- Produces: fresh test, build, API, and browser evidence for Incident/Event counts and responsive layout.

- [ ] **Step 1: Run backend regression tests**

Run from the repository root:

```powershell
python -m pytest backend/tests/test_ticketing_contract.py backend/tests/test_period_router_params.py backend/tests/test_router_auth.py -q
```

Expected: all selected backend tests PASS.

- [ ] **Step 2: Run frontend regression tests**

Run from `frontend/`:

```powershell
node --test src/__tests__/ticketingContracts.test.js src/__tests__/dashboardChartContracts.test.js src/__tests__/themeRedesignContracts.test.js
```

Expected: all selected frontend tests PASS.

- [ ] **Step 3: Build the production frontend**

Run from `frontend/`:

```powershell
npm run build
```

Expected: Vite exits with code 0 and writes the production bundle to `frontend/dist`.

- [ ] **Step 4: Verify the authenticated dashboard API**

Run from the repository root in one PowerShell session. This creates process-only development credentials, starts isolated verification servers, signs in through the Vite proxy, prints only the distribution response, and gives the Playwright session the same temporary cookie:

```powershell
$env:APP_ENV = 'development'
$env:PUBLIC_APP_ORIGIN = 'http://127.0.0.1:5180'
$env:ALLOWED_HOSTS = '127.0.0.1,localhost'
$env:DASHBOARD_USER = 'operator'
$env:DASHBOARD_PASSWORD_HASH = python -c "from argon2 import PasswordHasher; print(PasswordHasher().hash('ticketing-audit-only'))"
$env:DASHBOARD_SESSION_SECRET = python -c "import secrets; print(secrets.token_urlsafe(48))"
$env:DASHBOARD_SESSION_TTL_SECONDS = '28800'
$env:SESSION_COOKIE_SECURE = 'false'
$env:N8N_API_KEY = 'local-audit-key'
$env:N8N_MAP_API_KEY = 'local-audit-map-key'

New-Item -ItemType Directory -Force 'output/playwright' | Out-Null
Start-Process -FilePath 'python' -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8012','--lifespan','off' -WorkingDirectory "$PWD/backend" -WindowStyle Hidden -RedirectStandardOutput "$PWD/output/playwright/ticketing-donut-backend.log" -RedirectStandardError "$PWD/output/playwright/ticketing-donut-backend.err.log"

$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8012'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','5180','--strictPort' -WorkingDirectory "$PWD/frontend" -WindowStyle Hidden -RedirectStandardOutput "$PWD/output/playwright/ticketing-donut-vite.log" -RedirectStandardError "$PWD/output/playwright/ticketing-donut-vite.err.log"

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $health = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8012/api/v1/health' -TimeoutSec 2
    $page = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5180/login' -TimeoutSec 2
    if ($health.StatusCode -eq 200 -and $page.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw 'Ticketing verification servers did not become ready' }

$ticketingWebSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = 'operator'; password = 'ticketing-audit-only' } | ConvertTo-Json
Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5180/api/v1/auth/login' -Method Post -ContentType 'application/json' -Headers @{ Origin = 'http://127.0.0.1:5180' } -Body $loginBody -WebSession $ticketingWebSession | Out-Null
$dashboardResponse = Invoke-RestMethod 'http://127.0.0.1:5180/api/v1/ticketing/dashboard?period_start=2026-06&period_end=2026-06' -WebSession $ticketingWebSession
$dashboardResponse.type_ticket_distribution | ConvertTo-Json

$sessionCookie = $ticketingWebSession.Cookies.GetCookies('http://127.0.0.1:5180')['nod_session'].Value
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut open http://127.0.0.1:5180/login --headed
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut cookie-set nod_session $sessionCookie --domain 127.0.0.1 --path / --httpOnly true --secure false --sameSite Strict
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut goto http://127.0.0.1:5180/ticketing
```

Expected response fragment:

```json
{
  "type_ticket_distribution": [
    { "label": "Incident", "tickets": 1317 },
    { "label": "Event", "tickets": 452 }
  ]
}
```

The live counts may change if the underlying database changes after the verified 23 July 2026 snapshot. The required invariant is that the API values match a same-period read-only SQL aggregation at verification time.

- [ ] **Step 5: Verify desktop and mobile rendering with Playwright CLI**

Use the authenticated Playwright CLI session prepared in Step 4:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut snapshot
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut resize 1600 1000
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut snapshot
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut screenshot
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut resize 390 844
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut snapshot
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut screenshot
```

Expected desktop evidence:

- `Tipe Ticket INAP` is visible beside RC Category Pareto.
- The wide layout resolves to Kabupaten/Kota at half-row width plus two quarter-width panels.
- Incident and Event counts and percentages are legible.
- RC Pareto visible ticks are compact while the full labels remain available.

Expected mobile evidence:

- The three second-row panels stack in Kabupaten/Kota, RC Category Pareto, Tipe Ticket INAP order.
- No horizontal overflow is introduced.
- The donut, center total, and both legend rows remain visible.

- [ ] **Step 6: Inspect runtime errors and final diff**

Run:

```powershell
git diff --check
git status --short
```

Inspect Playwright console output and authenticated API requests. Expected: no new console errors, failed Ticketing requests, whitespace errors, or out-of-scope staged files.

- [ ] **Step 7: Stop isolated verification processes**

Run:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=ticketing-donut close
$verificationPids = Get-NetTCPConnection -State Listen -LocalPort 8012,5180 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($verificationPid in $verificationPids) {
  Stop-Process -Id $verificationPid -Force
}
```

Expected: the Playwright session closes and ports 8012 and 5180 no longer have listeners.
