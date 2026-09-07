# Changelog

All notable changes to Sösh are documented here.
Format: `[version] — date — summary`

---

## [0.3.0] — 2026-09-07

### Features

**Video submission**
- `expo-video` installed and registered in `app.json` plugins
- Pulse tab: capture mode extended to text / photo / video
- `CameraView` switches to `mode="video"` for video capture
- `startRecording()` / `stopRecording()` with 30-second limit and auto-stop
- Recording badge (red dot + MM:SS countdown) overlaid on camera preview
- Shutter button turns red stop-square while recording
- `VideoPreview` component using `useVideoPlayer` + `<VideoView>` with autoplay loop
- Video submits through existing presign → PUT → `POST /entries` flow with `content_type: 'video'`

**Video playback in feed and leaderboard**
- `FeedMediaView` and `MediaView` components auto-detect `content_type` and render
  `<VideoView>` (autoplay loop) for videos, `<Image>` for photos
- Applied to feed cards, feed modals, leaderboard cards, and leaderboard modals

**Results notifications**
- `send_results_notification()` added to `services/push.py` — batch push to all non-winner entrants
- `worker_resolve.py`: collects entrant push tokens after score recompute, sends after DB commit
- Deep link: tapping a results or milestone notification navigates to Leaderboard tab
- Bug fix: winner push token was being fetched inside the participant score loop; moved outside

**Terms of Service & Privacy Policy**
- `/legal` screen with two-tab layout (Terms / Privacy), full real content
- Terms: acceptance, service description, content rules, voting integrity, disclaimers
- Privacy: data collected, use, third-party services (Supabase, Expo, Railway, Upstash), retention, rights
- Accessible from Profile tab (Terms & Privacy link above Sign Out)

**Account deletion (GDPR compliance)**
- `DELETE /users/me` — deletes votes, entries, trophies, leaderboard results, score snapshot,
  user roles, nulls invite redemption, deletes user row, then removes Supabase Auth identity
  via Admin API (service role key)
- Profile tab: "Delete Account" button below Sign Out, behind two-step destructive confirmation
- Privacy Policy updated to reference in-app deletion (no longer "contact us")

### Backend changes
- `users.py`: `DELETE /users/me` endpoint; `httpx` used for Supabase Admin API call
- `workers/worker_resolve.py`: results notification step; winner token fetch bug fixed
- `services/push.py`: `send_results_notification()` added
- `app/_layout.tsx`: `navigateFromNotification` handles `'results'` and `'milestone'` types

---

## [0.2.0] — 2026-09-07

### Features

**Content-first home feed**
- New `GET /feed` endpoint — paginated stream of approved entries from resolved Pulses, joined with pulse context and user attribution
- Home screen completely redesigned: FlatList infinite scroll feed (TikTok-style), entry cards showing pulse prompt + content + author, active Pulse banner at top when live
- `FeedEntry` type added to mobile type system

**Submission history**
- New `GET /users/me/entries` endpoint — returns all of the authenticated user's entries with pulse context and computed rank
- Profile tab: "MY ENTRIES" section showing every submission, rank badge, vote count, content preview
- Stat row updated with ENTRIES count

**Profile photos**
- New `POST /media/presign-avatar` endpoint — presigned URL for avatar uploads, keyed by user ID (overwrites previous)
- `avatar_url` column added to `users` table
- Profile tab: tappable avatar opens camera roll picker (1:1 crop), uploads to Supabase Storage, saves URL to profile
- Public user profiles also display avatar photos
- `PATCH /users/me` accepts `avatar_url`

**Follow system**
- New `follows` table — `(follower_id, following_id)` composite primary key, self-follow check constraint
- `POST /users/{id}/follow` and `DELETE /users/{id}/follow` — idempotent follow/unfollow
- `follower_count`, `following_count`, `viewer_is_following` added to all user profile responses
- `GET /users/{id}` resolves viewer identity from optional `Authorization` header (best-effort, no auth error if absent)
- Public profile screen: Follow/Following button with optimistic UI
- Own profile: stat row now shows FOLLOWERS / FOLLOWING / TROPHIES

**Brand identity**
- All default Expo placeholder assets replaced with Sösh brand
- App icon: 1024×1024, black background, SÖSH wordmark
- Splash screen: 1284×2778, black background, SÖSH wordmark + tagline "Something is happening right now."
- Android adaptive icon, notification icon, and favicon all updated

### Backend changes
- `users.py`: `UserProfile` model updated with `avatar_url`, `follower_count`, `following_count`, `viewer_is_following`; `avatar_url` accepted in `PATCH /users/me`
- `media.py`: `POST /media/presign-avatar` added
- `routers/users.py`: `GET /users/me/entries` endpoint with SQL rank computation; `POST/DELETE /users/{id}/follow` endpoints

---

## [0.1.1] — 2026-09-07

Iterative improvements after initial build.

### Features

**Admin panel (in-app)**
- Admin UI accessible from profile tab for users with `admin` role
- Fire Pulse form: prompt, city, submission window, voting window
- Resolve active Pulse button
- Daily schedule management: enable/disable cron, view next run time

**Automated Pulse scheduling**
- `worker_fire_pulse.py` — RQ job that fires a daily Pulse from a 30-prompt rotation (tracked via Redis counter)
- `api/prompts.py` — 30 curated Pulse prompts
- `GET/POST/DELETE /admin/schedule` — schedule management endpoints backed by rq-scheduler

**Notification deep links**
- Tapping a "Pulse live" push notification navigates to the Pulse tab
- Tapping a "You won" push notification navigates to the Profile tab
- Deduplication via ref tracking prevents double-navigation on cold start

**Entry full-screen view**
- Tap any leaderboard entry card to open full-screen modal with content, vote count, flag button
- Vote and unvote from within modal

**Public user profiles**
- `GET /users/{user_id}` and `GET /trophies/{user_id}` — unauthenticated
- `/user/[id]` screen with full trophy case and stats
- Tapping a username anywhere in the app navigates to their public profile

**Historical leaderboard**
- When no Pulse is active, the Votes tab shows the last resolved Pulse's leaderboard
- `GET /pulses/resolved` endpoint returns most recent 20 resolved Pulses with winner data

**Mosaic improvements**
- Mosaic tiles are tappable — opens full-screen entry modal with link to user's public profile
- `user_id` included in mosaic API response to enable profile navigation

**Entry reporting**
- Flag button on entry modals
- `POST /reports` — idempotent entry flag, stored in `entry_reports` table

**UX pass**
- Leaderboard: `#1` entry gold background treatment, rank badges, full card tap targets
- Profile tab: display name primary, @username secondary; sign out button; Admin button if admin role
- Pulse tab: improved no-pulse copy, "Signal quiet."; submitted/voting state navigation CTAs
- Onboarding copy reframed as permanent identity commitment
- Login screen: wordmark 56px, tagline updated to "Something is happening right now."
- Sösh Score removed from home screen (belongs on profile only)

### Backend changes
- `is_admin` added to `GET /users/me` response via `user_roles` subquery
- `username` added as updatable field in `PATCH /users/me` with uniqueness enforcement
- `feed.py` router added — `GET /feed`
- `reports.py` router added — `POST /reports`
- `admin.py` — schedule CRUD endpoints added

### Infrastructure
- Fly.io replaced by **Railway** for API and worker deployment
- Worker uses main `Dockerfile` (not separate Dockerfile.worker)
- Worker start command: `rq worker --with-scheduler sosh`
- Redis env var: `RQ_REDIS_URL` (dollar signs in Railway start commands are not shell-expanded)
- `entry_reports` table created directly via psql (not in migration file)
- `user_roles` table used for admin flag; admin role granted via psql INSERT

---

## [0.1.0] — 2026-09-07

### Infrastructure
- Supabase project created (`gxtbcxkdodmfikkhncmw`, us-east-1)
- Full database migration applied
- Docker Compose stack: FastAPI API, RQ worker, Redis, RQ Dashboard
- Railway deployment configured for API and worker services

### Backend API (initial)
- `GET /health`
- `GET /users/me`, `GET /users/{id}`, `PATCH /users/me`, `PUT /users/me/push-token`
- `GET /pulses/active`, `GET /pulses/{id}`, `GET /pulses/{id}/leaderboard`, `GET /pulses/{id}/entries`, `GET /pulses/resolved`, `GET /pulses/{id}/mosaic`
- `POST /entries`
- `POST /votes`, `DELETE /votes/{entry_id}`
- `GET /trophies/me`, `GET /trophies/{user_id}`
- `POST /media/presign` (Supabase Storage)
- `POST /admin/pulses`, `POST /admin/pulses/{id}/resolve`

### Workers
- `worker_push.py` — send Pulse notification to all users via Expo Push
- `worker_resolve.py` — full resolution: flush votes, find winner, create trophy, update Sösh Score, generate mosaic

### Auth
- Supabase JWT verification via PyJWT JWKS client
- ES256 (ECC P-256) primary, HS256 fallback

### Mobile (initial build)
- React Native + Expo app
- Screens: Home (score + mosaic), Pulse (capture + voting), Leaderboard, Profile (trophy case), Onboarding, Login
- Supabase auth integration
- Push notification registration
- Photo/video capture and upload via Supabase Storage presign flow
- Expo Go on Android for development

### Known bugs fixed
- `DuplicatePreparedStatementError` — switched DATABASE_URL from transaction-mode pooler (port 6543) to session-mode (port 5432)
- RQ worker `Invalid attribute name` — added missing `psycopg2-binary` dependency
- Pulse INSERT syntax error — PostgreSQL `::interval` conflicts with SQLAlchemy named params; timestamps now computed in Python before INSERT

---

## [0.0.1] — 2026-09-06

### Design phase complete
- DESIGN.md — full product vision, Pulse mechanics, state machine, rejected ideas
- FLOWS.md — Pulse Path, Trophy/Score flows with edge cases
- SCHEMA.md — complete database schema with rationale
- STACK.md — zero-cost Phase 1 technology decisions
- MVP.md — v0.1 scope, success criteria, deferred items
- `migrations/0001_initial_schema.sql` — full schema migration (written, not yet applied)
