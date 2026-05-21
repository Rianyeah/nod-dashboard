# Network Reporting Page — Implementation Plan

## Goal
Add a new **Network Reporting** page (`/reporting`) to the NOD dashboard that surfaces `traktor_data` revenue/payload/traffic metrics broken down by **Kabupaten/Kota**, with scorecards, three pivot tables, and period filtering.

## Assumptions
- `traktor_data.site_id` joins with `data_site_master."Siteid"` (verified ✓)
- 6 Kabupaten values: SIDOARJO, PASURUAN, MOJOKERTO, JOMBANG, KOTA MOJOKERTO, KOTA PASURUAN
- 5 valid Site Classes: Diamond, Platinum, Gold, Silver, Bronze (filter out `#N/A` rows)
- 3 Battery Types: Lithium, VRLA, Tidak ada (normalize casing)
- Availability data comes from existing `availability_logs_jatim` table
- Frontend uses Vite + React, Backend uses FastAPI + asyncpg
- Reporting page reuses existing design tokens (CSS variables, glassmorphism, dark theme)

## Plan

### Step 1: Backend — Create `reporting.py` router
**Files**: `backend/routers/reporting.py` (NEW)
**Change**: Create a new FastAPI router with 4 endpoints:

1. `GET /reporting/scorecards?trx_month=2026-04`
   - Returns: `{ total_sites, total_revenue, total_payload, avg_availability }`
   - SQL: Aggregate from `traktor_data` + availability join

2. `GET /reporting/revenue-by-kabupaten?trx_month=2026-04`
   - Returns: Array of `{ kabupaten, total_sites, rev, rev_voice, rev_bb, rev_dig, rev_sms, rev_ir, payload, pld_2g, pld_3g, pld_4g, pld_5g, traffic, trf_2g, trf_3g, trf_4g }`
   - SQL: JOIN traktor_data × data_site_master, GROUP BY kabupaten

3. `GET /reporting/site-class-by-kabupaten?trx_month=2026-04`
   - Returns: Array of `{ kabupaten, diamond, platinum, gold, silver, bronze, total }`
   - SQL: Conditional COUNT from data_site_master + traktor_data (only sites with data that month)

4. `GET /reporting/battery-by-kabupaten`
   - Returns: Array of `{ kabupaten, lithium, vrla, tidak_ada, total }`
   - SQL: Conditional COUNT from data_site_master

**Verify**: `curl http://localhost:8000/api/v1/reporting/scorecards?trx_month=2026-04` returns valid JSON

---

### Step 2: Backend — Register router in main.py
**Files**: `backend/main.py` (MODIFY)
**Change**: Import and mount the reporting router:
```python
from routers import reporting as reporting_router
app.include_router(reporting_router.router, prefix=API_PREFIX)
```
**Verify**: `curl http://localhost:8000/docs` shows reporting endpoints

---

### Step 3: Backend — Add SQL queries
**Files**: `backend/queries/reporting.py` (NEW) or inline in router
**Change**: Write optimized SQL queries:
- Revenue query uses existing `idx_month_site` index
- Site class query filters out `#N/A` values
- Battery query normalizes 'tidak ada' / 'Tidak ada' casing
- All queries parameterized to prevent SQL injection

**Verify**: Each query returns correct row counts matching manual verification

---

### Step 4: Frontend — Add API service functions
**Files**: `frontend/src/services/api.js` (MODIFY)
**Change**: Add 4 new functions:
```js
export async function fetchReportingScorecards(trxMonth) { ... }
export async function fetchRevenueByKabupaten(trxMonth) { ... }
export async function fetchSiteClassByKabupaten(trxMonth) { ... }
export async function fetchBatteryByKabupaten() { ... }
```
**Verify**: Import check — no syntax errors

---

### Step 5: Frontend — Create NetworkReportingPage component
**Files**: `frontend/src/pages/NetworkReportingPage.jsx` (NEW)
**Change**: Create the full page layout:

**Scorecards Section** (top row, 4 cards):
| Card | Value | Format |
|------|-------|--------|
| Total Site | Count of distinct sites | `1,234` |
| Total Revenue | Sum of `rev` | `Rp 43,2 M` (Miliar) |
| Total Payload | Sum of `payload` | `11,3 TB` |
| Availability | Avg from availability data | `99.12%` |

**Table 1: Revenue & Payload by Kabupaten/Kota** (pivot table):
- Rows: Each Kabupaten
- Columns: Site Count, Revenue (Total, Voice, BB, Digital, SMS, IR), Payload (Total, 2G, 3G, 4G, 5G), Traffic (Total, 2G, 3G, 4G)
- Footer: Grand Total row
- Features: Sortable columns, formatted numbers

**Table 2: Site Class by Kabupaten/Kota** (cross-tab):
- Rows: Each Kabupaten
- Columns: Diamond, Platinum, Gold, Silver, Bronze, Total
- Color-coded badges for each class

**Table 3: Battery Type by Kabupaten/Kota** (cross-tab):
- Rows: Each Kabupaten
- Columns: Lithium, VRLA, Tidak Ada, Total
- Color-coded badges

**Filters**: Month/Year selector (reuse pattern from Header)

**Verify**: Page renders without errors at `/reporting`

---

### Step 6: Frontend — Add route and navigation
**Files**: `frontend/src/App.jsx` (MODIFY), `frontend/src/components/Header.jsx` (MODIFY)
**Change**:
- Add `/reporting` route in App.jsx with PrivateRoute wrapper
- Add navigation tabs/links in Header: "Dashboard" | "Network Reporting"
- Active state highlighting for current page

**Verify**: Clicking nav link navigates to `/reporting`, back to `/dashboard`

---

### Step 7: Frontend — Number formatting utility
**Files**: `frontend/src/utils/formatters.js` (NEW)
**Change**: Create formatting helpers:
```js
formatRevenue(value)    → "Rp 43,2 M" / "Rp 150,3 Jt"
formatPayload(value)    → "11,3 TB" / "2,8 GB"  
formatTraffic(value)    → "8.144"
formatPercent(value)    → "99,12%"
```
**Verify**: Unit test or console check with sample values

---

### Step 8: Polish — Styling and responsive design
**Files**: `frontend/src/pages/NetworkReportingPage.jsx` (MODIFY)
**Change**:
- Match existing dark theme with CSS variables
- Glassmorphism cards matching SummaryCards style
- Sticky table headers for scrollable tables
- Mobile-responsive: stack tables vertically on small screens
- Loading skeleton states
- Empty state handling

**Verify**: Visual inspection at different viewport sizes

---

### Step 9: Additional Recommended Feature — Revenue Trend Mini-Chart
**Files**: `frontend/src/pages/NetworkReportingPage.jsx` (MODIFY), `backend/routers/reporting.py` (MODIFY)
**Change**: Add a 5th endpoint and a small area chart showing total revenue trend across the 10 available months (2025-07 to 2026-04). This gives instant MoM context above the scorecards.

**Verify**: Chart renders with correct data points

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| JOIN query slow on 70K rows | Page load > 3s | Use indexed `trx_month` filter; queries already tested at ~200ms |
| `#N/A` site class values | Incorrect counts | Filter `WHERE "Site Class" NOT LIKE '#N/A%'` |
| Revenue overflow in JS | Display as `NaN` | Use `BigInt` or string-to-number conversion with fallback |
| Battery casing inconsistency | Split categories | Normalize with `LOWER("Type Battery")` |
| No availability in traktor_data | Scorecard incomplete | Query availability_logs_jatim separately for the period |

## Rollback Plan
1. Remove the `/reporting` route from `App.jsx`
2. Remove nav link from `Header.jsx`
3. Delete `NetworkReportingPage.jsx`
4. Delete `backend/routers/reporting.py`
5. Remove router registration from `main.py`
6. Delete `utils/formatters.js` (if no other consumers)

All changes are additive — zero impact on existing Dashboard functionality.
