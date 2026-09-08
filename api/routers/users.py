from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from config import settings
from database import get_db
from services.notif import create_notification
from services.push import send_follow_notification

router = APIRouter()


_ACCENT_PALETTE = {
    "#E63946",  # red
    "#F4A261",  # orange
    "#2A9D8F",  # teal
    "#457B9D",  # steel blue
    "#8338EC",  # purple
    "#06D6A0",  # mint
}


class UserProfile(BaseModel):
    id: UUID
    username: str | None
    display_name: str | None
    bio: str | None = None
    city: str | None
    country_code: str | None
    avatar_url: str | None = None
    accent_color: str | None = None
    sosh_score: int
    trophy_count: int
    follower_count: int = 0
    following_count: int = 0
    viewer_is_following: bool = False
    viewer_has_blocked: bool = False
    is_admin: bool = False


class UpdateProfileRequest(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$")
    display_name: str | None = Field(None, max_length=50)
    bio: str | None = Field(None, max_length=200)
    city: str | None = Field(None, max_length=100)
    country_code: str | None = Field(None, min_length=2, max_length=2)
    avatar_url: str | None = Field(None, max_length=500)
    accent_color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class PushTokenRequest(BaseModel):
    token: str = Field(..., max_length=200)


@router.get("/me", response_model=UserProfile)
async def get_my_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("""
            SELECT u.id, u.username, u.display_name, u.bio, u.city, u.country_code, u.avatar_url,
                   u.accent_color,
                   COALESCE(s.score, 0) AS sosh_score,
                   (SELECT COUNT(*) FROM trophies WHERE user_id = u.id) AS trophy_count,
                   (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
                   (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count,
                   FALSE AS viewer_is_following,
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


@router.get("/search", response_model=list[UserProfile])
async def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT u.id, u.username, u.display_name, u.bio, u.city, u.country_code, u.avatar_url,
                   u.accent_color,
                   COALESCE(s.score, 0) AS sosh_score,
                   (SELECT COUNT(*) FROM trophies WHERE user_id = u.id) AS trophy_count,
                   0 AS follower_count,
                   0 AS following_count,
                   FALSE AS viewer_is_following,
                   FALSE AS is_admin
            FROM users u
            LEFT JOIN sosh_score_snapshots s ON s.user_id = u.id
            WHERE u.username ILIKE :q OR u.display_name ILIKE :q
            ORDER BY COALESCE(s.score, 0) DESC
            LIMIT 30
        """),
        {"q": f"%{q}%"},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/{user_id}", response_model=UserProfile)
async def get_user_profile(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Optionally resolve viewer from Authorization header (best-effort, no error if missing)
    viewer_id = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            import jwt
            from auth import _jwks_client
            from config import settings as _s
            token = auth_header[7:]
            try:
                signing_key = _jwks_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(token, signing_key.key, algorithms=["ES256", "RS256"], audience="authenticated")
            except Exception:
                payload = jwt.decode(token, _s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
            viewer_id = payload.get("sub")
        except Exception:
            pass

    row = await db.execute(
        text("""
            SELECT u.id, u.username, u.display_name, u.bio, u.city, u.country_code, u.avatar_url,
                   u.accent_color,
                   COALESCE(s.score, 0) AS sosh_score,
                   (SELECT COUNT(*) FROM trophies WHERE user_id = u.id) AS trophy_count,
                   (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
                   (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count,
                   (EXISTS (SELECT 1 FROM follows WHERE follower_id = :viewer_id AND following_id = u.id)) AS viewer_is_following,
                   (EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = :viewer_id AND blocked_id = u.id)) AS viewer_has_blocked
            FROM users u
            LEFT JOIN sosh_score_snapshots s ON s.user_id = u.id
            WHERE u.id = :user_id
        """),
        {"user_id": user_id, "viewer_id": str(viewer_id) if viewer_id else "00000000-0000-0000-0000-000000000000"},
    )
    user = row.mappings().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(user)


@router.get("/{user_id}/followers")
async def get_followers(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT u.id::text, u.username, u.display_name, u.avatar_url, u.accent_color,
                   COALESCE(s.score, 0) AS sosh_score
            FROM follows f
            JOIN users u ON u.id = f.follower_id
            LEFT JOIN sosh_score_snapshots s ON s.user_id = u.id
            WHERE f.following_id = :user_id
            ORDER BY f.created_at DESC
            LIMIT 200
        """),
        {"user_id": user_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/{user_id}/following")
async def get_following(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT u.id::text, u.username, u.display_name, u.avatar_url, u.accent_color,
                   COALESCE(s.score, 0) AS sosh_score
            FROM follows f
            JOIN users u ON u.id = f.following_id
            LEFT JOIN sosh_score_snapshots s ON s.user_id = u.id
            WHERE f.follower_id = :user_id
            ORDER BY f.created_at DESC
            LIMIT 200
        """),
        {"user_id": user_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.post("/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def follow_user(
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if str(user_id) == current_user.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot follow yourself")

    # Get follower's display name for notification
    name_row = await db.execute(
        text("SELECT COALESCE(display_name, '@' || username) AS name FROM users WHERE id = :uid"),
        {"uid": current_user.user_id},
    )
    follower_name = (name_row.mappings().first() or {}).get("name", "Someone")

    # Get followed user's push token for notification
    token_row = await db.execute(
        text("SELECT push_token FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    followed_token = (token_row.mappings().first() or {}).get("push_token")

    result = await db.execute(
        text("INSERT INTO follows (follower_id, following_id) VALUES (:follower, :following) ON CONFLICT DO NOTHING"),
        {"follower": current_user.user_id, "following": user_id},
    )
    if result.rowcount > 0:
        await create_notification(
            db,
            user_id=str(user_id),
            type="follow",
            body=f"{follower_name} followed you",
            actor_id=current_user.user_id,
        )
        await db.commit()
        if followed_token:
            send_follow_notification(followed_token, follower_name, current_user.user_id)
    else:
        await db.commit()


@router.delete("/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
async def unfollow_user(
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM follows WHERE follower_id = :follower AND following_id = :following"),
        {"follower": current_user.user_id, "following": user_id},
    )
    await db.commit()


@router.post("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def block_user(
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if str(user_id) == current_user.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot block yourself")
    # Remove any follow relationship in both directions
    await db.execute(
        text("""
            DELETE FROM follows
            WHERE (follower_id = :me AND following_id = :them)
               OR (follower_id = :them AND following_id = :me)
        """),
        {"me": current_user.user_id, "them": str(user_id)},
    )
    await db.execute(
        text("""
            INSERT INTO user_blocks (blocker_id, blocked_id)
            VALUES (:blocker, :blocked)
            ON CONFLICT DO NOTHING
        """),
        {"blocker": current_user.user_id, "blocked": str(user_id)},
    )
    await db.commit()


@router.delete("/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
async def unblock_user(
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM user_blocks WHERE blocker_id = :blocker AND blocked_id = :blocked"),
        {"blocker": current_user.user_id, "blocked": str(user_id)},
    )
    await db.commit()


@router.patch("/me", response_model=UserProfile)
async def update_my_profile(
    body: UpdateProfileRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Use exclude_unset so explicitly sent null values (to clear fields) are included
    updates = body.model_dump(exclude_unset=True)
    # Strip unset non-nullable fields that weren't sent
    updates = {k: v for k, v in updates.items() if k in ("accent_color", "bio") or v is not None}
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    if "username" in updates:
        taken = await db.execute(
            text("SELECT 1 FROM users WHERE username = :u AND id != :uid"),
            {"u": updates["username"], "uid": current_user.user_id},
        )
        if taken.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    if "accent_color" in updates and updates["accent_color"] is not None and updates["accent_color"] not in _ACCENT_PALETTE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid accent color. Choose from: {', '.join(sorted(_ACCENT_PALETTE))}",
        )

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


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete the authenticated user's account and all their data.
    Order matters: delete dependent rows before the users row.
    Finally, delete the Supabase Auth identity so the email can be re-used.
    """
    uid = current_user.user_id

    # 1. Delete votes they cast (voter_id FK, no cascade)
    await db.execute(text("DELETE FROM votes WHERE voter_id = :uid"), {"uid": uid})

    # 2. Delete their entries — cascades: votes received on those entries, entry_reports
    await db.execute(text("DELETE FROM pulse_entries WHERE user_id = :uid"), {"uid": uid})

    # 3. Delete trophies, leaderboard results, score snapshot, roles
    await db.execute(text("DELETE FROM trophies WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM leaderboard_results WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM sosh_score_snapshots WHERE user_id = :uid"), {"uid": uid})
    await db.execute(text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": uid})

    # 4. Null out invite code redemptions (don't block the invite code from being re-used)
    await db.execute(
        text("UPDATE invite_codes SET used_by = NULL, used_at = NULL WHERE used_by = :uid"),
        {"uid": uid},
    )

    # 5. Delete user row (follows cascade automatically via FK ON DELETE CASCADE)
    await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})

    await db.commit()

    # 6. Delete Supabase Auth identity via Admin API
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
            # Auth deletion failure is non-fatal for the response —
            # the user row and all data are already gone.
            pass


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
