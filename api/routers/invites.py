"""
Invite code system — controlled onboarding.

POST /admin/invites          — generate a new invite code (admin only)
GET  /invites/{code}         — validate a code (public, used before signup)
POST /invites/{code}/redeem  — mark a code as used (called after successful signup)
GET  /admin/invites          — list all codes with status (admin only)
"""
import secrets
import string
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db

router = APIRouter()

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 8


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


# ─── Admin endpoints ──────────────────────────────────────────────────────────

class CreateInviteRequest(BaseModel):
    label: str | None = None           # e.g. "Heather", "Beta tester #2"
    expires_days: int | None = 30      # None = no expiry


@router.post("/admin/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: CreateInviteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify admin
    row = await db.execute(
        text("SELECT 1 FROM user_roles WHERE user_id = :uid AND role = 'admin'"),
        {"uid": current_user.user_id},
    )
    if not row.first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    code = _generate_code()
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=body.expires_days)
        if body.expires_days else None
    )

    await db.execute(
        text("""
            INSERT INTO invite_codes (code, created_by, label, expires_at)
            VALUES (:code, :created_by, :label, :expires_at)
        """),
        {"code": code, "created_by": current_user.user_id, "label": body.label, "expires_at": expires_at},
    )
    await db.commit()

    return {
        "code": code,
        "label": body.label,
        "expires_at": expires_at.isoformat() if expires_at else None,
    }


@router.get("/admin/invites")
async def list_invites(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("SELECT 1 FROM user_roles WHERE user_id = :uid AND role = 'admin'"),
        {"uid": current_user.user_id},
    )
    if not row.first():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    rows = await db.execute(
        text("""
            SELECT
                ic.id::text, ic.code, ic.label,
                ic.created_at::text, ic.expires_at::text,
                ic.used_at::text,
                u.username AS used_by_username
            FROM invite_codes ic
            LEFT JOIN users u ON u.id = ic.used_by
            ORDER BY ic.created_at DESC
        """),
    )
    return [dict(r) for r in rows.mappings().all()]


# ─── Public endpoints ─────────────────────────────────────────────────────────

@router.get("/invites/{code}")
async def validate_invite(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Check if an invite code is valid and unused. Called before signup."""
    row = await db.execute(
        text("""
            SELECT code, label, used_at, expires_at
            FROM invite_codes
            WHERE code = :code
        """),
        {"code": code.upper()},
    )
    invite = row.mappings().first()

    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid invite code")

    if invite["used_at"] is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite code already used")

    if invite["expires_at"] and invite["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite code has expired")

    return {"code": invite["code"], "valid": True}


class RedeemInviteRequest(BaseModel):
    user_id: str   # UUID of the newly created user


@router.post("/invites/{code}/redeem", status_code=status.HTTP_204_NO_CONTENT)
async def redeem_invite(
    code: str,
    body: RedeemInviteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark an invite code as used. Called immediately after successful signup."""
    result = await db.execute(
        text("""
            UPDATE invite_codes
            SET used_by = :user_id, used_at = now()
            WHERE code = :code
              AND used_at IS NULL
              AND (expires_at IS NULL OR expires_at > now())
        """),
        {"code": code.upper(), "user_id": body.user_id},
    )
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invite code is invalid, already used, or expired",
        )
