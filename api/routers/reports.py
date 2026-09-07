"""
Reports — users can flag inappropriate content.
POST /reports              — flag a pulse entry
POST /reports/post         — flag a post
POST /reports/user         — flag a user
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db

router = APIRouter()


class ReportRequest(BaseModel):
    entry_id: UUID


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def report_entry(
    body: ReportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify entry exists
    row = await db.execute(
        text("SELECT id FROM pulse_entries WHERE id = :id"),
        {"id": body.entry_id},
    )
    if not row.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    # Idempotent insert — silently ignore duplicate reports from same user
    await db.execute(
        text("""
            INSERT INTO entry_reports (entry_id, reported_by)
            VALUES (:entry_id, :user_id)
            ON CONFLICT (entry_id, reported_by) DO NOTHING
        """),
        {"entry_id": body.entry_id, "user_id": current_user.user_id},
    )
    await db.commit()


class PostReportRequest(BaseModel):
    post_id: UUID
    reason: str | None = None


@router.post("/post", status_code=status.HTTP_204_NO_CONTENT)
async def report_post(
    body: PostReportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(text("SELECT 1 FROM posts WHERE id = :id"), {"id": body.post_id})
    if not exists.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await db.execute(
        text("""
            INSERT INTO post_reports (post_id, reported_by, reason)
            VALUES (:post_id, :user_id, :reason)
            ON CONFLICT (post_id, reported_by) DO NOTHING
        """),
        {"post_id": body.post_id, "user_id": current_user.user_id, "reason": body.reason},
    )
    await db.commit()


class UserReportRequest(BaseModel):
    user_id: UUID
    reason: str | None = None


@router.post("/user", status_code=status.HTTP_204_NO_CONTENT)
async def report_user(
    body: UserReportRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if str(body.user_id) == current_user.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot report yourself")
    exists = await db.execute(text("SELECT 1 FROM users WHERE id = :id"), {"id": body.user_id})
    if not exists.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await db.execute(
        text("""
            INSERT INTO user_reports (user_id, reported_by, reason)
            VALUES (:user_id, :reported_by, :reason)
            ON CONFLICT (user_id, reported_by) DO NOTHING
        """),
        {"user_id": body.user_id, "reported_by": current_user.user_id, "reason": body.reason},
    )
    await db.commit()


# ── Admin: view reports ───────────────────────────────────────────────────────

@router.get("/admin/posts")
async def admin_post_reports(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(current_user.user_id, db)
    rows = await db.execute(
        text("""
            SELECT pr.post_id::text, pr.reported_by::text, pr.reason, pr.created_at::text,
                   u.username AS reporter_username,
                   p.content_type, p.text_content, p.media_url,
                   pu.username AS post_author_username
            FROM post_reports pr
            JOIN users u ON u.id = pr.reported_by
            JOIN posts p ON p.id = pr.post_id
            JOIN users pu ON pu.id = p.user_id
            ORDER BY pr.created_at DESC
            LIMIT 100
        """),
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/admin/users")
async def admin_user_reports(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT ur.user_id::text, ur.reported_by::text, ur.reason, ur.created_at::text,
                   reporter.username AS reporter_username,
                   reported.username AS reported_username
            FROM user_reports ur
            JOIN users reporter ON reporter.id = ur.reported_by
            JOIN users reported ON reported.id = ur.user_id
            ORDER BY ur.created_at DESC
            LIMIT 100
        """),
    )
    return [dict(r) for r in rows.mappings().all()]


async def _require_admin(user_id: str, db: AsyncSession):
    row = await db.execute(
        text("SELECT 1 FROM user_roles WHERE user_id = :uid AND role = 'admin'"),
        {"uid": user_id},
    )
    if not row.first():
        raise HTTPException(status_code=403, detail="Admin only")
