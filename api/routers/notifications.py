"""
Notification inbox endpoints.

GET  /notifications        — list last 50 notifications for current user
POST /notifications/read   — mark all as read
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db

router = APIRouter()


@router.get("")
async def list_notifications(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT
                n.id::text,
                n.type,
                n.body,
                n.read,
                n.created_at::text,
                n.post_id::text,
                n.pulse_id::text,
                n.actor_id::text,
                u.username     AS actor_username,
                u.display_name AS actor_display_name,
                u.avatar_url   AS actor_avatar_url,
                u.accent_color AS actor_accent_color
            FROM notifications n
            LEFT JOIN users u ON u.id = n.actor_id
            WHERE n.user_id = :user_id
            ORDER BY n.created_at DESC
            LIMIT 50
        """),
        {"user_id": current_user.user_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/unread-count")
async def unread_count(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("SELECT COUNT(*) AS count FROM notifications WHERE user_id = :uid AND read = FALSE"),
        {"uid": current_user.user_id},
    )
    return {"count": row.scalar()}


@router.post("/read", status_code=204)
async def mark_all_read(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE notifications SET read = TRUE WHERE user_id = :uid AND read = FALSE"),
        {"uid": current_user.user_id},
    )
    await db.commit()
