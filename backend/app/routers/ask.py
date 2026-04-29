"""POST /api/ask — TerraWatch AI Q&A about EONET events.

Rate limited: 10 requests/minute per IP to protect OpenRouter quota.
"""
import logging
from pydantic import BaseModel, field_validator
from fastapi import APIRouter, HTTPException, Request

from app.services.ai import ask

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# Simple in-process rate limiting store (resets on restart — good enough for MVP).
# For production, replace with Redis-backed slowapi or similar.
import time
from collections import defaultdict

_request_log: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 10        # max requests
_RATE_WINDOW = 60.0     # per 60 seconds


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
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

    _check_rate_limit(client_ip)

    try:
        answer = await ask(req.question)
        return AskResponse(answer=answer)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI ask failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service error")
