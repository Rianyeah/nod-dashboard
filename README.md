# NOD — Network Operation Dashboard

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
| `VITE_MAPBOX_TOKEN` | Mapbox GL access token |
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

## License

Internal tool — NOP Jawa Timur
