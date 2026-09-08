"""
Admin endpoints — protected by role check (user_roles.role = 'admin').
v0.1 scope: manually fire a Pulse.

POST /admin/pulses     — create and activate a new Pulse
POST /admin/pulses/{id}/resolve — manually trigger leaderboard resolution
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from rq_scheduler import Scheduler

from auth import AuthenticatedUser, get_current_user
from config import settings
from database import get_db
from redis_client import redis_sync
from workers.jobs import enqueue_leaderboard_resolve, enqueue_push_pulse_notification

DAILY_CRON_ID = "sosh:daily-pulse"

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
    now = datetime.now(timezone.utc)
    submission_ends_at = now + timedelta(minutes=body.submission_window_minutes)
    voting_ends_at = submission_ends_at + timedelta(hours=body.voting_window_hours)

    await db.execute(
        text("""
            INSERT INTO pulses
                (id, prompt, status, city, country_code,
                 submission_ends_at, voting_ends_at, created_at, updated_at)
            VALUES
                (:id, :prompt, 'active', :city, :country_code,
                 :submission_ends_at, :voting_ends_at,
                 now(), now())
        """),
        {
            "id": pulse_id,
            "prompt": body.prompt,
            "city": body.city,
            "country_code": body.country_code,
            "submission_ends_at": submission_ends_at,
            "voting_ends_at": voting_ends_at,
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


# ─── Schedule management ──────────────────────────────────────────────────────

class ScheduleRequest(BaseModel):
    cron: str = Field("0 18 * * *", description="Cron expression in UTC (default: 18:00 UTC / 1pm CDT)")


class ScheduleStatus(BaseModel):
    enabled: bool
    cron: str | None
    next_run: str | None


def _get_scheduler() -> Scheduler:
    return Scheduler(queue_name="sosh", connection=redis_sync)


def _find_cron_job(scheduler: Scheduler):
    for dt, job in scheduler.get_jobs(with_times=True):
        if job.id == DAILY_CRON_ID:
            return dt, job
    return None, None


@router.get("/schedule", response_model=ScheduleStatus)
async def get_schedule(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(current_user, db)
    scheduler = _get_scheduler()
    dt, job = _find_cron_job(scheduler)
    if job is None:
        return ScheduleStatus(enabled=False, cron=None, next_run=None)
    cron_str = job.meta.get("cron_string") if job.meta else None
    return ScheduleStatus(
        enabled=True,
        cron=cron_str,
        next_run=dt.isoformat() if dt else None,
    )


@router.post("/schedule", response_model=ScheduleStatus)
async def set_schedule(
    body: ScheduleRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(current_user, db)
    scheduler = _get_scheduler()

    # Cancel any existing cron for this ID
    try:
        scheduler.cancel(DAILY_CRON_ID)
    except Exception:
        pass

    scheduler.cron(
        body.cron,
        func="workers.worker_fire_pulse.fire_daily_pulse",
        id=DAILY_CRON_ID,
        use_local_timezone=False,
        repeat=None,  # run forever
    )

    dt, job = _find_cron_job(scheduler)
    return ScheduleStatus(
        enabled=True,
        cron=body.cron,
        next_run=dt.isoformat() if dt else None,
    )


@router.delete("/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(current_user, db)
    scheduler = _get_scheduler()
    try:
        scheduler.cancel(DAILY_CRON_ID)
    except Exception:
        pass


# ─── Moderation ───────────────────────────────────────────────────────────────

@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: delete any post regardless of ownership."""
    await _require_admin(current_user, db)
    result = await db.execute(
        text("DELETE FROM posts WHERE id = :id"),
        {"id": post_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Post not found")


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_ban_user(
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: permanently ban (delete) a user account and all their data."""
    await _require_admin(current_user, db)
    uid = str(user_id)

    await db.execute(text("DELETE FROM votes WHERE voter_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM pulse_entries WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM trophies WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM leaderboard_results WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM sosh_score_snapshots WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": uid})
    await db.execute(
        text("UPDATE invite_codes SET used_by = NULL, used_at = NULL WHERE used_by = :uid"),
        {"uid": uid},
    )
    result = await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")

    if settings.supabase_url and settings.supabase_service_role_key:
        try:
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"{settings.supabase_url}/auth/v1/admin/users/{uid}",
                    headers={
                        "apikey": settings.supabase_service_role_key,
                        "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    },
                    timeout=10,
                )
        except Exception:
            pass
