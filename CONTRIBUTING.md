# Contributing to Sösh

This document covers the development workflow, code conventions, and PR process for the Sösh codebase.

**Team:** Captain (human), V.E.R.N. (Gemma AI, local), Claude (Anthropic AI)

---

## Git Workflow

### Branch strategy

We use a simple trunk-based workflow:

- `main` is always deployable
- Feature work happens in short-lived branches off `main`
- Branch names: `feature/<what>`, `fix/<what>`, `docs/<what>`

Example:
```bash
git checkout -b feature/home-screen-ui
# ... work ...
git push origin feature/home-screen-ui
# → open PR to main
```

### Commit messages

Use the imperative mood, present tense. One line for the what, optional body for the why.

```
Add leaderboard polling hook

Polls GET /pulses/{id}/leaderboard every 5 seconds when pulse is active.
Stops polling when status changes to resolved.
```

All commits should include the Co-Authored-By trailer when AI-assisted:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
or
```
Co-Authored-By: V.E.R.N. Gemma4 <vern@local>
```

### Pushing and PRs

Push commits after each significant build step so VERN can review and contribute.

For small, self-contained changes: commit directly to `main`.
For larger features or anything that touches the API contract: open a PR.

---

## Code Conventions

### Python (API)

- **Formatting:** PEP 8. No enforced formatter yet (black not configured) — keep lines under 100 chars.
- **Types:** Use Python type hints on all function signatures. Pydantic models for all request/response bodies.
- **SQL:** Raw `text()` queries via SQLAlchemy. No ORM models — the schema is complex and the SQL is cleaner to read directly.
- **Named params:** SQLAlchemy `text()` uses `:param_name` syntax. Never use string formatting or f-strings to build SQL.
- **Async:** All API route handlers must be `async def`. Workers are synchronous (RQ limitation) and use psycopg2.
- **Errors:** Raise `HTTPException` with descriptive `detail` strings. Never swallow exceptions silently.
- **Logging:** Use `print()` for now (captured by Docker/Fly.io logs). Structured logging deferred to v0.2.

### TypeScript (Mobile)

- **Strict mode:** `tsconfig.json` has `strict: true`. No `any` unless unavoidable.
- **Components:** Functional components only. No class components.
- **State:** React hooks. No global state library until clearly needed.
- **API calls:** Centralized in a `lib/api.ts` module (to be created). No fetch() calls scattered in components.
- **Navigation:** Expo Router (file-based routing in `app/` directory).

### Database

- **Migrations:** Sequential numbered files in `migrations/`. Run manually in Supabase SQL Editor.
- **Schema changes:** Never modify a migration that has been applied to production. Write a new migration file.
- **Naming:** `snake_case` for all table and column names. UUIDs for all primary keys.

---

## Environment Setup

See README.md for full setup instructions.

Quick reference:
```bash
# Start backend
docker-compose up --build

# Check API is running
curl http://localhost:8000/health

# Start mobile (separate terminal)
cd mobile && npm install && npx expo start

# View worker logs
docker-compose logs worker -f

# View API logs
docker-compose logs api -f

# RQ job dashboard
open http://localhost:9181
```

---

## Testing

See TESTING.md for the full test strategy.

Run the smoke test suite:
```bash
# Backend smoke test (runs against local Docker API)
python3 scripts/smoke_test.py  # (to be created)
```

---

## Adding a New Endpoint

1. Add the route handler to the appropriate file in `api/routers/`
2. Update `API.md` with the new endpoint's documentation
3. If it touches a new table or modifies behavior, update `SCHEMA.md` or `DECISIONS.md`
4. If it has business logic complexity, add a brief comment explaining the intent

---

## Making a Schema Change

1. Write a new migration file: `migrations/000N_description.sql`
2. Run it manually in Supabase SQL Editor (test environment first if possible)
3. Update `SCHEMA.md` to reflect the change
4. Update any affected router code
5. Update `API.md` if the response shape changes

---

## Secrets and Credentials

- **Never commit `.env`** — it is gitignored
- **Never hardcode credentials** in source code
- All secrets go through `config.py` (pydantic-settings reads from env)
- Supabase credentials are in Claude's memory (supabase-credentials.md) and with VERN
- To share credentials with a new team member: share the `.env` file out-of-band (not via git)

---

## What Needs Sign-off Before Merging

Changes that require all three (Captain, VERN, Claude) to review before merging:

- Changes to the Pulse mechanic core loop (timing, submission rules, resolution logic)
- New monetization mechanics
- Changes to the RLS policies or auth model
- Anything that modifies the `users`, `pulses`, `votes`, or `trophies` tables

Everything else: one-person judgment call is fine at this stage.
