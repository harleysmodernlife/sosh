"""
Trophy Case endpoints — v0.1 scope.

GET /trophies/{user_id}   — get a user's trophy case (public)
GET /trophies/me          — get own trophies (authenticated shortcut)
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db

router = APIRouter()


async def _get_trophies(user_id: UUID, db: AsyncSession):
    rows = await db.execute(
        text("""
            SELECT t.id, t.pulse_id, t.awarded_at::text,
                   p.prompt, p.city, p.country_code,
                   pe.content_type, pe.text_content, pe.media_url,
                   t.vote_count
            FROM trophies t
            JOIN pulses p ON p.id = t.pulse_id
            JOIN pulse_entries pe ON pe.id = t.entry_id
            WHERE t.user_id = :user_id
            ORDER BY t.awarded_at DESC
        """),
        {"user_id": user_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/me")
async def get_my_trophies(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_trophies(current_user.user_id, db)


@router.get("/{user_id}")
async def get_user_trophies(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    return await _get_trophies(user_id, db)
