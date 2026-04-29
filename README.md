# 🌍 TerraWatch — Earth Event Intelligence Platform

> Real-time natural disaster intelligence powered by NASA EONET, PostGIS, and AI — visualized on an interactive world map.

![TerraWatch Dashboard](https://img.shields.io/badge/status-active-brightgreen) ![MapLibre GL JS](https://img.shields.io/badge/MapLibre-v5.24-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green) ![Python](https://img.shields.io/badge/Python-3.11%2B-blue) ![Supabase](https://img.shields.io/badge/Supabase-PostGIS-orange)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗺 **Interactive Map** | MapLibre GL JS v5 — clustered event markers, pulsing animations, click-to-zoom |
| 📡 **Live NASA Data** | Polls [NASA EONET API](https://eonet.gsfc.nasa.gov/) every 15 minutes for open natural events |
| 🧠 **AI Q&A** | Ask natural-language questions about active events via OpenRouter / Gemini |
| 🔥 **Event Categories** | Wildfires, Volcanoes, Earthquakes, Severe Storms, Floods, Sea Ice, and more |
| 📍 **Track Paths** | View historical movement paths for iceberg and storm events |
| 🔍 **Search & Filter** | Filter by category, status, and date range |
| 📊 **Live Stats Bar** | Per-category event counts updated in real time |
| 🔒 **Hardened Backend** | Parameterized SQL, rate-limited AI endpoint, input validation |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TerraWatch Stack                         │
├──────────────────┬──────────────────────┬───────────────────────┤
│   Frontend       │      Backend          │      Database          │
│   ─────────      │      ───────          │      ────────          │
│   HTML + CSS     │   FastAPI (Python)    │   Supabase (Postgres)  │
│   Vanilla JS     │   APScheduler         │   PostGIS extension    │
│   MapLibre v5    │   asyncpg             │   EONET event cache    │
│   ES Modules     │   OpenRouter / Gemini │   Geometry tracking    │
└──────────────────┴──────────────────────┴───────────────────────┘
```

**Data Flow:**
```
NASA EONET API → APScheduler (15 min) → FastAPI Ingestion → Supabase/PostGIS
                                                                    ↓
Browser ←── GeoJSON API ←── FastAPI Routers ←── PostGIS Queries ──┘
   ↓
MapLibre GL JS → Clustered Event Layers → Popup Cards
   ↓
AI Chat Panel → /api/ask → OpenRouter (Gemini) → Formatted Response
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- A [Supabase](https://supabase.com) project with PostGIS enabled
- An [OpenRouter](https://openrouter.ai) API key (for AI chat)

### 1. Clone the repo
```bash
git clone https://github.com/biplavbarua/TerraWatch.git
cd TerraWatch
```

### 2. Backend setup
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase DATABASE_URL and GEMINI_API_KEY
```

**.env format:**
```env
DATABASE_URL=postgresql://user:password@host:5432/postgres
GEMINI_API_KEY=sk-or-v1-your-openrouter-key
CORS_ORIGINS=*
POLL_INTERVAL_MINUTES=15
BACKFILL_YEARS=3
```

### 3. Start the backend
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will:
- Create database schema on first run
- Backfill 3 years of historical EONET data
- Begin polling NASA EONET every 15 minutes

### 4. Start the frontend
```bash
cd frontend
python3 -m http.server 3000
# or with no-cache headers (recommended for development):
python3 -c "
import http.server, os
class NC(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
os.chdir('frontend')
http.server.HTTPServer(('',3000),NC).serve_forever()
"
```

Open **http://localhost:3000** in your browser.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/api/events` | Paginated event list (filters: status, category, days, limit) |
| `GET` | `/api/events/geojson` | GeoJSON FeatureCollection for map rendering |
| `GET` | `/api/events/{eonet_id}/path` | Event track path as GeoJSON LineString |
| `GET` | `/api/stats` | Per-category event counts |
| `POST` | `/api/ask` | AI Q&A (body: `{"question": "..."}`) |

### Query Parameters (events)
| Param | Type | Default | Description |
|---|---|---|---|
| `status` | `open` \| `closed` | `open` | Event status filter |
| `category` | string | all | EONET category slug |
| `days` | int 1–3650 | all time | Events updated within N days |
| `limit` | int 1–2000 | 1000 | Max features returned |

---

## 🗄 Database Schema

```sql
-- Core events table
CREATE TABLE events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eonet_id    TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    category    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    source_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Geometry tracking (PostGIS)
CREATE TABLE event_geometries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
    geometry    GEOGRAPHY(POINT, 4326) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    magnitude_value NUMERIC,
    magnitude_unit  TEXT
);
```

---

## 🔒 Security

- **SQL Injection**: All queries use parameterized `asyncpg` statements — no string interpolation
- **Rate Limiting**: AI endpoint throttled to 10 requests/60 seconds per process
- **Input Validation**: `days`, `limit`, and `status` parameters are validated before query construction
- **CORS**: Configurable via `CORS_ORIGINS` env var (default `*` for development; restrict for production)

---

## 📁 Project Structure

```
TerraWatch/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + CORS + lifespan
│   │   ├── config.py         # Pydantic settings
│   │   ├── db.py             # asyncpg connection pool
│   │   ├── scheduler.py      # APScheduler EONET polling
│   │   ├── routers/
│   │   │   ├── events.py     # /api/events + /api/events/geojson
│   │   │   ├── ask.py        # /api/ask (AI Q&A with rate limiting)
│   │   │   └── stats.py      # /api/stats
│   │   └── services/
│   │       ├── eonet.py      # NASA EONET API client
│   │       ├── ingestion.py  # Event upsert + geometry storage
│   │       └── ai.py         # Gemini/OpenRouter integration
│   └── requirements.txt
└── frontend/
    ├── index.html            # App shell + MapLibre CDN
    └── src/
        ├── main.js           # App orchestrator + map init
        ├── api.js            # Backend API client
        ├── layers/
        │   ├── eventLayer.js # MapLibre cluster + circle layers
        │   └── pathLayer.js  # Event track path rendering
        └── ui/
            ├── sidebar.js    # Event list + category filters
            ├── eventCard.js  # Popup card with AI integration
            └── chatPanel.js  # AI Q&A slide-in panel
```

---

## 🗺 Map Features

- **Clustering**: Events cluster at low zoom levels using MapLibre's native clustering engine
- **Category Colors**: Each event type has a distinct color (🔥 orange for wildfires, 🌋 red for volcanoes, etc.)
- **Pulse Animation**: Active open events pulse with a glowing ring animation
- **Track Paths**: For events with multiple geometry records, a "Show Path" button renders the movement trajectory as a dashed line
- **Fly-to**: Clicking a sidebar event smoothly animates the camera to that event's location

---

## 🛣 Roadmap

- [ ] 3D Globe projection (pending MapLibre v5 globe + Carto tile compatibility)
- [ ] ML trajectory prediction for iceberg and storm track forecasting
- [ ] Push notifications for new high-severity events
- [ ] Export event data as CSV / GeoJSON
- [ ] Mobile-responsive layout
- [ ] Dark/light mode toggle

---

## 🙏 Credits

- **[NASA EONET](https://eonet.gsfc.nasa.gov/)** — Natural event data source
- **[MapLibre GL JS](https://maplibre.org/)** — Open-source WebGL map rendering
- **[CARTO](https://carto.com/)** — Dark Matter base map tiles
- **[Supabase](https://supabase.com/)** — PostgreSQL + PostGIS cloud hosting
- **[OpenRouter](https://openrouter.ai/)** — LLM API gateway (Gemini 2.0 Flash)

---

## 📄 License

MIT © 2026 Biplav Barua
