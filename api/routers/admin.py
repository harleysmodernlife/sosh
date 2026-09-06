"""
Admin endpoints — protected by role check (user_roles.role = 'admin').
v0.1 scope: manually fire a Pulse.

POST /admin/pulses     — create and activate a new Pulse
POST /admin/pulses/{id}/resolve — manually trigger leaderboard resolution
"""
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db
from workers.jobs import enqueue_leaderboard_resolve, enqueue_push_pulse_notification

router = APIRouter()


async def _require_admin(current_user: AuthenticatedUser, db: AsyncSession):
    row = await db.execute(
        text("SELECT role FROM user_roles WHERE user_id = :uid"),
        {"uid": current_user.user_id},
    )
    role = row.scalar()
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


class CreatePulseRequest(BaseModel):
    prompt: str = Field(..., max_length=200)
    submission_window_minutes: int = Field(15, ge=5, le=60)
    voting_window_hours: int = Field(2, ge=1, le=24)
    city: str | None = Field(None, max_length=100)
    country_code: str | None = Field(None, min_length=2, max_length=2)


class PulseCreatedResponse(BaseModel):
    id: UUID
    prompt: str
    status: str
    submission_ends_at: str
    voting_ends_at: str


@router.post("/pulses", response_model=PulseCreatedResponse, status_code=status.HTTP_201_CREATED)
async def fire_pulse(
    body: CreatePulseRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(current_user, db)

    # Ensure no other pulse is currently active
    active = await db.execute(
        text("SELECT id FROM pulses WHERE status IN ('active', 'voting') LIMIT 1")
    )
    if active.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A Pulse is already active. Resolve it before firing another.",
        )

    pulse_id = uuid4()
    await db.execute(
        text("""
            INSERT INTO pulses
                (id, prompt, status, city, country_code,
                 submission_ends_at, voting_ends_at, created_at, updated_at)
            VALUES
                (:id, :prompt, 'active', :city, :country_code,
                 now() + :submission_interval::interval,
                 now() + :submission_interval::interval + :voting_interval::interval,
                 now(), now())
        """),
        {
            "id": pulse_id,
            "prompt": body.prompt,
            "city": body.city,
            "country_code": body.country_code,
            "submission_interval": f"{body.submission_window_minutes} minutes",
            "voting_interval": f"{body.voting_window_hours} hours",
        },
    )
    await db.commit()

    # Enqueue jobs: send push notifications + schedule resolution
    enqueue_push_pulse_notification(str(pulse_id), body.prompt, body.city)
    enqueue_leaderboard_resolve(
        str(pulse_id),
        delay_seconds=(body.submission_window_minutes * 60) + (body.voting_window_hours * 3600),
    )

    row = await db.execute(
        text("""
            SELECT id, prompt, status,
                   submission_ends_at::text,
                   voting_ends_at::text
            FROM pulses WHERE id = :id
        """),
        {"id": pulse_id},
    )
    return dict(row.mappings().first())


@router.post("/pulses/{pulse_id}/resolve", status_code=status.HTTP_204_NO_CONTENT)
async def manually_resolve_pulse(
    pulse_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(current_user, db)

    row = await db.execute(
        text("SELECT status FROM pulses WHERE id = :id"),
        {"id": pulse_id},
    )
    pulse = row.mappings().first()
    if not pulse:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    if pulse["status"] == "resolved":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Pulse already resolved")

    enqueue_leaderboard_resolve(str(pulse_id), delay_seconds=0)
