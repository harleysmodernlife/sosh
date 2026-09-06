# Sösh — Product Design Document
**Version:** 0.1 (Brainstorm Capture)
**Status:** In Progress — not locked
**Contributors:** Captain (human), V.E.R.N. (Gemma), Claude (Anthropic)
**Last Updated:** 2026-09-06

---

## Table of Contents

1. [Vision](#1-vision)
2. [Core Problem Being Solved](#2-core-problem-being-solved)
3. [Core Mechanics](#3-core-mechanics)
4. [The App State Machine](#4-the-app-state-machine)
5. [Status and Reputation System](#5-status-and-reputation-system)
6. [Monetization](#6-monetization)
7. [Technical Architecture](#7-technical-architecture)
8. [Safety and Regulatory](#8-safety-and-regulatory)
9. [Onboarding](#9-onboarding)
10. [Open Questions](#10-open-questions)
11. [Rejected Ideas and Why](#11-rejected-ideas-and-why)

---

## 1. Vision

Sosh is a global, real-time experience engine. It replaces the passive, algorithmically-bubbled feed with a high-dopamine loop built on synchronized global events, competitive status, and genuine cross-cultural connection.

**The one-sentence pitch:**
TikTok shows you what the algorithm thinks you want. Sosh shows you what the planet is actually doing right now — and lets you compete to define it.

**What it is NOT:**
- A follower-based content platform
- A local or proximity-first app
- A pay-to-win system
- A professional or portfolio platform

---

## 2. Core Problem Being Solved

Current social media has three terminal failures:

| Platform | Failure |
|---|---|
| TikTok / Instagram | Geographic and behavioral bubble. You see what the algorithm predicts you want, not the world. Passive consumption, declining sense of real connection. |
| Twitter/X | Attention-maximizing toxicity. Rage and outrage as the primary engagement driver. |
| BeReal / authenticity apps | Correct instinct, wrong execution. One post per day, no competition, no global scale. Novelty without retention. |

**The gap Sosh fills:**
Active, real-time global participation. Not "here's content the machine selected for you" — but "the world is doing something right now and you can be part of it."

---

## 3. Core Mechanics

### 3.1 The Pulse

The foundational mechanic. Everything else is built around it.

**What it is:** At random intervals, a global push notification fires a simple, universal prompt. Users have a 15-minute window to capture and post a response using the in-app camera. When the window closes, the leaderboard resolves.

**Key constraints:**
- **In-app capture only.** No gallery uploads. No filters. This is a mandatory technical constraint. It levels the playing field against high-production creators and forces authenticity.
- **Multi-modal.** A response can be a short video (15s max), a photo, or a short text post (140 chars max). The prompt determines what fits naturally.
- **Rolling Wave timing.** Pulses follow the sun in regional waves (Asia-Pacific, then EMEA, then Americas). This solves the time-zone problem. Regional participation is local; leaderboards are global.

**Pulse types:**
- **Standard Pulse** — Regular cadence, any prompt.
- **Sponsored Pulse** — Brand pays to host. Prompt must be genuine, not an ad in costume. See section 6.1.
- **Mega-Pulse** — Rare, elaborate, tied to cultural moments. Quarterly maximum. Entire world participates with the time-zone limitation accepted as part of the drama.

**The Pressure Gauge:**
The UI shifts subtly (background gradients, haptic pulses) as global Vibe-Snap activity rises, signaling that a Pulse is building. No numbers. No countdown. The user feels something is coming without knowing when. This preserves the variable reward mechanic.

CRITICAL: The Pressure Gauge must be genuinely stochastic. High pressure can dissipate without a Pulse firing. If users decode a predictable pattern it becomes a countdown and the variable reward is destroyed.

**Dynamic Pulse timing:**
Pulse firing is tied to global Vibe-Snap activity, not a fixed timer. When organic posting activity spikes, the AI holds the Pulse to let tension build. When activity dips, it fires. The Pulse is a release valve for organic community momentum.

---

### 3.2 The Vibe-Cluster Feed

The between-Pulse experience. This is the daily habit loop.

**What it is:** A zero-decision vertical stream (same UX pattern as TikTok's FYP) organized by Global Vibe — real-time mood clusters emerging from Vibe-Snaps posted by users worldwide.

**Example Vibes:** "Mid-Day Slump," "City Chaos," "Quiet Rain," "Late Night Grind"

**How Vibes are detected — five-signal triangulation:**

1. **Visual Semantics** — Pose detection, environment recognition, color palette analysis
2. **Temporal and Contextual Metadata** — Time of day, day of week, GPS location type (residential vs commercial vs transit), device orientation
3. **IMU Data** — Accelerometer and gyroscope patterns (stillness, fidgeting, scroll speed) as a mood-state proxy. No audio capture — see section 8.1.
4. **Trend Scout Labels** — Human-verified cluster names from the Trend Scout tier (see section 5.4)
5. **Implicit Feedback Loop** — Engagement patterns on labeled clusters increase AI confidence. Swipe-aways trigger recalibration.

**The Tide-Riding mechanic:**
Users post "Vibe-Snaps" at any time — not just during Pulses. The AI slots them into live Vibe-Clusters. This is the primary between-Pulse creation motivation.

Posting into a Vibe-Cluster is a bet on that mood. If the cluster grows to become the number one trending global vibe, early contributors get a **Tide-Rider Bonus** — a significant Reputation boost.

Anti-gaming layer: The bonus is weighted by how early the contribution was AND the diversity of the user's posting history. Users who always post into trending clusters get a decaying multiplier. Users with a history of early discovery get an amplified bonus. You cannot game this by following the crowd.

**Seeds (unclustered content):**
A Vibe-Snap that doesn't fit any existing cluster is tagged as a Seed and placed in a low-visibility Discovery layer. When similar Seeds reach critical mass (~50 globally), the AI generates a new Vibe-Cluster.

The user who posted the first Seed that became a cluster gets a large **Originator Bonus**. Originality is the most rewarded behavior in the system.

---

### 3.3 The Global Mosaic

The post-Pulse experience. After the window closes, an AI-curation layer builds a **Narrative Arc** — not just a ranked leaderboard.

**Structure:**
- Opens with earliest entries from the first Rolling Wave region
- Builds through different cultural reactions across regions
- Contrasts extremes (megacity vs rural, wealthy vs developing)
- Ends with the Pulse Champions

The user watches a documentary of how the world responded to one prompt in one moment. The Champions are the resolution, not a stat. This makes winning mean more (see Trophy Case, section 5.2).

---

### 3.4 The Synch-Link

When two users from different parts of the world respond to the same Pulse or Vibe-Cluster with algorithmically similar energy, the app creates a temporary Synch-Link.

**Three stages:**

1. **Shared Space** — Both users see each other's contributions. Reactions limited to emoji and pre-set prompts. Default for all users including minors.

2. **Parallel Echo** — The app offers a unique micro-prompt tied to their shared moment. Each user responds independently — no coordination required. The app displays responses side-by-side. The connection is the comparison, not collaboration. Zero friction.

3. **Direct Message** — Requires explicit opt-in from both users AND completed third-party identity verification. Minors have DM access disabled at the system level regardless. Hard gate, not a policy.

**Duration:** 24 to 72 hours depending on engagement. Urgency without permanence, reducing harassment surface.

---

### 3.5 The Vibe-Chain

Content-linking mechanic. User A posts a Vibe-Snap, User B chains their reaction, User C chains to that.

The app surfaces the **geographic arc** of a chain as a feature. A chain passing through Tokyo, Nairobi, Sao Paulo, and Nashville is a different cultural object than a domestic chain. The path is displayed visually inline — the cultural distance is the content.

---

### 3.6 The Global Canvas

A **Seasonal Activation** — not a core mechanic. Quarterly, tied to cultural moments when possible.

A massive shared digital space opens for a defined window. Every user gets one pixel or slot to contribute. The result is a collaborative global artifact.

Monetization: Brands sponsor a Canvas, buying high-traffic coordinates as "Golden Pixels" that trigger brand rewards when touched.

The Canvas is a PR event and user acquisition tool. It generates press and new users. It does not generate daily retention.

---

## 4. The App State Machine

The spine of the product. All user journeys and data schema decisions map to these three states.

```
QUIET MODE              PRESSURE MODE           PULSE MODE

User sees:              User sees:              User sees:
Vibe-Cluster Feed       Vibe-Cluster Feed       Full-screen
                        + shifting UI           Pulse prompt
                        gradients/haptics

User does:              User does:              User does:
Vibe-Snaps              Vibe-Snaps +            Capture and post
Tide-Riding             increased app           within 15-min
Vibe-Chains             check frequency         window
Browsing Mosaic
```

**State transitions:**
- Quiet to Pressure: Global Vibe-Snap velocity crosses threshold
- Pressure to Quiet: Activity drops without Pulse firing (INTENTIONAL — stochastic behavior preserves variable reward)
- Pressure to Pulse: AI releases the Pulse at peak activity signal
- Pulse to Quiet: 15-minute window closes, Mosaic renders

**Failure states to design for:**
- Pulse notification fails to deliver: user misses window — show replay in Mosaic only, no late entry
- Server congestion during Pulse window: edge-buffered local capture, staggered upload (metadata sent instantly, video trickles)
- Vibe-Cluster AI misclassification: implicit feedback loop corrects over time, Trend Scouts can flag egregious errors

---

## 5. Status and Reputation System

### 5.1 The Sosh Score

A single synthesized number on every profile. Simple surface, deep structure.

Visible to all: one number (e.g., 1,247)
Visible on tap: breakdown by category

**Weighting (working hypothesis — requires A/B validation):**

| Component | Weight | What it measures |
|---|---|---|
| Championship | 40% | Pulse wins — City Rep, National Rep, Global Face titles |
| Trend Discovery | 35% | Tide-Rider bonuses, Originator bonuses, early cluster detection |
| Community Signal | 25% | Synch-Link engagement, Vibe-Chain reach, Parallel Echo participation |

**Pioneer Legacy:** Applied as a permanent floor. Founding Wave users never fall below a minimum score even if inactive. The floor does not compound — active newcomers can and should surpass them.

WARNING: The weighting determines what behavior users optimize for. Getting this wrong accidentally turns Sosh into a trophy-farming app or a trend-chasing app. These weights are hypotheses that need real data to validate.

---

### 5.2 The Cultural Passport (Trophy Case)

Every Pulse win is recorded as a permanent, timestamped entry:

"Face of Nashville — The Great Rain Pulse — March 3, 2027"

**Properties:**
- Non-portable. This history exists only on Sosh. Leaving means losing it.
- Time-compounding. A 3-year profile is richer than a 3-month profile in a way that cannot be bought or gamed.
- Recency layer. Recent wins are most visible. Historical wins are archived but permanently accessible.

This is the primary moat — a switching cost, not a marketing slogan. You cannot take your Cultural Passport to TikTok.

---

### 5.3 The Throne (Active Rep Title)

The "Face of [City/Country/World]" title resets every Pulse. This keeps the game accessible and prevents permanent power concentration.

The Throne (immediate competition) and the Cultural Passport (long-term legacy) are separate systems serving separate psychological needs. Both are required. Neither replaces the other.

---

### 5.4 The Trend Scout Tier

Elevated user tier earned through demonstrated early trend detection.

**Roles:**
1. **Seed Naming** — AI surfaces unlabeled Seeds to Scouts for naming via consensus vote. Scout whose label wins earns Reputation. Scout whose labels are consistently rejected loses standing.
2. **Hidden Gem Surfacing** — Scouts flag Mosaic content the algorithm underweighted. Community validation confirms Scout accuracy.
3. **AI Training Signal** — Scout-verified labels become training data for the clustering AI. Scouts are the human feedback loop.

**Cartel prevention:** No single Scout can name a cluster alone. Consensus mechanism plus general user vote prevents any group from controlling what moods get defined and therefore what content gets visibility.

---

### 5.5 Pulse Ambassadors (Creator Layer)

The answer to "why would a creator with 2M TikTok followers post on Sosh?"

Ambassadors do NOT design Pulses — that corrupts the democratic event. They:
1. **Drop first** — post their entry at the start of a Pulse, setting an implicit quality bar and generating initial hype
2. **Spotlight hidden gems** — curate underweighted entries in the Mosaic post-Pulse (editorial role, not voting power)
3. **Revenue share** — receive a cut of Sponsored Pulse revenue for Pulses they Ambassadored

Ambassadors catalyze events without owning them. The Pulse remains democratic. The creator gets status and income without their existing audience automatically winning for them.

---

### 5.6 The Founding Wave

Pre-launch: recruit 500 to 1,000 Pioneers across 40+ countries.

Geographic diversity is non-negotiable. A US-heavy Pioneer cohort poisons the global brand at launch.

**Pioneer incentives:**
- Permanent Pioneer badge
- Reputation floor (Pioneer Legacy)
- Early Trend Scout access

**Anti-hoarding mechanism:**
- Pioneer Legacy Reputation boost decays with inactivity
- A portion of ongoing Pioneer Reputation is tied to how many non-Pioneers they have helped reach meaningful Reputation levels — Pioneers become growth nodes, not gatekeepers

---

## 6. Monetization

Three revenue streams. No subscriptions. No pay-to-win.

### 6.1 Sponsored Pulses

Brands pay to host a Pulse. The brand does not write an ad — they write a prompt.

Rules:
- Prompt must be genuine and universal, not a branded directive
- Brand provides Sponsor Boosts — free Visibility Boosts distributed to users who watch a 15s brand clip before posting. User gets the power-up free (paid with attention). Brand gets a guaranteed view. Sosh takes the ad revenue.
- Branded Pulses capped at 1 in 5 maximum
- No politically-oriented Sponsored Pulses within 30 days of any national election in the relevant region
- Country-of-origin transparency mandatory on all Sponsored Pulses

**Year 1 Founding Partnership model:**
Before scale exists, sell 10 to 20 brands a "Founding Partnership" — their brand triggers some of the first Pulses on the platform. They get founding-era cultural cachet. Sosh gets pre-scale revenue. This bridges the gap before the main ad model activates.

---

### 6.2 Cosmetic Flexes

Direct user purchases for purely visual items. No gameplay advantage, ever.

Examples: profile border styles, custom notification sounds for followers, post auras in the Mosaic, Sosh Score display themes.

Hard rule: Cosmetics affect appearance only. They do not affect leaderboard position, Vibe-Cluster visibility, Sosh Score, or any competitive mechanic. Violating this creates pay-to-win resentment that kills community trust.

---

### 6.3 B2B Mood Data (Pulse Reports)

Real-time aggregated global behavioral and sentiment data sold to corporations, hedge funds, and marketing agencies.

What is sold: cluster-level data only. "The mood of Sao Paulo is X." Never individual user data. Never precise GPS coordinates.

Privacy architecture: Individual IDs are never included in sold data. All reports are aggregated and anonymized before sale.

Political risk: "Social media company sells real-time emotional data to Wall Street" generates congressional hearings. The Public Ethics Charter (section 8.1) must be in place before this revenue stream is activated.

---

## 7. Technical Architecture

### 7.1 Stack Decision (To Be Made)

Existing project history: Python, TypeScript, HTML/JS

| Layer | Options |
|---|---|
| Backend API | Python (FastAPI) or TypeScript (Node/Express) |
| Mobile | React Native (cross-platform) or Flutter |
| Real-time | WebSockets or Server-Sent Events for Pulse notifications |
| AI/ML | Python — PyTorch or TensorFlow Lite for on-device models |
| Database | PostgreSQL (relational) + Redis (real-time state) |
| Media storage | S3-compatible object storage |
| Push notifications | FCM (Android) + APNs (iOS) |

Stack decision needs its own dedicated document before build begins.

---

### 7.2 On-Device Content Filtering

All content passes an on-device AI safety check before upload — not server-side moderation after the fact.

Why on-device: A 15-minute Pulse window means millions of simultaneous uploads. Server-side moderation cannot respond fast enough. One viral illegal clip before moderation catches it equals App Store ban.

Implementation: Lightweight vision model (CoreML on iOS, TensorFlow Lite on Android). The Post button is disabled until the model returns a safe classification. Detected violations return a user-facing warning before upload.

---

### 7.3 Distributed Edge Architecture

The Pulse creates a massive simultaneous upload spike that will crash central server architecture.

Approach:
- Video cached locally, uploaded in staggered trickle
- Metadata (the "I'm in" signal) sent instantly — this populates the live leaderboard
- Regional cluster infrastructure means a crash in EMEA does not affect the Americas wave

---

### 7.4 AI Mood Triangulation Pipeline

```
Input signals:
  1. Visual semantics     (pose, environment, color palette)
  2. Temporal metadata    (time, day, location type via GPS)
  3. IMU data             (accelerometer/gyroscope motion patterns)
  4. Trend Scout labels   (human-verified cluster names)
  5. Implicit feedback    (engagement patterns on labeled clusters)

Output:
  Cluster assignment (existing cluster or Seed flag)
  Confidence score
  Tide-Rider eligibility window
```

No audio capture. See section 8.1.

---

## 8. Safety and Regulatory

### 8.1 Privacy-by-Design Architecture

No ambient audio capture. Even 1-second audio samples are a legal and PR disaster across major markets (GDPR, CCPA). IMU data provides equivalent mood-proxy signals without audio and is already standard in social app data collection.

Data minimization:
- Collect only what the feature requires
- Individual IDs never sold or included in B2B reports
- Precise GPS coordinates binned to neighborhood/district level before any processing
- Aggregated mood data is the product; individual user data is not

**Public Ethics Charter:**
A legally binding public document specifying what is collected, what is never sold, how data is anonymized, and regional compliance modes. Must be written before B2B revenue is activated. Treat as a legal document, not marketing copy.

---

### 8.2 Age Verification

No AI face scanning. Unreliable, invasive, and regulatory non-compliant across major jurisdictions.

Approach:
- All users Unverified by default
- Unverified users: Shared Space only (emoji/pre-set reactions, no DMs)
- To unlock DM: third-party identity verification via Stripe Identity (US focus) or Sumsub/Jumio (global coverage — comparison needed)
- Under-18 users: DM access disabled at system level. Age verification cannot override this. Hard gate.

---

### 8.3 Election and Political Interference Policy

The Pulse mechanic plus global reach equals a vector for coordinated influence operations.

Hard rules:
- No politically-oriented Sponsored Pulses within 30 days of any national election in the relevant target region
- Country-of-origin transparency on all Sponsored Pulses
- Dedicated moderation monitoring for coordinated Vibe-Cluster manipulation (organized groups artificially inflating a mood)
- EU Digital Services Act compliance architecture required before reaching 45 million EU users — design for it before it is required

---

## 9. Onboarding — The Welcome Wave

New user opens the app. No tutorial screens. No setup required.

Sequence:

1. Lands immediately on the live Vibe-Cluster Feed — pure consumption, zero friction
2. Single ambient prompt floats at the bottom: "What's your vibe right now?" — one tap to post
3. First post triggers an immediate Reputation hit: "First Vibe — +10 Rep" — the loop teaches itself
4. If a Pulse is active: full-screen takeover — "THE PULSE IS LIVE. You have 11 minutes." No explanation needed.

The product explains itself through doing. Deeper features reveal themselves over time through use. Day 1 is about one thing: does the new user feel a hit?

---

## 10. Open Questions

Unresolved design decisions that need answers before or during build:

| # | Question | Priority |
|---|---|---|
| 1 | Tech stack — Python backend vs TypeScript? React Native vs Flutter? | Pre-build |
| 2 | Launch geography — which 3-5 cities for initial density? Working recommendation: Seoul, Lagos, Sao Paulo, London, plus one US city | Pre-launch |
| 3 | D7 retention target — working hypothesis: 40%+ D7 return rate constitutes "compulsion loop confirmed" | Pre-launch |
| 4 | Pulse frequency — working hypothesis: 2-3 standard Pulses per day in rolling waves | Design |
| 5 | Sosh Score weighting — the 40/35/25 split is a hypothesis requiring A/B test design | Post-MVP |
| 6 | Vibe-Snap moderation — full moderation architecture for between-Pulse content (lower urgency than Pulse content but higher volume) | Design |
| 7 | Founding Partnership pricing and deliverables | Pre-revenue |
| 8 | Sosh Score display scale — does it go to 10,000? 100,000? Scale affects perceived progression. | Design |
| 9 | Vibe-Cluster cold start — first 90 days lack organic clustering data. What are the manually seeded starter clusters? | Pre-launch |
| 10 | Age verification provider — Stripe Identity vs Sumsub vs Jumio, global coverage comparison needed | Pre-build |

---

## 11. Rejected Ideas and Why

Keeping these prevents re-litigating settled decisions.

| Idea | Why Rejected |
|---|---|
| Proof-of-Work / local competence hiring | Too similar to Fiverr. No social hook. |
| Local/proximity-first feed | The anti-bubble global angle is the differentiator. Local is what TikTok already does implicitly. |
| Dark Days (forced app downtime) | Startup suicide. You cannot build daily habit loops while intentionally breaking them. |
| Pro Tier subscription | Users will not pay monthly for social apps when free options dominate. |
| Buying gameplay power-ups | Pay-to-win kills community trust and status prestige. |
| Global Canvas as core mechanic | Novelty feature, not a retention loop. Reddit's "Place" proves this. Reclassified as Seasonal Activation. |
| 3D Globe as home screen | Navigation task masquerading as a product. High cognitive load, zero content. |
| Ambient Mode screensaver | No engagement, no ad revenue, no habit loop. |
| Countdown to next Pulse | Destroys variable reward mechanic — the core addiction driver. |
| AI face scan for age verification | Unreliable, invasive, regulatory non-compliant in major markets. |
| 1-second ambient audio capture | GDPR/CCPA liability. User trust disaster. IMU data provides equivalent signal. |
| Creator Pulse Architect role | If creators design the prompt, the Pulse stops being a democratic event. Contradicts the core ethos. |
| Creators curating Mosaic winners | Curatorial power in individual hands corrupts the meritocracy. Ambassadors spotlight; votes decide. |

---

*This document captures design decisions made during initial brainstorming. It is not a technical specification. Next phase: convert the State Machine (section 4) and Core Mechanics (section 3) into formal user journey flows and a data schema.*
