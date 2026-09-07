# Changelog

All notable changes to Sösh are documented here.
Format: [version] — date, summary of what changed.

---

## [0.1.0] — 2026-09-07

### Infrastructure
- Supabase project created (`gxtbcxkdodmfikkhncmw`, East US North Virginia)
- Full database migration applied: 40 tables, PostGIS, pgcrypto, RLS policies
- Docker Compose stack: FastAPI API, RQ worker, Redis, RQ Dashboard
- Fly.io deployment config for API (`api/fly.toml`)

### Backend API
- `GET /health`
- `GET /users/me`, `GET /users/{id}`, `PATCH /users/me`
- `GET /pulses/active`, `GET /pulses/{id}`, `GET /pulses/{id}/leaderboard`, `GET /pulses/{id}/entries`
- `POST /entries`, `POST /entries/{id}/reports`
- `POST /votes`, `DELETE /votes/{entry_id}`
- `GET /trophies/me`, `GET /trophies/{user_id}`
- `POST /media/presign` (Cloudflare R2 pre-signed URL)
- `POST /admin/pulses` (fire a Pulse)
- `POST /admin/pulses/{id}/resolve` (manual resolution)

### Workers
- `worker_push.py` — send Pulse notification to city users via Expo Push
- `worker_resolve.py` — full resolution: flush votes, find winner, create trophy, generate mosaic, update Sösh Score

### Auth
- Supabase JWT verification via PyJWT JWKS client
- ES256 (ECC P-256) primary, HS256 fallback for legacy tokens
- Admin role check via `user_roles` table

### Mobile skeleton
- React Native + Expo 51 project scaffolded
- Permissions configured: camera, microphone, location, notifications

### Documentation
- DESIGN.md, FLOWS.md, SCHEMA.md, STACK.md, MVP.md (design phase)
- README.md, ARCHITECTURE.md, API.md, RUNBOOK.md, DECISIONS.md, CONTRIBUTING.md, TESTING.md (build phase)

### Bugs fixed during build
- `DuplicatePreparedStatementError`: switched DATABASE_URL from transaction-mode pooler (port 6543) to session-mode (port 5432)
- RQ workers failing with `Invalid attribute name`: added missing `psycopg2-binary` dependency
- Pulse INSERT `syntax error near ":"`: PostgreSQL interval cast (`::interval`) conflicts with SQLAlchemy named params — fixed by computing timestamps in Python

---

## [0.0.1] — 2026-09-06

### Design phase complete
- DESIGN.md: full product vision, mechanics, state machine
- FLOWS.md: Pulse Path, Trophy/Score, Vibe-Cluster flows
- SCHEMA.md: complete database schema with rationale
- STACK.md: zero-cost Phase 1 technology decisions
- MVP.md: v0.1 scope, success criteria, what's deferred
- migrations/0001_initial_schema.sql: full schema migration (written, not yet applied)

---

## Upcoming: [0.2.0]

Planned after v0.1 D7 retention target is confirmed:
- Mobile UI screens: home, Pulse capture, leaderboard, Trophy Case
- Automated Pulse firing (replace manual admin trigger)
- Pressure Gauge UI
- Founding Wave recruitment across 3-5 cities
- Vibe-Cluster Feed design and build
- Sponsored Pulse infrastructure
