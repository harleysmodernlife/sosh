# Sösh — System Architecture
**Version:** 0.3
**Status:** Current (reflects live system)
**Last Updated:** 2026-09-08

---

## Component Map

```
Mobile App (React Native + Expo Go on Android)
        │
        │  HTTPS / REST
        ▼
┌───────────────────────────────────────────┐
│   FastAPI API                              │  ← Docker / Railway
│   (api/main.py)                            │
│                                            │
│  Routers:                                  │
│  /users    /pulses   /entries  /votes      │
│  /trophies /media    /admin    /health     │
│  /feed     /posts    /reports  /invites    │
│  /notifications      /dm                   │
└──────┬──────────────────────┬─────────────┘
       │                      │
       │  async read/write    │  async read/write
       ▼                      ▼
┌──────────────────┐   ┌─────────────────────────────┐
│  Supabase        │   │  Upstash Redis (TLS)         │
│  PostgreSQL      │   │  legal-eagle-100955.upstash  │
│  Auth (JWT)      │   │  .io:6380                    │
│  Storage         │   │                              │
│  (sosh-media     │   │  Stores:                     │
│   bucket)        │   │  • Live leaderboard sorted   │
└──────────────────┘   │    sets (leaderboard:{id})   │
                       │  • Vote milestone dedup sets  │
                       │  • RQ job queue (sosh queue)  │
                       │  • RQ scheduler (cron jobs)   │
                       └──────────────┬───────────────┘
                                      │
                                      │  RQ job pickup
                                      ▼
                       ┌──────────────────────────────┐
                       │  RQ Worker (Railway service)  │
                       │  (workers/worker_*.py)        │
                       │                              │
                       │  Jobs:                       │
                       │  • send_pulse_to_all         │  → Expo Push → FCM/APNs → device
                       │  • resolve_pulse             │  → trophies, score, notifications
                       │  • (cron) fire_pulse_job     │  → daily 18:00 UTC auto-fire
                       └──────────────────────────────┘

Media upload flow:
Mobile → POST /media/presign → API returns Supabase Storage presigned PUT URL
Mobile → PUT directly to Supabase Storage (API never proxies media bytes)
Mobile → submit entry/post with media_url → API stores public URL
```

---

## Component Details

### FastAPI API

- **Language:** Python 3.12
- **Framework:** FastAPI 0.115 + Uvicorn
- **DB client:** SQLAlchemy 2.0 async + asyncpg
- **Auth:** PyJWT with JWKS client (ES256 primary, HS256 fallback)
- **Validation:** Pydantic v2
- **Production host:** Railway (auto-deploys from `main` branch on GitHub)
- **Service URL:** `https://sosh-production.up.railway.app`

Important: `DATABASE_URL` must use the **session-mode pooler** (port 5432), not the transaction-mode pooler (port 6543). SQLAlchemy's asyncpg dialect uses prepared statements, which are incompatible with pgbouncer transaction mode.

### Supabase (PostgreSQL + Auth + Storage)

- **Project ref:** `gxtbcxkdodmfikkhncmw`
- **Region:** East US — North Virginia
- **Extensions:** `pgcrypto`
- **Auth:** Supabase Auth (email), issues ES256 JWTs
- **Trigger:** `handle_new_user()` fires on `auth.users` insert → creates row in `public.users`
- **RLS:** Enabled. Policies defined in migration 0001.
- **Connection:** Session-mode pooler at `aws-0-us-east-1.pooler.supabase.com:5432`
- **Storage:** `sosh-media` public bucket — avatars, entry media, post media
  - Avatar path: `avatars/{user_id}.jpg`
  - Entry media path: `entries/{user_id}/{entry_id}.{ext}`
  - Post media path: presigned by `/media/presign`

### Redis (Upstash)

- **Host:** `legal-eagle-100955.upstash.io:6380` (TLS required)
- **Connection:** via `RQ_REDIS_URL` env var (`rediss://` scheme)
- **Purpose:**
  - Live leaderboard sorted sets: key `leaderboard:{pulse_id}`, score = vote count
  - Vote milestone dedup: `milestones:{entry_id}` set, prevents double-notifying
  - RQ job queue: queue name `sosh`
  - RQ scheduler: daily cron job at 18:00 UTC for automated Pulse firing

### RQ Workers

Workers run as a separate Railway service (`rq worker --with-scheduler sosh`). They are **synchronous** — asyncpg cannot be used. Workers use `psycopg2-binary` for DB access.

Workers use the main `Dockerfile` (not a separate Dockerfile.worker). The start command is set in Railway's service config.

**`worker_fire_pulse.py`** — `fire_pulse_job()`
1. Selects a random prompt from `api/prompts.py` (30 curated prompts)
2. Calls `POST /admin/pulses` equivalent logic directly
3. Enqueues `send_pulse_to_all`

**`worker_resolve.py`** — `resolve_pulse(pulse_id)`
1. Marks pulse `status = 'resolving'`
2. Finds the top-voted entry (global, not per-city)
3. Creates a `trophies` record for the winner
4. Generates the `mosaics` record (top 20 entries by vote count)
5. Recomputes Sösh Score for all participants
6. Sends winner trophy notification
7. Sends results notification to all other participants
8. Marks pulse `status = 'resolved'`

### Supabase Storage (media)

- **Bucket:** `sosh-media` (public)
- **Upload flow:** Client-side direct upload via presigned PUT URL (API generates URL, never touches media bytes)
- **Media served:** via Supabase's public storage CDN URL
- **Max file size:** 50MB (Supabase free tier limit)

### Expo Push

- Single API call covers FCM (Android) and APNs (iOS)
- Push tokens stored in `users.push_token`, updated on every app launch
- Push types implemented: `pulse`, `trophy`, `results`, `milestone`, `like`, `comment`, `follow`, `dm`
- Deep link data included in each notification payload for in-app routing

---

## Data Flows

### Pulse Fire Flow

```
Admin → POST /admin/pulses  (or automated cron job)
  → Validates admin role (user_roles table)
  → Checks no active Pulse exists
  → Inserts pulse record (status='active')
  → enqueue: send_pulse_to_all (immediate)
  → enqueue_in: resolve_pulse (after submission + voting window)
  → Returns pulse ID and window timestamps
```

### Vote Flow

```
User → POST /votes {entry_id}
  → Auth check (JWT)
  → Validates pulse is in 'active' or 'voting' state
  → Validates user did not submit the entry
  → INSERT into votes (DB unique constraint prevents double-voting)
  → ZINCRBY leaderboard:{pulse_id} +1 entry_id (Redis)
  → Check milestone sets in Redis — notify if new milestone hit (5/10/25/50/100)
  → Returns 204
```

### Leaderboard Polling Flow

```
Mobile polls GET /pulses/{id}/leaderboard every 5 seconds
  → ZREVRANGE leaderboard:{pulse_id} 0 49 WITHSCORES (Redis)
  → Returns [{entry_id, vote_count, rank}]
  → If key missing (post-resolution): returns [] (mobile shows resolved state)
```

### Resolution Flow

```
RQ worker picks up resolve_pulse job
  → UPDATE pulse status='resolving'
  → SELECT entry with MAX(vote_count) (from DB)
  → INSERT trophies (city_rep)
  → INSERT mosaics (top 20 entries)
  → Recompute sosh_score for all participants
  → send_winner_notification (Expo Push, type='trophy')
  → send_results_notifications to all other entrants (type='results')
  → UPDATE pulse status='resolved'
```

### Post Like Flow

```
User → POST /posts/{id}/like
  → Auth check (JWT)
  → Fetch post author info + liker display name
  → INSERT into post_likes (ON CONFLICT DO NOTHING)
  → UPDATE posts SET like_count = like_count + 1
  → create_notification (type='like') in DB
  → send_like_notification (Expo Push) if author has push_token
  → Returns 204
```

### DM Flow

```
User A → POST /dm/conversations {user_id: B}
  → Find existing conversation between A+B, or create one
  → Returns {conversation_id}

User A → POST /dm/conversations/{id}/messages {body}
  → INSERT direct_message
  → Fetch recipient B's push_token in same query as sender display name
  → send_dm_notification (Expo Push, type='dm', conversation_id)
  → Returns message object

User B → POST /dm/conversations/{id}/read
  → UPDATE direct_messages SET read_at = now()
    WHERE conversation_id = :id AND sender_id != :me AND read_at IS NULL
```

---

## Auth Model

All API routes except `/health`, public pulse/leaderboard/mosaic endpoints, and user search require a valid Supabase JWT in the `Authorization: Bearer <token>` header.

JWT verification (`api/auth.py`):
1. Try ES256 via JWKS (`supabase_jwks_url`) — new Supabase projects use ECC P-256
2. Fall back to HS256 with `supabase_jwt_secret` — legacy tokens

Admin routes additionally check `user_roles.role = 'admin'` in the database.

Invite-only registration: new users must redeem an invite code (generated by admin) before completing onboarding. The `invite_codes` table tracks codes, expiry, and which user redeemed each.

---

## Database Schema (tables in use)

| Table | Purpose |
|---|---|
| `users` | Profiles, push tokens, accent colors, sosh_score |
| `user_roles` | Admin flag |
| `follows` | Follower/following relationships |
| `user_blocks` | Block relationships (hides feed content, prevents DMs) |
| `pulses` | Pulse events with submission/voting windows |
| `pulse_entries` | User submissions to Pulses |
| `votes` | Entry votes (unique per user per entry) |
| `trophies` | Win records |
| `mosaics` | Top 20 mosaic records per resolved Pulse |
| `leaderboard_results` | Archived final leaderboard per Pulse |
| `sosh_score_snapshots` | Score history per user |
| `posts` | Freeform social posts (text/photo/video) |
| `post_likes` | Post like records |
| `post_comments` | Post comments |
| `entry_reports` | Flagged Pulse entries |
| `post_reports` | Flagged posts |
| `user_reports` | Flagged users |
| `notifications` | In-app notification inbox |
| `conversations` | DM conversation containers |
| `conversation_participants` | Maps users to conversations |
| `direct_messages` | DM messages with read receipts |
| `invite_codes` | Invite-only signup codes |

---

## Mobile App Structure

```
mobile/app/
  (auth)/          — login, signup screens
  (tabs)/          — main tab bar
    home.tsx       — Pulse banner + social post feed
    pulse.tsx      — submit entry, vote, view leaderboard
    leaderboard.tsx — live voting + resolved Pulse results
    search.tsx     — search people + posts (tabbed)
    profile.tsx    — own profile: entries, trophies, score, avatar
  onboarding.tsx   — username + city + invite code gating
  admin.tsx        — fire Pulse, resolve, schedule, invite codes, moderation
  user/[id].tsx    — public profiles with follow/block/DM actions
  post/[id].tsx    — single post view with comments
  compose.tsx      — create new post (modal)
  notifications.tsx — notification inbox
  dm/
    index.tsx      — conversation list
    [id].tsx       — DM thread
  legal.tsx        — Terms of Service + Privacy Policy
```

---

## Production Infrastructure

| Service | Platform | Notes |
|---|---|---|
| API | Railway (sosh-production) | Auto-deploy from `main` |
| RQ Worker | Railway (sosh-worker) | Start cmd: `rq worker --with-scheduler sosh` |
| Database | Supabase | `gxtbcxkdodmfikkhncmw.supabase.co` |
| Redis | Upstash | `legal-eagle-100955.upstash.io:6380` (TLS) |
| Storage | Supabase Storage | `sosh-media` bucket (public) |
| Push | Expo Push + FCM/APNs | Token in `users.push_token` |
| Mobile | Expo Go (Android) | Dev server on local machine |

---

## Phase 2 Additions (not built yet)

```
+ ML Service (Python)
    → Clusters vibe_snaps into vibe_clusters
    → Feeds Pressure Gauge signal to API
    → Drives automated Pulse timing based on activity signals

+ WebSocket real-time leaderboard (replaces HTTP polling)

+ On-device content filter (PhotoDNA / on-device ML)

+ Age verification (deferred — DMs are open MVP, no verification yet)

+ Vibe-Cluster Feed, Tide-Riding, Synch-Links, Parallel Echo
```
