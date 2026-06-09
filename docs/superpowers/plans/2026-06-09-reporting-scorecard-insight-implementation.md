# Reporting Scorecard and Executive Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add EPM/non-EPM site composition, SIDOARJO default filtering, relative MoM percentages, revenue/payload YTD values, and clearer Executive Insight copy to Network Reporting.

**Architecture:** Extend the existing `/reporting/scorecards` response so one request returns monthly values, active-site composition, and YTD aggregates. Keep table delta behavior unchanged, while adding dedicated relative-percentage formatting and structured insight copy in `NetworkReportingPage.jsx`.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL, Pydantic, React 19, Tailwind CSS, Node contract tests, Python unittest, Playwright.

---

## Worktree Safety

The current worktree already contains user changes in the same Reporting files. Do not reset, revert, or overwrite them. Do not create implementation commits unless the user explicitly requests one; use scoped diffs and test checkpoints instead.

### Task 1: Lock the Backend Scorecard Contract

**Files:**
- Modify: `backend/tests/test_reporting_nop_contract.py`
- Modify: `backend/models/reporting.py`

- [ ] **Step 1: Add failing model and SQL contract tests**

Add tests that require the new response fields, EPM prefix classification, active-site filtering, YTD boundaries, and NOP filtering:

```python
def test_reporting_scorecard_exposes_site_composition_and_ytd(self):
    model_source = (
        REPORTING_ROUTER.parents[1] / "models" / "reporting.py"
    ).read_text(encoding="utf-8")

    for field in [
        "epm_sites: int = 0",
        "non_epm_sites: int = 0",
        "revenue_ytd: int = 0",
        "payload_ytd: int = 0",
    ]:
        self.assertIn(field, model_source)

    for contract in [
        "ACTIVE_MASTER_SITE_BREAKDOWN_QUERY",
        "UPPER(TRIM(d.\"Siteid\")) LIKE 'EPM%'",
        "UPPER(TRIM(d.\"Siteid\")) NOT LIKE 'EPM%'",
        "YTD_SCORECARDS_QUERY",
        "CAST(SPLIT_PART(t.trx_month, '-', 1) AS INTEGER) = :tahun",
        "CAST(SPLIT_PART(t.trx_month, '-', 2) AS INTEGER) <= :bulan",
        "revenue_ytd",
        "payload_ytd",
    ]:
        self.assertIn(contract, self.source)
```

- [ ] **Step 2: Run the backend contract test and verify RED**

Run:

```powershell
python -m unittest backend.tests.test_reporting_nop_contract
```

Expected: FAIL because the model fields and SQL query constants do not exist.

- [ ] **Step 3: Extend the Pydantic scorecard model**

Update `ReportingScorecard`:

```python
class ReportingScorecard(BaseModel):
    """Top-level KPI scorecards for the reporting page."""
    total_sites: int = 0
    epm_sites: int = 0
    non_epm_sites: int = 0
    total_revenue: int = 0
    total_payload: int = 0
    revenue_ytd: int = 0
    payload_ytd: int = 0
    avg_availability: Optional[float] = None
```

- [ ] **Step 4: Run the test and confirm only SQL contracts remain RED**

Run:

```powershell
python -m unittest backend.tests.test_reporting_nop_contract
```

Expected: model field assertions pass; query assertions still fail.

### Task 2: Implement Site Composition and YTD Aggregates

**Files:**
- Modify: `backend/routers/reporting.py`
- Test: `backend/tests/test_reporting_nop_contract.py`

- [ ] **Step 1: Replace the single active-site count query**

Use one aggregate query:

```python
ACTIVE_MASTER_SITE_BREAKDOWN_QUERY = """
SELECT
    COUNT(DISTINCT d."Siteid") AS total_sites,
    COUNT(DISTINCT CASE
        WHEN UPPER(TRIM(d."Siteid")) LIKE 'EPM%' THEN d."Siteid"
    END) AS epm_sites,
    COUNT(DISTINCT CASE
        WHEN UPPER(TRIM(d."Siteid")) NOT LIKE 'EPM%' THEN d."Siteid"
    END) AS non_epm_sites
FROM data_site_master d
WHERE d."Status Site" = 'Active'
{nop_filter}
"""
```

- [ ] **Step 2: Add the inclusive selected-year YTD query**

```python
YTD_SCORECARDS_QUERY = """
SELECT
    COALESCE(SUM(t.rev), 0) AS revenue_ytd,
    COALESCE(SUM(t.payload), 0) AS payload_ytd
FROM traktor_data t
LEFT JOIN data_site_master d ON t.site_id = d."Siteid"
WHERE CAST(SPLIT_PART(t.trx_month, '-', 1) AS INTEGER) = :tahun
  AND CAST(SPLIT_PART(t.trx_month, '-', 2) AS INTEGER) <= :bulan
{nop_filter}
"""
```

- [ ] **Step 3: Parse the selected period once and load all scorecard values**

Inside `get_scorecards`, initialize safe defaults and parse the period before availability/YTD queries:

```python
total_sites = 0
epm_sites = 0
non_epm_sites = 0
revenue_ytd = 0
payload_ytd = 0
avg_availability = None

site_result = await session.execute(
    text(
        ACTIVE_MASTER_SITE_BREAKDOWN_QUERY.format(
            nop_filter=build_nop_filter(nop, "d")
        )
    ),
    {"nop": nop},
)
site_row = site_result.mappings().first()
if site_row:
    total_sites = int(site_row.get("total_sites") or 0)
    epm_sites = int(site_row.get("epm_sites") or 0)
    non_epm_sites = int(site_row.get("non_epm_sites") or 0)

try:
    tahun, bulan = (int(part) for part in trx_month.split("-", 1))
except (TypeError, ValueError):
    tahun = bulan = None

if tahun is not None and bulan is not None:
    ytd_result = await session.execute(
        text(YTD_SCORECARDS_QUERY.format(
            nop_filter=build_nop_filter(nop, "d")
        )),
        {"tahun": tahun, "bulan": bulan, "nop": nop},
    )
    ytd_row = ytd_result.mappings().first()
    if ytd_row:
        revenue_ytd = int(ytd_row.get("revenue_ytd") or 0)
        payload_ytd = int(ytd_row.get("payload_ytd") or 0)
```

Reuse `tahun` and `bulan` for `AVAILABILITY_SCORECARD_QUERY`.

- [ ] **Step 4: Return the expanded response**

```python
return ReportingScorecard(
    total_sites=total_sites,
    epm_sites=epm_sites,
    non_epm_sites=non_epm_sites,
    total_revenue=total_revenue,
    total_payload=total_payload,
    revenue_ytd=revenue_ytd,
    payload_ytd=payload_ytd,
    avg_availability=avg_availability,
)
```

- [ ] **Step 5: Run backend contracts and verify GREEN**

Run:

```powershell
python -m unittest backend.tests.test_reporting_nop_contract
```

Expected: all Reporting contract tests pass.

- [ ] **Step 6: Validate the live SIDOARJO response**

Run the API or direct endpoint and verify:

```text
total_sites = 1070
epm_sites = 18
non_epm_sites = 1052
total_sites = epm_sites + non_epm_sites
revenue_ytd > 0
payload_ytd > 0
```

### Task 3: Lock the Frontend Reporting Behavior

**Files:**
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Test: `frontend/src/__tests__/dashboardReportingContracts.test.js`

- [ ] **Step 1: Add failing source contracts**

Add one focused test:

```javascript
it('defaults Reporting to SIDOARJO and renders site composition, relative MoM, and YTD metadata', () => {
  const page = src('pages', 'NetworkReportingPage.jsx');

  assert.match(page, /REPORTING_DEFAULT_NOP\s*=\s*'SIDOARJO'/);
  assert.match(page, /normalizeReportingNop/);
  assert.match(page, /setSelectedNop/);
  assert.match(page, /epm_sites/);
  assert.match(page, /non_epm_sites/);
  assert.match(page, /revenue_ytd/);
  assert.match(page, /payload_ytd/);
  assert.match(page, /getRelativeChange/);
  assert.match(page, /formatRelativePercent/);
  assert.match(page, /EPM:/);
  assert.match(page, /Site \(non EPM\):/);
  assert.match(page, /YTD:/);
  assert.doesNotMatch(page, /site dengan data traktor/);
  assert.doesNotMatch(page, /subtitle="total data usage"/);
  assert.doesNotMatch(page, /subtitle="rata-rata availability jaringan"/);
});
```

Strengthen the insight contract:

```javascript
assert.match(page, /summary/);
assert.match(page, /detail/);
assert.match(page, /text-\[var\(--text-primary\)\]/);
assert.match(page, /text-\[var\(--text-secondary\)\]/);
```

- [ ] **Step 2: Run the frontend contract and verify RED**

Run from `frontend`:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js
```

Expected: FAIL on missing default NOP, YTD metadata, relative MoM helpers, and structured insight text.

### Task 4: Implement Reporting Scorecards and Insight Readability

**Files:**
- Modify: `frontend/src/pages/NetworkReportingPage.jsx`
- Test: `frontend/src/__tests__/dashboardReportingContracts.test.js`

- [ ] **Step 1: Add canonical NOP and relative percentage helpers**

```javascript
const REPORTING_DEFAULT_NOP = 'SIDOARJO';

function normalizeReportingNop(value) {
  return String(value || '')
    .trim()
    .replace(/^NOP\s+/i, '')
    .toUpperCase();
}

function getRelativeChange(current, previous) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) {
    return null;
  }
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
}

function formatRelativePercent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  const number = Number(value);
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  return `${sign}${Math.abs(number).toFixed(digits).replace('.', ',')}%`;
}
```

Keep `getDelta` and `DeltaValue` unchanged for table absolute deltas.

- [ ] **Step 2: Resolve the actual SIDOARJO option after filters load**

```javascript
fetchFilterOptions()
  .then((options) => {
    if (cancelled) return;
    const nops = options?.nop || [];
    setNopOptions(nops);
    const defaultNop = nops.find(
      (item) => normalizeReportingNop(item) === REPORTING_DEFAULT_NOP,
    );
    setSelectedNop((current) => current ?? defaultNop ?? null);
  })
  .catch(console.error);
```

- [ ] **Step 3: Refactor the local Scorecard metadata area**

Change the local component to accept `metadata`, `momRate`, and `momDigits`:

```javascript
function Scorecard({
  title,
  value,
  metadata = [],
  momRate,
  momDigits = 1,
  icon: Icon,
  accent,
  glow,
  delay = 0,
}) {
  const momTone = momRate == null
    ? 'text-[var(--text-muted)]'
    : momRate < 0
      ? 'text-red-400'
      : momRate > 0
        ? 'text-emerald-400'
        : 'text-[var(--text-secondary)]';

  return (
    <DashboardKpiCard
      title={title}
      value={value}
      icon={Icon}
      accent={accent}
      glow={glow}
      className="animate-fade-in cursor-default"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="mt-2 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight" style={{ color: accent }}>
        {value}
      </p>
      <div className="mt-2 min-h-8 space-y-0.5 text-[10px] leading-4">
        {momRate !== undefined && (
          <p className={`font-mono font-semibold tabular-nums ${momTone}`}>
            {formatRelativePercent(momRate, momDigits)} MoM
          </p>
        )}
        {metadata.map((item) => (
          <p key={item.label} className="text-[var(--text-secondary)]">
            {item.label}: <span className="font-mono font-semibold text-[var(--text-primary)]">{item.value}</span>
          </p>
        ))}
      </div>
    </DashboardKpiCard>
  );
}
```

- [ ] **Step 4: Render the approved Option A metadata**

```javascript
<Scorecard
  title="Total Site"
  value={formatNumber(scorecards?.total_sites)}
  metadata={[
    { label: 'EPM', value: formatNumber(scorecards?.epm_sites) },
    { label: 'Site (non EPM)', value: formatNumber(scorecards?.non_epm_sites) },
  ]}
  ...
/>

<Scorecard
  title="Total Revenue"
  value={formatRevenue(scorecards?.total_revenue)}
  momRate={getRelativeChange(scorecards?.total_revenue, previousScorecards?.total_revenue)}
  metadata={[
    { label: 'YTD', value: formatRevenue(scorecards?.revenue_ytd) },
  ]}
  ...
/>

<Scorecard
  title="Total Payload"
  value={formatPayload(scorecards?.total_payload)}
  momRate={getRelativeChange(scorecards?.total_payload, previousScorecards?.total_payload)}
  metadata={[
    { label: 'YTD', value: formatPayload(scorecards?.payload_ytd) },
  ]}
  ...
/>

<Scorecard
  title="Availability"
  value={formatPercent(scorecards?.avg_availability)}
  momRate={getRelativeChange(scorecards?.avg_availability, previousScorecards?.avg_availability)}
  momDigits={2}
  ...
/>
```

- [ ] **Step 5: Split Executive Insight supporting copy**

Change `InsightCard` from one `body` string to `summary` and `detail`:

```javascript
function InsightCard({ label, title, summary, detail, chip, tone = 'info', icon: Icon = TrendingUp }) {
  const colors = INSIGHT_TONES[tone] || INSIGHT_TONES.info;
  return (
    <article className={`rounded-lg border p-3 ${colors.shell}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 size-4 shrink-0 ${colors.text}`} />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
          <h3 className={`mt-0.5 text-sm font-bold leading-5 ${colors.text}`}>{title}</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--text-primary)]">{summary}</p>
          {detail && <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-secondary)]">{detail}</p>}
          {chip && (
            <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.chip}`}>
              {chip}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
```

Build each insight with short strings. For example:

```javascript
const revenueMom = getRelativeChange(currentRevenue, previous?.total_revenue);
const payloadMom = getRelativeChange(currentPayload, previous?.total_payload);
const availabilityMom = getRelativeChange(availability, previous?.avg_availability);

{
  label: 'Revenue',
  title: revenueTargetMet ? 'Revenue melampaui target' : 'Revenue di bawah target',
  summary: `${formatRevenue(currentRevenue)} · ${formatRelativePercent(revenueMom)} MoM`,
  detail: `${revenueTargetMet ? 'Target terlampaui' : 'Gap terhadap target'} ${targetPercent == null ? '-' : `${Math.abs(targetPercent).toFixed(1).replace('.', ',')}%`}. ${getRevenueContributorInsight(revenueTotals, previousRevenueTotals)}`,
}
```

Availability uses relative MoM, not `ppt`. Payload detail includes:

```javascript
`YTD ${formatPayload(scorecards?.payload_ytd)}. ${payloadInsight.body}`
```

- [ ] **Step 6: Run the frontend contract and verify GREEN**

Run:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js
```

Expected: all Reporting frontend contracts pass.

### Task 5: Full Verification and Runtime QA

**Files:**
- Verify: `backend/models/reporting.py`
- Verify: `backend/routers/reporting.py`
- Verify: `frontend/src/pages/NetworkReportingPage.jsx`
- Verify: `backend/tests/test_reporting_nop_contract.py`
- Verify: `frontend/src/__tests__/dashboardReportingContracts.test.js`

- [ ] **Step 1: Run backend tests**

```powershell
python -m unittest discover -s backend\tests
```

Expected: all backend tests pass.

- [ ] **Step 2: Run targeted frontend contracts**

From `frontend`:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js src/__tests__/homePageContracts.test.js
```

Expected: all selected tests pass.

- [ ] **Step 3: Run lint and production build**

From `frontend`:

```powershell
npx eslint src/pages/NetworkReportingPage.jsx src/__tests__/dashboardReportingContracts.test.js
npm run build
```

Expected: ESLint exits zero; Vite build completes. Existing large-chunk warning is acceptable.

- [ ] **Step 4: Browser QA**

Open:

```text
http://127.0.0.1:5173/reporting
```

Verify:

- NOP defaults to SIDOARJO.
- Total Site shows EPM 18 and Site (non EPM) 1,052 for the current database snapshot.
- Revenue and Payload show relative MoM and YTD.
- Availability shows relative MoM only.
- Changing period changes YTD.
- Selecting another NOP refreshes all Reporting sections.
- Executive Insight supporting text is readable in dark and light themes.
- Desktop and mobile layouts do not clip metadata.
- Browser console contains no relevant errors.

- [ ] **Step 5: Refresh Graphify**

```powershell
graphify update .
```

Expected: code graph rebuild completes successfully.

