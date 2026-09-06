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
    username: str
    display_name: str | None
    city: str | None
    country_code: str | None
    sosh_score: int
    trophy_count: int


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(None, max_length=50)
    city: str | None = Field(None, max_length=100)
    country_code: str | None = Field(None, min_length=2, max_length=2)


@router.get("/me", response_model=UserProfile)
async def get_my_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
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

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["user_id"] = current_user.user_id

    await db.execute(
        text(f"UPDATE users SET {set_clause}, updated_at = now() WHERE id = :user_id"),
        updates,
    )
    await db.commit()

    return await get_my_profile(current_user, db)
