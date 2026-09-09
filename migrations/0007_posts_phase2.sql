-- 0007: Phase 2 posts features — bookmarks, reposts, hashtags, website_url

ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url VARCHAR(500);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of_id UUID REFERENCES posts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS post_bookmarks (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag        VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, tag)
);

CREATE INDEX IF NOT EXISTS post_hashtags_tag_idx     ON post_hashtags (tag);
CREATE INDEX IF NOT EXISTS post_hashtags_created_idx ON post_hashtags (created_at);
