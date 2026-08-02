# Login and Transport Reliability Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved dynamic Vanta login, explicit PL right-axis area treatment, and resilient Transport Quality refresh behavior without changing operational calculations.

**Architecture:** Keep Vanta and retry classification behind small pure helpers that can be tested without rendering React. Keep Transport Quality UI state local to its page, but isolate backend filter caching in a reusable async snapshot primitive so Redis, local fresh, stale fallback, and cold failure behaviors remain explicit.

**Tech Stack:** React 19, Vite 8, Axios, Recharts, Node test runner, FastAPI, SQLAlchemy async, Python unittest, Vanta 0.5.24, Three.js r134.

---

### Task 1: Fix the Vanta Fog runtime and dependency compatibility

**Files:**
- Create: `frontend/src/features/auth/vantaFogRuntime.js`
- Modify: `frontend/src/features/auth/LoginFogBackground.jsx`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Test: `frontend/src/__tests__/authSecurityContracts.test.js`

- [ ] **Step 1: Write failing resolver and dependency tests**

Add tests that import `resolveVantaFogFactory` and assert all supported module shapes resolve to the same factory:

```js
test('resolves direct and nested Vanta Fog exports', () => {
  const fog = () => 'fog';
  assert.equal(resolveVantaFogFactory(fog), fog);
  assert.equal(resolveVantaFogFactory({ default: fog }), fog);
  assert.equal(resolveVantaFogFactory({ default: { default: fog } }), fog);
  assert.equal(resolveVantaFogFactory({ FOG: fog }), fog);
  assert.equal(resolveVantaFogFactory({}), null);
});
```

Also assert `package.json` pins `three` to `0.134.0`, the options include `backgroundAlpha: 1`, and the runtime no longer assumes one default-export level.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test src/__tests__/authSecurityContracts.test.js
```

Expected: FAIL because `vantaFogRuntime.js`, the resolver, `backgroundAlpha`, and the r134 dependency do not exist yet.

- [ ] **Step 3: Implement the pure Vanta resolver**

Create:

```js
export function resolveVantaFogFactory(moduleValue) {
  const candidates = [
    moduleValue,
    moduleValue?.FOG,
    moduleValue?.default,
    moduleValue?.default?.FOG,
    moduleValue?.default?.default,
  ];
  return candidates.find((candidate) => typeof candidate === 'function') || null;
}
```

Update `LoginFogBackground` to call the resolver, throw into the existing fallback path when no factory exists, add `backgroundAlpha: 1`, and reduce the foreground vignette opacity so the canvas remains visible. Preserve reduced-motion and `destroy()` cleanup.

- [ ] **Step 4: Pin Three r134 and rebuild the lockfile**

Run:

```powershell
npm install --save-exact three@0.134.0
```

Confirm only `package.json` and `package-lock.json` dependency records change and Vanta remains `0.5.24`.

- [ ] **Step 5: Verify GREEN and production module shape**

Run:

```powershell
node --test src/__tests__/authSecurityContracts.test.js
npm run build
```

Expected: PASS; the Vanta chunk builds separately and its factory resolver accepts the generated nested default shape.

- [ ] **Step 6: Commit**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/src/features/auth/LoginFogBackground.jsx frontend/src/features/auth/vantaFogRuntime.js frontend/src/__tests__/authSecurityContracts.test.js
git commit -m "fix: activate login vanta fog"
```

### Task 2: Add the login identity sublabel

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`
- Test: `frontend/src/__tests__/authSecurityContracts.test.js`

- [ ] **Step 1: Write the failing title hierarchy test**

Require the exact text `Network Operation Dashboard` after the `NOD` heading while preserving `All in one Dashboard ENOM and Tools`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --test src/__tests__/authSecurityContracts.test.js
```

Expected: FAIL because the new sublabel is absent.

- [ ] **Step 3: Add the sublabel**

Render a restrained secondary line directly below the heading:

```jsx
<p className="mt-1 text-[11px] font-medium tracking-wide text-[var(--text-muted)]">
  Network Operation Dashboard
</p>
```

Keep form spacing, password visibility, and footer copy unchanged.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
node --test src/__tests__/authSecurityContracts.test.js
git add frontend/src/pages/LoginPage.jsx frontend/src/__tests__/authSecurityContracts.test.js
git commit -m "feat: add login dashboard sublabel"
```

### Task 3: Make packet loss an explicit right-axis area series

**Files:**
- Modify: `frontend/src/features/transport-quality/TransportQualityCharts.jsx`
- Modify: `frontend/src/features/transport-quality/transportQualityTrendAxes.js`
- Test: `frontend/src/__tests__/transportQualityContracts.test.js`

- [ ] **Step 1: Replace dynamic-axis expectations with failing semantic-axis tests**

Assert the resolver always returns:

```js
{
  axisBySeries: {
    pl_over_1_sites: 'large',
    latency_over_5_sites: 'small',
    jitter_not_clear_sites: 'small',
    thi_fail_sites: 'small',
  },
  hasLargeSeries: true,
}
```

Require `ComposedChart`, a gradient-backed `<Area dataKey="pl_over_1_sites" yAxisId="large">`, red right-axis ticks, and three remaining `<Line>` elements on `small`.

- [ ] **Step 2: Verify RED**

```powershell
node --test src/__tests__/transportQualityContracts.test.js
```

Expected: FAIL because the chart is still a `LineChart` and PL is still a line.

- [ ] **Step 3: Implement fixed semantic axes**

Replace value-dependent classification with a stable mapping. The left axis remains `[0, 50]` with six ticks; the right axis remains `[0, 'auto']` and uses the PL color for tick text.

- [ ] **Step 4: Render the PL area**

Use:

```jsx
<defs>
  <linearGradient id="transportPlArea" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="var(--color-pl_over_1_sites)" stopOpacity={0.42} />
    <stop offset="100%" stopColor="var(--color-pl_over_1_sites)" stopOpacity={0.04} />
  </linearGradient>
</defs>
<Area
  type="monotone"
  dataKey="pl_over_1_sites"
  yAxisId="large"
  stroke="var(--color-pl_over_1_sites)"
  strokeWidth={2.75}
  fill="url(#transportPlArea)"
  dot={false}
  activeDot={{ r: 4 }}
  isAnimationActive={false}
/>
```

Keep tooltip, legend, dates, and raw values unchanged.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
node --test src/__tests__/transportQualityContracts.test.js
git add frontend/src/features/transport-quality/TransportQualityCharts.jsx frontend/src/features/transport-quality/transportQualityTrendAxes.js frontend/src/__tests__/transportQualityContracts.test.js
git commit -m "feat: emphasize packet loss trend area"
```

### Task 4: Add bounded retries for Transport Quality GET requests

**Files:**
- Create: `frontend/src/features/transport-quality/transportQualityRequest.js`
- Modify: `frontend/src/services/api.js`
- Test: `frontend/src/__tests__/transportQualityContracts.test.js`

- [ ] **Step 1: Write failing retry policy tests**

Cover:

- network error without a response: retry;
- `ECONNABORTED`: retry;
- status 408, 429, 502, 503, 504: retry;
- status 400, 401, 403, 404: do not retry;
- `ERR_CANCELED`: do not retry;
- success after two transient failures returns the response;
- three total failed attempts rethrow the final error.

Use an injected `wait` function so tests do not sleep.

- [ ] **Step 2: Verify RED**

```powershell
node --test src/__tests__/transportQualityContracts.test.js
```

Expected: FAIL because the retry module is absent.

- [ ] **Step 3: Implement retry classification and execution**

Create `isRetryableTransportError(error)` and:

```js
export async function withTransportRetry(request, {
  retries = 2,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= retries || !isRetryableTransportError(error)) throw error;
      await wait(150 * (2 ** attempt));
    }
  }
}
```

- [ ] **Step 4: Route only Transport Quality APIs through the helper**

Add a private `fetchTransportQuality(path, params, signal)` wrapper and update all six functions to accept an optional signal. Do not change global Axios interceptors or unrelated API functions.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
node --test src/__tests__/transportQualityContracts.test.js
git add frontend/src/features/transport-quality/transportQualityRequest.js frontend/src/services/api.js frontend/src/__tests__/transportQualityContracts.test.js
git commit -m "fix: retry transient transport requests"
```

### Task 5: Preserve successful Transport Quality data across refresh failures

**Files:**
- Modify: `frontend/src/pages/TransportQualityPage.jsx`
- Test: `frontend/src/__tests__/transportQualityContracts.test.js`

- [ ] **Step 1: Write failing page-state contract tests**

Require separate filter, dashboard, and table error/loading states; explicit refresh keys; `AbortController`; `Promise.allSettled`; a `Coba lagi` button; and an initial-load branch that does not render scorecards with fabricated zero values.

- [ ] **Step 2: Verify RED**

```powershell
node --test src/__tests__/transportQualityContracts.test.js
```

- [ ] **Step 3: Isolate request state**

Replace the shared error with:

```js
const [filterError, setFilterError] = useState(null);
const [dashboardError, setDashboardError] = useState(null);
const [tableError, setTableError] = useState(null);
const [filtersLoading, setFiltersLoading] = useState(true);
const [filterRefreshKey, setFilterRefreshKey] = useState(0);
const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
const [tableRefreshKey, setTableRefreshKey] = useState(0);
```

Every effect owns and aborts its controller. A refresh sets loading/error flags but never clears successful payload state.

- [ ] **Step 4: Apply partial dashboard settlement**

Use `Promise.allSettled` for summary, trend, distributions, and breakdowns. Update each fulfilled result independently. Record a compact stale-data warning if any result fails.

- [ ] **Step 5: Add honest initial and stale states**

When no filters have ever loaded and the request failed, show an unavailable panel with `Coba lagi`. When prior data exists, show a compact warning and keep all panels visible. One retry action increments all relevant refresh keys.

- [ ] **Step 6: Verify GREEN and commit**

```powershell
node --test src/__tests__/transportQualityContracts.test.js
git add frontend/src/pages/TransportQualityPage.jsx frontend/src/__tests__/transportQualityContracts.test.js
git commit -m "fix: retain transport data on refresh failure"
```

### Task 6: Add a local stale-capable filter cache behind Redis

**Files:**
- Create: `backend/local_snapshot_cache.py`
- Modify: `backend/routers/transport_quality.py`
- Create: `backend/tests/test_local_snapshot_cache.py`
- Modify: `backend/tests/test_transport_quality_contract.py`

- [ ] **Step 1: Write failing async cache tests**

Use `unittest.IsolatedAsyncioTestCase` with an injected monotonic clock. Verify fresh hits, single refresh under concurrent callers, stale fallback after loader failure, and cold failure propagation.

- [ ] **Step 2: Verify RED**

```powershell
python -m unittest tests.test_local_snapshot_cache -v
```

Expected: FAIL because `LocalSnapshotCache` is absent.

- [ ] **Step 3: Implement the cache primitive**

Create a small `LocalSnapshotCache` with `_value`, `_expires_at`, an `asyncio.Lock`, `get_fresh()`, `get_stale()`, and `get_or_load(loader)`. Return status strings `LOCAL_HIT`, `LOCAL_MISS`, or `STALE`.

- [ ] **Step 4: Integrate the filter endpoint**

Extract the two SQL calls into `load_transport_quality_filters(session)`. The endpoint order is Redis hit, local fresh/load/stale, then optional Redis write after a successful load. Set the returned `X-Cache` header and preserve existing response validation.

- [ ] **Step 5: Verify backend GREEN and commit**

```powershell
python -m unittest tests.test_local_snapshot_cache tests.test_transport_quality_contract -v
git add backend/local_snapshot_cache.py backend/routers/transport_quality.py backend/tests/test_local_snapshot_cache.py backend/tests/test_transport_quality_contract.py
git commit -m "fix: cache transport filters locally"
```

### Task 7: Full regression, rendered QA, graph refresh, and PR update

**Files:**
- Modify only if verification reveals a scoped regression.

- [ ] **Step 1: Run full frontend verification**

```powershell
node --test src/__tests__/*.test.js
npm run lint
npm run build
```

Expected: all tests pass, lint exits zero, and Vite build exits zero. The existing chunk-size warning is non-blocking.

- [ ] **Step 2: Run full backend verification**

```powershell
python -m unittest discover -s tests -v
```

Expected: all backend tests pass.

- [ ] **Step 3: Run rendered browser QA**

Verify these flows:

- `/login` -> Vanta/fallback surface -> exact sublabel -> password visibility interaction;
- `/transport-quality` -> PL red area/right axis -> small-axis lines remain readable;
- successful data -> simulated transient refresh failure -> prior data remains -> `Coba lagi` recovers.

Collect desktop and mobile login screenshots plus Transport chart/stale-state screenshots outside the repository. Record page identity, nonblank content, overlay absence, console health, and interaction evidence.

- [ ] **Step 4: Check the final diff**

```powershell
git diff --check origin/main...HEAD
git status -sb
git diff --stat origin/main...HEAD
```

Confirm `.graphify/` is still untracked and excluded from commits.

- [ ] **Step 5: Refresh Graphify**

```powershell
graphify update .
```

Verify the generated `graph.json` and `GRAPH_REPORT.md` reference the final commit and report node/edge counts. Keep generated cache artifacts out of the PR.

- [ ] **Step 6: Push the branch and verify PR #24**

```powershell
git push origin codex/dashboard-visual-followups
gh pr view 24 --json url,isDraft,headRefOid,statusCheckRollup
```

Expected: PR #24 points to the final local HEAD and GitHub checks start for that SHA.
