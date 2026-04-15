"""
TerraWatch FastAPI application entrypoint.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app import db
from app.scheduler import start_scheduler, stop_scheduler, run_startup_tasks
from app.routers import events, ask

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("terrawatch")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────
    logger.info("TerraWatch starting …")
    await db.create_pool()
    await db.run_migration()
    start_scheduler()
    await run_startup_tasks()
    logger.info("TerraWatch ready ✓")
    yield
    # ── Shutdown ─────────────────────────────────────────────
    stop_scheduler()
    await db.close_pool()
    logger.info("TerraWatch stopped")


app = FastAPI(
    title="TerraWatch API",
    description="Real-time NASA EONET natural event intelligence",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow configured origins (use * for open development)
origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(events.router)
app.include_router(ask.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "terrawatch"}
