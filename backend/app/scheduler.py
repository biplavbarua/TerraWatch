"""
APScheduler setup for periodic EONET polling and one-time backfill.
"""
import asyncio
import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app.services import ingestion

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None


async def _poll_job():
    try:
        await ingestion.ingest_open_events()
    except Exception as e:
        logger.error(f"EONET poll job failed: {e}", exc_info=True)


async def _backfill_job():
    try:
        has_data = await ingestion.has_historical_data()
        if has_data:
            logger.info("Historical data exists — skipping backfill")
            return
        logger.info(f"Starting historical backfill ({settings.BACKFILL_YEARS} years) …")
        await ingestion.backfill_historical(settings.BACKFILL_YEARS)
    except Exception as e:
        logger.error(f"Backfill job failed: {e}", exc_info=True)


def start_scheduler():
    global _scheduler
    _scheduler = AsyncIOScheduler()

    # Recurring poll
    _scheduler.add_job(
        _poll_job,
        trigger="interval",
        minutes=settings.POLL_INTERVAL_MINUTES,
        id="eonet_poll",
        name="EONET Open Events Poll",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info(f"Scheduler started — polling every {settings.POLL_INTERVAL_MINUTES} min")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


async def run_startup_tasks():
    """Run immediately on startup: first poll + optional backfill."""
    await _poll_job()

    if not settings.SKIP_BACKFILL:
        # Run backfill in background so it doesn't block server startup
        asyncio.create_task(_backfill_job())
