# Sösh — Operations Runbook
**Version:** 0.1
**Last Updated:** 2026-09-07

This document covers day-to-day operations for v0.1: firing Pulses, resolving them, monitoring, and handling common failures.

---

## Prerequisites

- `.env` configured (see README.md)
- Docker Compose running (`docker-compose up -d`)
- A valid admin JWT (see [Getting an Admin JWT](#getting-an-admin-jwt))

---

## Getting an Admin JWT

### Sign in via Supabase (get a fresh JWT)

```bash
curl -s -X POST "https://gxtbcxkdodmfikkhncmw.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "testadmin@sosh.dev", "password": "TestPulse2026!"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])"
```

Save to a shell variable for use in other commands:
```bash
TOKEN=$(curl -s -X POST "https://gxtbcxkdodmfikkhncmw.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "testadmin@sosh.dev", "password": "TestPulse2026!"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
```

JWTs expire after 1 hour. Re-run to refresh.

### Creating a new admin user

```bash
# Create user in Supabase Auth (auto-confirms email)
curl -s -X POST "https://gxtbcxkdodmfikkhncmw.supabase.co/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "SecurePassword123!", "email_confirm": true}'
```

Then grant admin role in the DB:
```sql
-- Run in Supabase SQL Editor
INSERT INTO user_roles (user_id, role)
VALUES ('<user-uuid-here>', 'admin');
```

---

## Firing a Pulse

### Check no Pulse is currently active

```bash
curl -s http://localhost:8000/pulses/active
# Should return null, or a resolved pulse
```

### Fire the Pulse

```bash
curl -s -X POST http://localhost:8000/admin/pulses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show us Nashville right now.",
    "submission_window_minutes": 15,
    "voting_window_hours": 2,
    "city": "Nashville",
    "country_code": "US"
  }' | python3 -m json.tool
```

Expected response:
```json
{
  "id": "...",
  "prompt": "Show us Nashville right now.",
  "status": "active",
  "submission_ends_at": "...",
  "voting_ends_at": "..."
}
```

Save the pulse ID for monitoring and manual resolution:
```bash
PULSE_ID="<id-from-response>"
```

### Verify push notifications queued (check worker logs)

```bash
docker-compose logs worker --tail=20
# Look for: "sosh: workers.worker_push.send_pulse_to_all(...)"
# Then: "sosh: Job OK"
```

---

## Monitoring a Live Pulse

### Check Pulse status

```bash
curl -s http://localhost:8000/pulses/$PULSE_ID | python3 -m json.tool
```

### Watch the leaderboard

```bash
# Poll every 5 seconds
watch -n 5 "curl -s http://localhost:8000/pulses/$PULSE_ID/leaderboard | python3 -m json.tool"
```

### Monitor via RQ Dashboard

Open http://localhost:9181 to see queued, running, and failed jobs.

### Check API logs

```bash
docker-compose logs api -f
```

---

## Resolving a Pulse

Resolution happens automatically — the `resolve_pulse` RQ job is scheduled when the Pulse fires.

### Manual early resolution (testing or emergency)

```bash
curl -s -X POST "http://localhost:8000/admin/pulses/$PULSE_ID/resolve" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nHTTP %{http_code}"
# Expect: HTTP 204
```

Then verify the worker ran:
```bash
docker-compose logs worker --tail=20
# Look for: "sosh: resolve_pulse(...)" then "sosh: Job OK"
```

And verify the DB was updated:
```bash
curl -s http://localhost:8000/pulses/$PULSE_ID | python3 -m json.tool
# "status" should be "resolved"
```

---

## Checking Winners and Trophies

After resolution, check trophies were created:

```bash
# In Supabase SQL Editor or via psql
SELECT t.*, u.username, p.prompt
FROM trophies t
JOIN users u ON u.id = t.user_id
JOIN pulses p ON p.id = t.pulse_id
ORDER BY t.awarded_at DESC
LIMIT 10;
```

---

## Common Failures and Fixes

### "A Pulse is already active" on `POST /admin/pulses`

There's a Pulse stuck in `active`, `voting`, or `resolving` status.

```bash
# Find the stuck pulse
curl -s http://localhost:8000/pulses/active

# If stuck in 'resolving' (worker died mid-job):
# 1. Force resolve via API
curl -s -X POST "http://localhost:8000/admin/pulses/$STUCK_PULSE_ID/resolve" \
  -H "Authorization: Bearer $TOKEN"

# 2. If still stuck, update directly in DB (last resort):
# In Supabase SQL Editor:
# UPDATE pulses SET status = 'resolved', updated_at = now() WHERE id = '<pulse_id>';
```

### RQ worker job failed

Check the failed job details:

```bash
docker-compose logs worker --tail=50
```

Open RQ Dashboard at http://localhost:9181 → Failed queue → click the job to see the full traceback.

Common causes:
- **Database connection error** — check `DATABASE_URL` in `.env` is using port 5432 (session mode)
- **Import error** — missing Python package; add to `requirements.txt` and rebuild
- **Push notification failed** — `EXPO_ACCESS_TOKEN` not set; push jobs log failures but don't crash

To retry a failed job from RQ Dashboard: click the job → "Requeue".

### API returns 500

```bash
docker-compose logs api --tail=50
```

Most common causes:
- **`DuplicatePreparedStatementError`** — `DATABASE_URL` is using port 6543 (transaction mode) instead of 5432 (session mode). Fix `.env` and restart.
- **`ModuleNotFoundError`** — a package is missing from `requirements.txt`. Add it and rebuild: `docker-compose up --build`

### Worker can't connect to DB

Verify `DATABASE_URL` in `.env` is reachable:
```bash
python3 -c "
import asyncio, asyncpg
async def t():
    conn = await asyncpg.connect('$DATABASE_URL_SYNC', statement_cache_size=0)
    print('OK:', await conn.fetchval('SELECT version()'))
    await conn.close()
asyncio.run(t())
"
```

### Push notifications not delivering

In v0.1 development, `EXPO_ACCESS_TOKEN` is blank and pushes are not configured. The push worker will log failures but not crash. This is expected — pushes are deferred until Expo credentials are set up.

---

## Deployments

### Backend (Railway)

The API and worker both run on Railway and **auto-deploy on every push to `main`**.

```bash
# Push to deploy
git push origin main

# Tail production logs
railway logs --service sosh-api
railway logs --service sosh-worker
```

**Railway services:**
| Service | Start command |
|---------|--------------|
| `sosh-api` | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| `sosh-worker` | `rq worker --with-scheduler sosh` |

Both services use the same `Dockerfile` (root of `api/`).

**Environment variables** are set in the Railway dashboard under each service's Variables tab. Required vars: `DATABASE_URL`, `RQ_REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, `EXPO_ACCESS_TOKEN`.

**Important:** The worker reads Redis via `RQ_REDIS_URL` (not `REDIS_URL`). Dollar signs in Railway start commands are not shell-expanded, so the URL must be set as an environment variable — not embedded directly in the start command.

**Before deploying a breaking change:**
1. Verify migration is applied on production DB (run in Supabase SQL Editor)
2. Check Railway build logs after push for startup errors

### Database migrations

New migrations are run manually in the Supabase SQL Editor:

1. Open the Supabase dashboard → SQL Editor
2. Open the migration file
3. Paste and run
4. Verify no errors in the Results panel

Do not use Alembic against the Supabase pooler — transaction-mode pgbouncer breaks Alembic's version table operations. Run migrations directly.

---

## Useful DB Queries

```sql
-- All Pulses with entry counts
SELECT p.id, p.prompt, p.status, p.city,
       COUNT(pe.id) AS entries,
       p.created_at
FROM pulses p
LEFT JOIN pulse_entries pe ON pe.pulse_id = p.id
GROUP BY p.id
ORDER BY p.created_at DESC;

-- User leaderboard by Sösh Score
SELECT u.username, u.city, s.score, s.trophy_count
FROM users u
JOIN sosh_score_snapshots s ON s.user_id = u.id
ORDER BY s.score DESC
LIMIT 20;

-- Recent trophies with winner info
SELECT t.awarded_at, u.username, t.title, t.city, t.vote_count, p.prompt
FROM trophies t
JOIN users u ON u.id = t.user_id
JOIN pulses p ON p.id = t.pulse_id
ORDER BY t.awarded_at DESC
LIMIT 20;
```
