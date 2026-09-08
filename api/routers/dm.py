"""
Direct messaging endpoints.

GET  /dm/conversations              — list my conversations
POST /dm/conversations              — start or get existing conversation {user_id}
GET  /dm/conversations/{id}/messages — load messages (newest first, paginated)
POST /dm/conversations/{id}/messages — send a message {body}
POST /dm/conversations/{id}/read    — mark all incoming messages as read
"""
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db

router = APIRouter()


class StartConversationRequest(BaseModel):
    user_id: UUID


class SendMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)


@router.get("/conversations")
async def list_conversations(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all conversations for the current user, with other-user info and last message."""
    rows = await db.execute(
        text("""
            SELECT
                c.id::text AS conversation_id,
                c.created_at::text,
                other_u.id::text   AS other_user_id,
                other_u.username   AS other_username,
                other_u.display_name AS other_display_name,
                other_u.avatar_url AS other_avatar_url,
                other_u.accent_color AS other_accent_color,
                lm.body            AS last_message_body,
                lm.sender_id::text AS last_message_sender_id,
                lm.created_at::text AS last_message_at,
                (
                    SELECT COUNT(*) FROM direct_messages dm2
                    WHERE dm2.conversation_id = c.id
                      AND dm2.sender_id != :me
                      AND dm2.read_at IS NULL
                ) AS unread_count
            FROM conversations c
            JOIN conversation_participants cp_me  ON cp_me.conversation_id  = c.id AND cp_me.user_id  = :me
            JOIN conversation_participants cp_other ON cp_other.conversation_id = c.id AND cp_other.user_id != :me
            JOIN users other_u ON other_u.id = cp_other.user_id
            LEFT JOIN LATERAL (
                SELECT body, sender_id, created_at
                FROM direct_messages
                WHERE conversation_id = c.id
                ORDER BY created_at DESC LIMIT 1
            ) lm ON true
            ORDER BY COALESCE(lm.created_at, c.created_at) DESC
        """),
        {"me": current_user.user_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.post("/conversations")
async def start_or_get_conversation(
    body: StartConversationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find or create a 1-to-1 conversation between the current user and target user."""
    if str(body.user_id) == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    # Does a conversation already exist between these two users?
    existing = await db.execute(
        text("""
            SELECT c.id::text AS conversation_id
            FROM conversations c
            JOIN conversation_participants a ON a.conversation_id = c.id AND a.user_id = :me
            JOIN conversation_participants b ON b.conversation_id = c.id AND b.user_id = :them
        """),
        {"me": current_user.user_id, "them": str(body.user_id)},
    )
    row = existing.mappings().first()
    if row:
        return {"conversation_id": row["conversation_id"]}

    # Create new conversation
    conv_id = str(uuid4())
    await db.execute(text("INSERT INTO conversations (id) VALUES (:id)"), {"id": conv_id})
    await db.execute(
        text("INSERT INTO conversation_participants (conversation_id, user_id) VALUES (:cid, :uid)"),
        {"cid": conv_id, "uid": current_user.user_id},
    )
    await db.execute(
        text("INSERT INTO conversation_participants (conversation_id, user_id) VALUES (:cid, :uid)"),
        {"cid": conv_id, "uid": str(body.user_id)},
    )
    await db.commit()
    return {"conversation_id": conv_id}


def _require_participant(row, current_user: AuthenticatedUser):
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: UUID,
    offset: int = 0,
    limit: int = 50,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify access
    access = await db.execute(
        text("SELECT 1 FROM conversation_participants WHERE conversation_id = :cid AND user_id = :uid"),
        {"cid": conversation_id, "uid": current_user.user_id},
    )
    if not access.first():
        raise HTTPException(status_code=404, detail="Conversation not found")

    rows = await db.execute(
        text("""
            SELECT dm.id::text, dm.conversation_id::text, dm.sender_id::text,
                   dm.body, dm.created_at::text, dm.read_at::text,
                   u.username AS sender_username,
                   u.display_name AS sender_display_name,
                   u.avatar_url AS sender_avatar_url,
                   u.accent_color AS sender_accent_color
            FROM direct_messages dm
            JOIN users u ON u.id = dm.sender_id
            WHERE dm.conversation_id = :cid
            ORDER BY dm.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"cid": conversation_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: UUID,
    body: SendMessageRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify access
    access = await db.execute(
        text("SELECT 1 FROM conversation_participants WHERE conversation_id = :cid AND user_id = :uid"),
        {"cid": conversation_id, "uid": current_user.user_id},
    )
    if not access.first():
        raise HTTPException(status_code=404, detail="Conversation not found")

    msg_id = str(uuid4())
    await db.execute(
        text("""
            INSERT INTO direct_messages (id, conversation_id, sender_id, body)
            VALUES (:id, :cid, :sender, :body)
        """),
        {"id": msg_id, "cid": conversation_id, "sender": current_user.user_id, "body": body.body},
    )
    await db.commit()

    row = await db.execute(
        text("""
            SELECT dm.id::text, dm.conversation_id::text, dm.sender_id::text,
                   dm.body, dm.created_at::text, dm.read_at::text,
                   u.username AS sender_username,
                   u.display_name AS sender_display_name,
                   u.avatar_url AS sender_avatar_url,
                   u.accent_color AS sender_accent_color
            FROM direct_messages dm
            JOIN users u ON u.id = dm.sender_id
            WHERE dm.id = :id
        """),
        {"id": msg_id},
    )
    return dict(row.mappings().first())


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    conversation_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify access
    access = await db.execute(
        text("SELECT 1 FROM conversation_participants WHERE conversation_id = :cid AND user_id = :uid"),
        {"cid": conversation_id, "uid": current_user.user_id},
    )
    if not access.first():
        raise HTTPException(status_code=404, detail="Conversation not found")

    await db.execute(
        text("""
            UPDATE direct_messages
            SET read_at = now()
            WHERE conversation_id = :cid
              AND sender_id != :uid
              AND read_at IS NULL
        """),
        {"cid": conversation_id, "uid": current_user.user_id},
    )
    await db.commit()
