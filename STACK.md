# Sösh — Technology Stack
**Version:** 0.2
**Status:** Decided — revised for zero-cost development and early operation
**Depends on:** DESIGN.md v0.1, FLOWS.md v0.1, SCHEMA.md v0.1
**Last Updated:** 2026-09-06

---

## The Principle

The stack serves two constraints: the hard technical requirements from SCHEMA.md, and the hard financial requirement of $0/month until the product is earning.

This is a **phased stack**. Phase 1 (development through early users) runs entirely on free tiers. Phase 2 (post-revenue scale) upgrades individual services as needed. Nothing in Phase 1 requires rewriting to reach Phase 2 — only connection strings and hosting configs change.

**The rule:** No paid service until the free tier is genuinely exhausted or until the product is generating revenue. Every dollar spent before first revenue is a dollar that has to come out of your pocket.

This stack is optimized for a **solo developer with AI assistance** running guerilla development. It prioritizes:
- Free tiers first, paid upgrades only when earned
- Managed services over self-managed infrastructure (less ops burden)
- Python and TypeScript (languages already in use across the project)
- Tools with excellent documentation and large communities (better AI code generation support)

### What it costs to start

| Milestone | Cost |
|---|---|
| Development and local testing | $0/month |
| Founding Wave (up to ~500 users) | $0/month |
| App Store submission (when ready) | $99 Apple (annual) + $25 Google (one-time) |
| Operating at ~10,000 MAU | $0–15/month |
| First cost that scales dangerously | Stripe Identity at $1.50/verification — deferred until post-revenue |

**Revenue comes before meaningful cost.** Brand partnerships are sold after you have real user data, not before. Build first, prove the loop, then sell.

---

## Quick Reference

| Layer | Choice | Cost | Why |
|---|---|---|---|
| Mobile app | React Native + Expo | $0 | TypeScript, device APIs simplified, cross-platform |
| Mobile testing | Expo Go on device | $0 | No developer account needed until App Store submission |
| Main API | FastAPI (Python) | $0 | Async-native, Python experience |
| API hosting | Fly.io free tier | $0 | 3 VMs, no sleep, no credit card required |
| Job queue | RQ (Redis Queue) | $0 | Simple, Python, uses Redis already on Fly.io |
| Relational DB | PostgreSQL + PostGIS | $0 | Hard requirement from schema |
| DB hosting | Supabase free tier | $0 | 500MB DB, 50k MAU, PostGIS, Auth included |
| Redis | Redis on Fly.io VM | $0 | Bundled in existing free Fly.io VM |
| Media storage | Cloudflare R2 free tier | $0 | 10GB storage, no egress fees, CDN included |
| Push notifications | Expo Push + FCM/APNs | $0 | One API call, handles both platforms |
| Auth | Supabase Auth | $0 | Integrated with Supabase DB, JWT, sessions |
| Real-time leaderboard | HTTP polling (MVP) | $0 | Every 5s during Pulse window — no WebSocket complexity until needed |
| ML service | **DEFERRED — Phase 2** | $0 | Not needed for Pulse-only MVP |
| Age verification | **DEFERRED — Phase 2** | $0 | DMs are post-MVP. $1.50/user cost deferred until post-revenue |
| On-device filter | **DEFERRED — Phase 2** | $0 | Basic text moderation in API for MVP |

---

## Architecture Overview

```
PHASE 1 ARCHITECTURE (free tier — MVP through early users)

┌──────────────────────────────────────────────────────────────────────┐
│  MOBILE (React Native + Expo)                                        │
│                                                                      │
│  ┌────────────────┐  ┌───────────────────────────────────────────┐  │
│  │  Expo Camera   │  │  Expo Notifications                       │  │
│  │  (in-app       │  │  (Pulse trigger, Tide-Rider alerts)       │  │
│  │  capture only) │  │                                           │  │
│  └───────┬────────┘  └──────────────────────┬────────────────────┘  │
│          │                                  │                       │
└──────────┼──────────────────────────────────┼───────────────────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MAIN API (FastAPI / Python) — Fly.io free tier                      │
│                                                                      │
│  ┌────────────────────┐   ┌──────────────────────────────────────┐  │
│  │  HTTP REST         │   │  HTTP polling endpoint               │  │
│  │  endpoints         │   │  GET /pulse/{id}/leaderboard         │  │
│  │                    │   │  (mobile polls every 5s during       │  │
│  │                    │   │  Pulse window — no WebSocket yet)    │  │
│  └────────┬───────────┘   └──────────────────────────────────────┘  │
│           │                                                         │
└───────────┼─────────────────────────────────────────────────────────┘
            │
     ┌──────┴──────────────────┐
     ▼                         ▼
┌─────────────────┐   ┌────────────────────────────────┐
│ Supabase        │   │  Fly.io VM #2                  │
│ PostgreSQL      │   │  Redis (bundled, no extra cost) │
│ PostGIS         │   │  + RQ worker process           │
│ Supabase Auth   │   └────────────────────────────────┘
│ (free tier)     │
└─────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  MEDIA (Cloudflare R2 free tier)                                     │
│  10GB storage, 1M writes/month, zero egress fees, CDN included       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PUSH (Expo Push → FCM + APNs) — free                                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  DEFERRED TO PHASE 2                                                 │
│  - ML service (Vibe-Cluster triangulation)                           │
│  - WebSockets (replace polling at scale)                             │
│  - Age verification / Stripe Identity                                │
│  - On-device content filter (basic API-side moderation in MVP)       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Layer-by-Layer Decisions

### Mobile App — React Native + Expo

**Why React Native:**
The mobile app needs access to the camera (in-app capture only), IMU sensors (accelerometer/gyroscope for mood triangulation), push notifications, and on-device ML inference. React Native provides all of this with a mature ecosystem.

**Why Expo specifically:**
Expo wraps React Native and simplifies every device API we need:
- `expo-camera` handles in-app capture with enforced constraints
- `expo-sensors` gives clean access to accelerometer/gyroscope (IMU data)
- `expo-notifications` handles the Pulse notification trigger across both platforms
- `expo-location` for binned GPS (neighborhood-level, not precise)
- Expo EAS (Application Services) handles app builds and OTA updates without App Store re-submission for non-native changes
- The development workflow is dramatically faster than bare React Native

**Language:** TypeScript throughout. Strict mode enabled.

**On-device ML:**
- MediaPipe for pose estimation and basic scene classification (cross-platform, runs on-device, well-supported in React Native)
- TensorFlow Lite for the content safety filter model (Android: `@tensorflow/tfjs-react-native`, iOS: CoreML backend via TFLite)
- Both run before the Post button activates — no network call required for filtering

**Rejected:**
- Flutter (Dart) — Captain has no Dart experience. No advantage that justifies the learning curve.
- Native iOS/Android — Double the development work for a solo build. Not viable.

---

### Main API — FastAPI (Python)

**Why FastAPI:**
FastAPI is the correct choice because:

1. **Async-native.** The Pulse window creates simultaneous requests from potentially millions of users. FastAPI's async/await model handles concurrent connections without blocking. Flask blocks. Django blocks. FastAPI does not.

2. **WebSocket support is first-class.** The live leaderboard requires WebSocket connections for real-time push updates. FastAPI has native WebSocket support without a separate library. This is a hard requirement.

3. **Python.** Captain has Python experience from vern-os and atlas-v2. The ML service is also Python. Using the same language across services reduces cognitive overhead.

4. **Automatic OpenAPI docs.** FastAPI generates interactive API documentation automatically. This is valuable when Claude and VERN are generating code — we have a live reference for every endpoint.

**WebSocket broadcast at scale:**
A single API instance can serve WebSocket connections directly. When the API scales horizontally (multiple instances), WebSocket broadcasts use Redis Pub/Sub — when instance A receives a vote, it publishes to Redis, and all other instances receive it and push to their connected clients.

**Rejected:**
- Node.js/Express — Valid choice (TypeScript, good WebSocket ecosystem), but Python aligns better with the ML service and Captain's experience. Chosen not to split the backend language.
- Django — Too heavy for a real-time API. The ORM is synchronous by default, blocking in high-concurrency scenarios.
- Go — High performance but no existing experience, poor fit for guerilla development.

---

### ML Service — DEFERRED (Phase 2)

The ML triangulation pipeline is computationally expensive and is not needed for the Pulse-only MVP.

**What the MVP does instead:**
- Vibe-Clusters are seeded manually with 5-10 starter clusters (time-of-day based: "Morning," "Mid-Day," "Late Night," etc.)
- VibeSnap cluster assignment uses simple rules: time of day + GPS location type from device metadata
- This is intentionally dumb. It works well enough to test the Tide-Riding mechanic and feed experience before investing in ML

**When to build the ML service:**
When the Vibe-Cluster feed is shipping and manual cluster rules are clearly insufficient. At that point, start with Google Vision API free tier (1,000 units/month) for basic image labeling before building the full triangulation pipeline.

**Phase 2 stack (when ML service is needed):**
- Separate FastAPI Python service on Fly.io
- `mediapipe` for pose estimation
- `sentence-transformers` for content embeddings
- `scikit-learn` for clustering
- `Pillow` / `opencv-python` for image preprocessing

---

### Job Queue — RQ (Redis Queue)

**Why RQ over Celery:**
Celery is the industry standard but has significantly more configuration complexity. For a solo developer in guerilla mode, RQ is the correct starting point:
- Three lines to define a job, one line to enqueue it
- Uses the existing Redis instance (no additional broker needed)
- Dashboard (`rq-dashboard`) for monitoring job status
- Trivially simple to switch to Celery later if RQ's limitations are hit

**Why not a serverless queue (AWS SQS, etc.):**
Unnecessary complexity at this stage. The Redis instance is already required. Use it.

**Worker deployment:** RQ worker runs as a second process on Fly.io VM #2 (alongside Redis). Same free VM, two processes. At small scale this is fine. At scale, the worker gets its own VM.

---

### Database — PostgreSQL + PostGIS on Supabase

**Why Supabase:**
Supabase is a managed PostgreSQL platform with several features that directly reduce solo development overhead:

1. **PostGIS is available** as an extension with one click. Confirmed hard requirement from schema.
2. **Supabase Auth** handles user registration, JWT tokens, session management, and social login (Google, Apple) — services we need but do not want to build.
3. **Row Level Security (RLS)** allows database-level access control, reducing the amount of auth logic in the API layer.
4. **Database dashboard** for direct table inspection and SQL queries during development.
5. **Generous free tier** (500MB database, 50MB file storage, 50,000 monthly active users) — sufficient for the entire development and early launch phase.

**Supabase Auth integration with FastAPI:**
Supabase issues standard JWTs. FastAPI verifies these with `python-jose`. No custom auth system required.

**Supabase Realtime:**
Supabase has a built-in Realtime system (PostgreSQL → WebSocket). This may partially replace custom WebSocket code for some features. Evaluate during build — do not over-rely on it initially.

**Migration management:**
Supabase supports SQL migration files via the Supabase CLI. The schema from SCHEMA.md maps directly to migration files. Use the Supabase CLI for all schema changes — never modify tables directly through the dashboard in production.

---

### Cache and Realtime State — Redis on Fly.io

Redis runs on Fly.io VM #2 alongside the RQ worker. No separate service, no extra cost. The Fly.io free tier includes 3 shared VMs — VM #1 runs the API, VM #2 runs Redis + RQ worker, VM #3 is available if needed.

**What lives in Redis:**
All Redis keys defined in SCHEMA.md:
- Pulse leaderboard sorted sets
- Pressure Gauge float
- Vibe-Cluster heat floats (Phase 2)
- Rate limiting counters
- Session state
- RQ job queue

**When to upgrade:** When the Fly.io VM's 256MB RAM is insufficient for Redis data size, move Redis to a dedicated Fly.io volume or Upstash pay-as-you-go. This requires only a `REDIS_URL` change.

---

### Media Storage — Cloudflare R2

**Why R2 over AWS S3:**
R2 is S3-compatible. The API code is identical — use `boto3` with an R2 endpoint. The critical advantage is **zero egress fees**. AWS charges for every byte downloaded from S3. A video-heavy social platform with global CDN delivery would accumulate massive egress costs on S3. R2 has no egress fees.

R2 also integrates natively with Cloudflare CDN for global edge delivery of media — faster load times for international users, no additional configuration.

**Naming convention for media:**
```
{content_type}/{user_id}/{content_id}.{ext}
pulse_entries/{user_id}/{entry_id}.mp4
vibe_snaps/{user_id}/{snap_id}.jpg
parallel_echoes/{user_id}/{echo_id}.mp4
```

**Upload flow:**
The API generates a pre-signed upload URL, returns it to the mobile client, and the client uploads directly to R2. The API server never proxies media. This is mandatory at scale.

---

### Push Notifications — Expo Push + FCM/APNs

Expo's push notification service acts as a unified gateway to both FCM (Google/Android) and APNs (Apple/iOS). A single API call to Expo's service handles delivery to both platforms.

For the Pulse trigger specifically: when the Pulse fires, the API publishes a Redis Pub/Sub event. A dedicated notification worker subscribes, fetches all user push tokens for the active region wave, and batches the Expo push calls. Expo handles the rest.

**Limits:** Expo's push service has rate limits. For a Pulse firing to 1 million users, batch size should be 100 tokens per API call (Expo's recommended batch size).

---

### Auth — Supabase Auth

Supabase Auth handles:
- Email/password registration and login
- Magic link (passwordless) login
- Google and Apple OAuth (important for App Store compliance)
- JWT generation and refresh
- Session management

The mobile app uses `supabase-js` (or `supabase-flutter` if needed). The FastAPI backend verifies JWTs using the Supabase JWT secret.

**What Supabase Auth does NOT handle:**
- Age verification (this is Stripe Identity's job)
- Profile data (stored in the `users` table, not in Supabase Auth's user table)
- The Sösh Score, roles, or any application-level data

---

### Age Verification — DEFERRED (Phase 2)

Stripe Identity costs $1.50 per verification. DMs (the only feature requiring age verification) are post-MVP. Do not build or pay for this until DMs are on the roadmap.

**MVP approach:** The Synch-Link Shared Space (emoji reactions only) requires no verification. It is safe for all ages by design. This is sufficient for the Pulse-only MVP and the Vibe-Cluster phase.

**When to build:** When DM unlocking is ready to ship. At that point, implement Stripe Identity for US users, evaluate Sumsub for global coverage. The `verification_statuses` table in the schema is already designed for this — no schema changes needed when the time comes.

---

## Local Development Environment

All services run locally via Docker Compose. This mirrors the Fly.io production setup exactly — same services, same environment variables, no surprises when deploying.

### docker-compose.yml structure

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4  # PostgreSQL 16 with PostGIS
    environment:
      POSTGRES_DB: sosh_dev
      POSTGRES_USER: sosh
      POSTGRES_PASSWORD: sosh_dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: ./api
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql+asyncpg://sosh:sosh_dev_password@postgres:5432/sosh_dev
      REDIS_URL: redis://redis:6379
      SUPABASE_JWT_SECRET: ${SUPABASE_JWT_SECRET}
      R2_ACCESS_KEY: ${R2_ACCESS_KEY}
      R2_SECRET_KEY: ${R2_SECRET_KEY}
      R2_ENDPOINT: ${R2_ENDPOINT}
    depends_on:
      - postgres
      - redis

  worker:
    build: ./api
    command: rq worker --with-scheduler
    environment:
      DATABASE_URL: postgresql+asyncpg://sosh:sosh_dev_password@postgres:5432/sosh_dev
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  rq_dashboard:
    image: eoranged/rq-dashboard
    ports:
      - "9181:9181"
    environment:
      RQ_DASHBOARD_REDIS_URL: redis://redis:6379
    depends_on:
      - redis

volumes:
  postgres_data:

# ml_service added in Phase 2 when Vibe-Cluster ML is ready
```

### Repository structure

```
sosh/
  DESIGN.md
  FLOWS.md
  SCHEMA.md
  STACK.md
  docker-compose.yml
  .env.example
  .env                   (gitignored — never commit this)
  api/                   (FastAPI main API — Phase 1)
    Dockerfile
    fly.toml             (Fly.io deployment config)
    requirements.txt
    main.py
    routers/
    models/
    services/
    workers/             (RQ job definitions)
  mobile/                (React Native + Expo)
    package.json
    app.json
    app/
    components/
    hooks/
    services/
  migrations/            (SQL migration files for Supabase CLI)
    0001_initial_schema.sql
  # ml_service/ added in Phase 2
```

---

## Production Deployment

### Phase 1 — Free tier (development through ~10,000 MAU)

| Service | Where | Cost |
|---|---|---|
| Main API | Fly.io VM #1 (shared-cpu-1x, 256MB) | $0 |
| Redis + RQ Worker | Fly.io VM #2 (shared-cpu-1x, 256MB) | $0 |
| PostgreSQL + Auth | Supabase free tier | $0 |
| Media | Cloudflare R2 free tier | $0 |
| Push notifications | Expo Push + FCM/APNs | $0 |
| Mobile testing | Expo Go on device | $0 |
| **Total** | | **$0/month** |

**Fly.io deployment** is via `flyctl deploy` from the `api/` directory. The `fly.toml` config file in the repo handles the rest. Auto-deploy from GitHub via Fly.io's GitHub Action.

**App Store submission** (when ready, not before):
- Apple Developer Account: $99/year
- Google Play: $25 one-time

### Phase 2 — Post-revenue upgrades (pay only when earning)

| Milestone | What changes | New cost |
|---|---|---|
| App Store submission | Apple + Google accounts | +$124 one-time |
| Fly.io VM RAM insufficient | Upgrade to performance-1x VMs | +$15-30/month |
| Supabase free tier cap (~50k MAU) | Upgrade to Supabase Pro | +$25/month |
| Redis fills 256MB | Dedicated Redis volume on Fly.io | +$2-5/month |
| DMs feature ships | Stripe Identity, $1.50/verification | Variable |
| ML service needed | New Fly.io VM for ML service | +$7-15/month |
| WebSocket scale needed | Replace polling with WebSocket server | Code change only |
| 500k+ MAU | AWS RDS + ElastiCache migration | Significant — revisit at that point |

---

## Environment Variables

Every secret is in `.env` locally and in Fly.io's secret store in production (`flyctl secrets set KEY=value`). `.env` is gitignored. A `.env.example` file documents all required variables without values.

```bash
# .env.example

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# Database (direct connection for migrations, async for API)
DATABASE_URL=postgresql+asyncpg://...
DATABASE_URL_SYNC=postgresql://...   # for Supabase CLI migrations

# Redis
REDIS_URL=redis://localhost:6379     # local dev
# REDIS_URL=redis://redis-vm:6379    # Fly.io production (internal network)

# Cloudflare R2
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_ENDPOINT=                         # https://{account_id}.r2.cloudflarestorage.com
R2_BUCKET_NAME=sosh-media

# Expo Push Notifications
EXPO_ACCESS_TOKEN=

# App config (tuning parameters from Open Questions F1-F8)
# These are env vars, not hardcoded — adjust without a code deploy
SYNCH_LINK_SIMILARITY_THRESHOLD=0.75
SEED_CRITICAL_MASS=50
VIBE_SNAP_DAILY_LIMIT=20
VOTING_WINDOW_HOURS=2
PARALLEL_ECHO_MIN_EVENTS=1
HEAT_DECAY_HALF_LIFE_HOURS=6

# Phase 2 only — do not add until features are ready to ship
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
```

---

## What We Are Explicitly Not Using

| Tool | Why not |
|---|---|
| Railway | $5/month minimum even on Hobby plan. Fly.io free tier covers the same workload at $0. Switch to Railway only if Fly.io proves insufficient. |
| Upstash Redis | 10k commands/day free limit is too low for even a small Pulse event. Redis bundled on Fly.io VM is unlimited within the VM's RAM. |
| AWS directly | Too much configuration overhead for guerilla development and not free. Supabase + Fly.io + Cloudflare R2 gives equivalent capability at $0. |
| GraphQL | REST is simpler to build and debug for a known schema. Adds complexity without benefit. |
| WebSockets (Phase 1) | HTTP polling every 5 seconds is sufficient for the MVP Pulse window. WebSockets add connection management complexity that is not warranted at small scale. Add them in Phase 2. |
| Kubernetes | Not until scale requires it. Fly.io handles orchestration at this stage. |
| MongoDB or other NoSQL | PostgreSQL handles the relational and JSONB needs. Adding a second database type adds operational burden. |
| Socket.io | Not needed at this stage. FastAPI native WebSockets are sufficient when WebSockets are eventually added. |
| Celery (initially) | RQ is sufficient. Celery when RQ's limits are reached. |
| Web frontend | Mobile-first. No web frontend in the initial build. Web is a future phase decision. |
| Stripe Identity (Phase 1) | $1.50/verification. DMs are post-MVP. Do not build or pay for this until DMs are ready to ship. |

---

*This stack document reflects Phase 1 (free-tier, MVP-first). Build the Pulse loop. Prove D7 retention. Add complexity only when the product earns it. Next: `migrations/0001_initial_schema.sql`, repository scaffolding, FastAPI skeleton.*

---

## Build-Time Decisions (added 2026-09-07)

These decisions were made or confirmed during the initial build sprint. They augment the design-era choices above.

### Database connection: session-mode pooler required

**`DATABASE_URL` must use port 5432 (session mode), NOT port 6543 (transaction mode).**

SQLAlchemy's asyncpg dialect uses prepared statements internally. pgbouncer in transaction mode does not support prepared statements — connections are reused mid-session and statement handles are lost, causing `DuplicatePreparedStatementError`.

Session-mode pooler (port 5432) holds the connection for the client's logical session, making prepared statements safe. This is the correct pooler for a server-side FastAPI app with SQLAlchemy.

See ADR-003 in DECISIONS.md.

### Worker DB driver: psycopg2-binary

RQ workers are synchronous. asyncpg is an async driver and cannot be used in a sync context. Workers use `psycopg2-binary==2.9.9`.

Workers obtain the sync DB URL with:
```python
settings.database_url.replace("+asyncpg", "")
```

See ADR-006 in DECISIONS.md.

### JWT verification: PyJWT + JWKS client

New Supabase projects sign JWTs with ECC P-256 / ES256. Replaced `python-jose` (HS256-only in practice) with `PyJWT[crypto]` and `PyJWKClient` for automatic JWKS key fetching and caching.

See ADR-005 in DECISIONS.md.

### SQLAlchemy: raw text() queries, no ORM models

The schema has 40 tables with PostGIS and complex relationships. Raw `text()` queries are more readable and debuggable than ORM models for this schema complexity. No SQLAlchemy model classes are defined — only the `Base` declarative class for potential future use.
