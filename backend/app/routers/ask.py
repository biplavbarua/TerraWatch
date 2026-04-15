"""POST /api/ask — Gemini AI Q&A about EONET events."""
import logging
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

from app.services.ai import ask

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str


@router.post("/ask", response_model=AskResponse)
async def ask_ai(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    try:
        answer = await ask(req.question.strip())
        return AskResponse(answer=answer)
    except Exception as e:
        logger.error(f"AI ask failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI service error")
