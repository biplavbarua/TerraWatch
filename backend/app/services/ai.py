"""
OpenRouter-powered Q&A engine with function calling against the PostGIS DB.

Uses OpenRouter's OpenAI-compatible API with google/gemini-2.0-flash-001.
The model decides which tool(s) to call; we execute the SQL and return
the result back to the model for narration.
"""
from __future__ import annotations
import json
import logging
from typing import Any, Optional

from openai import AsyncOpenAI

from app import db
from app.config import settings

logger = logging.getLogger(__name__)

# ─── OpenRouter client ─────────────────────────────────────────────────────
_client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.GEMINI_API_KEY,
)

_MODEL = "google/gemini-2.0-flash-001"

_SYSTEM_PROMPT = """
You are TerraWatch AI — an intelligent assistant with real-time access to
NASA's EONET (Earth Observatory Natural Event Tracker) database.

You can answer questions about:
- Active and historical natural disasters worldwide
- Trends, statistics, and geographic patterns
- Specific events (wildfires, storms, earthquakes, volcanoes, etc.)

Always use your tools to fetch live data before answering. Be concise,
factual, and conversational. Format numbers with units and round appropriately.
When mentioning events, include their magnitude and location.
""".strip()

# ─── Tool schemas (OpenAI function-calling format) ─────────────────────────
_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_events",
            "description": (
                "Query natural disaster events from the EONET database. "
                "All parameters are optional — combine them to filter results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": (
                            "Event category. One of: wildfires, severeStorms, "
                            "earthquakes, floods, volcanoes, landslides, seaLakeIce, "
                            "drought, snow, tempExtremes, dustHaze, waterColor, manmade"
                        ),
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "closed", "all"],
                        "description": "open = currently active events",
                    },
                    "days": {
                        "type": "integer",
                        "description": "Limit to events updated within the last N days",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default 20, max 100)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stats",
            "description": "Get summary statistics: event counts grouped by category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["open", "closed", "all"],
                    },
                    "days": {
                        "type": "integer",
                        "description": "Count events active within the last N days",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_event_detail",
            "description": "Get full details and trajectory for one specific event by its EONET ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "eonet_id": {
                        "type": "string",
                        "description": "The EONET event ID, e.g. EONET_19481",
                    },
                },
                "required": ["eonet_id"],
            },
        },
    },
]


# ─── Tool implementations ──────────────────────────────────────────────────
async def _tool_query_events(
    category: Optional[str] = None,
    status: str = "open",
    days: Optional[int] = None,
    limit: int = 20,
) -> list[dict]:
    limit = min(max(1, limit), 100)
    where_clauses = []
    args: list[Any] = []
    i = 1

    if status != "all":
        where_clauses.append(f"e.status = ${i}")
        args.append(status)
        i += 1
    if category:
        where_clauses.append(f"e.category = ${i}")
        args.append(category)
        i += 1
    if days:
        where_clauses.append(f"g.recorded_at > NOW() - INTERVAL '{days} days'")

    where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    query = f"""
        SELECT
            e.eonet_id, e.title, e.category, e.status, e.source_url,
            g.recorded_at AS last_seen,
            ST_X(g.coordinates) AS lon, ST_Y(g.coordinates) AS lat,
            g.magnitude_value, g.magnitude_unit
        FROM events e
        LEFT JOIN LATERAL (
            SELECT * FROM event_geometries
            WHERE event_id = e.id
            ORDER BY recorded_at DESC LIMIT 1
        ) g ON TRUE
        {where_sql}
        ORDER BY g.recorded_at DESC NULLS LAST
        LIMIT ${i}
    """
    args.append(limit)
    rows = await db.fetch_all(query, *args)
    return [dict(r) for r in rows]


async def _tool_get_stats(status: str = "all", days: Optional[int] = None) -> list[dict]:
    where_parts = []
    args: list[Any] = []
    i = 1

    if status != "all":
        where_parts.append(f"status = ${i}")
        args.append(status)
        i += 1
    if days:
        where_parts.append(f"recorded_at > NOW() - INTERVAL '{days} days'")

    where_sql = "WHERE " + " AND ".join(where_parts) if where_parts else ""
    query = f"""
        SELECT category, COUNT(*) AS count
        FROM events {where_sql}
        GROUP BY category ORDER BY count DESC
    """
    rows = await db.fetch_all(query, *args)
    return [dict(r) for r in rows]


async def _tool_get_event_detail(eonet_id: str) -> Optional[dict]:
    event = await db.fetch_one(
        "SELECT * FROM events WHERE eonet_id = $1", eonet_id
    )
    if not event:
        return None
    path = await db.fetch_all(
        """
        SELECT recorded_at,
               ST_X(coordinates) AS lon, ST_Y(coordinates) AS lat,
               magnitude_value, magnitude_unit
        FROM event_geometries
        WHERE event_id = $1
        ORDER BY recorded_at ASC
        """,
        event["id"],
    )
    return {**dict(event), "path": [dict(p) for p in path]}


# ─── Tool dispatcher ───────────────────────────────────────────────────────
async def _dispatch_tool(name: str, args: dict) -> Any:
    if name == "query_events":
        return await _tool_query_events(**args)
    if name == "get_stats":
        return await _tool_get_stats(**args)
    if name == "get_event_detail":
        return await _tool_get_event_detail(**args)
    return {"error": f"Unknown tool: {name}"}


def _json_serialize(obj: Any) -> str:
    """JSON-serialize with datetime support."""
    import datetime

    def default(o: Any) -> Any:
        if isinstance(o, (datetime.datetime, datetime.date)):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o)} is not JSON serializable")

    return json.dumps(obj, default=default)


# ─── Public entry point ────────────────────────────────────────────────────
async def ask(question: str) -> str:
    """
    Run a multi-turn conversation with function calling via OpenRouter.
    Returns the final text answer.
    """
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]

    # Agentic loop — keep calling tools until model produces text
    for _ in range(5):  # max 5 tool rounds
        response = await _client.chat.completions.create(
            model=_MODEL,
            messages=messages,
            tools=_TOOLS,
            tool_choice="auto",
        )

        choice = response.choices[0]
        msg = choice.message

        # Append assistant message to history
        messages.append(msg.model_dump(exclude_none=True))

        # If no tool calls — we have a final answer
        if not msg.tool_calls:
            return msg.content or "I couldn't find relevant data for that question."

        # Execute all tool calls in this round
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            fn_args = json.loads(tc.function.arguments)
            logger.debug(f"AI tool call: {fn_name}({fn_args})")
            result = await _dispatch_tool(fn_name, fn_args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": _json_serialize(result),
            })

    return "I couldn't find relevant data for that question."
