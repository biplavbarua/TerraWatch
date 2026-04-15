# 🌍 TerraWatch

> **Real-time Earth event intelligence** — a full-stack platform that visualizes NASA's natural disaster data on a 3D interactive globe, enriched with AI-powered Q&A and historical trajectory tracking.

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![MapLibre GL JS](https://img.shields.io/badge/MapLibre_GL_JS-3.6-396CB2?logo=maplibre&logoColor=white)](https://maplibre.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostGIS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![OpenRouter](https://img.shields.io/badge/AI-OpenRouter%20%2F%20Gemini-FF6B35)](https://openrouter.ai)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🌐 **3D Globe Visualization** | Live disaster events rendered as color-coded markers on a WebGL globe powered by MapLibre GL JS |
| 🔥 **Real-time EONET Data** | Auto-ingests NASA EONET events every 15 minutes (wildfires, volcanoes, storms, floods, and more) |
| 🤖 **AI Q&A Engine** | Natural language queries answered by Gemini 2.0 Flash via OpenRouter, with database tool-calling |
| 🗺️ **Trajectory Tracking** | Multi-point event paths (e.g. typhoon tracks) visualized as animated routes on the globe |
| 🔍 **Filter & Search** | Filter by category (wildfires, storms, volcanoes…) + full-text search across all events |
| 📊 **Historical Backfill** | Ingests 3 years of historical closed events on startup for trend analysis |
| 🔗 **Source Links** | Direct links to primary sources (IRWIN, JTWC, USGS reports) in each event popup |
| 💾 **PostGIS Spatial DB** | All geometries stored as native PostGIS points for efficient spatial queries |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (Chrome)                     │
│  MapLibre GL JS 3D Globe  ·  Vanilla JS  ·  AI Chat UI  │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (localhost:8000)
┌──────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend                        │
│   /api/events/geojson  ·  /api/stats  ·  /api/ask        │
│   APScheduler (15-min poll)  ·  Backfill worker           │
└──────────────────────┬──────────────────────────────────┘
          ┌────────────┴────────────────┐
          │                             │
┌─────────▼──────────┐    ┌────────────▼───────────┐
│  Supabase Postgres  │    │  OpenRouter / Gemini    │
│  + PostGIS 3.3      │    │  (Tool-calling LLM)     │
│  1000+ events       │    │  Model: gemini-2.0-flash│
└────────────────────┘    └────────────────────────┘
          │
┌─────────▼──────────┐
│  NASA EONET API v3  │
│  Real-time events   │
└────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js (for `serve` static files)
- Supabase project with PostGIS enabled
- OpenRouter API key

### 1. Clone & Setup Backend

```bash
git clone https://github.com/YOUR_USERNAME/TerraWatch.git
cd TerraWatch/backend

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Environment

Create `backend/.env`:

```env
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-1-ap-south-1.pooler.supabase.com:5432/postgres
GEMINI_API_KEY=sk-or-v1-YOUR_OPENROUTER_KEY
CORS_ORIGINS=*
POLL_INTERVAL_MINUTES=15
BACKFILL_YEARS=3
SKIP_BACKFILL=false
```

> **Note:** The `GEMINI_API_KEY` variable is used for OpenRouter (OpenAI-compatible API). Get a key at [openrouter.ai](https://openrouter.ai).

### 3. Enable PostGIS (Supabase SQL Editor)

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 4. Run the Backend

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The backend will:
1. ✅ Create DB schema automatically
2. ✅ Ingest current open events from NASA EONET
3. ✅ Backfill 3 years of historical data
4. ✅ Start a 15-minute polling scheduler

### 5. Serve the Frontend

```bash
# Option A: npx serve (recommended)
cd frontend
npx serve . -l 3000

# Option B: Python (simplest)
cd frontend
python3 -m http.server 3000
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome or Firefox** (WebGL required for 3D globe).

---

## 📡 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Service health check |
| `/api/events` | GET | List events (JSON) with filters |
| `/api/events/geojson` | GET | GeoJSON FeatureCollection for MapLibre |
| `/api/events/{id}` | GET | Single event detail |
| `/api/events/{id}/path` | GET | Full trajectory as GeoJSON LineString |
| `/api/stats` | GET | Event counts by category |
| `/api/ask` | POST | AI natural language Q&A |
| `/api/ingest/trigger` | POST | Manually trigger ingestion |

**Query Parameters (events endpoints):**

| Param | Type | Description |
|---|---|---|
| `status` | `open\|closed\|all` | Filter by event status |
| `category` | string | Filter by category (e.g. `wildfires`) |
| `limit` | int | Max results (default 500, max 2000) |
| `days` | int | Only events from last N days |
| `min_mag` | float | Minimum magnitude filter |

**AI Ask Example:**
```bash
curl -X POST http://localhost:8000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "How many active wildfires are there in the US right now?"}'
```

---

## 🗂️ Project Structure

```
TerraWatch/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── db.py                # asyncpg pool + migrations
│   │   ├── scheduler.py         # APScheduler (15-min poll)
│   │   ├── routers/
│   │   │   └── events.py        # All API endpoints
│   │   └── services/
│   │       ├── ai.py            # OpenRouter tool-calling agent
│   │       ├── eonet.py         # NASA EONET API client
│   │       └── ingestion.py     # DB upsert logic
│   ├── migrations/
│   │   └── 001_initial.sql      # PostGIS schema
│   ├── requirements.txt
│   └── .env                     # Local config (gitignored)
│
└── frontend/
    ├── index.html               # App shell
    └── src/
        ├── main.js              # Bootstrap + MapLibre init
        ├── api.js               # Fetch wrapper
        ├── layers/
        │   ├── eventLayer.js    # MapLibre circle layer
        │   └── pathLayer.js     # Trajectory line layer
        └── ui/
            ├── sidebar.js       # Category filters + event list
            ├── chatPanel.js     # AI chat interface
            └── eventCard.js     # Event popup/card
```

---

## 🌐 Event Categories

| Category | Color | Description |
|---|---|---|
| 🔥 Wildfires | Orange | Active fire incidents (IRWIN dataset) |
| 🌀 Severe Storms | Cyan | Typhoons, hurricanes, cyclones |
| 🌋 Volcanoes | Amber | Volcanic activity worldwide |
| 🧊 Sea & Lake Ice | Light Blue | Ice formation and breakup events |
| 🌊 Floods | Blue | River and coastal flooding |
| 🏔️ Landslides | Purple | Debris flows and landslide events |
| 🌫️ Dust & Haze | Tan | Dust storms and smoke plumes |

---

## 🔧 Configuration

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection URL | required |
| `GEMINI_API_KEY` | OpenRouter API key | required |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `POLL_INTERVAL_MINUTES` | How often to fetch new events | `15` |
| `BACKFILL_YEARS` | Years of historical data to ingest | `3` |
| `SKIP_BACKFILL` | Skip historical backfill on startup | `false` |

---

## 🛠️ Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com) — async Python web framework
- [asyncpg](https://magicstack.github.io/asyncpg) — PostgreSQL async driver
- [APScheduler](https://apscheduler.readthedocs.io) — background task scheduling
- [httpx](https://www.python-httpx.org) — async HTTP client for EONET API
- [openai](https://github.com/openai/openai-python) SDK — used with OpenRouter

**Frontend**
- [MapLibre GL JS 3.6](https://maplibre.org) — open-source WebGL maps + globe projection
- Vanilla JS ES Modules — zero build step required
- [Carto Dark Matter](https://carto.com/basemaps) — dark base map tiles

**Infrastructure**
- [Supabase](https://supabase.com) — managed PostgreSQL + PostGIS
- [NASA EONET API v3](https://eonet.gsfc.nasa.gov/docs/v3) — natural event source
- [OpenRouter](https://openrouter.ai) — AI model routing (Gemini 2.0 Flash)

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

*Built with 🌍 and real-time Earth data.*
