# Superpowers Plan: Dashboard Fixes & Optimizations

### Goal
Resolve API timeouts, summary card logic flaws, and UI display bugs in the NOD Dashboard by rewriting heavy SQL queries using subquery aggregation and patching falsy checks in React components.

### Assumptions
- The database is NeonDB (PostgreSQL) and the backend is FastAPI with async SQLAlchemy.
- The frontend uses React with Recharts for charts and Mapbox for maps.
- All SQL modifications must maintain exact column aliases required by the current frontend interfaces.

### Plan
1. **Refactor `MAP_SITES_QUERY` & `SITES_LIST_QUERY`**
   - Files: `backend/queries/sql_queries.py`
   - Change: Move the `availability_logs_jatim` aggregation to a subquery before `LEFT JOIN`ing to `data_site_master` to eliminate the massive 1:M join cost and remove redundant `GROUP BY`s.
   - Verify: Run a local SQL test via `/map/sites` API to ensure the payload format remains identical but performance drops to <2 seconds.
2. **Refactor `SUMMARY_CARD_QUERY` & Apply Filters**
   - Files: `backend/queries/sql_queries.py`, `backend/routers/availability.py`, `backend/routers/sites.py` (to import `_build_filters`)
   - Change: Rewrite `SUMMARY_CARD_QUERY` to use a single subquery for log aggregation, calculating global stats via `SUM(agg.total_uptime)` to prevent inflated uptime from sites without logs. Inject `{filters}` into the query. Update `get_summary` endpoint to accept frontend filters (kabupaten, cluster, status, kelas, nop) and apply them.
   - Verify: Hit the `/availability/summary` endpoint with filtering params and verify the values change correctly and sites without data don't skew the percentages to 100%.
3. **Fix "Hari Data" Display & Trend Chart Scaling**
   - Files: `frontend/src/components/SiteDetailModal.jsx`, `frontend/src/components/AvailabilityChart.jsx`
   - Change: Replace `||` with `??` in `SiteDetailModal` so 0 is properly displayed. Update `YAxis` domain in `AvailabilityChart` to `[dataMin => Math.max(0, Math.min(90, Math.floor(dataMin))), 100]`.
   - Verify: Open a site detail modal for a site with 0 days of data and check if it says `0` instead of `—`. Check a site with <90% availability and verify the bar is correctly scaled on the trend chart.

### Risks & mitigations
- *SQL Syntax Errors:* PostgreSQL `MODE() WITHIN GROUP` needs specific handling. Since it already works in the current codebase, retaining the exact syntax inside the subqueries mitigates parsing risks.
- *API Signature changes:* Expanding filter parameters on `/availability/summary` might cause issues if the frontend doesn't supply them. Mitigation: Use `Query(None)` for all new parameters to ensure backward compatibility.

### Rollback plan
- The plan will touch isolated React components and SQL strings. Since the files are tracked by Git, simply running `git checkout backend/queries/sql_queries.py backend/routers/availability.py frontend/src/components/SiteDetailModal.jsx frontend/src/components/AvailabilityChart.jsx` will safely restore the exact previous state if verification fails.
