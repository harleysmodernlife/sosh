# Sösh API Reference

**Version:** 0.2.0
**Base URL (local):** `http://localhost:8000`
**Base URL (production):** `https://sosh-production.up.railway.app`
**Interactive docs:** `{base_url}/docs` (non-production only)

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

#### `GET /users/{user_id}` — public (auth optional)

Returns any user's public profile. If a valid `Authorization` header is present, `viewer_is_following` reflects whether the authenticated user follows this user.

**Path params:** `user_id` — UUID

**Response 200** — same shape as `/users/me`, `is_admin` always `false` on public profiles

**Response 404** — user not found

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

### Reports

#### `POST /reports`

Flag an entry for content moderation. Idempotent — reporting the same entry twice is silently ignored.

**Request body**
```json
{"entry_id": "5d8c8241-..."}
```

**Response 204**

**Response 404** — entry not found

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

## Rate Limits

None enforced in v0.2. Supabase's connection pooler is the practical ceiling.

---

## Versioning

The API is unversioned in v0.2. Breaking changes will get a path prefix (`/v2/...`) when needed.
