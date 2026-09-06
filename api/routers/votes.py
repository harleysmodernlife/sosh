"""
Vote endpoints — v0.1 scope.

POST   /votes              — cast a vote
DELETE /votes/{entry_id}   — remove a vote

Vote writes go to Redis first (sorted set leaderboard score += 1).
A background job (workers/vote_flush.py) flushes Redis → PostgreSQL every 10 seconds.
"""
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db
from redis_client import redis

router = APIRouter()


class CastVoteRequest(BaseModel):
    entry_id: UUID


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def cast_vote(
    body: CastVoteRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify entry exists and pulse is in votable state
    row = await db.execute(
        text("""
            SELECT pe.id, pe.pulse_id, p.status, p.voting_ends_at
            FROM pulse_entries pe
            JOIN pulses p ON p.id = pe.pulse_id
            WHERE pe.id = :entry_id
        """),
        {"entry_id": body.entry_id},
    )
    entry = row.mappings().first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    if entry["status"] not in ("active", "voting"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Voting window is closed",
        )

    # Can't vote on own entry
    submitter_row = await db.execute(
        text("SELECT user_id FROM pulse_entries WHERE id = :id"),
        {"id": body.entry_id},
    )
    submitter = submitter_row.scalar()
    if str(submitter) == str(current_user.user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot vote for your own entry",
        )

    # Write vote to DB (unique constraint prevents duplicates)
    try:
        await db.execute(
            text("""
                INSERT INTO votes (id, entry_id, voter_id, pulse_id, created_at)
                VALUES (:id, :entry_id, :voter_id, :pulse_id, now())
            """),
            {
                "id": uuid4(),
                "entry_id": body.entry_id,
                "voter_id": current_user.user_id,
                "pulse_id": entry["pulse_id"],
            },
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already voted for this entry",
        )

    # Increment Redis leaderboard score
    leaderboard_key = f"leaderboard:{entry['pulse_id']}"
    await redis.zincrby(leaderboard_key, 1, str(body.entry_id))


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_vote(
    entry_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text("""
            SELECT v.id, pe.pulse_id, p.status
            FROM votes v
            JOIN pulse_entries pe ON pe.id = v.entry_id
            JOIN pulses p ON p.id = pe.pulse_id
            WHERE v.entry_id = :entry_id AND v.voter_id = :voter_id
        """),
        {"entry_id": entry_id, "voter_id": current_user.user_id},
    )
    vote = row.mappings().first()
    if not vote:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vote not found")
    if vote["status"] not in ("active", "voting"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Voting window is closed",
        )

    await db.execute(
        text("DELETE FROM votes WHERE entry_id = :entry_id AND voter_id = :voter_id"),
        {"entry_id": entry_id, "voter_id": current_user.user_id},
    )
    await db.commit()

    # Decrement Redis leaderboard score (floor at 0)
    leaderboard_key = f"leaderboard:{vote['pulse_id']}"
    await redis.zincrby(leaderboard_key, -1, str(entry_id))
