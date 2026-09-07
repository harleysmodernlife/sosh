# Sösh — Architecture Decision Records
**Status:** Living document. Add entries when a significant technical decision is made or revisited.

These are decisions that were actively debated, researched, or that might be revisited in the future. The goal is to prevent the same ground from being relitigated by preserving the context that led to each choice.

---

## ADR-001: Python (FastAPI) over TypeScript (Node) for the API

**Date:** 2026-09-06
**Status:** Decided

**Context:**
Both Python and TypeScript are in active use across the project. The team has experience with both. The ML service (Phase 2) will be Python regardless.

**Decision:** Python + FastAPI

**Rationale:**
- Phase 2 ML service will be Python. Keeping the API in Python avoids a language boundary between API and ML.
- FastAPI's async-native design handles I/O-bound Pulse and vote workloads cleanly.
- Captain already has Python experience. TypeScript backend would have been net new friction.
- FastAPI's automatic OpenAPI generation is a meaningful DX win at this team size.

**Rejected alternative:** TypeScript + Hono/Fastify — strong language, but Python-ML continuity won out.

---

## ADR-002: Supabase over self-managed PostgreSQL

**Date:** 2026-09-06
**Status:** Decided

**Context:**
The schema requires PostgreSQL + PostGIS. We needed managed hosting on a $0 budget.

**Decision:** Supabase free tier

**Rationale:**
- Free tier includes 500MB PostgreSQL + PostGIS extension + Supabase Auth + real-time (if needed later) — everything in one service.
- Supabase Auth handles JWT issuance, OAuth, and email/password auth out of the box, eliminating a significant auth implementation burden.
- 50k MAU on free tier covers the entire Founding Wave and early growth.
- Upgrade path is clear and non-breaking (same connection strings, just paid tier).

**Trade-offs accepted:**
- Supabase's pgbouncer operates in transaction mode (port 6543) by default. SQLAlchemy with asyncpg requires session mode (port 5432). **We use port 5432 (session-mode pooler).**
- Free tier has a 5-connection direct DB limit, but the session-mode pooler handles this transparently.

---

## ADR-003: Session-mode pooler (port 5432) over transaction-mode (port 6543)

**Date:** 2026-09-07 (discovered during build)
**Status:** Decided — affects all DB connections

**Context:**
SQLAlchemy's asyncpg dialect uses prepared statements internally (e.g., for version detection, type OIDs). pgbouncer in transaction mode (port 6543) does not support prepared statements — connections are returned to the pool between transactions and prepared statement handles are lost.

**Decision:** All `DATABASE_URL` values use port 5432 (session-mode pooler)

**Rationale:**
- Session mode holds the connection for the lifetime of the client's logical session, making prepared statements safe.
- For a server-side app with SQLAlchemy's own connection pool (pool_size=5 default), session mode is the correct pooler choice.
- Transaction mode (port 6543) is appropriate for serverless/edge functions that cannot maintain persistent connections. We are not serverless.

**Implication:** If connection limits become a problem at scale, switch to SQLAlchemy's NullPool and revisit. At MVP scale (50-200 users), this is not a concern.

**Files affected:** `.env` (DATABASE_URL), `docker-compose.yml`

---

## ADR-004: RQ (Redis Queue) over Celery

**Date:** 2026-09-06
**Status:** Decided

**Context:**
Background jobs needed: push notifications at Pulse fire, leaderboard resolution after voting closes.

**Decision:** RQ + rq-scheduler

**Rationale:**
- RQ uses the Redis instance already required for the leaderboard sorted sets. Zero additional infrastructure.
- RQ is dramatically simpler than Celery for a team of this size. No broker config, no result backend config, no task routing complexity.
- rq-scheduler handles delayed jobs (resolve_pulse fires N hours after Pulse start) with one function call.
- Jobs are inspectable and requeue-able via rq-dashboard (included in docker-compose).

**Trade-offs accepted:**
- RQ workers are synchronous. asyncpg cannot be used in workers. Workers use psycopg2-binary for DB access.
- `psycopg2-binary` is an additional dependency not needed by the API. This is acceptable.

**Rejected alternative:** Celery — significantly more configuration complexity for no benefit at this scale.

---

## ADR-005: PyJWT + JWKS over python-jose for JWT verification

**Date:** 2026-09-07 (discovered during build)
**Status:** Decided

**Context:**
New Supabase projects sign JWTs with ECC P-256 / ES256, not HS256. The original scaffold used `python-jose` which handles HS256 but has incomplete ES256 support and requires manual JWKS fetching.

**Decision:** `PyJWT[crypto]` with `PyJWKClient`

**Rationale:**
- `PyJWKClient` automatically fetches and caches Supabase's public signing keys from the JWKS endpoint.
- Handles both ES256 (new Supabase projects) and HS256 (legacy tokens) transparently.
- The HS256 fallback preserves compatibility with the legacy JWT secret for service_role and anon keys.
- `PyJWT` is actively maintained and widely used.

**Auth flow:**
1. Try ES256 via JWKS: `https://gxtbcxkdodmfikkhncmw.supabase.co/auth/v1/.well-known/jwks.json`
2. On `PyJWKClientError`, fall back to HS256 with `SUPABASE_JWT_SECRET`
3. On any `PyJWTError`, return 401

**Rejected alternative:** Continue with python-jose — incomplete ES256 support, less actively maintained.

---

## ADR-006: psycopg2-binary for worker DB access

**Date:** 2026-09-07 (discovered during build)
**Status:** Decided

**Context:**
RQ workers execute synchronously. asyncpg is an async driver and cannot be used without an event loop. Workers need direct DB access for resolution logic.

**Decision:** `psycopg2-binary==2.9.9` for workers

**Rationale:**
- psycopg2 is the standard synchronous PostgreSQL driver for Python.
- `-binary` variant avoids the need for system-level libpq installation in Docker.
- Workers use `settings.database_url.replace("+asyncpg", "")` to get the sync-compatible URL.

**Note:** Workers also need `statement_cache_size=0` when using asyncpg raw connections (not relevant for psycopg2, but noted for reference in any future worker refactoring).

---

## ADR-007: HTTP polling over WebSockets for the leaderboard

**Date:** 2026-09-06
**Status:** Decided (deferred to v0.2)

**Context:**
The leaderboard needs to update during the active Pulse window to show vote changes in real time.

**Decision:** HTTP polling every 5 seconds in v0.1

**Rationale:**
- WebSocket infrastructure (Supabase Realtime or a custom WS server) adds meaningful complexity.
- At MVP scale (50-200 users), polling creates no meaningful server load.
- 5-second staleness is imperceptible at this scale — a 5-second-old leaderboard feels live.
- The Redis sorted set (`ZREVRANGE leaderboard:{pulse_id}`) is O(log n) and extremely fast.

**When to revisit:** When polling creates visible lag or server strain at higher scale. Likely deferred past 10k MAU.

---

## ADR-008: React Native + Expo over Flutter for the mobile app

**Date:** 2026-09-06
**Status:** Decided

**Context:**
The mobile app needs native device APIs: camera, microphone (for video), push notifications, location. Cross-platform is required (iOS + Android).

**Decision:** React Native + Expo

**Rationale:**
- TypeScript is in active use on the project. Flutter requires Dart — a new language.
- Expo simplifies camera, notifications, and location APIs significantly.
- Expo Go enables instant testing on device without building a native binary.
- The React Native ecosystem is larger, with better AI code generation support.
- Expo's EAS Build handles App Store submission without macOS requirement (important for Captain's Linux setup).

**Trade-offs accepted:**
- React Native performance is slightly below Flutter for animation-heavy UIs. Sösh is content-first, not animation-first. Acceptable.
- Expo adds an abstraction layer — some low-level native code may require ejecting. Not anticipated for v0.1 scope.

**Rejected alternative:** Flutter — correct technology, wrong language for this team at this time.

---

## ADR-009: No AI-generated Pulse prompts in v0.1

**Date:** 2026-09-06
**Status:** Decided

**Context:**
Could use an LLM to generate Pulse prompts automatically.

**Decision:** Human-authored prompts only in v0.1

**Rationale:**
- The quality of the prompt directly determines the quality of the Pulse. A bad prompt = low participation = bad data.
- AI-generated prompts add a dependency on an LLM API and introduce failure modes (API down, poor quality output, cost).
- At Nashville MVP scale (50-200 users), a human curating 1-2 Pulses per day is not a bottleneck.
- We don't yet have data on what prompt characteristics drive participation. Collecting that data requires human-authored prompts to iterate on.

**When to revisit:** After 30+ days of data on prompt performance. At that point, ML-assisted prompt generation becomes feasible.

---

## ADR-010: Votes written to DB + Redis simultaneously (not async flush)

**Date:** 2026-09-07
**Status:** Decided

**Context:**
Original design considered writing votes to Redis only and flushing to PostgreSQL asynchronously. Implemented as simultaneous write.

**Decision:** Write to DB and Redis on every vote

**Rationale:**
- DB write with unique constraint is the source of truth for preventing double-voting. Redis cannot enforce this.
- The unique constraint `(entry_id, voter_id)` in PostgreSQL is the authoritative deduplication mechanism.
- Redis sorted set provides fast leaderboard reads without hitting the DB on every poll.
- At MVP scale, simultaneous write adds negligible latency (both writes are fast).

**Risk at scale:** Under extreme concurrent voting load, DB write latency could become a bottleneck. At that point, vote writes could move to a queue with async DB flush + Redis as provisional state. Not a v0.1 concern.
