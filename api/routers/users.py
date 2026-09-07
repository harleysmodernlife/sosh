from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db

router = APIRouter()


class UserProfile(BaseModel):
    id: UUID
    username: str | None
    display_name: str | None
    city: str | None
    country_code: str | None
    sosh_score: int
    trophy_count: int
    is_admin: bool = False


class UpdateProfileRequest(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    display_name: str | None = Field(None, max_length=50)
    city: str | None = Field(None, max_length=100)
    country_code: str | None = Field(None, min_length=2, max_length=2)


class PushTokenRequest(BaseModel):
    token: str = Field(..., max_length=200)


@router.get("/me", response_model=UserProfile)
async def get_my_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("""
            SELECT u.id, u.username, u.display_name, u.city, u.country_code,
                   COALESCE(s.score, 0) AS sosh_score,
                   (SELECT COUNT(*) FROM trophies WHERE user_id = u.id) AS trophy_count,
                   (EXISTS (SELECT 1 FROM user_roles WHERE user_id = u.id AND role = 'admin')) AS is_admin
            FROM users u
            LEFT JOIN sosh_score_snapshots s ON s.user_id = u.id
            WHERE u.id = :user_id
        """),
        {"user_id": current_user.user_id},
    )
    user = row.mappings().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(user)


@router.get("/{user_id}", response_model=UserProfile)
async def get_user_profile(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("""
            SELECT u.id, u.username, u.display_name, u.city, u.country_code,
                   COALESCE(s.score, 0) AS sosh_score,
                   (SELECT COUNT(*) FROM trophies WHERE user_id = u.id) AS trophy_count
            FROM users u
            LEFT JOIN sosh_score_snapshots s ON s.user_id = u.id
            WHERE u.id = :user_id
        """),
        {"user_id": user_id},
    )
    user = row.mappings().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(user)


@router.patch("/me", response_model=UserProfile)
async def update_my_profile(
    body: UpdateProfileRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    if "username" in updates:
        taken = await db.execute(
            text("SELECT 1 FROM users WHERE username = :u AND id != :uid"),
            {"u": updates["username"], "uid": current_user.user_id},
        )
        if taken.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["user_id"] = current_user.user_id

    await db.execute(
        text(f"UPDATE users SET {set_clause}, updated_at = now() WHERE id = :user_id"),
        updates,
    )
    await db.commit()

    return await get_my_profile(current_user, db)


@router.get("/me/entries")
async def get_my_entries(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT
                pe.id::text,
                pe.content_type,
                pe.text_content,
                pe.media_url,
                pe.vote_count,
                pe.created_at::text,
                p.id::text   AS pulse_id,
                p.prompt     AS pulse_prompt,
                p.city       AS pulse_city,
                p.status     AS pulse_status,
                (
                    SELECT COUNT(*) + 1
                    FROM pulse_entries pe2
                    WHERE pe2.pulse_id = pe.pulse_id
                      AND pe2.vote_count > pe.vote_count
                ) AS rank
            FROM pulse_entries pe
            JOIN pulses p ON p.id = pe.pulse_id
            WHERE pe.user_id = :user_id
            ORDER BY pe.created_at DESC
            LIMIT 50
        """),
        {"user_id": current_user.user_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.put("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(
    body: PushTokenRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE users SET push_token = :token, updated_at = now() WHERE id = :user_id"),
        {"token": body.token, "user_id": current_user.user_id},
    )
    await db.commit()
