# Sösh — User Journey Flows
**Version:** 0.1
**Status:** In Progress
**Depends on:** DESIGN.md v0.1
**Last Updated:** 2026-09-06

---

These three flows are the product. Every data schema decision and stack choice in this project flows from what is documented here. Do not finalize the schema until all three flows are locked.

Each flow documents:
- Every user action
- Every system event
- Every data object that must exist
- Every branching decision point
- Edge cases and failure modes

---

## Flow 1: The Pulse Path

**Entry state:** App is in Pressure Mode or Quiet Mode. User's phone is anywhere (app open or closed).

---

### Step 1 — Pulse Fires

**System event:**
AI determines Pulse should fire based on regional Vibe-Snap velocity crossing the release threshold.

**System actions:**
- Pulse record created: ID, prompt text, type (standard/sponsored/mega), region wave, start timestamp, expiry timestamp (start + 15 minutes), sponsored brand ID if applicable
- Push notification dispatched to all users in the active region wave via FCM (Android) and APNs (iOS)
- Notification payload: Pulse ID, prompt text, expiry timestamp
- App state machine transitions: Quiet/Pressure → Pulse Mode

**Notification delivery branching:**

```
Notification received?
  YES + app open    → Full-screen Pulse takeover immediately
  YES + app closed  → Banner notification with deep link to Pulse screen
  NO (failed)       → User misses this Pulse. No late entry. Mosaic only.
```

**Edge case — user in wrong timezone or region:**
Rolling Wave means only one region is active per Pulse. Users outside the active region see the Pressure Gauge but do not receive the Pulse notification. They see the Mosaic after it resolves. This is by design — it creates the "relay" effect and geographic FOMO.

---

### Step 2 — User Opens Pulse Screen

**User sees:**
- Full-screen prompt text (large, centered)
- Live countdown timer showing time remaining in the 15-minute window
- Live global participant count (updates every few seconds)
- Multi-modal capture options: Camera (video ≤15s), Photo, Text (≤140 chars)

**Note on the countdown:** The in-Pulse countdown is intentional and correct. The variable reward mechanic applies to PRE-Pulse timing (the Pressure Gauge has no countdown). Once the Pulse IS active, a visible countdown creates urgency, not predictability. These are different psychological mechanisms.

**System actions:**
- User's Pulse view event logged: User ID, Pulse ID, timestamp, opened-from (notification/manual)
- Device camera initialized if camera mode selected

---

### Step 3 — Capture

**User actions:**
Records video, takes photo, or types text using in-app tools only.

**System actions (on-device, before upload):**
- On-device content filter runs in real-time during capture
- Model: TensorFlow Lite (Android) / CoreML (iOS)
- Filter checks: explicit content, graphic violence, recognized banned symbols

**Branching:**

```
Content filter result?
  SAFE     → Post button activates
  FLAGGED  → Warning shown to user: "This content may violate our guidelines."
               User can retake or abandon.
               Content does not upload.
  ERROR    → Filter model failed to run → fall back to server-side moderation
               Post button activates with internal flag for priority server review
```

---

### Step 4 — Post Submission

**User action:** Taps Post.

**System actions — two-track parallel process:**

Track A (instant):
- Metadata sent to server immediately: User ID, Pulse ID, media type, timestamp, region
- PulseEntry record created in pending state
- User's entry appears on the live leaderboard immediately (with 0 votes, pending media)
- User sees their rank on the live board

Track B (background):
- Media file uploads in staggered trickle from local cache
- PulseEntry record updated to active state when media confirmed received
- Other users can now see and vote on the entry

**Data object created — PulseEntry:**
```
PulseEntry {
  id
  pulse_id
  user_id
  media_url (null until Track B completes)
  media_type (video / photo / text)
  text_content (if text type)
  timestamp
  region
  vote_count (integer, starts 0)
  rank (computed from vote_count)
  status (pending / active / removed)
  content_filter_result (safe / flagged / error)
}
```

**Edge case — user posts and then closes app:**
Entry is already submitted. Background upload continues. User returns to see their rank.

**Edge case — upload fails midway:**
Retry with exponential backoff. If upload fails entirely, entry is marked failed and user is notified. Entry is removed from leaderboard.

---

### Step 5 — Voting Window (Runs Concurrently with Submission Window)

**User actions:**
Browse other entries in the feed. Tap to vote (like/react).

**System actions:**
- Vote record created: voter User ID, entry ID, timestamp
- PulseEntry vote_count incremented
- Leaderboard updates in real-time via WebSocket push to all active clients
- Regional leaderboard (same city/country) and global leaderboard are separate views

**Voting continues 2 hours after the 15-minute submission window closes.** This gives users who see the Mosaic later a chance to vote on entries, and lets the Narrative Arc develop more fully before final rank resolution.

**Data object created — Vote:**
```
Vote {
  id
  pulse_id
  entry_id
  voter_user_id
  timestamp
}
```

**Anti-spam rule:** One vote per user per entry. Rate limiting on vote submission endpoint.

---

### Step 6 — Window Closes

**System event:** Expiry timestamp reached.

**System actions:**
- Submission window closes (no new PulseEntries accepted)
- Voting continues for 2-hour post-window period
- App state transitions: Pulse Mode → Quiet Mode for submission UI
- Leaderboard becomes read-only for submissions, still live for vote counts

---

### Step 7 — Leaderboard Resolves (2 Hours Post-Window)

**System actions:**
- Final vote counts locked
- Rankings calculated for three scopes: City, National, Global
- Title assignments:
  - Top entry per city → City Rep (e.g., "Face of Nashville")
  - Top City Rep per country → National Rep
  - Top National Rep globally → Global Face
- Trophy records created for all title holders
- Sosh Score Championship component updated for all participants (not just winners — participation earns points too, weighted by final rank)
- Tide-Rider bonuses calculated for Vibe-Snap contributors whose cluster was the dominant Vibe during the Pulse window
- Push notifications sent to title holders

**Data objects created — Trophy, LeaderboardResult:**
```
Trophy {
  id
  user_id
  pulse_id
  title (CityRep / NationalRep / GlobalFace)
  scope_label (e.g., "Nashville", "United States", "Global")
  rank (1st, 2nd, 3rd for future use)
  vote_count
  timestamp
}

LeaderboardResult {
  id
  pulse_id
  scope (city / national / global)
  scope_label
  entries (ordered list of PulseEntry IDs with final vote counts)
  resolved_at
}
```

---

### Step 8 — Mosaic Renders

**System actions:**
- Narrative Arc Engine processes all active PulseEntries
- Constructs ordered documentary sequence: earliest entries → regional contrasts → climax → Champions
- Mosaic record created and published to all users globally
- Mosaic surfaces in Quiet Mode feed indefinitely (part of the Cultural Archive)

**Users in other regions** who did not participate in this Rolling Wave see the Mosaic as their first exposure to the Pulse. They can vote (within the 2-hour window) and browse the global documentary. This is the "Global Relay" experience.

---

### Pulse Path — Full Data Object Summary

| Object | Key Fields |
|---|---|
| Pulse | id, prompt, type, region_wave, start_time, expiry_time, brand_id |
| PulseEntry | id, pulse_id, user_id, media_url, media_type, timestamp, region, vote_count, rank, status |
| Vote | id, pulse_id, entry_id, voter_user_id, timestamp |
| Trophy | id, user_id, pulse_id, title, scope_label, vote_count, timestamp |
| LeaderboardResult | id, pulse_id, scope, scope_label, entries, resolved_at |
| Mosaic | id, pulse_id, narrative_sequence (ordered entry IDs), published_at |

---

---

## Flow 2: The Wednesday Path

**Entry state:** App is in Quiet Mode. No active Pulse. User opens the app with no specific intent.

---

### Step 1 — App Open

**User action:** Opens Sösh.

**System actions:**
- User lands on Vibe-Cluster Feed immediately — zero setup, zero friction
- Feed loads top 3-5 active Vibe-Clusters globally
- Each cluster card shows: name, heat level indicator, sample content thumbnail, contributor count, trending velocity arrow (up/down/flat)
- Pressure Gauge state reflected in subtle UI (background gradient warmth tied to global Vibe-Snap velocity)

**No login wall. No onboarding screen. No decision required.**
First-time users: Welcome Wave fires here (see DESIGN.md section 9).

---

### Step 2 — Feed Consumption

**User actions:**
- Scrolls vertically through Vibe-Cluster content
- Within a cluster: content is a mixed stream of photos, short videos, text posts from around the world
- Can tap to expand any entry (see full media, location label, Vibe-Chain if applicable)

**System actions — implicit feedback collection:**
Every interaction generates a signal:
```
ImplicitFeedback {
  id
  user_id
  content_id
  content_type (VibeSnap / PulseEntry)
  action (view / watch_full / re_watch / swipe_away / tap_expand / react)
  duration_ms (for video)
  timestamp
}
```

These signals feed the Vibe-Cluster ranking model and the Trend Scout labeling confidence scores.

**Pressure Gauge visibility:**
If global activity is building toward a Pulse, the feed UI subtly warms. No text indicator. No number. Just visual tension. The user feels something is coming.

---

### Step 3 — Decision to Post

**User action:** Taps the post CTA ("What's your vibe?" floating button).

**System actions:**
- In-app camera opens (default), with option to switch to photo or text mode
- Current top Vibe-Clusters shown below the capture area as optional context
- User is NOT required to pick a cluster — auto-assignment preserves authenticity

**Design decision confirmed:** Auto-assign cluster after capture, not before. Showing clusters pre-capture would encourage users to manufacture content to fit trending vibes rather than posting authentically. Strategic gaming is addressed at the reward calculation level (Tide-Rider diversity weighting), not at the capture level.

---

### Step 4 — Capture and Submit

**User action:** Captures content, taps Post.

**System actions — on-device (same as Pulse Path Step 3):**
- Content filter runs
- If flagged: warning shown, content blocked
- If safe: Post button activates

**On submission:**
- VibeSnap record created
- AI triangulation pipeline queued (asynchronous — does not block the user)

**Data object created — VibeSnap:**
```
VibeSnap {
  id
  user_id
  media_url
  media_type (video / photo / text)
  text_content
  capture_timestamp
  location_type (residential / commercial / transit / outdoor / unknown)
  location_bin (neighborhood-level, not precise coordinates)
  device_orientation (portrait_low / portrait_high / landscape / flat)
  imu_snapshot {
    stillness_score    (0.0 to 1.0)
    fidget_score       (0.0 to 1.0)
    scroll_velocity    (slow / medium / fast)
  }
  assigned_cluster_id (null until triangulation completes)
  seed_flag (bool)
  confidence_score (0.0 to 1.0)
  tide_rider_eligible (bool)
  originator_flag (bool)
}
```

---

### Step 5 — AI Triangulation (Asynchronous)

**System actions — runs in background after submission:**

Pipeline stages:
1. Visual analysis: pose estimation, environment detection, color palette
2. Temporal context: time of day + day of week + location type pattern match
3. IMU context: motion state classification
4. Historical pattern match: does this user's IMU + visual + temporal combo match a known cluster signature?
5. Candidate cluster selection: top 3 candidate clusters with confidence scores
6. Assignment: if top candidate confidence > threshold → assign to cluster; else → flag as Seed

**If assigned to existing cluster:**
- VibeSnap updated: assigned_cluster_id set, tide_rider_eligible evaluated
- Tide-Rider eligibility window recorded (cluster rank at time of post)
- User notified: "Your vibe matched: [Cluster Name] — currently #[X] globally, [trending up/down]"

**If Seed:**
- VibeSnap updated: seed_flag = true
- Seed record created or updated (increment similar_count if similar Seed already exists)
- User notified: "Your vibe is something new. [X] more people need to feel this to create a new cluster."

**Data object — Seed:**
```
Seed {
  id
  first_user_id
  first_vibe_snap_id
  created_at
  similar_snaps (list of VibeSnap IDs)
  similar_count (integer)
  threshold (50, configurable)
  promoted (bool)
  promoted_cluster_id (null until promoted)
  trend_scout_surfaced (bool)
}
```

**Seed promotion event (fires when similar_count hits threshold):**
- New VibeCluster created
- All contributing VibeSnaps assigned to new cluster retroactively
- Originator bonus applied to first_user_id
- If Trend Scouts haven't named it yet: cluster surfaces to Scout tier for naming
- Push notification to Originator: "You started something. [X] people felt it. [Cluster Name] is now live."

---

### Step 6 — Reputation Update

**System actions (may be delayed — not blocking):**

When a Tide-Rider bonus fires (cluster reaches peak):
```
TideRiderEvent {
  id
  user_id
  cluster_id
  vibe_snap_id
  post_timestamp
  cluster_rank_at_post
  cluster_peak_rank
  diversity_multiplier (0.1 to 2.0 based on posting history diversity)
  base_bonus
  final_bonus (base_bonus * diversity_multiplier)
  awarded_at
}
```

Sosh Score Trend Discovery component updated.
Push notification: "Your early read on [Cluster Name] paid off. +[X] Reputation."

When Originator bonus fires:
- Separate bonus event record
- Sosh Score Trend Discovery component updated
- Notification: "You started [Cluster Name]. +[X] Reputation."

---

### Wednesday Path — Full Data Object Summary

| Object | Key Fields |
|---|---|
| VibeSnap | id, user_id, media, timestamp, location_type, imu_snapshot, assigned_cluster_id, seed_flag, confidence_score |
| VibeCluster | id, name, heat_level, contributor_count, trend_velocity, top_content_ids, originator_user_id, created_at |
| Seed | id, first_user_id, similar_snaps, similar_count, threshold, promoted, promoted_cluster_id |
| TideRiderEvent | id, user_id, cluster_id, diversity_multiplier, final_bonus, awarded_at |
| ImplicitFeedback | id, user_id, content_id, action, duration_ms, timestamp |

---

---

## Flow 3: The Synch-Link Path

**Entry state:** Two users (A and B) have both posted content — either a Pulse response or a Vibe-Snap — that the AI flags as a similarity candidate. They are from different regions (cross-cultural is the product; intra-city matches have significantly lower priority).

---

### Step 1 — Synch-Link Detection

**System actions:**

The similarity engine runs:
- After Pulse window closes: compares all PulseEntries for energy signature similarity
- Continuously for Vibe-Snaps: runs as snaps are assigned to clusters

Energy signature comparison:
```
EnergySignature {
  visual_features    (embedding vector from visual model)
  temporal_context   (time-of-day + location-type bucket)
  imu_state          (stillness / fidget / motion class)
  content_embedding  (text/caption embedding if available)
  cluster_id         (cluster alignment)
}
```

Similarity score = weighted cosine similarity across signature dimensions.

**Branching — link candidate evaluation:**
```
Similarity score > threshold AND users from different regions?
  YES → Synch-Link candidate created
  NO  → No link. Candidate discarded.

Users already have an active Synch-Link from this Pulse/Vibe?
  YES → No duplicate. Skip.

Either user has blocked the other?
  YES → No link. Skip silently.
```

**Design decision — threshold calibration:**
Start tight (high similarity required). If Synch-Links are too rare: users never experience the mechanic. Too common: it feels like spam. Initial threshold should be tuned in the first month of launch with real data. This is a critical A/B test parameter.

**Data object created — SynchLink:**
```
SynchLink {
  id
  user_a_id
  user_b_id
  trigger_type (PulseEntry / VibeSnap)
  trigger_content_a_id
  trigger_content_b_id
  similarity_score
  stage (SharedSpace / ParallelEcho / DM)
  created_at
  expiry_at (created_at + 72 hours, renewable)
  active (bool)
}
```

---

### Step 2 — Notification to Both Users

**System actions:**
Push notifications sent to both User A and User B simultaneously.

Notification text: "Someone in [City, Country] experienced the same vibe as you at the same moment."

Notification payload: SynchLink ID, deep link to Shared Space

**Both users must receive the notification for the Synch-Link to be meaningful.** If one notification fails to deliver, the link remains open for 24 hours in case the user opens the app organically.

---

### Step 3 — Shared Space

**Entry:** Either user taps notification.

**User sees:**
- Their own triggering content (the Pulse entry or Vibe-Snap)
- The other user's triggering content
- Location labels only: city and country. No username yet. No profile.
- Reaction options: emoji set + pre-set text prompts only

Pre-set prompts examples:
- "This is exactly my vibe right now"
- "How is this the same?"
- "Tell me more"

**System actions:**
- SharedSpaceView event logged for both users
- Reactions stored as SharedSpaceEvent records
- SynchLink expiry extended by 24 hours each time either user engages

**Age gate:** Applies to all stages. The Shared Space itself is safe for all ages — limited reactions only.

**Data object — SharedSpaceEvent:**
```
SharedSpaceEvent {
  id
  synch_link_id
  user_id
  action (view / emoji_react / prompt_respond)
  content (emoji or pre-set prompt text)
  timestamp
}
```

**Expiry if neither user engages:**
SynchLink expires at the original expiry_at timestamp. No further notifications. Users can still view the Shared Space but it is marked expired and no new escalation is offered.

---

### Step 4 — Parallel Echo Offer

**Trigger:** Both users have engaged in the Shared Space (minimum: each user has at least one SharedSpaceEvent of type emoji_react or prompt_respond).

**System actions:**
- Parallel Echo prompt generated: AI constructs a micro-prompt based on the shared Vibe/Pulse context
- Example: "You both posted about the mid-day slump at the same moment. Here's your shared question: What does the next hour look like for you?"
- Prompt surfaces inside the Shared Space for both users: "You two have been matched. Want to go deeper?"

**User action:** Either user can initiate the Echo. The other user receives a notification and can respond independently at any time within the expiry window.

---

### Step 5 — Parallel Echo Capture and Display

**User action:** Each user responds independently using the in-app camera or text.

**System actions:**
- Same content filter as Pulse/Vibe-Snap capture (on-device)
- ParallelEcho responses stored separately
- Once both users have responded: side-by-side display unlocked

**Data object — ParallelEcho:**
```
ParallelEcho {
  id
  synch_link_id
  prompt_text
  user_a_response_url
  user_a_response_type (video / photo / text)
  user_a_responded_at
  user_b_response_url
  user_b_response_type
  user_b_responded_at
  both_responded (bool)
  shareable (bool — can either user share the side-by-side to the main feed?)
}
```

**Side-by-side display:**
- Geographic labels: "Nashville / Lagos"
- No username shown unless user has explicitly set display preference
- Either user can optionally share the side-by-side to the main Vibe-Cluster feed as a Vibe-Chain entry (user's choice, not automatic)

**Sosh Score update:** Community Signal component updated for both users when Parallel Echo is completed.

---

### Step 6 — DM Opt-In (Optional)

**Trigger:** After both users have completed the Parallel Echo.

**System action:** App surfaces DM opt-in prompt inside the Shared Space.

**Prompt:** "Want to keep the conversation going? Connect directly."

**System checks (in order):**
```
Is either user under 18?
  YES → DM option not shown. Path ends here. Silently.

Has User A completed identity verification?
  NO  → Prompt shown only to User A: "Verify your identity to unlock direct messaging"
        (links to Stripe Identity / Sumsub flow)

Has User B completed identity verification?
  NO  → Same prompt for User B

Both verified and 18+?
  Has User A tapped "Connect directly"?
    Has User B tapped "Connect directly"?
      BOTH YES → DM thread created
      ONE YES  → Waiting state. Other user notified once.
      NO       → No DM.
```

**Data objects — VerificationStatus, DMThread:**
```
VerificationStatus {
  id
  user_id
  provider (StripeIdentity / Sumsub / Jumio)
  verified (bool)
  verified_at
  age_verified (bool)
  under_18 (bool)
  --- NOTE: no raw ID document data stored by Sösh ---
  --- verification result only, document handled by provider ---
}

DMThread {
  id
  synch_link_id
  user_a_id
  user_b_id
  created_at
  last_activity_at
  expiry_at (last_activity_at + 72 hours, rolling)
  active (bool)
}

Message {
  id
  thread_id
  sender_id
  content_type (text / media)
  content
  sent_at
  read_at
}
```

---

### Step 7 — DM State Management

**Ongoing:**
- DM thread expiry rolls forward 72 hours from each new message
- If no activity for 72 hours: thread expires, both users notified
- Thread can be "renewed" by either user tapping "Keep this conversation"

**Safety:**
- Block and report available at all times, all stages
- A reported user's SynchLink and DM access is suspended pending review
- Blocked user cannot create new SynchLinks with the blocking user

---

### Synch-Link Path — Full Data Object Summary

| Object | Key Fields |
|---|---|
| SynchLink | id, user_a_id, user_b_id, trigger type, similarity_score, stage, expiry_at |
| SharedSpaceEvent | id, synch_link_id, user_id, action, content, timestamp |
| ParallelEcho | id, synch_link_id, prompt_text, both responses, both_responded |
| VerificationStatus | id, user_id, provider, verified, age_verified, under_18 |
| DMThread | id, synch_link_id, user_a_id, user_b_id, expiry_at |
| Message | id, thread_id, sender_id, content, sent_at |

---

---

## Schema Implications Across All Three Flows

The data objects across all three flows point to the following core schema structure:

### Primary Entities

```
User
  id, username, display_name, region, country, city
  sosh_score_championship, sosh_score_discovery, sosh_score_community
  pioneer (bool), pioneer_decay_factor
  ambassador (bool)
  trend_scout (bool)
  verification_status_id (FK)
  created_at

Pulse
  id, prompt_text, type, region_wave
  brand_id (FK, nullable)
  start_time, expiry_time, voting_closes_at
  mosaic_id (FK, nullable, set after resolution)

PulseEntry
  id, pulse_id, user_id, media_url, media_type, text_content
  timestamp, region, vote_count, rank, status

Vote (PulseEntry votes)
  id, pulse_id, entry_id, voter_user_id, timestamp

Trophy
  id, user_id, pulse_id, title, scope_label, vote_count, timestamp

Mosaic
  id, pulse_id, narrative_sequence (JSON ordered array), published_at

VibeSnap
  id, user_id, media_url, media_type, text_content
  capture_timestamp, location_type, location_bin
  imu_snapshot (JSON), assigned_cluster_id (FK, nullable), seed_flag
  confidence_score, tide_rider_eligible, originator_flag

VibeCluster
  id, name (set by Trend Scout consensus), heat_level
  contributor_count, trend_velocity, originator_user_id
  top_content_ids (JSON), created_at, last_updated

Seed
  id, first_user_id, first_vibe_snap_id
  similar_snaps (JSON array), similar_count, threshold
  promoted, promoted_cluster_id, created_at

TideRiderEvent
  id, user_id, cluster_id, vibe_snap_id
  post_timestamp, cluster_rank_at_post, cluster_peak_rank
  diversity_multiplier, final_bonus, awarded_at

SynchLink
  id, user_a_id, user_b_id, trigger_type
  trigger_content_a_id, trigger_content_b_id
  similarity_score, stage, created_at, expiry_at, active

ParallelEcho
  id, synch_link_id, prompt_text
  user_a_response_url, user_a_response_type, user_a_responded_at
  user_b_response_url, user_b_response_type, user_b_responded_at
  both_responded, shareable

VerificationStatus
  id, user_id, provider, verified, verified_at, age_verified, under_18

DMThread
  id, synch_link_id, user_a_id, user_b_id
  created_at, last_activity_at, expiry_at, active

Message
  id, thread_id, sender_id, content_type, content, sent_at, read_at

ImplicitFeedback
  id, user_id, content_id, content_type, action, duration_ms, timestamp
```

---

## Stack Implications (What the Flows Reveal)

The three flows make the following technical requirements clear:

| Requirement | Why | Stack Implication |
|---|---|---|
| Real-time leaderboard (sub-second updates) | Pulse Path Step 5 | Redis sorted sets |
| Push notifications with payload | Pulse Path Step 1 | FCM + APNs |
| Geospatial location typing | Wednesday Path Step 4 | PostGIS extension on PostgreSQL |
| Asynchronous AI pipeline | Wednesday Path Step 5 | Separate Python ML service, job queue (Celery / RQ) |
| On-device ML inference | Pulse/Vibe-Snap capture | TFLite (Android) + CoreML (iOS) |
| High-volume simultaneous media upload | Pulse Path Step 4 | Edge buffering, S3-compatible storage, CDN |
| WebSocket for live Pulse feed | Pulse Path Steps 4-5 | Node.js (strong WebSocket support) or FastAPI with async |
| Relational data with complex queries | Schema above | PostgreSQL |
| Short-lived state (active Pulse, Pressure Gauge) | State machine | Redis |
| Third-party identity verification | Synch-Link Path Step 6 | Stripe Identity API / Sumsub API |

**The schema and the technical requirements together now make the stack decision a math problem, not a guess.** See STACK.md when ready.

---

## Open Questions Surfaced by These Flows

| # | Question | Impacts |
|---|---|---|
| F1 | What is the minimum engagement threshold for Parallel Echo to unlock? (currently: each user has at least 1 SharedSpaceEvent) | Synch-Link Path Step 4 |
| F2 | What is the exact Synch-Link similarity threshold for initial launch? | Synch-Link Path Step 1 |
| F3 | Does voting on PulseEntries close at the 15-minute mark or 2 hours after? (currently: 2 hours) | Pulse Path Step 5-6 |
| F4 | Can a user post multiple Vibe-Snaps per day, or is there a rate limit? | Wednesday Path Step 3 |
| F5 | What is the Vibe-Cluster heat decay function? (how quickly does a cluster cool if posting stops?) | VibeCluster model |
| F6 | Are Parallel Echo side-by-sides shareable to the main feed by default, or opt-in? (currently: opt-in) | Synch-Link Path Step 5 |
| F7 | What is the exact Seed critical mass threshold? (currently: 50) | Wednesday Path Step 5 |
| F8 | How are Trend Scouts selected initially before the reputation system has data? | Pre-launch |

---

*Next document: SCHEMA.md (formal database schema based on objects above) or STACK.md (technology stack decision based on requirements above). Recommend SCHEMA.md first.*
