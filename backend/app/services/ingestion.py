"""
EONET → PostGIS ingestion service.

Handles:
  - Upsert of open events (polled every N minutes)
  - One-time historical backfill (closed events, year by year)
"""
import logging
from datetime import datetime, timezone, date
from typing import Optional

from app import db
from app.services import eonet as eonet_client

logger = logging.getLogger(__name__)


def _parse_dt(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


async def ingest_events_dict(events_data: dict) -> int:
    """Parse an EONET events response dict and upsert into DB. Returns count ingested."""
    pool = await db.get_pool()
    events = events_data.get("events", [])
    ingested = 0

    async with pool.acquire() as conn:
        for event in events:
            try:
                eonet_id = event["id"]
                title = event.get("title", "Unknown Event")
                categories = event.get("categories", [])
                category = categories[0]["id"] if categories else "unknown"
                sources = event.get("sources", [])
                source_url = sources[0]["url"] if sources else None
                closed_raw = event.get("closed")
                closed_at = _parse_dt(closed_raw)
                status = "closed" if closed_at else "open"

                # Upsert event — update status/closed_at on conflict
                row = await conn.fetchrow(
                    """
                    INSERT INTO events (eonet_id, title, category, status, source_url, closed_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (eonet_id) DO UPDATE
                        SET status    = EXCLUDED.status,
                            closed_at = EXCLUDED.closed_at,
                            source_url = COALESCE(EXCLUDED.source_url, events.source_url)
                    RETURNING id
                    """,
                    eonet_id, title, category, status, source_url, closed_at,
                )
                event_id = row["id"]

                # Upsert geometry trajectory points
                geometries = event.get("geometry", [])
                for geom in geometries:
                    try:
                        coords = geom.get("coordinates", [])
                        if len(coords) < 2:
                            continue
                        lon, lat = float(coords[0]), float(coords[1])
                        recorded_at = _parse_dt(geom.get("date"))
                        if not recorded_at:
                            continue
                        mag_value = geom.get("magnitudeValue")
                        mag_unit = geom.get("magnitudeUnit")

                        await conn.execute(
                            """
                            INSERT INTO event_geometries
                                (event_id, recorded_at, coordinates, magnitude_value, magnitude_unit)
                            VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6)
                            ON CONFLICT (event_id, recorded_at) DO NOTHING
                            """,
                            event_id, recorded_at, lon, lat,
                            float(mag_value) if mag_value is not None else None,
                            mag_unit,
                        )
                    except Exception as eg_err:
                        logger.debug(f"  Geometry skip for {eonet_id}: {eg_err}")

                ingested += 1
            except Exception as ev_err:
                logger.warning(f"Failed to ingest event {event.get('id', '?')}: {ev_err}")

    return ingested


async def ingest_open_events() -> int:
    """Fetch and upsert currently open natural events."""
    logger.info("Ingesting open events …")
    data = await eonet_client.fetch_events(status="open", limit=1000)
    count = await ingest_events_dict(data)
    logger.info(f"Open events ingested: {count}")
    return count


async def backfill_historical(years: int = 5) -> int:
    """
    Backfill closed events year-by-year for the past `years` years.
    This is run once on startup so EventCast has training data immediately.
    """
    current_year = date.today().year
    total = 0

    for y in range(current_year - years, current_year + 1):
        start = f"{y}-01-01"
        end = f"{y}-12-31"
        logger.info(f"Backfilling year {y} …")
        try:
            data = await eonet_client.fetch_events(
                status="closed", limit=1000, start=start, end=end
            )
            count = await ingest_events_dict(data)
            total += count
            logger.info(f"  → {count} events from {y}")
        except Exception as e:
            logger.error(f"  Backfill failed for {y}: {e}")

    logger.info(f"Historical backfill complete. Total: {total} events")
    return total


async def has_historical_data() -> bool:
    """Check if any closed events exist (i.e., backfill already ran)."""
    row = await db.fetch_one(
        "SELECT COUNT(*) AS cnt FROM events WHERE status = 'closed'"
    )
    return row["cnt"] > 0 if row else False
