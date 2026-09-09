-- 0008: streak columns on users + post_media carousel table

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak  INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_media (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    media_url  TEXT        NOT NULL,
    media_type VARCHAR(10) NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
    position   INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS post_media_post_id_idx ON post_media (post_id, position);
