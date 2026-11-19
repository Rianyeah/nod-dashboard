# NOD — Network Operation Dashboard

Redis response-cache deployment and N8N invalidation instructions are documented in
[`docs/redis_cache_zeabur.md`](docs/redis_cache_zeabur.md).
Mapbox build-token configuration and production troubleshooting are documented in
[`docs/mapbox_zeabur.md`](docs/mapbox_zeabur.md).

N8N static-map sector export configuration is documented in
[`docs/n8n_map_integration.md`](docs/n8n_map_integration.md).

Management Data imports, dashboard roles, and the combined Ticketing takeover ranking are documented in
[`docs/management_data.md`](docs/management_data.md).

> Real-time availability monitoring for 1,246+ telecom sites across Jawa Timur

![Dark Theme Dashboard](https://img.shields.io/badge/theme-OLED%20Dark-0A0E1A?style=flat-square)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?style=flat-square)
![React](https://img.shields.io/badge/frontend-React%20+%20Vite-61DAFB?style=flat-square)
![NeonDB](https://img.shields.io/badge/database-NeonDB-00E599?style=flat-square)

## Features

- **Dark OLED Glassmorphism UI** — Premium data-first design with Fira Code + Inter typography
- **Mapbox Integration** — Dark-v11 tiles, clustered markers, interactive popups with site details
- **NOP Filter** — Global Network Operation Point filter cascading to all components
- **Real-time Metrics** — Summary cards, availability trends, outage tracking
- **Site Management** — Sortable, searchable paginated table with status badges
- **Detail Modals** — Full 55+ column site detail with sectioned glassmorphism layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, TailwindCSS 4, Recharts, Mapbox GL JS |
| Backend | FastAPI, SQLAlchemy (async), Uvicorn |
| Database | NeonDB (PostgreSQL) |
| Deployment | Docker, Zeabur |

## Quick Start

```bash
# Backend
cd backend
cp .env.example .env  # Configure DATABASE_URL
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
echo "VITE_MAPBOX_TOKEN=your_token" > .env.local
npm install
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | NeonDB PostgreSQL connection string |
| `VITE_MAPBOX_TOKEN` | Public Mapbox GL build token (`pk.`); configure as a GitHub Actions repository variable for production |
| `REDIS_URL` | Private Zeabur Redis connection string; optional and fail-open |
| `OVERVIEW_CACHE_TTL_SECONDS` | Home overview TTL (default `60`) |
| `FILTER_CACHE_TTL_SECONDS` | Global filter/latest-period TTL (default `300`) |
| `APP_ENV` | `development` / `production` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) |

## Deploy with Docker

```bash
docker build \
  --build-arg VITE_MAPBOX_TOKEN=your_token \
  -t nod-dashboard .

docker run -p 8000:8000 \
  -e DATABASE_URL="your_neondb_url" \
  nod-dashboard
```

## Peta Jalur EPM

The dashboard opens this feature under **Tools → Peta Jalur EPM**. Set up
each environment before deploying the application:

1. Apply `backend/sql/epm.sql`, `backend/sql/epm_photos.sql`, then
   `backend/sql/epm_seed.sql` against that environment's direct PostgreSQL
   connection. The seed can run again without replacing user edits.
2. Create a private `uploads` bucket on the same Neon branch. Set the
   branch S3 endpoint, region, and storage read/write credentials in the
   backend environment using the variables in `backend/.env.example`.
3. Build with the existing public Mapbox token. Verify a test photo upload,
   report JPG, and backup restore in an isolated branch before release.

JSON backups contain collection metadata and do not include image files.
Use a ZIP backup (up to 512 MiB per collection) to restore original images and
verify their checksums. JPG allows a single selected evidence photo.
The seeded 4.434 km follows an estimated road corridor. Its field verification
status remains pending until an operator verifies it.

## License

Internal tool — NOP Jawa Timur
