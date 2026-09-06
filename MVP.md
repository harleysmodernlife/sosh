# Sösh — MVP Scope (v0.1)
**Status:** Locked
**Last Updated:** 2026-09-06

---

## The Hypothesis

The entire v0.1 build exists to test one thing:

> **Does the Pulse loop create a daily habit?**

Specifically: do users return on Day 7 — without being prompted by a Pulse notification — to check their standing, browse the Mosaic, or look at their Trophy Case?

If yes: the core addiction mechanic works. Build the rest.
If no: no amount of Vibe-Clusters, Synch-Links, or ML will save it. Redesign the loop before adding features.

Everything in v0.1 is chosen because it is necessary to test this hypothesis. Everything not in v0.1 is excluded because it is not.

---

## What Is IN v0.1

### User accounts
- Register with email or Google (Supabase Auth)
- Basic profile: username, display name, city, country
- Push notification token stored on registration

### The Pulse
- Admin endpoint to manually trigger a Pulse (no AI, no automation yet — a human fires it)
- Push notification delivered to all registered users in the target region
- 15-minute submission window with visible countdown
- In-app camera only — no gallery uploads
- Multi-modal: short video (≤15s), photo, or text (≤140 chars)
- Basic server-side content moderation (keyword filter + image hash check against known CSAM database via PhotoDNA or equivalent free API — no on-device ML yet)
- Two-track submission: metadata instant, media background upload

### Voting
- Users can vote on other entries during the submission window + 2 hours after
- One vote per user per entry (enforced by unique constraint)
- Leaderboard updates via HTTP polling every 5 seconds during active window
- City-scope leaderboard only (National and Global deferred — need user density first)

### Leaderboard Resolution
- City Rep title assigned to top entry per city when voting closes
- Trophy record created for winner
- Push notification to winner

### Trophy Case
- Permanent timestamped record of every Pulse win on user profile
- Visible to all users
- This is the Cultural Passport seed — it exists from day one

### Sösh Score (simplified)
- Championship component only: `trophy_count * 10`
- Displayed as a single number on profile
- No normalization formula yet (not enough data to normalize against)
- No Trend Discovery or Community Signal components — those require features not in v0.1

### Global Mosaic
- Simple ranked list of top 20 entries after voting closes
- No Narrative Arc Engine — just ordered by vote count
- Available to all users globally after resolution
- Browsable from the home screen between Pulses

### Home screen between Pulses
- Shows: current Sösh Score, Trophy Case preview, most recent Mosaic
- No Vibe-Cluster feed — this is intentionally minimal
- The gap between Pulses is where we test whether the Trophy Case and Score create voluntary return behavior

---

## What Is OUT Until v0.2+

These are not "forgotten" — they are explicitly deferred. The schema tables for all of these exist in the database from migration 0001. The API simply does not implement routes for them yet.

| Feature | Why deferred | Needed before adding |
|---|---|---|
| Vibe-Cluster Feed | Requires ML service and meaningful content volume | Pulse loop proven, ML service built |
| Tide-Riding | Depends on Vibe-Clusters | Vibe-Clusters working |
| Synch-Links and Parallel Echo | High complexity, depends on scale | 10k+ MAU, Vibe-Clusters live |
| DMs and age verification | Requires Stripe Identity ($1.50/user) | Post-revenue |
| Vibe-Chains | Depends on Vibe-Cluster Feed | Vibe-Clusters working |
| Trend Scout tier | Needs an active Vibe-Cluster system to scout | Vibe-Clusters working |
| Full Sösh Score formula | Needs Trend Discovery and Community Signal events | v0.2 features live |
| Score normalization (rolling percentile) | Needs enough users to have a meaningful percentile | 1k+ active users |
| Sponsored Pulses | Need a real engagement rate to sell | Post-launch, proven retention |
| Cosmetic purchases | Need an established status hierarchy | Post-launch |
| B2B mood data | Need ML clustering and scale | Phase 3 |
| Global Canvas | PR/seasonal event — not a habit loop | Launch marketing moment |
| Rolling Wave regional logic | Need enough users per region | 5k+ users across 3+ regions |
| National and Global leaderboard scopes | Need density | 500+ users per city competing |
| Pressure Gauge UI | Needs dynamic Pulse timing | Once Pulse timing is automated |
| Automated Pulse firing | Needs activity-based trigger logic | Once manual Pulses are tested |
| Founding Wave pioneer mechanics | Need a Pioneer cohort to recruit | Pre-v0.2 launch prep |
| On-device content filter | Deferred from MVP; server-side basic moderation sufficient | When content volume justifies it |
| WebSocket leaderboard | HTTP polling sufficient at MVP scale | When polling creates noticeable lag |
| ML service | Not needed for Pulse-only MVP | When Vibe-Clusters are prioritized |

---

## Schema Note

All tables defined in SCHEMA.md are created in `migrations/0001_initial_schema.sql`. The v0.1 API only implements routes that touch:

- `users`
- `user_roles` (pioneer flag only, read-only in v0.1)
- `sosh_score_snapshots`
- `pulses`
- `pulse_entries`
- `votes`
- `trophies`
- `leaderboard_results`
- `mosaics`
- `content_reports` (basic reporting)
- `user_blocks`

All other tables exist in the database, are not populated by the API, and are not exposed by any route. They are there so that v0.2 features can be added without a schema migration scramble.

---

## Launch Strategy

**Target:** One city. Not global — one city with enough density for the leaderboard to feel competitive.

**Why one city:** 500 users in one neighborhood fighting for City Rep is more addictive than 500 users spread across 20 countries. The competition must feel real. It cannot feel real without density.

**Recommended launch city:** Nashville (home market, existing network, easier to recruit and gather feedback). Expand to a second city only after D7 retention is confirmed in the first.

**User acquisition for MVP testing:** Personal network, VERN community if applicable, targeted social posts. No paid acquisition before the loop is proven.

**Target test group:** 50-200 active users in the launch city. Enough to make the leaderboard competitive, small enough to gather real feedback directly.

---

## Success Criteria

| Metric | Target | What it means |
|---|---|---|
| D7 retention | 40%+ | Users return on day 7 without a Pulse notification forcing them back |
| Pulse participation rate | 60%+ of registered users per Pulse | The notification is compelling enough to interrupt what they're doing |
| Trophy Case views per user | 3+ per week | Users are returning to look at their legacy between Pulses |
| Vote-to-entry ratio | 5:1 or higher | Consumers (voters) outnumber creators (posters) — healthy feed dynamic |

**If D7 retention is below 40% after 30 days of testing:** do not add features. Investigate and fix the loop. The most likely culprits: Pulses too infrequent, prompt quality poor, leaderboard not competitive enough due to low density.

---

## What Happens After v0.1 is Proven

Once D7 retention target is hit and sustained for 2 weeks:

1. Automate Pulse firing (replace manual admin trigger with activity-based logic)
2. Add Pressure Gauge UI
3. Begin Founding Wave recruitment across 3-5 cities
4. Design and build Vibe-Cluster Feed (Phase 2 start)
5. Build Sponsored Pulse infrastructure (first revenue path)

The move to v0.2 is triggered by data, not by a calendar date.

---

*Design phase closed. Build starts with `migrations/0001_initial_schema.sql`.*
