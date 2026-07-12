# Project Analysis & Recommendations — NOD Dashboard

> Analysis generated from live codebase exploration (`D:\Web-dashboard`) and the existing knowledge graph (`graphify-out/graph.json`: 835 nodes, 1.068 edges, 82 communities).

---

## 1. Executive Summary

**NOD (Network Operation Dashboard)** is a real-time availability monitoring dashboard for 1.246+ telecom sites across Jawa Timur. It uses a modern async Python backend (FastAPI + SQLAlchemy + NeonDB) and a React 19 frontend (Vite + TailwindCSS 4 + Mapbox GL JS + Recharts).

The codebase is functionally mature and already covers multiple operational domains (availability, map, reporting, activity ENOM, data potensi, impact service, ticketing, transport quality). However, the knowledge graph and directory structure reveal several maintainability and UX gaps that should be addressed before scaling further.

---

## 2. High-Level Structure

```
D:\Web-dashboard
├── backend/          # FastAPI + async SQLAlchemy + NeonDB
├── frontend/         # React 19 + Vite + TailwindCSS 4 + Mapbox
├── docs/             # Deployment & integration documentation
├── design-system/    # (currently empty — opportunity)
├── graphify-out/     # Knowledge graph outputs
├── AGENTS.md         # Agent instructions for this codebase
└── README.md         # Project overview
```

---

## 3. Backend Structure

| File / Folder | Responsibility |
|---------------|----------------|
| `main.py` | FastAPI entry point, lifespan, CORS, app bootstrap |
| `database.py` | Async engine, `AsyncSession`, DB dependency injection |
| `cache.py` | Redis response-cache helpers |
| `security.py` | Authentication & session guard |
| `models/` | Pydantic schemas per domain: `site`, `availability`, `reporting`, `activity_enom`, `data_potensi`, `impact_service`, `ticketing`, `transport_quality`, `overview` |
| `queries/` | Central SQL layer: `sql_queries.py`, `metrics_cache.py` |
| `routers/` | API routers per domain (10+ routers) |
| `scripts/load_data.py` | Data import utility |
| `sector_geometry.py` | Sector antenna geometry processing for Mapbox |
| `tests/` | 20+ contract & unit tests |

### Positive Patterns
- Clear layered architecture: **Router → Model → Query → Database**.
- SQL is separated from route handlers (no inline SQL).
- Precomputed metrics cache exists for heavy analytical queries.
- Strong test coverage via contract tests.

### Concerning Patterns
- `availability.py` router shows inferred coupling to `float` helpers in `sector_geometry.py`. This coupling should be verified or extracted into a dedicated service layer.
- `models/` is a flat directory with many unrelated schemas, leading to low community cohesion in the knowledge graph.

---

## 4. Frontend Structure

| File / Folder | Responsibility |
|---------------|----------------|
| `pages/` | 10 route-level pages: Dashboard, SiteMap, NetworkReporting, ActivityEnom, DataPotensi, ImpactService, Ticketing, TransportQuality, Home, Login |
| `components/` | Shared UI components: MapboxMap, SiteTable, SummaryCards, AvailabilityChart, FilterPanel, Header, WorstSitesPanel, SiteDetailModal |
| `components/ui/` | Shadcn/ui primitives (button, card, dialog, table, tooltip, badge, etc.) |
| `components/dashboard-charts/` | Chart-specific utilities & tooltip content |
| `components/dashboard-filters/` | Dashboard filter logic |
| `features/` | Feature modules: `activity-enom`, `data-potensi`, `impact-service`, `ticketing`, `transport-quality` |
| `hooks/` | Custom hooks: `useMapData`, `useSiteDetail`, `useSessionTimeout`, `useDebouncedValue`, `useDashboardThemeTokens`, etc. |
| `services/api.js` | HTTP client & API call definitions |
| `utils/` | Formatters & map color utilities |
| `__tests__/` | Contract tests per page/feature |

### Positive Patterns
- Component hierarchy is reasonable: Pages → Features → Components → UI primitives.
- Custom hooks isolate data fetching and reusable UI state.
- Newer features are modularized under `features/`.

### Concerning Patterns
- The main dashboard still lives under `components/`, inconsistent with newer `features/` modules.
- Theme system has known blockers (light mode is broken).
- Chart components lack consistent tooltips and responsive behavior.

---

## 5. Typical Data Flow

```text
Frontend Page / Feature
        ↓
  services/api.js  ──────→  Backend Router
        ↓                         ↓
  Custom Hook              Pydantic Model
        ↓                         ↓
  Component                SQL Query / metrics_cache
        ↓                         ↓
  UI                       NeonDB (async SQLAlchemy)
```

---

## 6. Key Findings from Knowledge Graph

The existing `graphify-out/graph.json` provides the following signals:

| Finding | Detail |
|---------|--------|
| **Graph size** | 835 nodes, 1.068 edges, 82 communities |
| **God nodes** | `Plan`, `AsyncSession`, `list_sites()`, `sector_row_to_feature()`, `float` — confirming the core domain is site data, availability, and map sectors |
| **Surprising connections** | Multiple inferred edges from `availability.py` router to `float` / `sector_geometry.py` — suggests accidental or undocumented coupling |
| **Knowledge gaps** | 316 isolated nodes — many components/variables are weakly connected or undocumented |
| **Frontend blockers** | Community 25 identifies light-mode breakage, missing chart tooltips, broken responsive grid, static status dots, and duplicated RCA Dominan field |
| **Fragmentation** | 26 thin communities (< 3 nodes) and 82 total communities — excessive modular fragmentation |
| **Schema cohesion** | Community 1 (Pydantic schemas) has very low cohesion (0.06) — schemas are too mixed |

---

## 7. Recommendations

### 7.1 Frontend — Fix Foundational Issues First

| Issue | Recommended Action |
|-------|--------------------|
| Light mode broken | Migrate to consistent CSS variables or Tailwind `darkMode: 'class'`. Remove hardcoded dark colors from components. |
| Charts lack tooltips | Apply the existing `DashboardChartTooltipContent` component consistently across all Recharts charts. |
| Responsive chart grid breaks below 1080px | Use CSS Grid `minmax()` or Tailwind responsive breakpoints (`lg:grid-cols-3 md:grid-cols-2`). |
| Status dot is static | Wire status dots to real availability data via the existing `StatusBadge` component. |
| Duplicated "RCA Dominan" field | Audit data models and SQL queries to remove redundant columns. |

### 7.2 Backend — Refactor Schema Organization

- Split the flat `models/` directory into domain sub-folders:
  ```text
  models/
  ├── base.py            # shared base classes
  ├── site/
  ├── availability/
  ├── reporting/
  └── shared/            # common fields & enums
  ```
- Introduce a shared base schema for common fields (`site_id`, `nop`, `period`) to reduce duplication.
- This directly addresses the low cohesion observed in Community 1.

### 7.3 Reduce Module Fragmentation

- Consolidate small utility files where it makes sense (e.g., `dashboardChartUtils.js`, `dashboardFilterUtils.js`, `formatters.js`).
- Avoid creating a new file for a single function unless it is genuinely reusable across multiple features.
- Merge closely related custom hooks if they fetch similar kabupaten/period data.

### 7.4 Decouple Backend Routers

- Verify the inferred edges between `availability.py` and `sector_geometry.py`.
- If the coupling is real, introduce a service layer:
  ```text
  backend/
  ├── services/
  │   ├── availability_service.py
  │   └── map_service.py
  └── routers/
      ├── availability.py   # calls availability_service
      └── map.py            # calls map_service
  ```
- Routers should depend on services, not low-level geometry utilities.

### 7.5 Documentation & Onboarding

- Fill the empty `design-system/` folder with component documentation (Storybook, Markdown catalog, or simple gallery page).
- Add docstrings to hooks and utility functions to reduce the 316 isolated-node knowledge gap.
- Update `AGENTS.md` with the agreed data-flow architecture after refactoring.

### 7.6 Testing

- The project already has 20+ contract tests — maintain and expand them.
- Add end-to-end tests for critical user flows:
  ```text
  Login → Dashboard → Map interaction → Site detail modal
  ```
- Add visual regression tests because the UI is undergoing theme redesign.

### 7.7 Performance

- Audit routers for N+1 query patterns when loading site details.
- Expand Redis caching beyond `metrics_cache.py` to summary and trend endpoints.
- Implement lazy loading for non-dashboard pages using `React.lazy` + `Suspense`.

### 7.8 Feature Modularity

- Apply the `features/` pattern to the main dashboard:
  ```text
  frontend/src/features/
  ├── dashboard/
  │   ├── components/
  │   ├── hooks/
  │   ├── services/
  │   └── utils/
  └── ...existing features
  ```
- This aligns the main dashboard with newer features and improves maintainability.

---

## 8. Suggested Roadmap

### Phase 1 — Stabilization (1–2 weeks)
- Fix light mode and responsive chart grid.
- Add consistent chart tooltips.
- Remove duplicated RCA Dominan field.
- Verify and document backend inferred couplings.

### Phase 2 — Refactoring (2–3 weeks)
- Split `backend/models/` into domain sub-folders.
- Consolidate small frontend utility/hook files.
- Move main dashboard code into `frontend/src/features/dashboard/`.
- Introduce backend service layer for cross-domain logic.

### Phase 3 — Scaling (3–4 weeks)
- Implement lazy page loading.
- Add Redis caching for summary/trend endpoints.
- Add E2E and visual regression tests.
- Build `design-system/` documentation.

---

## 9. Next Steps

Choose one starting point and we can begin implementation:

1. **Frontend theme & responsive fixes**
2. **Backend `models/` domain split**
3. **Frontend utility consolidation**
4. **Backend service-layer extraction**
5. **End-to-end test for critical user flow**

---

*Document version: 1.0*
*Generated: 2026-07-08*
*Workspace: `D:\Web-dashboard`*
