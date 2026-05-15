# 🌐 Network Operation Dashboard (NOD)

> Internal web dashboard for NOC team — Monitoring telecom site availability in Jawa Timur

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+ / FastAPI / SQLAlchemy + asyncpg |
| Frontend | React 18+ / Vite 5+ / Mapbox GL JS / Recharts |
| UI | shadcn/ui + Tailwind CSS |
| Database | NeonDB (PostgreSQL 16) |
| Deployment | Zeabur VPS (Singapore) |

## Getting Started

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # fill in your DATABASE_URL
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local  # fill in MAPBOX_TOKEN
npm run dev
```

## API Docs
Once backend is running: http://localhost:8000/docs
