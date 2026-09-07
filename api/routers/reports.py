"""
Entry reports — users can flag inappropriate content.
POST /reports   — flag an entry (idempotent per user per entry)
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
