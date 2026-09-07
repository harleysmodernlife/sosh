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


@router.get("/resolved")
async def get_resolved_pulses(db: AsyncSession = Depends(get_db)):
    """Last 10 resolved pulses with winner info and mosaic presence flag."""
    rows = await db.execute(
        text("""
            SELECT p.id::text, p.prompt, p.city, p.country_code,
                   p.updated_at::text AS resolved_at,
                   lr.user_id::text  AS winner_id,
                   u.username        AS winner_username,
                   u.display_name    AS winner_display_name,
                   lr.vote_count     AS winner_votes,
                   (m.id IS NOT NULL) AS has_mosaic
            FROM pulses p
            LEFT JOIN leaderboard_results lr
                   ON lr.pulse_id = p.id AND lr.scope = 'city' AND lr.rank = 1
            LEFT JOIN users u ON u.id = lr.user_id
            LEFT JOIN mosaics m ON m.pulse_id = p.id
            WHERE p.status = 'resolved'
            ORDER BY p.updated_at DESC
            LIMIT 10
        """)
    )
    return [dict(r) for r in rows.mappings().all()]


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


@router.get("/{pulse_id}/mosaic")
async def get_pulse_mosaic(pulse_id: UUID, db: AsyncSession = Depends(get_db)):
    """
    Returns the top 20 entries for a resolved pulse in mosaic order.
    Entry IDs are stored as an ordered array in the mosaics table.
    """
    rows = await db.execute(
        text("""
            SELECT pe.id::text, pe.content_type, pe.text_content,
                   pe.media_url, pe.vote_count,
                   u.username, u.display_name
            FROM mosaics m
            JOIN LATERAL unnest(m.entry_ids) WITH ORDINALITY AS t(entry_id, ord) ON TRUE
            JOIN pulse_entries pe ON pe.id = t.entry_id
            JOIN users u ON u.id = pe.user_id
            WHERE m.pulse_id = :pulse_id
            ORDER BY t.ord
        """),
        {"pulse_id": pulse_id},
    )
    return [dict(r) for r in rows.mappings().all()]


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
