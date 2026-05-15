# Superpowers Brainstorm — NOD Web Dashboard

## Goal
Build a full-stack **Network Operation Dashboard (NOD)** web application for the NOC team in Jawa Timur to monitor telecom site availability via an interactive Mapbox map, summary cards, trend charts, and a detail table — backed by FastAPI + NeonDB and deployed on Zeabur.

## Constraints
- **Internal only** — no public auth needed in v1.0, but network-level IP restriction applies
- **Existing database** — NeonDB already has `availability_logs_jatim` and `data_site_master` tables with specific column naming (quoted identifiers, TEXT types requiring casting)
- **Mapbox GL JS** is mandatory — the team already has an account/token
- **Zeabur VPS** is the deployment target — Singapore region
- **shadcn/ui + Tailwind** for frontend UI components (per NOD doc spec)
- **Performance** — < 3s full page load, < 1s popup, up to 1,000 markers
- **Bahasa Indonesia** interface language
- **No PDF export, no auth, no mobile app** in v1.0

## Known context
- Database schema is fixed — two tables joined via `data_site_master."Siteid" = availability_logs_jatim."SITE ID"` (LEFT JOIN)
- Type casting is critical: Lat/Long → `::FLOAT`, outage → `NULLIF(col,'')::NUMERIC`, availability → `::NUMERIC`
- 15 API endpoints documented across 4 groups (Map, Availability, Sites, Health/Webhook)
- 13 React components specified with exact file paths
- 4 SQL queries provided verbatim in the NOD doc
- Color system fully defined (5 marker statuses + 9 brand colors)
- N8N integration for outage notifications (Telegram/WhatsApp/Email)
- CI/CD via GitHub Actions to Zeabur
- UptimeRobot for cold-start prevention

## Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **NeonDB column names use quoted identifiers and spaces** (e.g., `"SITE ID"`, `"outage (menit)"`) — easy to cause SQL errors | High | Use parameterized SQL with exact quoted column names from the doc; add integration tests |
| 2 | **Mapbox token exposure** — token could be leaked if committed to Git | Medium | Use `.env.local` + `.gitignore`; Mapbox URL restriction on the token |
| 3 | **1,000 markers performance** — rendering all markers at once could lag on lower-end tablets | Medium | Implement marker clustering (FR-01-5); use Mapbox GeoJSON source layer instead of individual DOM markers |
| 4 | **TEXT-typed numeric columns** — outage/lat/long stored as TEXT may contain empty strings or garbage | High | Always use `NULLIF(col,'')::NUMERIC` pattern; add backend validation and error handling |
| 5 | **Zeabur cold start** — free/low-tier may sleep the service | Low | UptimeRobot ping every 5 min on `/health` endpoint |
| 6 | **No auth in v1.0** — anyone on internal network can access all data | Low (internal only) | Accept for v1.0; plan auth for v1.1; rely on network-level IP restriction |

## Options

### Option A — Full Monorepo Build (Backend + Frontend together)
Build both backend and frontend in a single monorepo as specified in the NOD doc. Develop backend first, then frontend, then integrate.

**Pros:** Matches the NOD doc structure exactly; single repo for CI/CD; straightforward
**Cons:** Sequential — frontend blocked until backend is ready; longer total time

### Option B — API-First with Mock Data Frontend
Build backend API first with full tests. Simultaneously build frontend with mock/hardcoded data. Integrate last.

**Pros:** Parallel development possible; frontend can be iterated independently; faster overall
**Cons:** Risk of API contract mismatch; needs careful schema alignment

### Option C — Frontend-First with Proxy to NeonDB
Build the frontend directly querying NeonDB via a thin proxy (or Neon Data API), skip FastAPI initially.

**Pros:** Fastest to a visual demo
**Cons:** No proper API layer; violates the architecture spec; security risk exposing DB; would need rewrite later

### Option D — Incremental Vertical Slices
Build one complete vertical slice at a time (e.g., Map Dashboard end-to-end, then Availability, then Site Table).

**Pros:** Each slice delivers user-visible value; easier to test; natural checkpoint structure
**Cons:** Slightly more context switching between backend/frontend per slice

## Recommendation

**Option D — Incremental Vertical Slices** is the best approach.

This builds the project in complete feature slices:
1. **Slice 1:** Project scaffolding + DB connection + `/health` endpoint + frontend shell
2. **Slice 2:** Map dashboard (backend map endpoints + Mapbox map component + markers)
3. **Slice 3:** Summary cards + availability endpoints
4. **Slice 4:** Site popup + detail modal
5. **Slice 5:** Site table with search/filter/pagination
6. **Slice 6:** Availability trend chart (Recharts)
7. **Slice 7:** Filter panel integration (kabupaten, cluster, kelas, periode)
8. **Slice 8:** N8N webhook endpoint + CI/CD + deployment config

Each slice is testable end-to-end, provides visible progress, and avoids the "big integration" risk at the end.

## Acceptance criteria

1. Interactive Mapbox map loads with all site markers colored by availability status in < 3 seconds
2. Clicking a marker shows popup with site availability, outage, kabupaten, class, and "Detail" link
3. Summary cards show: total sites, avg availability %, total outage minutes
4. Site table displays all sites with search by name/ID and filter by kabupaten/cluster/kelas
5. Bar chart shows 12-month availability trend per selected site
6. Period filter (bulan/tahun) updates map markers, summary cards, and table data
7. Detail modal shows full site info (55+ columns) including power, technology bands, monitoring status
8. All 15 API endpoints respond correctly with proper type casting for TEXT→NUMERIC/FLOAT columns
9. `/health` endpoint returns 200 for UptimeRobot
10. `POST /webhook/n8n/alert` accepts and processes outage alert payloads
11. Frontend uses Bahasa Indonesia for all labels
12. Project runs locally with `uvicorn` (backend) and `npm run dev` (frontend)
