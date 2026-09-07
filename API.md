# Sösh API Reference
**Version:** 0.1.0
**Base URL (local):** `http://localhost:8000`
**Base URL (production):** `https://sosh-api.fly.dev` (when deployed)
**Interactive docs:** `{base_url}/docs` (development only)

---

## Authentication

All endpoints except `GET /health` and `GET /pulses/active` require a Supabase JWT.

```
Authorization: Bearer <supabase_access_token>
```

Tokens are issued by Supabase Auth (email sign-in, OAuth). New Supabase projects use ES256 (ECC P-256). The API verifies via JWKS with HS256 fallback.

**Admin endpoints** additionally require `user_roles.role = 'admin'` in the database.

---

## Endpoints

### Health

#### `GET /health`
No auth required.

**Response 200**
```json
{"status": "ok", "version": "0.1.0"}
```

---

### Users

#### `GET /users/me`
Returns the authenticated user's profile.

**Response 200**
```json
{
  "id": "eab17969-320a-424b-ad54-a6d273135765",
  "username": "testadmin",
  "display_name": null,
  "city": "Nashville",
  "country_code": "US",
  "sosh_score": 10,
  "trophy_count": 1
}
```

**Response 404** — user profile not found (auth user exists but trigger didn't create profile — rare)

---

#### `GET /users/{user_id}`
Returns any user's public profile. No auth required.

**Path params:** `user_id` — UUID

**Response 200** — same shape as `/users/me`

**Response 404** — user not found

---

#### `PATCH /users/me`
Updates the authenticated user's profile. Only include fields you want to change.

**Request body** (all fields optional)
```json
{
  "display_name": "Captain Nashville",
  "city": "Nashville",
  "country_code": "US"
}
```

**Constraints:**
- `display_name` — max 50 chars
- `city` — max 100 chars
- `country_code` — exactly 2 chars (ISO 3166-1 alpha-2)

**Response 200** — updated profile

**Response 400** — no fields provided

---

### Pulses

#### `GET /pulses/active`
Returns the currently active or voting Pulse. No auth required.

**Response 200**
```json
{
  "id": "f60e37e5-a695-4058-8a73-3ec55ea52f30",
  "prompt": "Show us your view right now.",
  "status": "active",
  "submission_ends_at": "2026-09-07 01:21:57.011156+00",
  "voting_ends_at": "2026-09-07 03:21:57.011156+00",
  "city": "Nashville",
  "country_code": "US"
}
```

**Response 200 `null`** — no active Pulse

**Pulse status values:**
- `active` — submission window open
- `voting` — submission closed, voting open
- `resolving` — worker is computing results
- `resolved` — complete

---

#### `GET /pulses/{pulse_id}`
Returns any Pulse by ID. No auth required.

**Path params:** `pulse_id` — UUID

**Response 200** — same shape as `/pulses/active`

**Response 404** — Pulse not found

---

#### `GET /pulses/{pulse_id}/leaderboard`
Returns the live leaderboard from Redis, sorted by votes descending.

Poll this every 5 seconds while `status` is `active` or `voting`.

**Response 200**
```json
[
  {"entry_id": "5d8c8241-bbde-419f-9ee7-06c1d561b222", "vote_count": 7, "rank": 1},
  {"entry_id": "a1b2c3d4-...", "vote_count": 4, "rank": 2}
]
```

Returns `[]` if the Pulse has resolved and the Redis key has expired.

---

#### `GET /pulses/{pulse_id}/entries`
Returns all approved entries for a Pulse, sorted by vote count descending.

Requires auth. Includes a `viewer_has_voted` flag per entry.

**Response 200**
```json
[
  {
    "id": "5d8c8241-bbde-419f-9ee7-06c1d561b222",
    "user_id": "eab17969-...",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 7,
    "created_at": "2026-09-07 01:07:24.68884+00",
    "username": "testadmin",
    "display_name": null,
    "viewer_has_voted": false
  }
]
```

---

### Entries

#### `POST /entries`
Submit an entry for the active Pulse. Requires auth.

**Request body**
```json
{
  "pulse_id": "f60e37e5-a695-4058-8a73-3ec55ea52f30",
  "content_type": "text",
  "text_content": "Looking out at Broadway!"
}
```

For photo/video entries:
```json
{
  "pulse_id": "f60e37e5-...",
  "content_type": "photo",
  "media_key": "pulse_entries/eab17969-.../uuid.jpg"
}
```

**`content_type` values:** `"video"`, `"photo"`, `"text"`

**Constraints:**
- `text_content` — required if `content_type = "text"`, max 140 chars
- `media_key` — required if `content_type = "photo"` or `"video"` (obtained from `POST /media/presign`)
- One entry per user per Pulse (enforced by DB unique constraint)
- Submission window must be open (`pulse.status = 'active'`)

**Response 201**
```json
{
  "id": "5d8c8241-bbde-419f-9ee7-06c1d561b222",
  "pulse_id": "f60e37e5-...",
  "content_type": "text",
  "text_content": "Looking out at Broadway!",
  "media_url": null,
  "created_at": "2026-09-07 01:07:24.68884+00"
}
```

**Response 409** — submission window closed, or already submitted

**Response 422** — moderation rejected (profanity / keyword filter)

---

#### `POST /entries/{entry_id}/reports`
Report an entry for content moderation. Requires auth.

**Request body**
```json
{"reason": "spam"}
```

**`reason` values:** `"spam"`, `"harassment"`, `"inappropriate"`, `"other"`

**Response 204**

---

### Votes

#### `POST /votes`
Cast a vote on an entry. Requires auth.

**Request body**
```json
{"entry_id": "5d8c8241-bbde-419f-9ee7-06c1d561b222"}
```

**Constraints:**
- Pulse must be `active` or `voting`
- Cannot vote on own entry
- One vote per user per entry (unique constraint)

**Response 204**

**Response 403** — own entry

**Response 404** — entry not found

**Response 409** — voting closed, or already voted

---

#### `DELETE /votes/{entry_id}`
Remove a previously cast vote. Requires auth.

**Path params:** `entry_id` — UUID of the entry you voted on

**Constraints:**
- Pulse must still be `active` or `voting`

**Response 204**

**Response 404** — vote not found

**Response 409** — voting window closed

---

### Trophies

#### `GET /trophies/me`
Returns the authenticated user's Trophy Case. Requires auth.

**Response 200**
```json
[
  {
    "id": "f837b19b-a9fd-410c-9bfc-051e8971d478",
    "pulse_id": "f60e37e5-...",
    "awarded_at": "2026-09-07 01:12:23.936078+00",
    "prompt": "Show us your view right now.",
    "city": "Nashville",
    "country_code": "US",
    "content_type": "text",
    "text_content": "Looking out at Broadway!",
    "media_url": null,
    "vote_count": 1
  }
]
```

Returns `[]` if no trophies yet.

---

#### `GET /trophies/{user_id}`
Returns any user's Trophy Case. No auth required.

**Path params:** `user_id` — UUID

**Response 200** — same shape as `/trophies/me`

---

### Media

#### `POST /media/presign`
Generates a pre-signed URL for direct upload to Cloudflare R2. Requires auth.

Upload flow:
1. Call `POST /media/presign` → get `upload_url` and `media_key`
2. `PUT <upload_url>` with media bytes directly (client → R2, API not involved)
3. Submit entry with `media_key` in `POST /entries`

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
  "upload_url": "https://sosh-media.r2.cloudflarestorage.com/...?X-Amz-Signature=...",
  "media_key": "pulse_entries/eab17969-.../uuid.jpg",
  "expires_in": 600
}
```

**Note:** R2 credentials are not configured in development. This endpoint returns 500 until `R2_ACCESS_KEY`, `R2_SECRET_KEY`, and `R2_ENDPOINT` are set in `.env`.

---

### Admin

Admin endpoints require auth **and** `user_roles.role = 'admin'` in the DB.

#### `POST /admin/pulses`
Fire a new Pulse.

**Request body**
```json
{
  "prompt": "Show us your view right now.",
  "submission_window_minutes": 15,
  "voting_window_hours": 2,
  "city": "Nashville",
  "country_code": "US"
}
```

**Field constraints:**
- `prompt` — max 200 chars
- `submission_window_minutes` — 5–60, default 15
- `voting_window_hours` — 1–24, default 2
- `city` / `country_code` — optional (null = global Pulse)

**Response 201**
```json
{
  "id": "f60e37e5-a695-4058-8a73-3ec55ea52f30",
  "prompt": "Show us your view right now.",
  "status": "active",
  "submission_ends_at": "2026-09-07 01:21:57.011156+00",
  "voting_ends_at": "2026-09-07 03:21:57.011156+00"
}
```

**Response 409** — a Pulse is already active. Resolve it first.

**Side effects on success:**
- Enqueues `send_pulse_to_all` immediately (push notifications)
- Schedules `resolve_pulse` after `submission_window_minutes * 60 + voting_window_hours * 3600` seconds

---

#### `POST /admin/pulses/{pulse_id}/resolve`
Manually trigger resolution of a Pulse (bypass the scheduled timer).

Use this to resolve a Pulse immediately during testing, or if the scheduled job failed.

**Response 204**

**Response 404** — Pulse not found

**Response 409** — already resolved

**Side effects:** Enqueues `resolve_pulse` with `delay_seconds=0`

---

## Error Format

All errors use standard HTTP status codes with a JSON body:

```json
{"detail": "A Pulse is already active. Resolve it before firing another."}
```

Validation errors (422) use FastAPI's default format:
```json
{
  "detail": [
    {"type": "missing", "loc": ["body", "content_type"], "msg": "Field required", ...}
  ]
}
```

---

## Rate Limits

None implemented in v0.1. Supabase's connection pooler is the practical limit.

---

## Versioning

The API is unversioned in v0.1. Breaking changes will get a path prefix (`/v2/...`) when needed.
