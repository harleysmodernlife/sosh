# Sösh API Reference

**Version:** 0.4.0
**Base URL (local):** `http://localhost:8000`
**Base URL (production):** `https://sosh-production.up.railway.app`
**Interactive docs:** `{base_url}/docs` (non-production only)
**Last Updated:** 2026-09-09

---

## Authentication

All endpoints except those marked **public** require a Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

Tokens are issued by Supabase Auth (email sign-in). New Supabase projects use ES256 (ECC P-256). The API verifies via JWKS with HS256 fallback for older tokens.

**Admin endpoints** additionally require `user_roles.role = 'admin'` in the database.

---

## Response Format

All errors return a JSON body:

```json
{"detail": "Human-readable error message"}
```

Validation errors (422) use FastAPI's default format:

```json
{
  "detail": [
    {"type": "missing", "loc": ["body", "field_name"], "msg": "Field required"}
  ]
}
```

---

## Endpoints

### Health

#### `GET /health` — public

**Response 200**
```json
{"status": "ok", "version": "0.1.0"}
```

---

### Users

#### `GET /users/me`

Returns the authenticated user's full profile.

**Response 200**
```json
{
  "id": "9d3c9c1f-3462-4374-b123-573d29614ba9",
  "username": "Harleysmodernlife",
  "display_name": "Captain",
  "city": "Shelbyville",
  "country_code": null,
  "avatar_url": "https://gxtbcxkdodmfikkhncmw.supabase.co/storage/v1/object/public/sosh-media/avatars/9d3c9c1f-....jpg",
  "sosh_score": 10,
  "trophy_count": 1,
  "follower_count": 3,
  "following_count": 1,
  "viewer_is_following": false,
  "is_admin": true
}
```

**Response 404** — auth user exists but profile row is missing (should not happen in normal operation)

---

#### `GET /users/me/entries`

Returns the authenticated user's submission history across all Pulses, newest first.

**Response 200**
```json
[
  {
    "id": "5d8c8241-bbde-419f-9ee7-06c1d561b222",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 7,
    "created_at": "2026-09-07 01:07:24+00",
    "pulse_id": "f60e37e5-a695-4058-8a73-3ec55ea52f30",
    "pulse_prompt": "Show us your view right now.",
    "pulse_city": "Nashville",
    "pulse_status": "resolved",
    "rank": 1
  }
]
```

`rank` — position within that Pulse (1 = highest votes). Computed as count of entries with strictly more votes + 1.

Returns `[]` if the user has never submitted an entry.

---

#### `GET /users/search` — public

Search users by username or display name (case-insensitive prefix/substring match). Returns up to 20 results.

**Query params:** `q` — search string (required)

**Response 200** — array of user objects (same shape as `/users/me`)

---

#### `GET /users/{user_id}` — public (auth optional)

Returns any user's public profile. If a valid `Authorization` header is present, `viewer_is_following` and `viewer_has_blocked` reflect the authenticated user's relationship with this user.

**Path params:** `user_id` — UUID

**Response 200** — same shape as `/users/me`, `is_admin` always `false` on public profiles, includes `viewer_has_blocked: bool`

**Response 404** — user not found

---

#### `GET /users/{user_id}/followers` — public

Returns the list of users who follow the given user.

**Response 200** — array of `{id, username, display_name, avatar_url, accent_color}`

---

#### `GET /users/{user_id}/following` — public

Returns the list of users the given user follows.

**Response 200** — array of `{id, username, display_name, avatar_url, accent_color}`

---

#### `PATCH /users/me`

Updates the authenticated user's profile. Send only the fields you want to change.

**Request body** (all fields optional)
```json
{
  "username": "newhandle",
  "display_name": "Captain Nashville",
  "city": "Nashville",
  "avatar_url": "https://..."
}
```

**Constraints:**
- `username` — 3–30 chars, `[a-zA-Z0-9_]` only, globally unique
- `display_name` — max 50 chars
- `city` — max 100 chars
- `avatar_url` — max 500 chars; set via the avatar upload flow (see `POST /media/presign-avatar`)

**Response 200** — updated profile

**Response 400** — no fields provided

**Response 409** — username already taken

---

#### `DELETE /users/me`

Permanently deletes the authenticated user's account and all associated data. Irreversible.

Deletion order: votes cast, entries (cascades votes received + reports), trophies, leaderboard results, Sosh score, user roles, invite redemption nulled, user row deleted, Supabase Auth identity deleted.

**Auth:** required

**Response 204** — account deleted

**Response 401** — not authenticated

---

#### `POST /users/{user_id}/follow`

Follow a user. Idempotent — following someone you already follow is a no-op.

**Path params:** `user_id` — UUID of the user to follow

**Response 204**

**Response 400** — cannot follow yourself

---

#### `DELETE /users/{user_id}/follow`

Unfollow a user.

**Path params:** `user_id` — UUID

**Response 204**

---

#### `POST /users/{user_id}/block`

Block a user. Removes follow relationships in both directions (you stop following them and they stop following you). Their posts are hidden from your feed. Idempotent.

**Path params:** `user_id` — UUID of the user to block

**Response 204**

**Response 400** — cannot block yourself

---

#### `DELETE /users/{user_id}/block`

Unblock a user.

**Path params:** `user_id` — UUID

**Response 204**

---

#### `PUT /users/me/push-token`

Register or update the device push notification token. Call this on app launch after notification permission is granted.

**Request body**
```json
{"token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"}
```

**Response 204**

---

### Pulses

#### `GET /pulses/active` — public

Returns the current active or voting Pulse. Returns `null` if no Pulse is running.

**Response 200**
```json
{
  "id": "f60e37e5-a695-4058-8a73-3ec55ea52f30",
  "prompt": "Show us your view right now.",
  "status": "active",
  "submission_ends_at": "2026-09-07 01:21:57+00",
  "voting_ends_at": "2026-09-07 03:21:57+00",
  "city": "Nashville",
  "country_code": "US"
}
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `active` | Submission window open |
| `voting` | Submissions closed, voting open |
| `resolving` | Worker computing results |
| `resolved` | Complete — winner and trophies finalized |

**Response 200 `null`** — no active Pulse

---

#### `GET /pulses/{pulse_id}` — public

Returns any Pulse by ID.

**Response 200** — same shape as `/pulses/active`

**Response 404** — Pulse not found

---

#### `GET /pulses/{pulse_id}/leaderboard` — public

Returns the live leaderboard from Redis, sorted by votes descending. Poll every 5 seconds while `status` is `active` or `voting`.

**Response 200**
```json
[
  {"entry_id": "5d8c8241-...", "vote_count": 7, "rank": 1},
  {"entry_id": "a1b2c3d4-...", "vote_count": 4, "rank": 2}
]
```

Returns `[]` if the Pulse has resolved and the Redis key has expired (use `/pulses/{id}/entries` instead).

---

#### `GET /pulses/{pulse_id}/entries`

Returns all approved entries for a Pulse, sorted by vote count descending. Includes a `viewer_has_voted` flag per entry.

**Response 200**
```json
[
  {
    "id": "5d8c8241-...",
    "user_id": "eab17969-...",
    "pulse_id": "f60e37e5-...",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 7,
    "created_at": "2026-09-07 01:07:24+00",
    "username": "testadmin",
    "display_name": null,
    "viewer_has_voted": false
  }
]
```

---

#### `GET /pulses/resolved` — public

Returns the 20 most recently resolved Pulses with winner summaries. Used by the Historical Leaderboard view.

**Response 200**
```json
[
  {
    "id": "f60e37e5-...",
    "prompt": "Show us your view right now.",
    "city": "Nashville",
    "country_code": "US",
    "resolved_at": "2026-09-07 03:22:00+00",
    "winner_id": "eab17969-...",
    "winner_username": "testadmin",
    "winner_display_name": null,
    "winner_votes": 7,
    "has_mosaic": true
  }
]
```

---

#### `GET /pulses/{pulse_id}/mosaic` — public

Returns all entries for a resolved Pulse, ordered by vote count descending. Used to render the Mosaic grid.

**Response 200**
```json
[
  {
    "id": "5d8c8241-...",
    "user_id": "eab17969-...",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 7,
    "username": "testadmin",
    "display_name": null
  }
]
```

---

### Entries

#### `POST /entries`

Submit an entry for the active Pulse. One entry per user per Pulse.

**Request body — text entry**
```json
{
  "pulse_id": "f60e37e5-...",
  "content_type": "text",
  "text_content": "Looking out at Broadway!"
}
```

**Request body — photo or video entry**
```json
{
  "pulse_id": "f60e37e5-...",
  "content_type": "photo",
  "media_key": "pulse_entries/eab17969-.../uuid.jpg"
}
```

**`content_type` values:** `"text"`, `"photo"`, `"video"`

**Constraints:**
- `text_content` — required for text entries, max 140 chars, passes keyword moderation filter
- `media_key` — required for photo/video; obtain from `POST /media/presign`, then upload, then pass the returned `media_key`
- Submission window must be open (`pulse.status = "active"`)
- One entry per user per Pulse

**Response 201**
```json
{
  "id": "5d8c8241-...",
  "pulse_id": "f60e37e5-...",
  "content_type": "text",
  "text_content": "Looking out at Broadway!",
  "media_url": null,
  "created_at": "2026-09-07 01:07:24+00"
}
```

**Response 409** — submission window closed, or already submitted
**Response 422** — text content failed moderation filter

---

### Votes

#### `POST /votes`

Cast a vote on an entry during an active or voting Pulse. Requires auth.

**Request body**
```json
{"entry_id": "5d8c8241-..."}
```

**Constraints:**
- Pulse must be `active` or `voting`
- Cannot vote on your own entry
- One vote per user per entry

**Response 204**

**Response 403** — own entry
**Response 404** — entry not found
**Response 409** — voting closed, or already voted

---

#### `DELETE /votes/{entry_id}`

Remove a previously cast vote. Only possible while the Pulse is still `active` or `voting`.

**Path params:** `entry_id` — UUID of the entry you voted on

**Response 204**

**Response 404** — vote not found
**Response 409** — voting window closed

---

### Trophies

#### `GET /trophies/me`

Returns the authenticated user's Trophy Case, newest first.

**Response 200**
```json
[
  {
    "id": "f837b19b-...",
    "pulse_id": "f60e37e5-...",
    "awarded_at": "2026-09-07 01:12:23+00",
    "prompt": "Show us your view right now.",
    "city": "Nashville",
    "country_code": "US",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 7
  }
]
```

Returns `[]` if no trophies yet.

---

#### `GET /trophies/{user_id}` — public

Returns any user's Trophy Case.

**Response 200** — same shape as `/trophies/me`

---

### Feed

#### `GET /feed` — public

Paginated content feed of approved entries from resolved Pulses, newest first. This is the home screen feed — open the app, see community content immediately.

**Query params:**

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `offset` | int ≥ 0 | 0 | — |
| `limit` | int 1–20 | 10 | 20 |

**Response 200**
```json
[
  {
    "id": "5d8c8241-...",
    "user_id": "eab17969-...",
    "username": "testadmin",
    "display_name": null,
    "city": "Nashville",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 7,
    "created_at": "2026-09-07 01:07:24+00",
    "pulse_id": "f60e37e5-...",
    "pulse_prompt": "Show us your view right now.",
    "pulse_city": "Nashville"
  }
]
```

Returns `[]` when no more entries are available (end of feed).

---

### Posts

#### `POST /posts`

Create a freeform social post.

**Request body — text post**
```json
{"content_type": "text", "text_content": "Hello world"}
```

**Request body — photo/video post**
```json
{
  "content_type": "photo",
  "media_url": "https://...supabase.co/storage/.../post.jpg",
  "caption": "Optional caption"
}
```

**Constraints:**
- `text_content` — required for text, max 500 chars
- `media_url` — required for photo/video
- `caption` — optional, max 200 chars

**Response 201** — full post object (see below)

---

#### `GET /posts/feed`

Returns the social post feed.

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `offset` | int | 0 | Pagination offset |
| `limit` | int | 20 | Max 20 |
| `mode` | string | `foryou` | `foryou` (global) or `following` (followed users only) |

**Response 200**
```json
[
  {
    "id": "abc123-...",
    "user_id": "9d3c9c1f-...",
    "content_type": "text",
    "text_content": "Hello world",
    "media_url": null,
    "caption": null,
    "like_count": 3,
    "comment_count": 1,
    "created_at": "2026-09-08 10:00:00",
    "username": "Harleysmodernlife",
    "display_name": "Captain",
    "avatar_url": "https://...",
    "accent_color": "#E63946",
    "viewer_has_liked": false
  }
]
```

Posts from blocked users are excluded.

---

#### `GET /posts/search`

Search posts by text content or caption (case-insensitive substring match). Returns up to 40 results, newest first.

**Query params:** `q` — search string (required)

**Response 200** — array of post objects (same shape as feed), includes `viewer_has_liked`

---

#### `GET /posts/user/{user_id}`

All posts by a specific user, newest first.

**Query params:** `offset` (default 0), `limit` (default 30)

**Response 200** — array of post objects

---

#### `GET /posts/{post_id}`

Get a single post by ID.

**Response 200** — post object

**Response 404** — post not found

---

#### `PATCH /posts/{post_id}` — 204

Update text content or caption of a post. Own posts only.

**Request body** (all optional)
```json
{"text_content": "Updated text", "caption": null}
```

**Response 204**

**Response 404** — post not found or not yours

---

#### `DELETE /posts/{post_id}`

Delete a post. Own posts only.

**Response 204**

**Response 404** — post not found or not yours

---

#### `POST /posts/{post_id}/like`

Like a post. Idempotent. Sends a push notification to the post author (excluding self-likes).

**Response 204**

---

#### `DELETE /posts/{post_id}/like`

Unlike a post.

**Response 204**

---

#### `POST /posts/{post_id}/bookmark`

Save a post to your bookmarks. Idempotent.

**Response 204**

---

#### `DELETE /posts/{post_id}/bookmark`

Remove a post from your bookmarks.

**Response 204**

---

#### `GET /posts/bookmarked`

All posts you have bookmarked, newest-bookmarked first.

**Query params:** `offset` (default 0), `limit` (default 20)

**Response 200** — array of post objects (same shape as feed)

---

#### `POST /posts/{post_id}/repost`

Repost an existing post to your feed. Creates a new post record with `repost_of_id` set. Idempotent (silently succeeds if already reposted).

**Response 201**

---

#### `DELETE /posts/{post_id}/repost`

Remove your repost of a post.

**Response 204**

---

#### `GET /posts/hashtag/{tag}`

All posts tagged with a given hashtag, newest first.

**Query params:** `offset` (default 0), `limit` (default 20)

**Response 200** — array of post objects

---

#### `GET /posts/hashtags/trending` — public

Top 20 hashtags by post count in the last 7 days.

**Response 200**
```json
[
  {"tag": "sösh", "count": 14},
  {"tag": "pulse", "count": 9}
]
```

---

### Comments

#### `GET /posts/{post_id}/comments`

Returns all comments on a post, oldest first.

**Response 200**
```json
[
  {
    "id": "cmt123-...",
    "post_id": "abc123-...",
    "user_id": "9d3c9c1f-...",
    "body": "Great post!",
    "created_at": "2026-09-08 10:05:00",
    "username": "Harleysmodernlife",
    "display_name": "Captain",
    "avatar_url": "https://...",
    "accent_color": "#E63946"
  }
]
```

---

#### `POST /posts/{post_id}/comments`

Add a comment to a post. Sends a push notification to the post author (excluding self-comments).

**Request body**
```json
{"body": "Great post!"}
```

**Constraints:** `body` — 1–300 chars

**Response 201** — comment object (same shape as above)

**Response 404** — post not found

---

#### `DELETE /posts/{post_id}/comments/{comment_id}`

Delete a comment. Own comments only.

**Response 204**

**Response 404** — comment not found or not yours

---

### Notifications

#### `GET /notifications`

Returns the authenticated user's notification inbox, newest first. Returns up to 50 notifications.

**Response 200**
```json
[
  {
    "id": "notif123-...",
    "type": "like",
    "body": "Captain liked your post",
    "read": false,
    "created_at": "2026-09-08 10:00:00",
    "actor_id": "9d3c9c1f-...",
    "post_id": "abc123-...",
    "conversation_id": null
  }
]
```

**Notification types:** `pulse`, `trophy`, `results`, `milestone`, `like`, `comment`, `follow`, `dm`

---

#### `GET /notifications/unread-count`

Returns the count of unread notifications.

**Response 200**
```json
{"count": 3}
```

---

#### `POST /notifications/read`

Marks all notifications as read.

**Response 204**

---

### Direct Messages

#### `GET /dm/conversations`

Returns the authenticated user's conversation list, most recently active first.

**Response 200**
```json
[
  {
    "conversation_id": "conv123-...",
    "other_user_id": "eab17969-...",
    "other_username": "testadmin",
    "other_display_name": null,
    "other_avatar_url": null,
    "other_accent_color": null,
    "last_message_body": "Hey!",
    "last_message_at": "2026-09-08 10:00:00",
    "unread_count": 2
  }
]
```

---

#### `POST /dm/conversations`

Start or retrieve a conversation with a user. Idempotent — if a conversation already exists between the two users, returns the existing one.

**Request body**
```json
{"user_id": "eab17969-..."}
```

**Response 200**
```json
{"conversation_id": "conv123-..."}
```

---

#### `GET /dm/conversations/{conversation_id}/messages`

Returns paginated messages in a conversation, newest first.

**Query params:** `offset` (default 0), `limit` (default 50, max 50)

**Response 200**
```json
[
  {
    "id": "msg123-...",
    "conversation_id": "conv123-...",
    "sender_id": "9d3c9c1f-...",
    "body": "Hey!",
    "created_at": "2026-09-08 10:00:00",
    "read_at": null,
    "sender_username": "Harleysmodernlife",
    "sender_display_name": "Captain",
    "sender_avatar_url": "https://..."
  }
]
```

**Response 403** — authenticated user is not a participant in this conversation

---

#### `POST /dm/conversations/{conversation_id}/messages`

Send a message. Triggers a push notification to the recipient.

**Request body**
```json
{"body": "Hey!"}
```

**Constraints:** `body` — 1–1000 chars

**Response 201** — message object (same shape as above)

**Response 403** — not a participant

---

#### `POST /dm/conversations/{conversation_id}/read`

Mark all unread incoming messages in a conversation as read (sets `read_at = now()`).

**Response 204**

---

### Reports

#### `POST /reports`

Flag a Pulse entry for moderation. Idempotent.

**Request body**
```json
{"entry_id": "5d8c8241-..."}
```

**Response 204**

**Response 404** — entry not found

---

#### `POST /reports/post`

Flag a social post for moderation. Idempotent.

**Request body**
```json
{"post_id": "abc123-..."}
```

**Response 204**

---

#### `POST /reports/user`

Flag a user for moderation. Idempotent.

**Request body**
```json
{"user_id": "eab17969-..."}
```

**Response 204**

---

#### `GET /reports/admin/posts` — admin only

Returns flagged posts aggregated by post, sorted by report count descending.

**Response 200**
```json
[
  {
    "post_id": "abc123-...",
    "text_content": "...",
    "username": "someone",
    "report_count": 5,
    "created_at": "2026-09-08 09:00:00"
  }
]
```

---

#### `GET /reports/admin/users` — admin only

Returns flagged users aggregated by user, sorted by report count descending.

**Response 200**
```json
[
  {
    "reported_user_id": "eab17969-...",
    "username": "someone",
    "report_count": 3
  }
]
```

---

### Invites

#### `POST /admin/invites` — admin only

Generate a new invite code.

**Request body** (all optional)
```json
{"label": "For Heather", "expires_days": 7}
```

**Response 201**
```json
{"code": "XKCD-4892", "label": "For Heather", "expires_at": "2026-09-15 18:00:00"}
```

---

#### `GET /admin/invites` — admin only

List all invite codes with redemption status.

**Response 200**
```json
[
  {
    "id": "inv123-...",
    "code": "XKCD-4892",
    "label": "For Heather",
    "created_at": "2026-09-08 18:00:00",
    "expires_at": "2026-09-15 18:00:00",
    "used_at": null,
    "used_by_username": null
  }
]
```

---

#### `GET /invites/{code}` — public

Validate an invite code (used during signup to check the code is valid before completing registration).

**Response 200**
```json
{"code": "XKCD-4892", "valid": true}
```

`valid: false` if the code doesn't exist, is expired, or has already been used.

---

#### `POST /invites/{code}/redeem`

Redeem an invite code for a user. Called during onboarding after the user account is created.

**Request body**
```json
{"user_id": "9d3c9c1f-..."}
```

**Response 204**

**Response 400** — code invalid, expired, or already redeemed

---

### Media

#### `POST /media/presign`

Generates a pre-signed URL for direct upload to Supabase Storage. Use for Pulse entry photos and videos.

**Upload flow:**
1. `POST /media/presign` → receive `upload_url` and `media_key`
2. `PUT <upload_url>` with media bytes directly (client → Supabase Storage; the API is never a proxy)
3. Submit entry with `media_key` via `POST /entries`

**Request body**
```json
{
  "content_type": "image/jpeg",
  "pulse_id": "f60e37e5-..."
}
```

**Allowed content types:** `video/mp4`, `image/jpeg`, `image/png`, `image/webp`

**Response 200**
```json
{
  "upload_url": "https://gxtbcxkdodmfikkhncmw.supabase.co/storage/v1/object/upload/sign/sosh-media/pulse_entries/...?token=...",
  "media_key": "pulse_entries/eab17969-.../uuid.jpg",
  "expires_in": 600
}
```

The signed URL expires in 600 seconds (10 minutes). Upload before it expires.

---

#### `POST /media/presign-avatar`

Generates a pre-signed URL for uploading a profile avatar. The avatar is stored at `avatars/{user_id}.jpg` in Supabase Storage — uploading a new avatar overwrites the old one.

**No request body required.**

**Avatar upload flow:**
1. `POST /media/presign-avatar` → receive `upload_url` and `media_key` (the public URL)
2. `PUT <upload_url>` with JPEG image bytes
3. `PATCH /users/me` with `{"avatar_url": "<media_key>"}` to save to profile

**Response 200**
```json
{
  "upload_url": "https://gxtbcxkdodmfikkhncmw.supabase.co/storage/v1/object/upload/sign/sosh-media/avatars/...?token=...",
  "media_key": "https://gxtbcxkdodmfikkhncmw.supabase.co/storage/v1/object/public/sosh-media/avatars/9d3c9c1f-....jpg",
  "expires_in": 600
}
```

Note: for this endpoint, `media_key` is the full public URL (not a path), ready to pass directly to `PATCH /users/me`.

---

### Admin

All admin endpoints require auth **and** `user_roles.role = 'admin'` in the database.

#### `POST /admin/pulses`

Fire a new Pulse. Fails if a Pulse is already active or voting.

**Request body**
```json
{
  "prompt": "Show us your view right now.",
  "submission_window_minutes": 30,
  "voting_window_hours": 4,
  "city": "Nashville",
  "country_code": "US"
}
```

**Field constraints:**
- `prompt` — required, max 200 chars
- `submission_window_minutes` — 5–60, default 30
- `voting_window_hours` — 1–24, default 4
- `city` / `country_code` — optional; omit for a global Pulse

**Response 201**
```json
{
  "id": "f60e37e5-...",
  "prompt": "Show us your view right now.",
  "status": "active",
  "submission_ends_at": "2026-09-07 18:30:00+00",
  "voting_ends_at": "2026-09-07 22:30:00+00"
}
```

**Response 409** — a Pulse is already active or voting

**Side effects:**
- Enqueues `send_pulse_to_all` immediately (push notifications to all users)
- Schedules `resolve_pulse` for when both windows close

---

#### `POST /admin/pulses/{pulse_id}/resolve`

Manually trigger resolution of a Pulse, bypassing the scheduled timer. Use during testing or if the scheduled job failed.

**Response 204**

**Response 404** — Pulse not found
**Response 409** — already resolved

**Side effects:** Enqueues `resolve_pulse` with no delay

---

#### `GET /admin/schedule`

Returns the current automated daily Pulse schedule.

**Response 200**
```json
{
  "enabled": true,
  "cron": "0 18 * * *",
  "next_run": "2026-09-08 18:00:00+00"
}
```

`enabled: false` means no schedule is set. `next_run` is `null` when disabled.

---

#### `POST /admin/schedule`

Set or update the automated daily Pulse schedule. Uses standard cron syntax. The cron job fires `fire_daily_pulse` which picks the next prompt from the 30-prompt rotation.

**Request body**
```json
{"cron": "0 18 * * *"}
```

**Response 200** — same shape as `GET /admin/schedule`

---

#### `DELETE /admin/schedule`

Remove the automated daily Pulse schedule.

**Response 204**

---

#### `DELETE /admin/posts/{post_id}` — admin only

Delete any post regardless of ownership. Used to remove flagged content after reviewing admin reports.

**Response 204**

**Response 404** — post not found

---

#### `DELETE /admin/users/{user_id}` — admin only

Ban a user: performs a full account deletion (same cascade as `DELETE /users/me`) plus Supabase Auth removal. Irreversible.

**Response 204**

**Response 404** — user not found

---

## Rate Limits

None enforced in v0.2. Supabase's connection pooler is the practical ceiling.

---

## Versioning

The API is unversioned in v0.2. Breaking changes will get a path prefix (`/v2/...`) when needed.
