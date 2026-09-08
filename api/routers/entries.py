"""
Pulse entry submission and reporting.

POST /entries          — submit a new entry for the active pulse
POST /entries/{id}/reports — report an entry for moderation
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from config import settings
from database import get_db
from redis_client import redis
from services.moderation import is_text_safe

router = APIRouter()


class SubmitEntryRequest(BaseModel):
    pulse_id: UUID
    content_type: str = Field(..., pattern="^(video|photo|text)$")
    text_content: str | None = Field(None, max_length=140)
    # For media entries: client uploads directly to R2 after getting a presigned URL,
    # then calls this endpoint with the resulting media_key.
    media_key: str | None = None


class EntryResponse(BaseModel):
    id: UUID
    pulse_id: UUID
    content_type: str
    text_content: str | None
    media_url: str | None
    created_at: str


REACTION_EMOJIS = {"❤️", "🔥", "👏", "😂"}


class ReactRequest(BaseModel):
    emoji: str


class ReportRequest(BaseModel):
    reason: str = Field(..., pattern="^(spam|offensive|csam|other)$")
    details: str | None = Field(None, max_length=500)


@router.post("", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
async def submit_entry(
    body: SubmitEntryRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify pulse is in active (submission) state
    row = await db.execute(
        text("SELECT status, submission_ends_at FROM pulses WHERE id = :id"),
        {"id": body.pulse_id},
    )
    pulse = row.mappings().first()
    if not pulse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    if pulse["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Submission window is closed",
        )

    # One entry per user per pulse
    existing = await db.execute(
        text("SELECT id FROM pulse_entries WHERE pulse_id = :pid AND user_id = :uid"),
        {"pid": body.pulse_id, "uid": current_user.user_id},
    )
    if existing.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already submitted an entry for this Pulse",
        )

    # Basic content moderation for text entries
    if body.content_type == "text":
        if not body.text_content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text_content required")
        if not is_text_safe(body.text_content):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Content did not pass moderation",
            )

    # Build public media_url from key if provided
    media_url = None
    if body.media_key:
        media_url = (
            f"{settings.supabase_url}/storage/v1/object/public"
            f"/sosh-media/{body.media_key}"
        )

    entry_id = uuid4()
    await db.execute(
        text("""
            INSERT INTO pulse_entries
                (id, pulse_id, user_id, content_type, text_content, media_url,
                 media_key, moderation_status, created_at)
            VALUES
                (:id, :pulse_id, :user_id, :content_type, :text_content, :media_url,
                 :media_key, 'approved', now())
        """),
        {
            "id": entry_id,
            "pulse_id": body.pulse_id,
            "user_id": current_user.user_id,
            "content_type": body.content_type,
            "text_content": body.text_content,
            "media_url": media_url,
            "media_key": body.media_key,
        },
    )
    await db.commit()

    # Seed entry in Redis leaderboard with 0 votes
    leaderboard_key = f"leaderboard:{body.pulse_id}"
    await redis.zadd(leaderboard_key, {str(entry_id): 0}, nx=True)

    row = await db.execute(
        text("SELECT id, pulse_id, content_type, text_content, media_url, created_at::text FROM pulse_entries WHERE id = :id"),
        {"id": entry_id},
    )
    return dict(row.mappings().first())


@router.get("/{entry_id}/reactions")
async def get_reactions(
    entry_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return reaction counts for an entry, including whether the viewer reacted."""
    rows = await db.execute(
        text("""
            SELECT emoji, COUNT(*) AS count,
                   BOOL_OR(user_id = :uid) AS viewer_reacted
            FROM entry_reactions
            WHERE entry_id = :eid
            GROUP BY emoji
        """),
        {"eid": entry_id, "uid": current_user.user_id},
    )
    counts = {r["emoji"]: {"count": int(r["count"]), "viewer_reacted": bool(r["viewer_reacted"])}
              for r in rows.mappings().all()}
    return {em: counts.get(em, {"count": 0, "viewer_reacted": False}) for em in REACTION_EMOJIS}


@router.post("/{entry_id}/react", status_code=status.HTTP_204_NO_CONTENT)
async def toggle_reaction(
    entry_id: UUID,
    body: ReactRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle an emoji reaction on an entry (add if absent, remove if present)."""
    if body.emoji not in REACTION_EMOJIS:
        raise HTTPException(status_code=400, detail="Invalid emoji")

    result = await db.execute(
        text("""
            INSERT INTO entry_reactions (entry_id, user_id, emoji)
            VALUES (:eid, :uid, :emoji)
            ON CONFLICT DO NOTHING
        """),
        {"eid": entry_id, "uid": current_user.user_id, "emoji": body.emoji},
    )
    if result.rowcount == 0:
        # Already reacted → remove
        await db.execute(
            text("DELETE FROM entry_reactions WHERE entry_id = :eid AND user_id = :uid AND emoji = :emoji"),
            {"eid": entry_id, "uid": current_user.user_id, "emoji": body.emoji},
        )
    await db.commit()


@router.post("/{entry_id}/reports", status_code=status.HTTP_204_NO_CONTENT)
async def report_entry(
    entry_id: UUID,
    body: ReportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO content_reports (id, reporter_id, entry_id, reason, details, created_at)
            VALUES (:id, :reporter_id, :entry_id, :reason, :details, now())
            ON CONFLICT DO NOTHING
        """),
        {
            "id": uuid4(),
            "reporter_id": current_user.user_id,
            "entry_id": entry_id,
            "reason": body.reason,
            "details": body.details,
        },
    )
    await db.commit()
