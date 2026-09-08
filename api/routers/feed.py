"""
Content feed — paginated stream of approved entries from resolved Pulses.
GET /feed?offset=0&limit=10

Each entry includes the pulse prompt so the context is always visible.
Ordered by entry creation time descending (newest first).
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter()

MAX_LIMIT = 20


@router.get("")
async def get_feed(
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT
                pe.id::text,
                pe.user_id::text,
                pe.content_type,
                pe.text_content,
                pe.media_url,
                pe.vote_count,
                pe.created_at::text,
                u.username,
                u.display_name,
                u.city,
                p.id::text   AS pulse_id,
                p.prompt     AS pulse_prompt,
                p.city       AS pulse_city
            FROM pulse_entries pe
            JOIN pulses p ON p.id = pe.pulse_id
            JOIN users u  ON u.id = pe.user_id
            WHERE p.status = 'resolved'
              AND pe.moderation_status = 'approved'
            ORDER BY (EXTRACT(EPOCH FROM pe.created_at) + pe.vote_count * 3600) DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]
