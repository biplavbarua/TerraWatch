"""POST /api/ask — TerraWatch AI Q&A about EONET events.

Rate limited: 10 requests/minute per IP to protect OpenRouter quota.
"""
import logging
from pydantic import BaseModel, field_validator
from fastapi import APIRouter, HTTPException, Request

from app.services.ai import ask

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# Simple in-process rate limiting store (resets on restart)
# Now upgraded to use Upstash Redis if UPSTASH_REDIS_URL is configured.
import time
from collections import defaultdict
import redis.asyncio as redis
from app.config import settings

_request_log: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10        # max requests
_RATE_WINDOW = 60.0     # per 60 seconds

_redis_client = None
if settings.UPSTASH_REDIS_URL:
    _redis_client = redis.from_url(settings.UPSTASH_REDIS_URL, decode_responses=True)


async def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    now_ts = time.time()  # epoch time for redis

    if _redis_client:
        try:
            key = f"rate_limit:{ip}"
            # 1. Remove elements outside the window
            await _redis_client.zremrangebyscore(key, 0, now_ts - _RATE_WINDOW)
            # 2. Add current request
            await _redis_client.zadd(key, {str(now_ts): now_ts})
            # 3. Count requests in window
            count = await _redis_client.zcard(key)
            # 4. Set expiry to auto-cleanup the key
            await _redis_client.expire(key, int(_RATE_WINDOW) + 1)
            
            if count > _RATE_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded: {_RATE_LIMIT} requests per {int(_RATE_WINDOW)}s. Try again shortly.",
                )
            return
        except redis.RedisError as e:
            logger.warning(f"Redis rate limiting failed, falling back to in-memory: {e}")
        except HTTPException:
            raise

    # Fallback in-memory logic
    timestamps = _request_log[ip]
    # Drop timestamps outside the window
    _request_log[ip] = [t for t in timestamps if now - t < _RATE_WINDOW]
    if len(_request_log[ip]) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {_RATE_LIMIT} requests per {int(_RATE_WINDOW)}s. Try again shortly.",
        )
    _request_log[ip].append(now)


class AskRequest(BaseModel):
    question: str

    @field_validator("question")
    @classmethod
    def question_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Question cannot be empty")
        if len(v) > 500:
            raise ValueError("Question must be 500 characters or fewer")
        return v


class AskResponse(BaseModel):
    answer: str


@router.post("/ask", response_model=AskResponse)
async def ask_ai(req: AskRequest, request: Request):
    # Get client IP (works behind proxies too)
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    client_ip = client_ip.split(",")[0].strip()

    await _check_rate_limit(client_ip)

    try:
        answer = await ask(req.question)
        return AskResponse(answer=answer)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI ask failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service error")
