# Sösh — Testing Strategy
**Version:** 0.1
**Last Updated:** 2026-09-07

---

## Philosophy

At MVP scale, the highest-value tests are end-to-end smoke tests against the real API. Unit tests for pure functions are valuable but secondary. Integration tests against a live Supabase instance catch the class of bugs we actually encountered during build (pgbouncer compatibility, field name mismatches, JWT algorithm issues).

**Test priority order:**
1. Backend smoke tests (the Pulse loop end-to-end)
2. Worker job tests (resolution logic)
3. Unit tests for business logic (vote deduplication, moderation)
4. Mobile component tests (after UI is built)

---

## Backend Smoke Test: The Pulse Loop

This is the canonical manual test. Run after every significant backend change.

### Setup

```bash
# Start backend
docker-compose up -d

# Get a fresh admin JWT
TOKEN=$(curl -s -X POST "https://gxtbcxkdodmfikkhncmw.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "testadmin@sosh.dev", "password": "TestPulse2026!"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
```

### Steps

```bash
# 1. Verify no active Pulse
curl -s http://localhost:8000/pulses/active
# Expected: null

# 2. Fire a Pulse
PULSE=$(curl -s -X POST http://localhost:8000/admin/pulses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Test prompt.", "submission_window_minutes": 5, "voting_window_hours": 1, "city": "Nashville", "country_code": "US"}')
echo $PULSE | python3 -m json.tool
PULSE_ID=$(echo $PULSE | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
# Expected: 201 with id, status=active, timestamps

# 3. Verify Pulse is active
curl -s http://localhost:8000/pulses/active | python3 -m json.tool
# Expected: pulse with status=active

# 4. Get a voter JWT (testvoter@sosh.dev or create one)
VOTER_TOKEN=$(curl -s -X POST "https://gxtbcxkdodmfikkhncmw.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "testvoter@sosh.dev", "password": "TestVoter2026!"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

# 5. Submit an entry as voter
ENTRY=$(curl -s -X POST http://localhost:8000/entries \
  -H "Authorization: Bearer $VOTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"pulse_id\": \"$PULSE_ID\", \"content_type\": \"text\", \"text_content\": \"Test entry.\"}")
echo $ENTRY | python3 -m json.tool
ENTRY_ID=$(echo $ENTRY | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
# Expected: 201 with entry id

# 6. Vote as admin (different user)
curl -s -X POST http://localhost:8000/votes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entry_id\": \"$ENTRY_ID\"}" \
  -w "\nHTTP %{http_code}"
# Expected: HTTP 204

# 7. Self-vote should fail
curl -s -X POST http://localhost:8000/votes \
  -H "Authorization: Bearer $VOTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"entry_id\": \"$ENTRY_ID\"}" | python3 -m json.tool
# Expected: 403 "You cannot vote for your own entry"

# 8. Check leaderboard
curl -s "http://localhost:8000/pulses/$PULSE_ID/leaderboard" | python3 -m json.tool
# Expected: [{entry_id: ..., vote_count: 1, rank: 1}]

# 9. Resolve
curl -s -X POST "http://localhost:8000/admin/pulses/$PULSE_ID/resolve" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nHTTP %{http_code}"
# Expected: HTTP 204

# 10. Wait for worker then verify resolution
sleep 5
docker-compose logs worker --tail=10
# Expected: "Job OK"

curl -s "http://localhost:8000/pulses/$PULSE_ID" | python3 -m json.tool
# Expected: status=resolved

curl -s "http://localhost:8000/trophies/me" \
  -H "Authorization: Bearer $VOTER_TOKEN" | python3 -m json.tool
# Expected: [] (voter won but their trophies are under their user ID)
# Check admin's trophies:
curl -s "http://localhost:8000/trophies/me" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# Expected: trophy for the most-voted entry (may be voter's entry if vote_count > 0)
```

### Pass criteria

All steps return expected HTTP codes. Worker logs show `Job OK`. Pulse status is `resolved`. At least one trophy exists in DB.

---

## Automated Tests (pytest)

Tests live in `api/tests/`. Framework: pytest + pytest-asyncio.

```bash
# Run all tests
cd api && python -m pytest tests/ -v

# Run a specific test file
python -m pytest tests/test_votes.py -v
```

Tests are currently minimal (v0.1). Expand as the codebase grows.

### Test structure (to build)

```
api/tests/
├── conftest.py          # DB fixtures, test client, test user setup
├── test_health.py       # /health endpoint
├── test_pulses.py       # Fire, retrieve, leaderboard
├── test_entries.py      # Submit, moderation, deduplication
├── test_votes.py        # Vote, self-vote rejection, deduplication
├── test_trophies.py     # Trophy retrieval
└── test_resolution.py   # resolve_pulse worker logic
```

### conftest.py pattern (to implement)

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient
from main import app

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

@pytest_asyncio.fixture
async def admin_token():
    # Sign in as testadmin@sosh.dev, return JWT
    ...
```

---

## What to Test and What to Skip

### Test:
- Auth: valid token accepts, invalid token 401s, expired token 401s
- Vote deduplication: second vote on same entry returns 409
- Self-vote: own entry returns 403
- Submission window: entry after window closes returns 409
- Pulse conflict: second `POST /admin/pulses` while one is active returns 409
- Resolution worker: pulse ends with status=resolved, trophy exists
- Moderation: profanity in text entry returns 422

### Don't test (yet):
- Push notification delivery (requires real device)
- R2 media upload (requires real R2 credentials)
- End-to-end mobile UI flows (manual testing until UI is stable)
- Load/performance testing (deferred until > 200 users)

---

## Testing on a Real Device

1. Start `npx expo start` in the `mobile/` directory
2. Scan the QR code with Expo Go
3. The mobile app connects to `http://localhost:8000` in dev mode
4. Use the test user credentials to log in

Note: The mobile device and the dev machine must be on the same network for `localhost` to resolve. If not, use your machine's local IP address in the API base URL.
