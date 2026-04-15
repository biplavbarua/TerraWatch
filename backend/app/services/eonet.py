"""
Async client for the NASA EONET v3 API.
https://eonet.gsfc.nasa.gov/docs/v3
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

EONET_BASE = "https://eonet.gsfc.nasa.gov/api/v3"
_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


async def fetch_events(
    *,
    status: Optional[str] = "open",
    limit: int = 1000,
    start: Optional[str] = None,
    end: Optional[str] = None,
    category: Optional[str] = None,
) -> dict:
    """Fetch events from EONET. Returns the raw JSON dict."""
    params: dict = {"limit": limit}
    if status and status != "all":
        params["status"] = status
    if start:
        params["start"] = start
    if end:
        params["end"] = end
    if category:
        params["category"] = category

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{EONET_BASE}/events", params=params)
        resp.raise_for_status()
        data = resp.json()
        n = len(data.get("events", []))
        logger.info(f"EONET fetched {n} events (status={status}, start={start}, end={end})")
        return data


async def fetch_categories() -> list[dict]:
    """Return all available EONET event categories."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{EONET_BASE}/categories")
        resp.raise_for_status()
        return resp.json().get("categories", [])
