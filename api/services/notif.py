"""
Helper to insert a row into the notifications table.
Called inline after social actions (like, comment, follow).
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def create_notification(
    db: AsyncSession,
    *,
    user_id: str,        # recipient
    type: str,
    body: str,
    actor_id: str | None = None,
    post_id: str | None = None,
    pulse_id: str | None = None,
) -> None:
    """Insert a notification row. Silently swallows errors (non-fatal)."""
    try:
        await db.execute(
            text("""
                INSERT INTO notifications (user_id, type, body, actor_id, post_id, pulse_id)
                VALUES (:user_id, :type, :body, :actor_id, :post_id, :pulse_id)
            """),
            {
                "user_id": user_id,
                "type": type,
                "body": body,
                "actor_id": actor_id,
                "post_id": str(post_id) if post_id else None,
                "pulse_id": str(pulse_id) if pulse_id else None,
            },
        )
        # Caller is responsible for commit
    except Exception:
        pass
