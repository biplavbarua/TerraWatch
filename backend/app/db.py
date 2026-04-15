"""
asyncpg connection pool + query helpers.
All PostGIS geometry I/O uses ST_AsGeoJSON / ST_X / ST_Y / ST_MakePoint
to avoid needing a WKB parser.
"""
from __future__ import annotations
import ssl
import pathlib
import logging
import urllib.parse
from typing import Any, Optional

import asyncpg
from app.config import settings

logger = logging.getLogger(__name__)  

_pool: Optional[asyncpg.Pool] = None


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def create_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # Parse DSN to extract components — handles URL-encoded special chars
        parsed = urllib.parse.urlparse(settings.DATABASE_URL)
        password = urllib.parse.unquote(parsed.password or "")
        user = urllib.parse.unquote(parsed.username or "postgres")
        host = parsed.hostname or "localhost"
        port = parsed.port or 5432
        database = parsed.path.lstrip("/") or "postgres"

        _pool = await asyncpg.create_pool(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            ssl=_ssl_context(),
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
        logger.info("Database pool created")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        return await create_pool()
    return _pool


async def run_migration() -> None:
    """Execute the initial SQL migration to set up schema."""
    pool = await get_pool()
    sql_path = pathlib.Path(__file__).parent.parent / "migrations" / "001_initial.sql"
    sql = sql_path.read_text()
    async with pool.acquire() as conn:
        await conn.execute(sql)
    logger.info("Database schema ready")


async def fetch_all(query: str, *args: Any) -> list[asyncpg.Record]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetch_one(query: str, *args: Any) -> Optional[asyncpg.Record]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def execute(query: str, *args: Any) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(query, *args)
