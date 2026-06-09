# Impact Service Scorecard Delta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show absolute and relative changes against the immediately preceding equal-length period on all five Impact Service scorecards.

**Architecture:** Extend the existing `/impact-service/summary` response with previous-period values. The router derives one comparison range and executes the existing summary aggregation for both periods, while the React page calculates presentation-only delta labels through shared formatter helpers.

**Tech Stack:** FastAPI, async SQLAlchemy, Pydantic, React, Tailwind CSS, Node contract tests, Python unittest, Playwright CLI.

---

## File Structure

- `backend/models/impact_service.py`: extend the summary response contract.
- `backend/routers/impact_service.py`: derive and query the previous equal-length period.
- `backend/tests/test_impact_service_contract.py`: protect model, range, NOP, and endpoint mapping contracts.
- `frontend/src/pages/ImpactServicePage.jsx`: format and render directional scorecard deltas.
- `frontend/src/__tests__/dashboardReportingContracts.test.js`: protect the five scorecards and shared formatting behavior.

### Task 1: Backend Previous-Period Contract

**Files:**
- Modify: `backend/tests/test_impact_service_contract.py`
- Modify: `backend/models/impact_service.py`
- Modify: `backend/routers/impact_service.py`

- [ ] **Step 1: Write failing model and router contracts**

Add assertions for:

```python
previous_total_alarms
previous_impacted_sites
previous_open_alarms
previous_clear_alarms
previous_sow_tsel
```

Assert the router contains a range helper equivalent to:

```python
range_days = (end_date - start_date).days + 1
previous_end_date = start_date - timedelta(days=1)
previous_start_date = previous_end_date - timedelta(days=range_days - 1)
```

Assert `SUMMARY_QUERY` runs for both active and previous periods with the same
`build_nop_filter(nop)` result.

- [ ] **Step 2: Verify the contracts fail**

Run:

```powershell
python -m unittest backend.tests.test_impact_service_contract
```

Expected: failures for missing previous-period fields and comparison-range
logic.

- [ ] **Step 3: Extend `ImpactServiceSummary`**

Add integer fields with zero defaults:

```python
previous_total_alarms: int = 0
previous_impacted_sites: int = 0
previous_open_alarms: int = 0
previous_clear_alarms: int = 0
previous_sow_tsel: int = 0
```

- [ ] **Step 4: Implement previous-period loading**

Import `timedelta` if needed and add:

```python
def previous_equal_period(start_date: date, end_date: date) -> tuple[date, date]:
    range_days = (end_date - start_date).days + 1
    previous_end_date = start_date - timedelta(days=1)
    previous_start_date = previous_end_date - timedelta(days=range_days - 1)
    return previous_start_date, previous_end_date
```

In `get_impact_service_summary`, execute `SUMMARY_QUERY` twice with identical
NOP filtering. Map the second row to the five `previous_*` response fields.

- [ ] **Step 5: Verify backend contracts pass**

Run:

```powershell
python -m unittest backend.tests.test_impact_service_contract
```

Expected: all Impact Service backend contracts pass.

### Task 2: Frontend Scorecard Delta Presentation

**Files:**
- Modify: `frontend/src/__tests__/dashboardReportingContracts.test.js`
- Modify: `frontend/src/pages/ImpactServicePage.jsx`

- [ ] **Step 1: Write failing frontend contracts**

Assert the page contains shared helpers:

```javascript
getImpactDelta
formatImpactDelta
isSingleDayRange
```

Assert all five `previous_*` fields are paired with their current metric.
Assert the static subtitles no longer exist. Assert both labels exist:

```text
vs hari sebelumnya
vs periode sebelumnya
```

Assert the zero-denominator path returns `-`.

- [ ] **Step 2: Verify the frontend contract fails**

Run:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js
```

from `frontend`.

Expected: the new Impact Service delta contract fails.

- [ ] **Step 3: Implement shared delta helpers**

Add helpers equivalent to:

```javascript
function getImpactDelta(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  const delta = currentValue - previousValue;
  const rate = previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
  return { delta, rate };
}
```

Format signed integers with `formatNumber`, percentages with one decimal and
Indonesian decimal punctuation, and use `-` when `rate` is unavailable.

- [ ] **Step 4: Render scorecard metadata**

Update `Scorecard` to receive `delta` and `comparisonLabel`. Render:

```text
+12 (+2,0%) vs hari sebelumnya
```

Use green for positive, red for negative, and muted text for zero. Determine
the label with:

```javascript
const isSingleDayRange = startDate === endDate;
```

Pair every scorecard with its corresponding `previous_*` field.

- [ ] **Step 5: Verify frontend contracts and lint**

Run from `frontend`:

```powershell
node --test src/__tests__/dashboardReportingContracts.test.js
npx eslint src/pages/ImpactServicePage.jsx src/__tests__/dashboardReportingContracts.test.js
```

Expected: both commands exit successfully.

### Task 3: Runtime And Regression Verification

**Files:**
- Update generated graph artifacts through `graphify update .`

- [ ] **Step 1: Restart the backend dev server**

Restart Uvicorn on `127.0.0.1:8000` so the new Pydantic response fields are
active. Keep Vite on `127.0.0.1:5173`.

- [ ] **Step 2: Verify the live API**

Call a single-day and multi-day summary for the same NOP. Confirm all five
`previous_*` fields exist and the values reflect the derived comparison range.

- [ ] **Step 3: Run full automated verification**

```powershell
python -m unittest discover -s backend\tests
```

From `frontend`:

```powershell
node --test src/__tests__/homePageContracts.test.js src/__tests__/dashboardReportingContracts.test.js src/__tests__/activityEnomContracts.test.js src/__tests__/transportQualityContracts.test.js src/__tests__/ticketingContracts.test.js
npm run build
```

Expected: all tests pass and Vite production build succeeds. The existing chunk
size warning is informational.

- [ ] **Step 4: Run browser QA**

Use Playwright CLI because the Browser plugin is unavailable. Verify:

- `/impact-service` loads after login.
- A single-day range shows `vs hari sebelumnya` on all five scorecards.
- A multi-day range shows `vs periode sebelumnya`.
- Changing NOP refreshes current and previous values.
- Desktop and `390x844` mobile layouts have no clipping or horizontal page
  overflow.
- Browser console has no relevant errors or warnings.

- [ ] **Step 5: Refresh Graphify**

```powershell
graphify update .
```

Expected: code graph rebuild completes successfully.
