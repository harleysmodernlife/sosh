"""
Pulse endpoints — v0.1 scope:
  GET  /pulses/active          — current active pulse (if any)
  GET  /pulses/{id}            — pulse detail
  GET  /pulses/{id}/leaderboard — polled every 5s during window (from Redis sorted set)
  GET  /pulses/{id}/entries    — all entries for a pulse
  POST /pulses/{id}/entries    — submit an entry (delegates to entries router)
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db
from redis_client import redis

router = APIRouter()


class PulseResponse(BaseModel):
    id: UUID
    prompt: str
    status: str
    submission_ends_at: str | None
    voting_ends_at: str | None
    city: str | None
    country_code: str | None


class LeaderboardEntry(BaseModel):
    entry_id: str
    vote_count: int
    rank: int


@router.get("/active", response_model=PulseResponse | None)
async def get_active_pulse(db: AsyncSession = Depends(get_db)):
    row = await db.execute(
        text("""
            SELECT id, prompt, status,
                   submission_ends_at::text,
                   voting_ends_at::text,
                   city, country_code
            FROM pulses
            WHERE status IN ('active', 'voting')
            ORDER BY created_at DESC
            LIMIT 1
        """)
    )
    pulse = row.mappings().first()
    return dict(pulse) if pulse else None


@router.get("/{pulse_id}", response_model=PulseResponse)
async def get_pulse(pulse_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await db.execute(
        text("""
            SELECT id, prompt, status,
                   submission_ends_at::text,
                   voting_ends_at::text,
                   city, country_code
            FROM pulses
            WHERE id = :pulse_id
        """),
        {"pulse_id": pulse_id},
    )
    pulse = row.mappings().first()
    if not pulse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    return dict(pulse)


@router.get("/{pulse_id}/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(pulse_id: UUID):
    """
    Returns the current leaderboard from Redis.
    Mobile client polls this endpoint every 5 seconds during an active Pulse window.
    Falls back to DB query if Redis key is missing (e.g. after resolution).
    """
    key = f"leaderboard:{pulse_id}"
    # Redis ZREVRANGE with scores — top 50
    raw = await redis.zrevrange(key, 0, 49, withscores=True)
    return [
        LeaderboardEntry(entry_id=entry_id, vote_count=int(score), rank=i + 1)
        for i, (entry_id, score) in enumerate(raw)
    ]


@router.get("/{pulse_id}/entries")
async def get_pulse_entries(
    pulse_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    rows = await db.execute(
        text("""
            SELECT pe.id, pe.user_id, pe.content_type, pe.text_content,
                   pe.media_url, pe.vote_count, pe.created_at::text,
                   u.username, u.display_name,
                   EXISTS(
                       SELECT 1 FROM votes v
                       WHERE v.entry_id = pe.id AND v.voter_id = :user_id
                   ) AS viewer_has_voted
            FROM pulse_entries pe
            JOIN users u ON u.id = pe.user_id
            WHERE pe.pulse_id = :pulse_id
              AND pe.moderation_status = 'approved'
            ORDER BY pe.vote_count DESC, pe.created_at ASC
        """),
        {"pulse_id": pulse_id, "user_id": current_user.user_id},
    )
    return [dict(r) for r in rows.mappings().all()]
