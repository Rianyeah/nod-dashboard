# Superpowers Plan — NOD Web Dashboard

## Goal
Build the full-stack Network Operation Dashboard (NOD) using incremental vertical slices. Each step produces a testable, working increment. Backend (FastAPI + NeonDB) and Frontend (React + Vite + Mapbox GL) in a monorepo deployed to Zeabur.

## Assumptions
- NeonDB is already provisioned with `availability_logs_jatim` and `data_site_master` tables populated with data
- User has a valid Mapbox access token (public token, `pk.` prefix)
- Python 3.11+ and Node.js 18+ are installed locally
- Git is initialized in `d:\Web-dashboard`
- Zeabur account and VPS are available for deployment
- The user will provide `DATABASE_URL` and `VITE_MAPBOX_TOKEN` values when needed

## Plan

---

### Step 1 — Project Scaffolding & Git Setup
**Files:** `.gitignore`, `README.md`, `backend/`, `frontend/`
**Change:**
- Create the monorepo folder structure: `backend/`, `frontend/`, `.github/workflows/`
- Create `.gitignore` with entries for `.env`, `.env.local`, `*.env`, `node_modules/`, `__pycache__/`, `dist/`, `.vite/`
- Create `README.md` with project overview
- Create `backend/requirements.txt` with: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `asyncpg`, `pydantic>=2.0`, `python-dotenv`
- Create `backend/.env.example` with template variables
- Create `frontend/.env.example` with template variables
**Verify:**
```bash
ls backend/requirements.txt
ls frontend/.env.example
ls .gitignore
cat .gitignore | Select-String "env"
```

---

### Step 2 — Backend: Database Connection & Health Endpoint
**Files:** `backend/main.py`, `backend/database.py`, `backend/.env`
**Change:**
- Create `backend/database.py` — async SQLAlchemy engine using `DATABASE_URL` from env, with `create_async_engine` and `async_sessionmaker`
- Create `backend/main.py` — FastAPI app with CORS middleware, `/api/v1` prefix, `/api/v1/health` endpoint returning `{"status": "ok"}`
- Include error handling for DB connection failures
**Verify:**
```bash
cd backend
pip install -r requirements.txt
python -c "from main import app; print('FastAPI app created')"
```

---

### Step 3 — Backend: SQL Queries Module
**Files:** `backend/queries/sql_queries.py`
**Change:**
- Create `backend/queries/__init__.py`
- Create `backend/queries/sql_queries.py` with all 4 SQL queries from the NOD doc:
  - `MAP_SITES_QUERY` — GeoJSON data for map markers
  - `SUMMARY_CARD_QUERY` — total sites, avg availability, total outage
  - `TREND_AVAILABILITY_QUERY` — 12-month trend per site
  - `POPUP_DETAIL_QUERY` — full site detail for popup/modal
- All queries use proper quoted column names and type casting (`::FLOAT`, `NULLIF(col,'')::NUMERIC`)
**Verify:**
```bash
python -c "from queries.sql_queries import MAP_SITES_QUERY, SUMMARY_CARD_QUERY; print('Queries loaded OK')"
```

---

### Step 4 — Backend: Pydantic Models
**Files:** `backend/models/site.py`, `backend/models/availability.py`
**Change:**
- Create `backend/models/__init__.py`
- Create `backend/models/site.py` — Pydantic schemas: `SiteBase`, `SiteMapFeature`, `SiteDetail`, `SiteListItem`, `SiteFilterOptions`
- Create `backend/models/availability.py` — Pydantic schemas: `AvailabilitySummary`, `AvailabilityTrend`, `AvailabilityByKabupaten`, `WorstSite`
- All schemas use `Optional` for nullable fields, proper typing for cast fields
**Verify:**
```bash
python -c "from models.site import SiteMapFeature, SiteDetail; from models.availability import AvailabilitySummary; print('Models OK')"
```

---

### Step 5 — Backend: Map Router (2 endpoints)
**Files:** `backend/routers/map.py`
**Change:**
- Create `backend/routers/__init__.py`
- Create `backend/routers/map.py` with:
  - `GET /map/sites?bulan=&tahun=` — returns array of GeoJSON features for all sites with avg_availability
  - `GET /map/sites/{site_id}/popup` — returns full detail for a single site's popup
- Uses `database.py` async session and `sql_queries.py`
- Register router in `main.py` under `/api/v1`
**Verify:**
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
# In another terminal: curl http://localhost:8000/api/v1/health
# In another terminal: curl "http://localhost:8000/api/v1/map/sites?bulan=5&tahun=2025"
```

---

### Step 6 — Backend: Availability Router (5 endpoints)
**Files:** `backend/routers/availability.py`
**Change:**
- Create `backend/routers/availability.py` with:
  - `GET /availability/summary?bulan=&tahun=` — summary cards data
  - `GET /availability/by-kabupaten?bulan=&tahun=` — grouped by kabupaten
  - `GET /availability/site/{site_id}?bulan=&tahun=` — single site availability
  - `GET /availability/trend/{site_id}?tahun=` — 12-month trend data
  - `GET /availability/worst?bulan=&tahun=&limit=` — worst-performing sites
- Register router in `main.py`
**Verify:**
```bash
curl "http://localhost:8000/api/v1/availability/summary?bulan=5&tahun=2025"
curl "http://localhost:8000/api/v1/availability/worst?bulan=5&tahun=2025&limit=5"
```

---

### Step 7 — Backend: Sites Router (4 endpoints) + Webhook
**Files:** `backend/routers/sites.py`
**Change:**
- Create `backend/routers/sites.py` with:
  - `GET /sites?kabupaten=&cluster=&status=&kelas=&page=&limit=` — paginated site list
  - `GET /sites/{site_id}/detail` — full 55+ column detail
  - `GET /sites/search?q=` — search by name or ID
  - `GET /sites/filters/options` — dropdown options for filters
- Add `POST /webhook/n8n/alert` to `main.py` for N8N integration
- Register router in `main.py`
**Verify:**
```bash
curl "http://localhost:8000/api/v1/sites?page=1&limit=10"
curl "http://localhost:8000/api/v1/sites/search?q=SBY"
curl "http://localhost:8000/api/v1/sites/filters/options"
# All 15 endpoints accessible at http://localhost:8000/docs
```

---

### Step 8 — Frontend: Vite + React Scaffolding
**Files:** `frontend/` (entire scaffold)
**Change:**
- Initialize React + Vite project in `frontend/` using `npx create-vite`
- Install dependencies: `mapbox-gl`, `recharts`, `axios`, `react-router-dom`
- Install Tailwind CSS + configure `tailwind.config.js` and `postcss.config.js`
- Initialize shadcn/ui with `npx shadcn-ui@latest init`
- Create `frontend/.env.local` with `VITE_API_BASE_URL` and `VITE_MAPBOX_TOKEN` placeholders
- Create `frontend/src/services/api.js` — Axios instance with base URL from env
**Verify:**
```bash
cd frontend
npm run dev
# Browser opens at http://localhost:5173 with default Vite React page
```

---

### Step 9 — Frontend: App Shell + Header + Design System
**Files:** `frontend/src/App.jsx`, `frontend/src/components/Header.jsx`, `frontend/src/index.css`
**Change:**
- Create `frontend/src/index.css` with brand color CSS variables (`--primary-blue: #1A56A0`, etc.)
- Create `frontend/src/components/Header.jsx` — top navbar with logo, title "NETWORK OPERATION DASHBOARD", subtitle "Jawa Timur — Monitoring Availability Site", and period filter dropdowns (bulan/tahun)
- Update `frontend/src/App.jsx` — 2-column grid layout: left sidebar (summary cards + chart) + right main area (map) + bottom full-width (table)
- All labels in Bahasa Indonesia
**Verify:**
```bash
npm run dev
# Visual check: header renders with title, blue branding, period dropdowns
```

---

### Step 10 — Frontend: API Service + Custom Hooks
**Files:** `frontend/src/services/api.js`, `frontend/src/hooks/useMapData.js`, `frontend/src/hooks/useSiteDetail.js`
**Change:**
- Create `frontend/src/services/api.js` — Axios instance + all API call functions (fetchMapSites, fetchSummary, fetchTrend, fetchSites, fetchSiteDetail, fetchFilterOptions, searchSites, fetchWorstSites)
- Create `frontend/src/hooks/useMapData.js` — custom hook for map data with loading/error states
- Create `frontend/src/hooks/useSiteDetail.js` — custom hook for site detail with loading/error states
**Verify:**
```bash
npm run dev
# Check browser console: no import errors
```

---

### Step 11 — Frontend: Mapbox Map Component + Markers
**Files:** `frontend/src/components/MapboxMap.jsx`, `frontend/src/utils/mapColors.js`
**Change:**
- Create `frontend/src/utils/mapColors.js` — `getMarkerColor(availability)` function with the 5-status color system
- Create `frontend/src/components/MapboxMap.jsx`:
  - Initialize Mapbox GL map centered on Jawa Timur `[112.5, -7.5]`, zoom 8
  - Use GeoJSON source layer for markers (not individual DOM markers) for performance
  - Color markers based on `avg_availability` using `getMarkerColor()`
  - Implement click handler to show popup
  - Implement marker clustering at low zoom levels (FR-01-5)
- Wire into `App.jsx` main area
**Verify:**
```bash
npm run dev
# Visual check: Mapbox map renders, centered on Jatim, markers visible with colors
```

---

### Step 12 — Frontend: Summary Cards Component
**Files:** `frontend/src/components/SummaryCards.jsx`, `frontend/src/components/ui/StatusBadge.jsx`
**Change:**
- Create `frontend/src/components/ui/StatusBadge.jsx` — colored badge for availability status
- Create `frontend/src/components/SummaryCards.jsx` — 3 cards (Total Site, Avg Availability %, Total Outage menit) with icons, numbers, and subtle animations
- Fetch data from `/availability/summary` endpoint
- Wire into `App.jsx` left sidebar
**Verify:**
```bash
npm run dev
# Visual check: 3 summary cards display with real data from API
```

---

### Step 13 — Frontend: Site Popup + Detail Modal
**Files:** `frontend/src/components/SitePopup.jsx`, `frontend/src/components/SiteDetailModal.jsx`
**Change:**
- Create `frontend/src/components/SitePopup.jsx` — Mapbox popup content showing: Site ID, Site Name, Status badge, Avg Availability %, Outage, Kabupaten, Class, "Lihat Detail Lengkap" button
- Create `frontend/src/components/SiteDetailModal.jsx` — full-screen modal with tabs/sections:
  - Header (Site ID, Name, Status)
  - Availability (avg %, outage, jumlah hari)
  - Lokasi (Kabupaten, Kecamatan, Alamat)
  - Teknis (Class, NOP, Cluster, Type, Brand)
  - Teknologi (2G/4G/5G bands)
  - Power (PLN, Genset, Battery info)
  - Monitoring (WDM, NMS, EMU, ENVA status)
- Wire popup into MapboxMap marker click; wire modal into popup CTA button
**Verify:**
```bash
npm run dev
# Click a marker → popup appears → click "Lihat Detail" → modal opens with full data
```

---

### Step 14 — Frontend: Site Table with Search & Filter
**Files:** `frontend/src/components/SiteTable.jsx`, `frontend/src/components/FilterPanel.jsx`
**Change:**
- Create `frontend/src/components/FilterPanel.jsx` — dropdown filters for Kabupaten, Cluster, Kelas site (populated from `/sites/filters/options`)
- Create `frontend/src/components/SiteTable.jsx`:
  - Table with columns: Site ID, Nama, Kabupaten, Class, Avail%, Outage, Status
  - Search input (by name or Site ID)
  - Column sorting (click header to sort)
  - Pagination (page/limit)
  - Row click opens SiteDetailModal
- Wire into `App.jsx` bottom area
**Verify:**
```bash
npm run dev
# Visual check: table renders with data, search works, filters work, clicking row opens modal
```

---

### Step 15 — Frontend: Availability Trend Chart
**Files:** `frontend/src/components/AvailabilityChart.jsx`
**Change:**
- Create `frontend/src/components/AvailabilityChart.jsx` — Recharts bar chart showing 12-month availability trend
- Fetch from `/availability/trend/{site_id}` when a site is selected (from map click or table row)
- X-axis: month labels, Y-axis: availability %, bars colored by status threshold
- Wire into `App.jsx` left sidebar below summary cards
**Verify:**
```bash
npm run dev
# Click a site → chart updates with 12-month trend data
```

---

### Step 16 — Frontend: Global Filter Integration
**Files:** Update `App.jsx`, `Header.jsx`, all data-fetching components
**Change:**
- Lift period filter state (bulan, tahun) to `App.jsx` as global state
- Lift filter panel state (kabupaten, cluster, kelas) to `App.jsx`
- Wire filter changes to re-fetch: map data, summary cards, site table
- Ensure map markers update when period changes
- Ensure summary cards update when period changes
- Ensure site table respects all active filters
**Verify:**
```bash
npm run dev
# Change period dropdown → map markers, cards, and table all update
# Change kabupaten filter → table filters, map highlights change
```

---

### Step 17 — CI/CD & Deployment Configuration
**Files:** `.github/workflows/deploy.yml`, `backend/Dockerfile` (optional), `frontend/Dockerfile` (optional)
**Change:**
- Create `.github/workflows/deploy.yml` — GitHub Actions workflow for auto-deploy to Zeabur on push to `main`
- Create `backend/Procfile` or startup config for Zeabur: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Create `frontend/Procfile` for Zeabur: `npx serve dist -p 3000`
- Document all environment variables needed in Zeabur Dashboard
**Verify:**
```bash
cat .github/workflows/deploy.yml
# Verify YAML syntax is valid
# Verify both services are configured
```

---

### Step 18 — Polish: Responsive Layout, Animations & Final Testing
**Files:** Various CSS and component files
**Change:**
- Add responsive breakpoints for tablet (1024px) and desktop (1366px+)
- Add micro-animations: card hover effects, map marker pulse for critical sites, table row hover
- Add loading skeletons for map, cards, table while data fetches
- Add error states with retry buttons
- Add dark mode map style toggle (light-v11 ↔ dark-v11)
- Final end-to-end test: all 15 endpoints, all UI interactions
**Verify:**
```bash
npm run dev
# Resize browser to tablet width → layout adapts
# All interactions smooth, loading states visible, error states handled
npm run build
# Build succeeds without errors
```

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| NeonDB quoted column names cause SQL syntax errors | Copy queries verbatim from NOD doc; test each query in NeonDB console first |
| Mapbox token leaked to Git | `.gitignore` includes all env files; verify before first commit |
| 1,000 markers slow on tablet | Use GeoJSON source + symbol layer (not DOM markers); add clustering |
| TEXT→NUMERIC cast fails on dirty data | `NULLIF(col,'')::NUMERIC` pattern everywhere; backend try/except with 422 response |
| Zeabur cold start | UptimeRobot pings `/health` every 5 min |
| CORS issues between frontend/backend | Configure `ALLOWED_ORIGINS` properly in FastAPI CORS middleware |

## Rollback plan
- Each step is a git commit — `git revert` to undo any step
- Database is read-only (no schema changes in v1.0) — no DB rollback needed
- Zeabur supports instant rollback to previous deployment
- Frontend can fallback to mock data by toggling `VITE_API_BASE_URL` to local mock server
