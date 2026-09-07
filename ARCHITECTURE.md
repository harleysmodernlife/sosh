# Sösh — System Architecture
**Version:** 0.1
**Status:** Current (reflects live system)
**Last Updated:** 2026-09-07

---

## Component Map

```
Mobile App (React Native + Expo)
        │
        │  HTTPS / REST
        ▼
┌───────────────────────┐
│   FastAPI API          │  ← runs in Docker / Fly.io
│   (api/main.py)        │
│                        │
│  Routers:              │
│  /users  /pulses       │
│  /entries /votes       │
│  /trophies /media      │
│  /admin  /health       │
└──────┬────────┬────────┘
       │        │
       │        │  async read/write
       │        ▼
       │   ┌─────────────────────────────┐
       │   │   Supabase (PostgreSQL)      │
       │   │   project: gxtbcxkdodmfikk   │
       │   │   host: pooler.supabase.com  │
       │   │   port: 5432 (session mode)  │
       │   │   40 tables, PostGIS, RLS    │
       │   └─────────────────────────────┘
       │
       │  async read/write
       ▼
┌──────────────┐
│  Redis       │  ← runs in Docker / Fly.io VM
│  port: 6379  │
│              │
│  Stores:     │
│  • Live leaderboard sorted sets
│  • RQ job queue (sosh queue)
│  • RQ scheduled jobs
└──────┬───────┘
       │
       │  RQ job pickup
       ▼
┌──────────────────────────┐
│  RQ Worker               │
│  (workers/worker_*.py)   │
│                          │
│  Jobs:                   │
│  • send_pulse_to_all     │  → Expo Push API → FCM / APNs → device
│  • resolve_pulse         │  → writes trophies, mosaics, score snapshots
└──────────────────────────┘

Media upload flow (separate path):
Mobile → POST /media/presign → API returns presigned R2 URL
Mobile → PUT directly to Cloudflare R2 (API never proxies media bytes)
Mobile → submit entry with media_key → API stores key, constructs CDN URL
```

---

## Component Details

### FastAPI API

- **Language:** Python 3.12
- **Framework:** FastAPI 0.115 + Uvicorn
- **DB client:** SQLAlchemy 2.0 async + asyncpg
- **Auth:** PyJWT with JWKS client (ES256 primary, HS256 fallback)
- **Validation:** Pydantic v2
- **Hot reload:** Uvicorn `--reload` in development (volume-mounted source)
- **Production host:** Fly.io (`api/fly.toml`, region: ord)

Important: `DATABASE_URL` must use the **session-mode pooler** (port 5432), not the transaction-mode pooler (port 6543). SQLAlchemy's asyncpg dialect uses prepared statements, which are incompatible with pgbouncer transaction mode.

### Supabase (PostgreSQL)

- **Project ref:** `gxtbcxkdodmfikkhncmw`
- **Region:** East US — North Virginia
- **Extensions:** `postgis`, `pgcrypto`
- **Auth:** Supabase Auth (email + OAuth), issues ES256 JWTs
- **Trigger:** `handle_new_user()` fires on `auth.users` insert → creates row in `public.users`, `public.sosh_score_snapshots`, `public.verification_statuses`
- **RLS:** Enabled on all tables. Policies defined in migration 0001.
- **Connection:** Session-mode pooler at `aws-0-us-east-1.pooler.supabase.com:5432`

### Redis

- **Version:** Redis 7 Alpine
- **Purpose in v0.1:**
  - Live leaderboard sorted sets: key `leaderboard:{pulse_id}`, score = vote count
  - RQ job queue: queue name `sosh`
  - RQ scheduler (rq-scheduler 0.13.1)
- **Development:** Docker container
- **Production:** Redis VM on Fly.io (bundled in the free tier)

### RQ Workers

Workers run as a separate process (`rq worker --with-scheduler sosh`). They are **synchronous** — asyncpg cannot be used. Workers use `psycopg2-binary` for DB access.

**`worker_push.py`** — `send_pulse_to_all(pulse_id, prompt, city)`
1. Queries `users` for all users in the target city who have a push token
2. Batches into groups of 100
3. Sends to Expo Push API
4. Logs failures (does not retry in v0.1)

**`worker_resolve.py`** — `resolve_pulse(pulse_id)`
1. Marks pulse `status = 'resolving'`
2. Finds the top-voted entry per city (from DB `vote_count`)
3. Creates a `trophies` record for the winner (`city_rep` title)
4. Generates the `mosaics` record (top 20 entries by vote count)
5. Updates `leaderboard_results` table
6. Updates winner's `sosh_score_snapshots`
7. Sends winner push notification
8. Marks pulse `status = 'resolved'`

### Cloudflare R2 (media)

- **Bucket:** `sosh-media`
- **Upload flow:** Client-side direct upload via presigned PUT URL (API generates URL, never touches media bytes)
- **CDN:** R2 has zero egress fees — media served directly from R2 public URL
- **Not configured yet** in v0.1 local development (keys are blank in `.env`)

### Expo Push

- Single API call covers FCM (Android) and APNs (iOS)
- Push tokens stored in `users.push_token`
- Token updated on every app launch
- Not configured yet in v0.1 local development

---

## Data Flows

### Pulse Fire Flow

```
Admin → POST /admin/pulses
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
  → Returns 204
```

### Leaderboard Polling Flow

```
Mobile polls GET /pulses/{id}/leaderboard every 5 seconds
  → ZREVRANGE leaderboard:{pulse_id} 0 49 WITHSCORES (Redis)
  → Returns [{entry_id, vote_count, rank}]
  → If key missing (post-resolution): returns [] (mobile falls back to mosaic view)
```

### Resolution Flow

```
RQ worker picks up resolve_pulse job
  → UPDATE pulse status='resolving'
  → SELECT entry with MAX(vote_count) per city (from DB votes table)
  → INSERT trophies (city_rep)
  → INSERT mosaics (top 20 entries)
  → INSERT leaderboard_results
  → UPDATE sosh_score_snapshots (trophy_count * 10)
  → send_winner_notification (Expo Push)
  → UPDATE pulse status='resolved'
```

---

## Auth Model

All API routes except `/health` and `GET /pulses/active` require a valid Supabase JWT in the `Authorization: Bearer <token>` header.

JWT verification (`api/auth.py`):
1. Try ES256 via JWKS (`supabase_jwks_url`) — new Supabase projects use ECC P-256
2. Fall back to HS256 with `supabase_jwt_secret` — legacy tokens and service_role keys

Admin routes additionally check `user_roles.role = 'admin'` in the database.

---

## Phase 2 Additions (not built yet)

When Vibe-Clusters and ML are prioritized:

```
+ ML Service (Python, runs on Fly.io or Modal)
    → Clusters vibe_snaps into vibe_clusters
    → Feeds Pressure Gauge signal to API
    → Drives automated Pulse timing

+ WebSocket real-time leaderboard (replaces HTTP polling)

+ Stripe Identity (age verification for DMs)

+ S3-compatible upload validation (PhotoDNA for CSAM scanning)
```
