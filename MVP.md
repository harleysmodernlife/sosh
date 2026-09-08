# Sösh — MVP Scope
**Status:** v0.2 — Active development
**Last Updated:** 2026-09-08

---

## The Hypothesis

The entire MVP build exists to test one thing:

> **Does the Pulse loop create a daily habit?**

Specifically: do users return on Day 7 — without being prompted by a Pulse notification — to check their standing, browse the Mosaic, or look at their Trophy Case?

If yes: the core addiction mechanic works. Build the rest.
If no: no amount of Vibe-Clusters, Synch-Links, or ML will save it. Redesign the loop before adding features.

---

## What Is Built and Live

### User Accounts
- [x] Register with email (Supabase Auth)
- [x] Invite-only signup — admin generates codes, shared 1:1 with new users
- [x] Onboarding: username + city (gated — must complete before accessing app)
- [x] Basic profile: username, display name, city, avatar, accent color
- [x] Push notification token stored and updated on every app launch
- [x] Account deletion (full data purge + Supabase Auth removal)
- [x] 6-color accent palette — stored in `users.accent_color`, shown on avatar/profile/score

### The Pulse
- [x] Admin trigger via in-app Admin tab
- [x] Automated daily firing (RQ cron, 18:00 UTC, 30 curated prompts)
- [x] Push notification to all registered users
- [x] In-app submission: text (500 chars), photo, or video (≤30s in-app recording)
- [x] Submission window (configurable, default 30 min)
- [x] Photo/video uploads via Supabase Storage presigned URLs

### Voting
- [x] Vote on other entries (one per entry, unique constraint enforced)
- [x] Live leaderboard via HTTP polling (5s interval) during active window
- [x] Milestone push notifications (5/10/25/50/100 votes, Redis dedup)
- [x] Results notifications to all participants on resolution

### Leaderboard Resolution
- [x] Global winner (top entry by vote count) receives City Rep trophy
- [x] Trophy record created with timestamp
- [x] Sösh Score recomputed: trophies×100 + entries×10 + votes_received×2 + votes_cast×1
- [x] Mosaic grid — top 20 entries, tappable tiles, full-screen modal

### Trophy Case
- [x] Permanent timestamped record of every Pulse win
- [x] Visible on own profile and public profiles

### Sösh Score
- [x] Full formula: trophies×100 + entries×10 + votes_received×2 + votes_cast×1
- [x] Recomputed on every Pulse resolve
- [x] Displayed on profile with accent color
- [x] Historical snapshot table preserved

### Social Graph
- [x] Follow / unfollow users
- [x] Follower/following counts on profiles
- [x] Block / unblock users
- [x] Blocked users hidden from feed; their posts invisible
- [x] Follow relationships removed on block

### Social Feed (Posts)
- [x] Freeform posts: text, photo, video
- [x] Home feed: "For You" (global) and "Following" tabs
- [x] Like / unlike posts with push notifications
- [x] Comments with push notifications
- [x] Post editing and deletion (own posts)
- [x] Post sharing — native OS share sheet with `sosh://post/<id>` deep links
- [x] Post search (ILIKE on text_content and caption)

### User Discovery
- [x] Search people by username or display name
- [x] Search posts by content (tabbed search screen)
- [x] Public user profiles with follow/block/DM actions

### Direct Messages (DMs)
- [x] Open DMs (no age verification required — deferred to Phase 2)
- [x] Conversation list with unread count badge
- [x] Thread view: inverted FlatList, read receipts
- [x] Push notifications for incoming messages
- [x] Deep link routing: tap notification → opens conversation
- [x] DM accessible from profile top bar and from any public profile

### Notifications
- [x] In-app notification inbox
- [x] Unread count on notifications button
- [x] Types: pulse, trophy, results, milestone, like, comment, follow, dm
- [x] Deep links from notifications to relevant screen

### Moderation
- [x] Entry reporting (flag button on entries)
- [x] Post reporting
- [x] User reporting
- [x] Admin: view flagged posts with report counts, delete flagged post
- [x] Admin: view flagged users with report counts, ban user (full account deletion)

### Content
- [x] Terms of Service and Privacy Policy screen (in-app, accessible from profile)
- [x] Brand assets: SÖSH icon, splash screen

---

## What Is Still Out (Phase 2+)

| Feature | Why deferred | Needed before adding |
|---|---|---|
| Vibe-Cluster Feed | Requires ML service and meaningful content volume | Pulse loop proven, ML built |
| Tide-Riding | Depends on Vibe-Clusters | Vibe-Clusters working |
| Synch-Links / Parallel Echo | High complexity, depends on scale | 10k+ MAU |
| Age verification for DMs | Stripe Identity $1.50/user — DMs are live but unverified MVP | Post-revenue |
| On-device content filter | Server-side basic moderation sufficient for now | When content volume justifies it |
| WebSocket leaderboard | HTTP polling sufficient at MVP scale | When polling creates noticeable lag |
| ML service | Not needed for Pulse-only MVP | When Vibe-Clusters are prioritized |
| Vibe-Chains | Depends on Vibe-Cluster Feed | Vibe-Clusters working |
| Full Sösh Score normalization | Needs enough users for meaningful percentile | 1k+ active users |
| Sponsored Pulses | Need proven engagement rate | Post-launch, proven retention |
| Cosmetic purchases | Need established status hierarchy | Post-launch |
| B2B mood data | Need ML clustering and scale | Phase 3 |
| Global Canvas | PR/seasonal event | Launch marketing moment |
| National/Global leaderboard scopes | Need user density | 500+ users per city |
| Pressure Gauge UI | Needs dynamic Pulse timing | Once Pulse timing is activity-driven |
| App Store submission | Need polished UX + Apple/Google review | When product is stable |

---

## Launch Strategy

**Current state:** Invite-only. Captain + Heather (when ready). Small test group.

**Target for first real cohort:** One city. Not global — enough density in one place for the leaderboard to feel competitive.

**Recommended launch city:** Nashville (home market, existing network).

**User acquisition:** Personal network, 1:1 invites from Admin tab. No paid acquisition before the loop is proven.

---

## Success Criteria

| Metric | Target | What it means |
|---|---|---|
| D7 retention | 40%+ | Users return on day 7 without a Pulse notification forcing them back |
| Pulse participation rate | 60%+ of registered users | The notification is compelling enough to interrupt what they're doing |
| Trophy Case views per user | 3+ per week | Users return to their legacy between Pulses |
| Vote-to-entry ratio | 5:1 or higher | Consumers outnumber creators — healthy feed dynamic |

**If D7 retention is below 40% after 30 days:** do not add features. Investigate the loop. Most likely culprits: Pulses too infrequent, prompt quality poor, not enough users for competitive leaderboard.

---

## What Happens After the Loop is Proven

Once D7 retention target is hit and sustained for 2 weeks:

1. Invite Heather and expand the test group
2. Begin Founding Wave recruitment across 3–5 cities
3. Design and build Vibe-Cluster Feed (Phase 2)
4. Build Sponsored Pulse infrastructure (first revenue path)
5. App Store submission (Apple + Google)

The move to Phase 2 is triggered by data, not a calendar date.
