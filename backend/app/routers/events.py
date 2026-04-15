"""
Events API router.

GET /api/events         — list events (JSON)
GET /api/events/geojson — GeoJSON FeatureCollection (for MapLibre source)
GET /api/events/{id}    — single event details
GET /api/events/{id}/path — full trajectory as GeoJSON LineString
GET /api/stats          — counts by category
POST /api/ingest/trigger — manual ingest (dev/admin)
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse

from app import db
from app.services import ingestion

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


@router.get("/events")
async def list_events(
    category: Optional[str] = Query(None),
    status: str = Query("open", pattern="^(open|closed|all)$"),
    limit: int = Query(500, le=2000),
    days: Optional[int] = Query(None),
    min_mag: Optional[float] = Query(None),
):
    where = []
    args = []
    i = 1

    if status != "all":
        where.append(f"e.status = ${i}"); args.append(status); i += 1
    if category:
        where.append(f"e.category = ${i}"); args.append(category); i += 1
    if days:
        where.append(f"g.recorded_at > NOW() - INTERVAL '{days} days'")
    if min_mag is not None:
        where.append(f"g.magnitude_value >= ${i}"); args.append(min_mag); i += 1

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    args.append(limit)

    rows = await db.fetch_all(
        f"""
        SELECT
            e.eonet_id, e.title, e.category, e.status, e.source_url,
            e.recorded_at AS created_at, e.closed_at,
            g.recorded_at AS last_seen,
            ST_X(g.coordinates) AS lon, ST_Y(g.coordinates) AS lat,
            g.magnitude_value, g.magnitude_unit,
            (SELECT COUNT(*) FROM event_geometries WHERE event_id = e.id) AS path_points
        FROM events e
        LEFT JOIN LATERAL (
            SELECT * FROM event_geometries
            WHERE event_id = e.id
            ORDER BY recorded_at DESC LIMIT 1
        ) g ON TRUE
        {where_sql}
        ORDER BY g.recorded_at DESC NULLS LAST
        LIMIT ${i}
        """,
        *args,
    )
    return [dict(r) for r in rows]


@router.get("/events/geojson")
async def events_geojson(
    category: Optional[str] = Query(None),
    status: str = Query("open", pattern="^(open|closed|all)$"),
    limit: int = Query(1000, le=5000),
    days: Optional[int] = Query(None),
):
    """GeoJSON FeatureCollection — direct source for MapLibre."""
    where = []
    args = []
    i = 1

    if status != "all":
        where.append(f"e.status = ${i}"); args.append(status); i += 1
    if category:
        where.append(f"e.category = ${i}"); args.append(category); i += 1
    if days:
        where.append(f"g.recorded_at > NOW() - INTERVAL '{days} days'")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    args.append(limit)

    rows = await db.fetch_all(
        f"""
        SELECT
            e.eonet_id, e.title, e.category, e.status, e.source_url,
            g.recorded_at AS last_seen,
            ST_AsGeoJSON(g.coordinates) AS geometry_json,
            g.magnitude_value, g.magnitude_unit,
            (SELECT COUNT(*) FROM event_geometries WHERE event_id = e.id) AS path_points
        FROM events e
        LEFT JOIN LATERAL (
            SELECT * FROM event_geometries
            WHERE event_id = e.id
            ORDER BY recorded_at DESC LIMIT 1
        ) g ON TRUE
        {where_sql}
        ORDER BY g.recorded_at DESC NULLS LAST
        LIMIT ${i}
        """,
        *args,
    )

    features = []
    for r in rows:
        if not r["geometry_json"]:
            continue
        features.append({
            "type": "Feature",
            "geometry": json.loads(r["geometry_json"]),
            "properties": {
                "eonet_id": r["eonet_id"],
                "title": r["title"],
                "category": r["category"],
                "status": r["status"],
                "source_url": r["source_url"],
                "last_seen": r["last_seen"].isoformat() if r["last_seen"] else None,
                "magnitude_value": r["magnitude_value"],
                "magnitude_unit": r["magnitude_unit"],
                "path_points": int(r["path_points"] or 0),
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/events/{eonet_id}")
async def get_event(eonet_id: str):
    row = await db.fetch_one("SELECT * FROM events WHERE eonet_id = $1", eonet_id)
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return dict(row)


@router.get("/events/{eonet_id}/path")
async def get_event_path(eonet_id: str):
    """Full trajectory as GeoJSON LineString (or MultiPoint if only 1 point)."""
    event = await db.fetch_one("SELECT id FROM events WHERE eonet_id = $1", eonet_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    points = await db.fetch_all(
        """
        SELECT recorded_at, ST_X(coordinates) AS lon, ST_Y(coordinates) AS lat,
               magnitude_value, magnitude_unit
        FROM event_geometries
        WHERE event_id = $1
        ORDER BY recorded_at ASC
        """,
        event["id"],
    )

    if not points:
        return {"type": "FeatureCollection", "features": []}

    coords = [[r["lon"], r["lat"]] for r in points]
    timestamps = [r["recorded_at"].isoformat() for r in points]
    magnitudes = [r["magnitude_value"] for r in points]

    geom_type = "LineString" if len(coords) > 1 else "Point"
    geometry = {"type": geom_type, "coordinates": coords if len(coords) > 1 else coords[0]}

    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "eonet_id": eonet_id,
                "timestamps": timestamps,
                "magnitudes": magnitudes,
                "magnitude_unit": points[0]["magnitude_unit"],
            },
        }],
    }


@router.get("/stats")
async def get_stats(status: str = Query("open", pattern="^(open|closed|all)$")):
    where = "" if status == "all" else f"WHERE status = '{status}'"
    rows = await db.fetch_all(
        f"""
        SELECT category, COUNT(*) AS count
        FROM events {where}
        GROUP BY category ORDER BY count DESC
        """
    )
    total = sum(r["count"] for r in rows)
    return {
        "total": total,
        "by_category": [dict(r) for r in rows],
    }


@router.post("/ingest/trigger")
async def trigger_ingest():
    """Manually trigger an open-events ingestion (dev/admin use)."""
    count = await ingestion.ingest_open_events()
    return {"ingested": count}
