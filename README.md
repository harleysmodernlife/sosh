# Sösh

A global, real-time social platform built around synchronized events called **Pulses**. When a Pulse fires, every user in the active region gets a push notification and has 15 minutes to capture and post a response. The leaderboard resolves, a winner earns a permanent trophy, and the cycle resets.

**Core hypothesis:** Does the Pulse loop create a daily habit? (D7 retention target: 40%+)

---

## Docs

| Doc | What it covers |
|-----|---------------|
| [DESIGN.md](DESIGN.md) | Full product vision, mechanics, state machine, rejected ideas |
| [FLOWS.md](FLOWS.md) | User journey flows with edge cases |
| [SCHEMA.md](SCHEMA.md) | Database schema design rationale |
| [STACK.md](STACK.md) | Technology choices and cost model |
| [MVP.md](MVP.md) | v0.1 scope, success criteria, what's deferred |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, component wiring, data flows |
| [API.md](API.md) | Complete API reference |
| [RUNBOOK.md](RUNBOOK.md) | Operations: firing Pulses, deploying, incident response |
| [DECISIONS.md](DECISIONS.md) | Key architectural decisions and rationale |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Git flow, PR process, code conventions |
| [TESTING.md](TESTING.md) | Test strategy and how to run tests |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Repo Structure

```
sosh/
├── api/                    FastAPI backend
│   ├── routers/            Route handlers (one file per domain)
│   ├── services/           Business logic (moderation, push)
│   ├── workers/            RQ background jobs
│   ├── main.py             App entry point
│   ├── auth.py             JWT verification (Supabase ES256/HS256)
│   ├── config.py           Settings (pydantic-settings, reads .env)
│   ├── database.py         SQLAlchemy async engine
│   ├── redis_client.py     Redis async + sync clients
│   ├── requirements.txt
│   ├── Dockerfile
│   └── fly.toml            Fly.io deployment config
├── mobile/                 React Native + Expo app (screens TBD)
│   ├── app.json
│   ├── package.json
│   └── tsconfig.json
├── migrations/
│   └── 0001_initial_schema.sql   Full DB schema (run once in Supabase SQL Editor)
├── docker-compose.yml      Local dev: redis, api, worker, rq-dashboard
├── .env                    Local secrets (gitignored)
├── .env.example            Template for .env
└── .gitignore
```

---

## Local Development Setup

### Prerequisites

- Docker + Docker Compose
- Node.js 20+ and npm (for mobile)
- Expo Go installed on your phone

### 1. Clone and configure

```bash
git clone https://github.com/harleysmodernlife/sosh.git
cd sosh
cp .env.example .env
# Fill in .env with credentials (see RUNBOOK.md for where to find them)
```

### 2. Run the backend

```bash
docker-compose up --build
```

Services started:
| Service | URL |
|---------|-----|
| API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| RQ Dashboard | http://localhost:9181 |
| Redis | localhost:6379 |

### 3. Verify it's running

```bash
curl http://localhost:8000/health
# → {"status":"ok","version":"0.1.0"}
```

### 4. Run the mobile app

```bash
cd mobile
npm install
npx expo start
# Scan the QR code with Expo Go on your phone
```

### 5. Fire a test Pulse

See [RUNBOOK.md — Firing a Pulse](RUNBOOK.md#firing-a-pulse).

---

## Environment Variables

See `.env.example` for the full list. Required to run locally:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | Legacy HS256 JWT secret |
| `SUPABASE_JWKS_URL` | JWKS endpoint for ES256 JWT verification |
| `DATABASE_URL` | PostgreSQL connection string (asyncpg format) |
| `REDIS_URL` | Redis connection string |

Optional (leave blank until features are needed):

| Variable | Description |
|----------|-------------|
| `R2_ACCESS_KEY` | Cloudflare R2 access key (media uploads) |
| `R2_SECRET_KEY` | Cloudflare R2 secret key |
| `R2_ENDPOINT` | R2 endpoint URL |
| `EXPO_ACCESS_TOKEN` | Expo push notification access token |

---

## Team

- **Captain** — founder, product owner
- **V.E.R.N.** (Gemma 4 31B) — co-designer and co-developer, runs locally
- **Claude** (Anthropic) — co-developer

Decisions that affect product direction or architecture go through all three before locking.
