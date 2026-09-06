# Sösh — Technology Stack
**Version:** 0.1
**Status:** Decided — subject to revision at scale milestones
**Depends on:** DESIGN.md v0.1, FLOWS.md v0.1, SCHEMA.md v0.1
**Last Updated:** 2026-09-06

---

## The Principle

The schema confirmed five hard requirements. The stack serves those requirements. Every choice below is a direct response to a technical constraint from SCHEMA.md, not a preference or trend.

This stack is optimized for a **solo developer with AI assistance** running guerilla development. It prioritizes:
- Managed services over self-managed infrastructure (less ops burden)
- Python and TypeScript (languages already in use across the project)
- Free/cheap tiers early, scalable paths later
- Tools with excellent documentation and large communities (better AI code generation support)

---

## Quick Reference

| Layer | Choice | Why |
|---|---|---|
| Mobile app | React Native + Expo | TypeScript, device APIs simplified, cross-platform |
| Main API | FastAPI (Python) | Async-native, WebSocket built-in, Python experience |
| ML service | FastAPI (Python) | Same language as API, separate process, async job queue |
| Job queue | RQ (Redis Queue) | Simple, Python, uses the Redis already required |
| Relational DB | PostgreSQL + PostGIS | Hard requirement from schema |
| Cache + realtime state | Redis | Hard requirement from schema |
| DB hosting | Supabase | Managed PostgreSQL + PostGIS + Auth, generous free tier |
| Redis hosting | Upstash | Serverless Redis, free tier, REST + Redis protocol |
| API hosting | Railway | Python deployment, connects to Supabase and Upstash |
| Media storage | Cloudflare R2 | S3-compatible, no egress fees, CDN included |
| Push notifications | Expo Push + FCM/APNs | One API call, handles both platforms |
| Auth | Supabase Auth | Integrated with Supabase DB, JWT, handles sessions |
| Age verification | Stripe Identity | Well-documented, easy to integrate |
| On-device filter | TensorFlow Lite + MediaPipe | Cross-platform, handles pose + content classification |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  MOBILE (React Native + Expo)                                        │
│                                                                      │
│  ┌─────────────────┐  ┌────────────────┐  ┌───────────────────────┐ │
│  │  On-device ML   │  │  Expo Camera   │  │  Expo Notifications   │ │
│  │  TFLite +       │  │  (in-app       │  │  (Pulse trigger,      │ │
│  │  MediaPipe      │  │  capture only) │  │  Tide-Rider alerts)   │ │
│  └────────┬────────┘  └───────┬────────┘  └──────────┬────────────┘ │
│           │                  │                       │              │
└───────────┼──────────────────┼───────────────────────┼──────────────┘
            │                  │                       │
            ▼                  ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MAIN API (FastAPI / Python)  — Railway                              │
│                                                                      │
│  ┌────────────────────┐   ┌──────────────────────────────────────┐  │
│  │  HTTP REST         │   │  WebSocket Server                    │  │
│  │  endpoints         │   │  - Pulse leaderboard stream          │  │
│  │                    │   │  - Pressure Gauge updates            │  │
│  │                    │   │  - Active Pulse feed                 │  │
│  └────────┬───────────┘   └──────────────┬───────────────────────┘  │
│           │                              │                          │
└───────────┼──────────────────────────────┼──────────────────────────┘
            │                              │
     ┌──────┴──────┐               ┌───────┴──────┐
     ▼             ▼               ▼              ▼
┌─────────┐  ┌──────────┐   ┌───────────┐  ┌──────────────────────┐
│ Supabase│  │  Upstash │   │  Upstash  │  │  Redis Pub/Sub       │
│ Postgres│  │  Redis   │   │  Redis    │  │  (WebSocket          │
│ PostGIS │  │  (sorted │   │  (rate    │  │   broadcast to       │
│         │  │  sets,   │   │   limits, │  │   multiple API       │
│         │  │  leaderb.)  │   Pressure │  │   instances)         │
└─────────┘  └──────────┘   │  Gauge)   │  └──────────────────────┘
                             └───────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  JOB QUEUE (RQ Workers / Python) — Railway                           │
│                                                                      │
│  Jobs: vote_flush, leaderboard_resolve, mosaic_generate,             │
│        heat_decay, seed_check, sosh_score_refresh,                   │
│        synchlink_expire, pioneer_decay, tide_rider_evaluate          │
│                                                                      │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  ML SERVICE (FastAPI / Python) — Railway                             │
│                                                                      │
│  - Vibe-Snap triangulation pipeline                                  │
│  - Cluster assignment + confidence scoring                           │
│  - Seed similarity detection                                         │
│  - Synch-Link energy signature comparison                            │
│  - Narrative Arc Engine (Mosaic generation)                          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  MEDIA (Cloudflare R2 + CDN)                                         │
│  - All video, photo uploads from Pulse entries and Vibe-Snaps        │
│  - On-demand transcoding via Cloudflare Stream (future phase)        │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PUSH (Expo Push Notification Service → FCM + APNs)                  │
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

### ML Service — FastAPI (Python, separate process)

The triangulation pipeline is computationally expensive (vision model inference, embedding comparisons, clustering). It cannot run in the main API without blocking request handling.

**Architecture:** Separate FastAPI service, same Railway project. The main API enqueues jobs to RQ; the ML service workers consume them.

**Libraries:**
- `mediapipe` — pose estimation, scene classification
- `sentence-transformers` — content embeddings for Synch-Link similarity
- `scikit-learn` — clustering, similarity scoring
- `Pillow` / `opencv-python` — image preprocessing
- `numpy` — vector operations

**Note on model hosting:**
Initial ML models (pose estimation, content filter) are included in the service container. As models grow, consider Hugging Face model hub or a dedicated model store. Do not hard-code model weights in the codebase — load from a configurable path.

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

**Worker deployment:** RQ workers run as separate Railway processes in the same project as the API.

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

### Cache and Realtime State — Upstash Redis

**Why Upstash:**
Upstash is serverless Redis — you pay per request, not per hour. For early-stage development and low-traffic periods, this is dramatically cheaper than a dedicated Redis instance. It supports both the Redis protocol (for standard Redis clients like `redis-py`) and a REST API.

When traffic scales beyond Upstash's economical range, migrating to a dedicated Redis instance (Railway Redis, AWS ElastiCache) requires changing only the connection string — no code changes.

**What lives in Upstash:**
All Redis keys defined in SCHEMA.md:
- Pulse leaderboard sorted sets
- Pressure Gauge float
- Vibe-Cluster heat floats
- Rate limiting counters
- Session state
- Seed similarity buckets
- RQ job queue

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

### Age Verification — Stripe Identity

Stripe Identity provides government ID verification with a mature SDK, clear pricing, and strong documentation. It does not store raw document data in Sösh systems — the result (verified/not-verified, over-18/under-18) is a webhook payload. The `verification_statuses` table stores only these boolean results.

**Integration flow:**
1. User initiates verification in app settings
2. API calls Stripe Identity to create a verification session
3. Mobile app opens Stripe Identity SDK (built-in UI)
4. User completes ID scan within Stripe's SDK
5. Stripe sends webhook to API with result
6. API updates `verification_statuses` table

**Note:** Stripe Identity has limitations in some countries. For global coverage, evaluate Sumsub as an alternative or supplement after launch. Do not block the build on this decision — implement Stripe Identity first.

---

## Local Development Environment

All services run locally via Docker Compose. This is the only approved local dev setup — do not run services manually outside of Docker.

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

  ml_service:
    build: ./ml_service
    ports:
      - "8001:8001"
    environment:
      DATABASE_URL: postgresql+asyncpg://sosh:sosh_dev_password@postgres:5432/sosh_dev
      REDIS_URL: redis://redis:6379
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
  .env               (gitignored — never commit this)
  api/               (FastAPI main API)
    Dockerfile
    requirements.txt
    main.py
    routers/
    models/
    services/
    workers/          (RQ job definitions)
  ml_service/        (FastAPI ML service)
    Dockerfile
    requirements.txt
    main.py
    pipelines/
    models/           (ML model weights — gitignored, loaded from storage)
  mobile/            (React Native + Expo)
    package.json
    app.json
    app/
    components/
    hooks/
    services/
  migrations/        (SQL migration files for Supabase CLI)
    0001_initial_schema.sql
```

---

## Production Deployment

### Early stage (0 to ~50,000 users)

All services on Railway. One project, multiple services.

| Service | Railway config |
|---|---|
| Main API | Python service, `api/` directory, auto-deploy on push to main |
| ML Service | Python service, `ml_service/` directory |
| RQ Worker | Python service, `api/` directory, command: `rq worker --with-scheduler` |
| PostgreSQL | Supabase (external, not Railway) |
| Redis | Upstash (external, not Railway) |
| Media | Cloudflare R2 (external) |

Monthly cost estimate (early stage, ~10,000 MAU):
- Railway: ~$20/month (Hobby plan, covers API + ML service + worker)
- Supabase: $0 (free tier)
- Upstash: $0 (free tier, ~10k daily requests)
- Cloudflare R2: $0 (free tier: 10GB storage, 1M Class A operations)
- Expo EAS: $0 (free tier)
- Total: ~$20/month

### Scale milestones and what changes

| Milestone | What changes |
|---|---|
| 50k MAU | Upgrade Supabase to Pro ($25/month), upgrade Upstash to pay-as-you-go |
| 100k MAU | Add read replicas for PostgreSQL, dedicated Redis (Railway or AWS) |
| 500k MAU | Move to AWS RDS + ElastiCache, add API horizontal scaling, CDN tuning |
| 1M+ MAU | Full AWS/GCP infrastructure review — this is a good problem to have |

---

## Environment Variables

Every secret is in `.env` locally and in Railway's environment variable settings in production. `.env` is gitignored. A `.env.example` file documents all required variables without values.

```bash
# .env.example

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# Database (direct connection for migrations, async for API)
DATABASE_URL=postgresql+asyncpg://...
DATABASE_URL_SYNC=postgresql://...   # for Alembic migrations

# Redis (Upstash in production, localhost in development)
REDIS_URL=

# Cloudflare R2
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_ENDPOINT=                          # https://{account_id}.r2.cloudflarestorage.com
R2_BUCKET_NAME=sosh-media

# Stripe Identity
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Expo Push Notifications
EXPO_ACCESS_TOKEN=

# App config (tuning parameters from Open Questions F1-F8)
SYNCH_LINK_SIMILARITY_THRESHOLD=0.75
SEED_CRITICAL_MASS=50
VIBE_SNAP_DAILY_LIMIT=20
VOTING_WINDOW_HOURS=2
PARALLEL_ECHO_MIN_EVENTS=1
HEAT_DECAY_HALF_LIFE_HOURS=6
```

**Note on the config section:** The tuning parameters (F1-F8 baselines) are environment variables, not hardcoded constants. This allows adjusting them without a code deploy.

---

## What We Are Explicitly Not Using

| Tool | Why not |
|---|---|
| AWS directly (early stage) | Too much configuration overhead for guerilla development. Supabase + Upstash + Cloudflare R2 + Railway gives equivalent capability with a fraction of the setup time. |
| GraphQL | REST + WebSocket is simpler to build and debug. GraphQL's flexibility is not needed for a defined, known schema. Adds complexity without benefit at this stage. |
| Kubernetes | Not until scale requires it. Railway handles orchestration at this stage. |
| Microservices beyond 3 | API, ML service, and workers. Splitting further creates coordination overhead that kills guerilla development velocity. |
| MongoDB or other NoSQL | PostgreSQL handles the relational and JSONB needs. Introducing a second database type adds operational burden. |
| Socket.io | FastAPI's native WebSocket support is sufficient. Socket.io adds a dependency and namespace complexity that is not needed. |
| Celery (initially) | RQ is sufficient for the job queue. Celery when RQ's limits are reached. |
| Next.js or web frontend | Mobile-first. No web frontend in the initial build. Web is a future phase decision. |

---

*This stack document is complete. The build can begin. Next: migrate SCHEMA.md to actual SQL migration files in `migrations/0001_initial_schema.sql`, set up the repository structure defined above, and scaffold the FastAPI main API.*
