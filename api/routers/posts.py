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

import re

from auth import AuthenticatedUser, get_current_user
from database import get_db
from services.push import send_like_notification, send_comment_notification, send_mention_notification, send_repost_notification
from services.notif import create_notification

# Subquery to aggregate post_media rows as a JSON array (position-ordered).
# Returns [] for posts with no carousel items (backward compat with media_url).
_MEDIA_ITEMS_SQ = """
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object('url', pm.media_url, 'type', pm.media_type) ORDER BY pm.position)
        FROM post_media pm WHERE pm.post_id = p.id
    ), '[]'::jsonb) AS media_items
"""


def _extract_mentions(text: str | None) -> list[str]:
    if not text:
        return []
    return list({m.lower() for m in re.findall(r'@([a-zA-Z0-9_]+)', text)})


def _extract_hashtags(text: str | None) -> list[str]:
    if not text:
        return []
    return list({t.lower() for t in re.findall(r'#([a-zA-Z][a-zA-Z0-9_]*)', text)})[:10]


async def _store_hashtags(db: AsyncSession, post_id: str, text_content: str | None, caption: str | None) -> None:
    combined = ' '.join(filter(None, [text_content, caption]))
    tags = _extract_hashtags(combined)
    for tag in tags:
        try:
            await db.execute(
                text("INSERT INTO post_hashtags (post_id, tag) VALUES (:pid, :tag) ON CONFLICT DO NOTHING"),
                {"pid": post_id, "tag": tag},
            )
        except Exception:
            pass


async def _fire_mention_notifications(
    db: AsyncSession,
    text_content: str | None,
    actor_id: str,
    actor_name: str,
    post_id: str,
) -> None:
    usernames = _extract_mentions(text_content)
    if not usernames:
        return
    rows = await db.execute(
        text("SELECT id::text, push_token FROM users WHERE LOWER(username) = ANY(:names) AND id::text != :actor"),
        {"names": usernames, "actor": actor_id},
    )
    for row in rows.mappings().all():
        await create_notification(
            db,
            user_id=row["id"],
            type="mention",
            body=f"{actor_name} mentioned you",
            actor_id=actor_id,
            post_id=post_id,
        )
        if row["push_token"]:
            send_mention_notification(row["push_token"], actor_name, post_id)

router = APIRouter()


class MediaItemIn(BaseModel):
    """One item in a multi-image carousel (URL is already the full public Supabase URL)."""
    media_url: str = Field(..., max_length=1000)
    media_type: str = Field("photo", pattern="^(photo|video)$")


class CreatePostRequest(BaseModel):
    content_type: str = Field(..., pattern="^(text|photo|video)$")
    text_content: str | None = Field(None, max_length=500)
    media_url: str | None = Field(None, max_length=1000)   # single media (legacy)
    media_items: list[MediaItemIn] | None = None           # carousel (takes precedence)
    caption: str | None = Field(None, max_length=200)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(
    body: CreatePostRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.content_type == "text" and not body.text_content:
        raise HTTPException(status_code=400, detail="text_content required for text posts")
    if body.content_type in ("photo", "video") and not body.media_url and not body.media_items:
        raise HTTPException(status_code=400, detail="media_url or media_items required for photo/video posts")

    # Derive primary media_url for backward compat (first carousel item wins)
    primary_url = body.media_url
    if body.media_items:
        primary_url = body.media_items[0].media_url

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
            "media_url": primary_url,
            "caption": body.caption,
        },
    )

    # Insert carousel items (only when media_items provided)
    if body.media_items:
        for i, item in enumerate(body.media_items):
            await db.execute(
                text("""
                    INSERT INTO post_media (post_id, position, media_url, media_type)
                    VALUES (:pid, :pos, :url, :mtype)
                """),
                {"pid": post_id, "pos": i, "url": item.media_url, "mtype": item.media_type},
            )

    await db.commit()

    row = await db.execute(
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   false AS viewer_has_liked,
                   {_MEDIA_ITEMS_SQ}
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.id = :id
        """),
        {"id": post_id},
    )
    post = dict(row.mappings().first())

    # Fire @mention notifications and store #hashtags (non-fatal)
    mention_text = ' '.join(filter(None, [body.text_content, body.caption]))
    actor_name = post.get("display_name") or f"@{post.get('username')}"
    await _fire_mention_notifications(db, mention_text, current_user.user_id, actor_name, post_id)
    await _store_hashtags(db, post_id, body.text_content, body.caption)
    if mention_text:
        await db.commit()

    return post


@router.get("/search")
async def search_posts(
    q: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   (EXISTS (
                       SELECT 1 FROM post_likes pl
                       WHERE pl.post_id = p.id AND pl.user_id = :viewer_id
                   )) AS viewer_has_liked,
                   {_MEDIA_ITEMS_SQ}
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.text_content ILIKE :q OR p.caption ILIKE :q
            ORDER BY p.created_at DESC
            LIMIT 40
        """),
        {"viewer_id": current_user.user_id, "q": f"%{q}%"},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/feed")
async def get_post_feed(
    offset: int = 0,
    limit: int = 20,
    mode: str = "foryou",  # "foryou" | "following"
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Home feed — global (foryou) or following-only posts, newest first."""
    block_filter = "AND p.user_id NOT IN (SELECT blocked_id FROM user_blocks WHERE blocker_id = :viewer_id)"
    if mode == "following":
        where = f"WHERE (p.user_id IN (SELECT following_id FROM follows WHERE follower_id = :viewer_id) OR p.user_id = :viewer_id) {block_filter}"
    else:
        where = f"WHERE TRUE {block_filter}"
    rows = await db.execute(
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   p.repost_of_id::text,
                   ur.username AS repost_original_username,
                   ur.display_name AS repost_original_display_name,
                   (EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id)) AS viewer_has_liked,
                   (EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = :viewer_id)) AS viewer_has_bookmarked,
                   (EXISTS (SELECT 1 FROM posts rp WHERE rp.repost_of_id = p.id AND rp.user_id = :viewer_id)) AS viewer_has_reposted,
                   {_MEDIA_ITEMS_SQ}
            FROM posts p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN posts orig ON orig.id = p.repost_of_id
            LEFT JOIN users ur ON ur.id = orig.user_id
            {where}
            ORDER BY (EXTRACT(EPOCH FROM p.created_at) + p.like_count * 3600) DESC
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
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   (EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id)) AS viewer_has_liked,
                   (EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = :viewer_id)) AS viewer_has_bookmarked,
                   {_MEDIA_ITEMS_SQ}
            FROM posts p
            JOIN users u ON u.id = p.user_id
            WHERE p.user_id = :user_id
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"user_id": user_id, "viewer_id": current_user.user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/bookmarked")
async def get_bookmarked_posts(
    offset: int = 0,
    limit: int = 20,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   (EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id)) AS viewer_has_liked,
                   TRUE AS viewer_has_bookmarked,
                   {_MEDIA_ITEMS_SQ}
            FROM post_bookmarks pb
            JOIN posts p ON p.id = pb.post_id
            JOIN users u ON u.id = p.user_id
            WHERE pb.user_id = :viewer_id
            ORDER BY pb.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"viewer_id": current_user.user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/hashtag/{tag}")
async def get_hashtag_posts(
    tag: str,
    offset: int = 0,
    limit: int = 20,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Posts tagged with #tag, newest first."""
    rows = await db.execute(
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count,
                   p.created_at::text, p.repost_of_id::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   NULL AS repost_original_username, NULL AS repost_original_display_name,
                   (EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id)) AS viewer_has_liked,
                   (EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = :viewer_id)) AS viewer_has_bookmarked,
                   (EXISTS (SELECT 1 FROM posts rp WHERE rp.repost_of_id = p.id AND rp.user_id = :viewer_id)) AS viewer_has_reposted,
                   {_MEDIA_ITEMS_SQ}
            FROM post_hashtags ph
            JOIN posts p ON p.id = ph.post_id
            JOIN users u ON u.id = p.user_id
            WHERE ph.tag = LOWER(:tag)
              AND p.repost_of_id IS NULL
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"tag": tag.lower(), "viewer_id": current_user.user_id, "limit": limit, "offset": offset},
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/hashtags/trending")
async def get_trending_hashtags(db: AsyncSession = Depends(get_db)):
    """Top 20 hashtags by post count in the last 7 days."""
    rows = await db.execute(
        text("""
            SELECT ph.tag, COUNT(*) AS post_count
            FROM post_hashtags ph
            JOIN posts p ON p.id = ph.post_id
            WHERE p.created_at > NOW() - INTERVAL '7 days'
            GROUP BY ph.tag
            ORDER BY post_count DESC
            LIMIT 20
        """)
    )
    return [dict(r) for r in rows.mappings().all()]


@router.get("/{post_id}")
async def get_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await db.execute(
        text(f"""
            SELECT p.id::text, p.user_id::text, p.content_type, p.text_content,
                   p.media_url, p.caption, p.like_count, p.comment_count, p.created_at::text,
                   u.username, u.display_name, u.avatar_url, u.accent_color,
                   p.repost_of_id::text,
                   ur.username AS repost_original_username,
                   ur.display_name AS repost_original_display_name,
                   (EXISTS (SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = :viewer_id)) AS viewer_has_liked,
                   (EXISTS (SELECT 1 FROM post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = :viewer_id)) AS viewer_has_bookmarked,
                   (EXISTS (SELECT 1 FROM posts rp WHERE rp.repost_of_id = p.id AND rp.user_id = :viewer_id)) AS viewer_has_reposted,
                   {_MEDIA_ITEMS_SQ}
            FROM posts p
            JOIN users u ON u.id = p.user_id
            LEFT JOIN posts orig ON orig.id = p.repost_of_id
            LEFT JOIN users ur ON ur.id = orig.user_id
            WHERE p.id = :post_id
        """),
        {"post_id": post_id, "viewer_id": current_user.user_id},
    )
    post = row.mappings().first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    return dict(post)


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

    # Notify author (skip self-likes)
    if result.rowcount > 0 and post_info["author_id"] != current_user.user_id:
        await create_notification(
            db,
            user_id=post_info["author_id"],
            type="like",
            body=f"{post_info['liker_name']} liked your post",
            actor_id=current_user.user_id,
            post_id=str(post_id),
        )
        await db.commit()
        if post_info["author_push_token"]:
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


# ── Bookmarks ─────────────────────────────────────────────────────────────────

@router.post("/{post_id}/repost", status_code=status.HTTP_201_CREATED)
async def repost(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a repost. Idempotent — if already reposted, returns existing."""
    # Check original exists and get its data
    row = await db.execute(
        text("SELECT id, content_type, text_content, media_url, caption FROM posts WHERE id = :id AND repost_of_id IS NULL"),
        {"id": post_id},
    )
    original = row.mappings().first()
    if not original:
        raise HTTPException(status_code=404, detail="Post not found or is already a repost")

    # Idempotency: return existing repost if found
    existing = await db.execute(
        text("SELECT id::text FROM posts WHERE repost_of_id = :orig AND user_id = :uid"),
        {"orig": post_id, "uid": current_user.user_id},
    )
    ex = existing.mappings().first()
    if ex:
        return {"id": ex["id"]}

    new_id = str(uuid4())
    await db.execute(
        text("""
            INSERT INTO posts (id, user_id, content_type, text_content, media_url, caption, repost_of_id)
            VALUES (:id, :user_id, :content_type, :text_content, :media_url, :caption, :repost_of_id)
        """),
        {
            "id": new_id,
            "user_id": current_user.user_id,
            "content_type": original["content_type"],
            "text_content": original["text_content"],
            "media_url": original["media_url"],
            "caption": original["caption"],
            "repost_of_id": str(post_id),
        },
    )

    await db.commit()

    # Notify original author (skip self-reposts)
    notify = await db.execute(
        text("""
            SELECT p.user_id::text AS author_id, u.push_token,
                   r.display_name AS reposter_display, r.username AS reposter_username
            FROM posts p
            JOIN users u ON u.id = p.user_id
            JOIN users r ON r.id = :reposter_id
            WHERE p.id = :post_id
        """),
        {"post_id": post_id, "reposter_id": current_user.user_id},
    )
    notify_row = notify.mappings().first()
    if notify_row and notify_row["push_token"] and notify_row["author_id"] != str(current_user.user_id):
        actor_name = notify_row["reposter_display"] or f"@{notify_row['reposter_username']}"
        send_repost_notification(notify_row["push_token"], actor_name, str(post_id))
    return {"id": new_id}


@router.delete("/{post_id}/repost", status_code=status.HTTP_204_NO_CONTENT)
async def unrepost(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete the current user's repost of this post."""
    await db.execute(
        text("DELETE FROM posts WHERE repost_of_id = :orig AND user_id = :uid"),
        {"orig": post_id, "uid": current_user.user_id},
    )
    await db.commit()


@router.post("/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
async def bookmark_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("INSERT INTO post_bookmarks (post_id, user_id) VALUES (:post_id, :user_id) ON CONFLICT DO NOTHING"),
        {"post_id": post_id, "user_id": current_user.user_id},
    )
    await db.commit()


@router.delete("/{post_id}/bookmark", status_code=status.HTTP_204_NO_CONTENT)
async def unbookmark_post(
    post_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM post_bookmarks WHERE post_id = :post_id AND user_id = :user_id"),
        {"post_id": post_id, "user_id": current_user.user_id},
    )
    await db.commit()


# ── Comments ──────────────────────────────────────────────────────────────────

_COMMENT_SELECT = """
    SELECT c.id::text, c.post_id::text, c.user_id::text, c.body, c.created_at::text,
           c.parent_id::text,
           u.username, u.display_name, u.avatar_url, u.accent_color
    FROM post_comments c
    JOIN users u ON u.id = c.user_id
"""


class CreateCommentRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=300)
    parent_id: str | None = None


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
        text("INSERT INTO post_comments (id, post_id, user_id, body, parent_id) VALUES (:id, :post_id, :uid, :body, :parent_id)"),
        {"id": comment_id, "post_id": post_id, "uid": current_user.user_id, "body": body.body, "parent_id": body.parent_id},
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

    # Notify post author (skip self-comments and replies)
    if post_info["author_id"] != current_user.user_id and not body.parent_id:
        await create_notification(
            db,
            user_id=post_info["author_id"],
            type="comment",
            body=f"{post_info['commenter_name']} commented on your post",
            actor_id=current_user.user_id,
            post_id=str(post_id),
        )
        await db.commit()
        if post_info["author_push_token"]:
            send_comment_notification(
                post_info["author_push_token"],
                post_info["commenter_name"],
                str(post_id),
            )

    # Fire @mention notifications in comment body
    await _fire_mention_notifications(db, body.body, current_user.user_id, post_info["commenter_name"], str(post_id))
    await db.commit()

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
