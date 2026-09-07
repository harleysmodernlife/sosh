"""
Post endpoints — freeform user posts (permanent gallery + social feed).

POST   /posts                    — create a post
GET    /posts/feed               — home feed: posts from followed users + own posts
GET    /users/{id}/posts         — all posts by a user (profile gallery)
DELETE /posts/{id}               — delete own post
POST   /posts/{id}/like          — like a post
DELETE /posts/{id}/like          — unlike a post
"""
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import AuthenticatedUser, get_current_user
from database import get_db
from services.push import send_like_notification, send_comment_notification

router = APIRouter()


class CreatePostRequest(BaseModel):
    content_type: str = Field(..., pattern="^(text|photo|video)$")
    text_content: str | None = Field(None, max_length=500)
    media_url: str | None = Field(None, max_length=1000)
    caption: str | None = Field(None, max_length=200)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(
    body: CreatePostRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.content_type == "text" and not body.text_content:
        raise HTTPException(status_code=400, detail="text_content required for text posts")
    if body.content_type in ("photo", "video") and not body.media_url:
        raise HTTPException(status_code=400, detail="media_url required for photo/video posts")

    post_id = str(uuid4())
    await db.execute(
        text("""
            INSERT INTO posts (id, user_id, content_type, text_content, media_url, caption)
            VALUES (:id, :user_id, :content_type, :text_content, :media_url, :caption)
        """),
        {
            "id": post_id,
            "user_id": current_user.user_id,
            "content_type": body.content_type,
            "text_content": body.text_content,
            "media_url": body.media_url,
            "caption": body.caption,
        },
    )
    await db.commit()

    row = await db.execute(
        text("""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   false AS viewer_has_liked
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.id = :id
        """),
        {"id": post_id},
    )
    return dict(row.mappings().first())


@router.get("/feed")
async def get_post_feed(
    offset: int = 0,
    limit: int = 20,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Global For You feed — all posts, newest first."""
    rows = await db.execute(
        text("""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   (EXISTS (
                       SELECT 1 FROM post_likes pl
                       WHERE pl.post_id = p.id AND pl.user_id = :viewer_id
                   )) AS viewer_has_liked
            FROM posts p
            JOIN users u ON u.id = p.user_id
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"viewer_id": current_user.user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/user/{user_id}")
async def get_user_posts(
    user_id: UUID,
    offset: int = 0,
    limit: int = 30,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text("""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   (EXISTS (
                       SELECT 1 FROM post_likes pl
                       WHERE pl.post_id = p.id AND pl.user_id = :viewer_id
                   )) AS viewer_has_liked
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id = :user_id
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"user_id": user_id, "viewer_id": current_user.user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]


class UpdatePostRequest(BaseModel):
    text_content: str | None = Field(None, max_length=500)
    caption: str | None = Field(None, max_length=300)


@router.patch("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def update_post(
    post_id: UUID,
    body: UpdatePostRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            UPDATE posts
            SET text_content = :text_content,
                caption = :caption
            WHERE id = :id AND user_id = :uid
        """),
        {"id": post_id, "uid": current_user.user_id,
         "text_content": body.text_content, "caption": body.caption},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Post not found or not yours")


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("DELETE FROM posts WHERE id = :id AND user_id = :uid"),
        {"id": post_id, "uid": current_user.user_id},
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Post not found or not yours")


@router.post("/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
async def like_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch post author info and liker display name in one query
    row = await db.execute(
        text("""
            SELECT p.user_id::text AS author_id,
                   u_author.push_token AS author_push_token,
                   COALESCE(u_liker.display_name, '@' || u_liker.username) AS liker_name
            FROM posts p
            JOIN users u_author ON u_author.id = p.user_id
            JOIN users u_liker  ON u_liker.id  = :liker_id
            WHERE p.id = :post_id
        """),
        {"post_id": post_id, "liker_id": current_user.user_id},
    )
    post_info = row.mappings().first()
    if not post_info:
        raise HTTPException(status_code=404, detail="Post not found")

    result = await db.execute(
        text("""
            INSERT INTO post_likes (post_id, user_id)
            VALUES (:post_id, :user_id)
            ON CONFLICT DO NOTHING
        """),
        {"post_id": post_id, "user_id": current_user.user_id},
    )
    if result.rowcount > 0:
        await db.execute(
            text("UPDATE posts SET like_count = like_count + 1 WHERE id = :id"),
            {"id": post_id},
        )
    await db.commit()

    # Send push notification to author (skip self-likes)
    if (
        result.rowcount > 0
        and post_info["author_id"] != current_user.user_id
        and post_info["author_push_token"]
    ):
        send_like_notification(
            post_info["author_push_token"],
            post_info["liker_name"],
            str(post_id),
        )


@router.delete("/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
async def unlike_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("DELETE FROM post_likes WHERE post_id = :post_id AND user_id = :user_id"),
        {"post_id": post_id, "user_id": current_user.user_id},
    )
    if result.rowcount > 0:
        await db.execute(
            text("UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = :id"),
            {"id": post_id},
        )
    await db.commit()


# ── Comments ──────────────────────────────────────────────────────────────────

_COMMENT_SELECT = """
    SELECT c.id::text, c.post_id::text, c.user_id::text, c.body, c.created_at::text,
           u.username, u.display_name, u.avatar_url, u.accent_color
    FROM post_comments c
    JOIN users u ON u.id = c.user_id
"""


class CreateCommentRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=300)


@router.get("/{post_id}/comments")
async def get_comments(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text(f"{_COMMENT_SELECT} WHERE c.post_id = :post_id ORDER BY c.created_at ASC"),
        {"post_id": post_id},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.post("/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    post_id: UUID,
    body: CreateCommentRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch post author info + commenter display name
    info_row = await db.execute(
        text("""
            SELECT p.user_id::text AS author_id,
                   u_author.push_token AS author_push_token,
                   COALESCE(u_commenter.display_name, '@' || u_commenter.username) AS commenter_name
            FROM posts p
            JOIN users u_author    ON u_author.id    = p.user_id
            JOIN users u_commenter ON u_commenter.id = :commenter_id
            WHERE p.id = :post_id
        """),
        {"post_id": post_id, "commenter_id": current_user.user_id},
    )
    post_info = info_row.mappings().first()
    if not post_info:
        raise HTTPException(status_code=404, detail="Post not found")

    comment_id = str(uuid4())
    await db.execute(
        text("INSERT INTO post_comments (id, post_id, user_id, body) VALUES (:id, :post_id, :uid, :body)"),
        {"id": comment_id, "post_id": post_id, "uid": current_user.user_id, "body": body.body},
    )
    await db.execute(
        text("UPDATE posts SET comment_count = comment_count + 1 WHERE id = :id"),
        {"id": post_id},
    )
    await db.commit()

    row = await db.execute(
        text(f"{_COMMENT_SELECT} WHERE c.id = :id"),
        {"id": comment_id},
    )
    comment = dict(row.mappings().first())

    # Notify author (skip self-comments)
    if (
        post_info["author_id"] != current_user.user_id
        and post_info["author_push_token"]
    ):
        send_comment_notification(
            post_info["author_push_token"],
            post_info["commenter_name"],
            str(post_id),
        )

    return comment


@router.delete("/{post_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    post_id: UUID,
    comment_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("DELETE FROM post_comments WHERE id = :id AND user_id = :uid"),
        {"id": comment_id, "uid": current_user.user_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Comment not found or not yours")
    await db.execute(
        text("UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = :id"),
        {"id": post_id},
    )
    await db.commit()
