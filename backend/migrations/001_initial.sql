-- TerraWatch — Initial Schema
-- PostGIS extension is created automatically below (idempotent — safe to re-run)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─── Events ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id          SERIAL PRIMARY KEY,
    eonet_id    VARCHAR(50)  UNIQUE NOT NULL,
    title       TEXT         NOT NULL,
    category    VARCHAR(50),
    status      VARCHAR(20)  NOT NULL DEFAULT 'open',
    source_url  TEXT,
    description TEXT,
    recorded_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_status   ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_recorded ON events(recorded_at DESC);

-- ─── Event Geometries (trajectory points) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS event_geometries (
    id              SERIAL PRIMARY KEY,
    event_id        INTEGER     NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    recorded_at     TIMESTAMPTZ NOT NULL,
    coordinates     GEOMETRY(Point, 4326) NOT NULL,
    magnitude_value FLOAT,
    magnitude_unit  VARCHAR(20),
    UNIQUE (event_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_eg_event_id   ON event_geometries(event_id);
CREATE INDEX IF NOT EXISTS idx_eg_recorded   ON event_geometries(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_eg_coords     ON event_geometries USING GIST(coordinates);
