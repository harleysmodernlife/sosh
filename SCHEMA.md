# Sösh — Database Schema
**Version:** 0.1
**Status:** In Progress
**Depends on:** DESIGN.md v0.1, FLOWS.md v0.1
**Last Updated:** 2026-09-06

---

## Overview

This document defines the full data schema for Sösh. Every table here corresponds to a data object identified in FLOWS.md. Where a design decision affects the schema, the rationale is documented inline.

### Two-tier storage architecture

Not all data lives in the same place. This schema uses two storage layers:

**PostgreSQL** — Persistent, relational, source of truth. All data that must survive a restart, be audited, or be queried relationally lives here.

**Redis** — Ephemeral, fast, real-time state. Leaderboard counters, vote buffers, active Pulse state, Pressure Gauge, rate limiting. Redis is the working memory; PostgreSQL is the permanent record.

Where a table has a Redis counterpart, both are documented together.

### Baseline defaults for Open Questions F1-F8

Rather than leaving these undefined, the schema sets baseline values. All are treated as tuning parameters, not fixed logic — they should be exposed as configurable constants in the application, not hardcoded.

| Question | Baseline Value |
|---|---|
| F1 — Parallel Echo engagement threshold | 1 SharedSpaceEvent per user (minimum engagement) |
| F2 — Synch-Link similarity threshold | 0.75 (start tight, tune based on match rate) |
| F3 — Voting window duration post-submission | 2 hours after submission window closes |
| F4 — Vibe-Snap daily rate limit per user | 20 per day |
| F5 — Vibe-Cluster heat decay half-life | 6 hours (heat halves every 6 hours with no new snaps) |
| F6 — Parallel Echo side-by-side sharing | Opt-in (user must explicitly choose to share) |
| F7 — Seed critical mass threshold | 50 similar snaps |
| F8 — Initial Trend Scout selection | Founding Wave Pioneers with highest Originator activity in first 30 days |

---

## Enum Types

Define these first. They are referenced throughout the schema.

```sql
CREATE TYPE pulse_type AS ENUM ('standard', 'sponsored', 'mega');

CREATE TYPE media_type AS ENUM ('video', 'photo', 'text');

CREATE TYPE entry_status AS ENUM ('pending', 'active', 'removed', 'flagged');

CREATE TYPE filter_result AS ENUM ('safe', 'flagged', 'error', 'pending');

CREATE TYPE trophy_title AS ENUM ('city_rep', 'national_rep', 'global_face');

CREATE TYPE synch_link_stage AS ENUM ('shared_space', 'parallel_echo', 'dm');

CREATE TYPE verification_provider AS ENUM ('stripe_identity', 'sumsub', 'jumio');

CREATE TYPE feedback_action AS ENUM (
    'view', 'watch_full', 'rewatch',
    'swipe_away', 'tap_expand', 'react', 'vibe_chain'
);

CREATE TYPE user_role AS ENUM ('pioneer', 'trend_scout', 'ambassador');

CREATE TYPE location_type AS ENUM (
    'residential', 'commercial', 'transit',
    'outdoor', 'unknown'
);

CREATE TYPE pulse_region_wave AS ENUM ('asia_pacific', 'emea', 'americas');
```

---

## Section 1 — Users and Roles

### users

The core user record. Deliberately lean — authentication details live in a separate auth system (not defined here). Profile enrichment is separate.

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(30) UNIQUE NOT NULL,
    display_name    VARCHAR(60),
    city            VARCHAR(100),
    country         VARCHAR(2),         -- ISO 3166-1 alpha-2
    region_wave     pulse_region_wave,  -- which Rolling Wave region the user belongs to
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ         -- soft delete
);

CREATE INDEX idx_users_country ON users(country);
CREATE INDEX idx_users_region_wave ON users(region_wave);
```

### user_roles

Special roles (Pioneer, Trend Scout, Ambassador) are stored in a separate table rather than boolean flags on users. This allows role metadata (decay factors, assignment reasons) to be stored cleanly.

```sql
CREATE TABLE user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            user_role NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by      VARCHAR(50),        -- 'system', 'admin', or user_id of granter
    decay_factor    NUMERIC(3,2) DEFAULT 1.0,  -- Pioneer decay: starts at 1.0, decreases with inactivity
    active          BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role) WHERE active = TRUE;
```

### sosh_score_snapshots

Denormalized score for fast reads. Updated by a background job whenever a score-affecting event occurs (Trophy, TideRiderEvent, etc). The underlying event tables are the source of truth; this is a cache.

```sql
CREATE TABLE sosh_score_snapshots (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES users(id),
    total_score                 INTEGER NOT NULL DEFAULT 0,
    championship_score          INTEGER NOT NULL DEFAULT 0,   -- 40% weight
    trend_discovery_score       INTEGER NOT NULL DEFAULT 0,   -- 35% weight
    community_signal_score      INTEGER NOT NULL DEFAULT 0,   -- 25% weight
    pioneer_floor               INTEGER NOT NULL DEFAULT 0,   -- additive floor, does not compound
    last_computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sosh_score_total ON sosh_score_snapshots(total_score DESC);
```

**Score computation note:** The `total_score` is NOT a simple sum of the three component scores. It is computed as:

```
championship_normalized    = (championship_score / max_championship) * 1000 * 0.40
trend_discovery_normalized = (trend_discovery_score / max_trend) * 1000 * 0.35
community_normalized       = (community_signal_score / max_community) * 1000 * 0.25
total_score = championship_normalized + trend_discovery_normalized + community_normalized + pioneer_floor
```

The normalization denominators (`max_championship`, etc.) are rolling percentile values recalculated periodically, not static maximums. This prevents early adopters from permanently dominating the scale.

---

## Section 2 — Pulses

### brands

Sponsors for Sponsored Pulses. Also used for Founding Partnership records.

```sql
CREATE TABLE brands (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    country_of_origin   VARCHAR(2),     -- ISO 3166-1 alpha-2, required for transparency
    contact_email   VARCHAR(255),
    founding_partner    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### pulses

```sql
CREATE TABLE pulses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_text     VARCHAR(500) NOT NULL,
    type            pulse_type NOT NULL DEFAULT 'standard',
    region_wave     pulse_region_wave NOT NULL,
    brand_id        UUID REFERENCES brands(id),     -- NULL for non-sponsored
    start_time      TIMESTAMPTZ NOT NULL,
    submission_closes_at    TIMESTAMPTZ NOT NULL,   -- start_time + 15 minutes
    voting_closes_at        TIMESTAMPTZ NOT NULL,   -- submission_closes_at + 2 hours
    mosaic_id       UUID,                           -- set after Mosaic renders (FK added later)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulses_region_wave ON pulses(region_wave);
CREATE INDEX idx_pulses_start_time ON pulses(start_time DESC);
CREATE INDEX idx_pulses_brand_id ON pulses(brand_id) WHERE brand_id IS NOT NULL;
```

**Election policy enforcement:** A CHECK constraint is not sufficient here — political eligibility is determined by comparing brand metadata against an election calendar that lives outside the database. This is enforced at the application layer before a Pulse is created, not at the schema layer.

### pulse_entries

HIGH WRITE TABLE during Pulse windows. See Redis section for the vote counter strategy.

```sql
CREATE TABLE pulse_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES pulses(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    media_url       VARCHAR(1000),           -- NULL until background upload completes
    media_type      media_type NOT NULL,
    text_content    VARCHAR(280),            -- only populated if media_type = 'text'
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    region          VARCHAR(2),              -- ISO country code of submitter at submission time
    city            VARCHAR(100),
    status          entry_status NOT NULL DEFAULT 'pending',
    filter_result   filter_result NOT NULL DEFAULT 'pending',
    vote_count      INTEGER NOT NULL DEFAULT 0,   -- DENORMALIZED — see Redis vote strategy
    city_rank       INTEGER,                 -- set after voting closes
    national_rank   INTEGER,
    global_rank     INTEGER,

    -- Prevent duplicate entries per user per pulse
    UNIQUE (pulse_id, user_id)
);

CREATE INDEX idx_pulse_entries_pulse_id ON pulse_entries(pulse_id);
CREATE INDEX idx_pulse_entries_user_id ON pulse_entries(user_id);
-- Leaderboard query index: fetch top entries for a pulse ordered by votes
CREATE INDEX idx_pulse_entries_leaderboard ON pulse_entries(pulse_id, vote_count DESC)
    WHERE status = 'active';
-- Regional leaderboard query
CREATE INDEX idx_pulse_entries_regional ON pulse_entries(pulse_id, region, vote_count DESC)
    WHERE status = 'active';
```

### votes

Individual vote records. The vote_count on pulse_entries is denormalized from this table via Redis (see below). This table is the audit log.

```sql
CREATE TABLE votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES pulses(id),
    entry_id        UUID NOT NULL REFERENCES pulse_entries(id),
    voter_user_id   UUID NOT NULL REFERENCES users(id),
    voted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One vote per user per entry
    UNIQUE (entry_id, voter_user_id)
);

CREATE INDEX idx_votes_entry_id ON votes(entry_id);
CREATE INDEX idx_votes_voter_user_id ON votes(voter_user_id);
```

**The vote write problem — Redis strategy:**

During a Pulse's 2-hour voting window, millions of votes may arrive. A direct SQL UPDATE to `pulse_entries.vote_count` on every vote would create severe lock contention.

Solution:

```
On vote submission:
  1. Write Vote record to PostgreSQL (individual audit record — acceptable write rate)
  2. ZINCRBY Redis key "pulse:{pulse_id}:votes" 1 "{entry_id}"
     (Redis sorted set — O(log n) increment, no locking)

Every 10 seconds (background job):
  3. Read top N from Redis sorted set
  4. Batch UPDATE pulse_entries.vote_count from Redis values
  5. Publish leaderboard update event to WebSocket subscribers

On voting_closes_at:
  6. Final flush: sync all Redis vote counts to PostgreSQL
  7. Compute final ranks (city/national/global)
  8. Clear Redis leaderboard key
```

**Redis key:** `pulse:{pulse_id}:votes:{scope}` where scope is `global`, `{country_code}`, or `{country_code}:{city_slug}`

### trophies

```sql
CREATE TABLE trophies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    pulse_id        UUID NOT NULL REFERENCES pulses(id),
    entry_id        UUID NOT NULL REFERENCES pulse_entries(id),
    title           trophy_title NOT NULL,
    scope_label     VARCHAR(100) NOT NULL,  -- "Nashville", "United States", "Global"
    final_vote_count    INTEGER NOT NULL,
    awarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trophies_user_id ON trophies(user_id);
CREATE INDEX idx_trophies_pulse_id ON trophies(pulse_id);
CREATE INDEX idx_trophies_awarded_at ON trophies(awarded_at DESC);
```

### leaderboard_results

The final resolved leaderboard per scope per Pulse. Stored as a snapshot — not recomputed on read.

```sql
CREATE TABLE leaderboard_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES pulses(id),
    scope           VARCHAR(20) NOT NULL,   -- 'global', 'national', 'city'
    scope_label     VARCHAR(100) NOT NULL,
    ranked_entries  JSONB NOT NULL,         -- ordered array of {entry_id, user_id, vote_count, rank}
    resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (pulse_id, scope, scope_label)
);

CREATE INDEX idx_leaderboard_results_pulse_id ON leaderboard_results(pulse_id);
```

### mosaics

The Mosaic is a curated document, not a query result. It is "baked" by the Narrative Arc Engine after voting closes. Stored as a JSONB document.

```sql
CREATE TABLE mosaics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL UNIQUE REFERENCES pulses(id),
    narrative_sequence  JSONB NOT NULL,
    -- Structure: [
    --   { "entry_id": "...", "user_id": "...", "region": "...", "city": "...",
    --     "narrative_position": "opening|buildup|contrast|climax|champion",
    --     "display_label": "Seoul, South Korea" },
    --   ...
    -- ]
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Mosaic generation note:** The Narrative Arc Engine is an async background job triggered when `voting_closes_at` is reached. It:
1. Fetches all active PulseEntries for the Pulse ordered by submission time
2. Groups by region
3. Applies narrative arc logic (opening wave → regional contrast → climax → champions)
4. Writes the JSONB document to this table
5. Updates `pulses.mosaic_id` to reference the new record

This is NOT computed in real-time. It is a pre-baked document served from PostgreSQL or cached in Redis.

---

## Section 3 — Vibe-Cluster System

### vibe_clusters

```sql
CREATE TABLE vibe_clusters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100),           -- NULL until named by Trend Scout consensus
    proposed_names      JSONB,                  -- array of {name, proposed_by_user_id, vote_count}
    heat_level          NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- heat decays with half-life of 6 hours (F5 baseline)
    -- heat = sum of recent snap weights, halved every 6 hours
    contributor_count   INTEGER NOT NULL DEFAULT 0,
    trend_velocity      NUMERIC(5,2) NOT NULL DEFAULT 0,  -- rate of heat change
    originator_user_id  UUID REFERENCES users(id),
    top_content_ids     JSONB,              -- array of top 10 VibeSnap IDs by engagement
    geographic_spread   JSONB,              -- {country_code: contributor_count} map
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_clusters_heat ON vibe_clusters(heat_level DESC);
CREATE INDEX idx_vibe_clusters_created ON vibe_clusters(created_at DESC);
```

**Redis key for live heat:** `cluster:{cluster_id}:heat` (float, updated on every Vibe-Snap assignment)

**Heat decay job:** Runs every 30 minutes. For each active cluster: `heat = heat * (0.5 ^ (minutes_since_last_update / 360))`. Updates Redis and PostgreSQL.

### vibe_snaps

HIGH READ TABLE. The content of the Vibe-Cluster Feed comes from here.

```sql
CREATE TABLE vibe_snaps (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    media_url           VARCHAR(1000),
    media_type          media_type NOT NULL,
    text_content        VARCHAR(280),
    capture_timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Location (binned, not precise)
    location_type       location_type NOT NULL DEFAULT 'unknown',
    location_country    VARCHAR(2),         -- ISO country code
    location_city       VARCHAR(100),
    -- PostGIS point binned to ~1km neighborhood level, NOT precise GPS
    location_point      GEOMETRY(Point, 4326),

    -- Device state at capture
    device_orientation  VARCHAR(20),        -- 'portrait_low', 'portrait_high', 'landscape', 'flat'

    -- IMU snapshot
    imu_stillness_score     NUMERIC(3,2),   -- 0.0 (moving) to 1.0 (completely still)
    imu_fidget_score        NUMERIC(3,2),   -- 0.0 to 1.0
    imu_scroll_velocity     VARCHAR(10),    -- 'slow', 'medium', 'fast'

    -- Cluster assignment (set by async triangulation job)
    assigned_cluster_id UUID REFERENCES vibe_clusters(id),  -- NULL until assigned or Seeded
    seed_flag           BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score    NUMERIC(3,2),

    -- Tide-Rider state
    tide_rider_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    cluster_rank_at_post    INTEGER,        -- rank of cluster when snap was posted

    -- Originator flag (set when a Seed snap spawned a new cluster)
    originator_flag     BOOLEAN NOT NULL DEFAULT FALSE,

    -- Moderation
    status              entry_status NOT NULL DEFAULT 'pending',
    filter_result       filter_result NOT NULL DEFAULT 'pending',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_snaps_user_id ON vibe_snaps(user_id);
CREATE INDEX idx_vibe_snaps_cluster ON vibe_snaps(assigned_cluster_id, capture_timestamp DESC)
    WHERE status = 'active';
CREATE INDEX idx_vibe_snaps_seeds ON vibe_snaps(seed_flag, capture_timestamp DESC)
    WHERE seed_flag = TRUE AND status = 'active';
-- PostGIS spatial index
CREATE INDEX idx_vibe_snaps_location ON vibe_snaps USING GIST(location_point);
```

### seeds

Tracks unclustered Vibe-Snaps that may become new clusters.

```sql
CREATE TABLE seeds (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_user_id           UUID NOT NULL REFERENCES users(id),
    first_vibe_snap_id      UUID NOT NULL REFERENCES vibe_snaps(id),
    similar_snap_ids        JSONB NOT NULL DEFAULT '[]',    -- array of VibeSnap IDs
    similar_count           INTEGER NOT NULL DEFAULT 1,
    threshold               INTEGER NOT NULL DEFAULT 50,    -- F7 baseline
    promoted                BOOLEAN NOT NULL DEFAULT FALSE,
    promoted_cluster_id     UUID REFERENCES vibe_clusters(id),
    trend_scout_surfaced    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_at             TIMESTAMPTZ
);

CREATE INDEX idx_seeds_similar_count ON seeds(similar_count DESC) WHERE promoted = FALSE;
CREATE INDEX idx_seeds_first_user ON seeds(first_user_id);
```

### tide_rider_events

Records when a Tide-Rider bonus is awarded.

```sql
CREATE TABLE tide_rider_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    cluster_id          UUID NOT NULL REFERENCES vibe_clusters(id),
    vibe_snap_id        UUID NOT NULL REFERENCES vibe_snaps(id),
    post_timestamp      TIMESTAMPTZ NOT NULL,
    cluster_rank_at_post    INTEGER NOT NULL,
    cluster_peak_rank   INTEGER NOT NULL,

    -- Anti-gaming diversity multiplier
    -- Computed from user's posting history: what % of their snaps were into trending clusters?
    -- Low diversity (always chases trends) = multiplier < 1.0
    -- High diversity (discovers early) = multiplier up to 2.0
    diversity_multiplier    NUMERIC(3,2) NOT NULL,
    base_bonus          INTEGER NOT NULL,
    final_bonus         INTEGER NOT NULL,   -- base_bonus * diversity_multiplier, rounded

    awarded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tide_rider_events_user_id ON tide_rider_events(user_id);
CREATE INDEX idx_tide_rider_events_cluster_id ON tide_rider_events(cluster_id);
```

---

## Section 4 — Synch-Link System

### synch_links

```sql
CREATE TABLE synch_links (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id               UUID NOT NULL REFERENCES users(id),
    user_b_id               UUID NOT NULL REFERENCES users(id),
    trigger_type            VARCHAR(20) NOT NULL,   -- 'pulse_entry' or 'vibe_snap'
    trigger_content_a_id    UUID NOT NULL,          -- PulseEntry ID or VibeSnap ID
    trigger_content_b_id    UUID NOT NULL,
    similarity_score        NUMERIC(4,3) NOT NULL,  -- 0.000 to 1.000
    threshold_at_creation   NUMERIC(4,3) NOT NULL,  -- record what threshold was used (tunable)
    stage                   synch_link_stage NOT NULL DEFAULT 'shared_space',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_at               TIMESTAMPTZ NOT NULL,   -- created_at + 72 hours, rolling
    active                  BOOLEAN NOT NULL DEFAULT TRUE,

    -- Prevent duplicate links between the same two users for the same trigger content
    UNIQUE (user_a_id, user_b_id, trigger_content_a_id)
);

CREATE INDEX idx_synch_links_user_a ON synch_links(user_a_id) WHERE active = TRUE;
CREATE INDEX idx_synch_links_user_b ON synch_links(user_b_id) WHERE active = TRUE;
CREATE INDEX idx_synch_links_expiry ON synch_links(expiry_at) WHERE active = TRUE;
```

**Note on user_a / user_b ordering:** Always store with the lexicographically smaller user UUID as user_a. This prevents duplicate links where A→B and B→A are stored separately.

### shared_space_events

```sql
CREATE TABLE shared_space_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id   UUID NOT NULL REFERENCES synch_links(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    action          VARCHAR(30) NOT NULL,   -- 'view', 'emoji_react', 'prompt_respond'
    content         VARCHAR(500),           -- emoji or pre-set prompt text
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_space_events_link ON shared_space_events(synch_link_id);
CREATE INDEX idx_shared_space_events_user ON shared_space_events(synch_link_id, user_id);
```

**Parallel Echo unlock check:**
A query against this table determines if both users have hit the F1 threshold (1 event each):

```sql
SELECT
    COUNT(DISTINCT user_id) AS users_engaged,
    COUNT(*) FILTER (WHERE user_id = $user_a_id) AS a_events,
    COUNT(*) FILTER (WHERE user_id = $user_b_id) AS b_events
FROM shared_space_events
WHERE synch_link_id = $link_id
  AND action IN ('emoji_react', 'prompt_respond');
-- Parallel Echo unlocks when a_events >= 1 AND b_events >= 1
```

### parallel_echoes

```sql
CREATE TABLE parallel_echoes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id           UUID NOT NULL UNIQUE REFERENCES synch_links(id),
    prompt_text             VARCHAR(500) NOT NULL,
    user_a_response_url     VARCHAR(1000),
    user_a_response_type    media_type,
    user_a_text_content     VARCHAR(280),
    user_a_responded_at     TIMESTAMPTZ,
    user_b_response_url     VARCHAR(1000),
    user_b_response_type    media_type,
    user_b_text_content     VARCHAR(280),
    user_b_responded_at     TIMESTAMPTZ,
    both_responded          BOOLEAN NOT NULL DEFAULT FALSE,
    -- F6 baseline: opt-in sharing
    user_a_shared_to_feed   BOOLEAN NOT NULL DEFAULT FALSE,
    user_b_shared_to_feed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parallel_echoes_link ON parallel_echoes(synch_link_id);
```

### verification_statuses

```sql
CREATE TABLE verification_statuses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
    provider        verification_provider,
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    -- Age verification: only stores the result, never the document
    -- The raw ID document is handled entirely by the third-party provider
    age_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    under_18        BOOLEAN NOT NULL DEFAULT FALSE,    -- permanent gate regardless of opt-in
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**CRITICAL privacy note:** This table stores verification RESULTS only. No document images, no date of birth, no government ID numbers. The third-party provider (Stripe Identity, Sumsub, or Jumio) handles all document storage. Sösh stores only the boolean outcomes.

### dm_threads

```sql
CREATE TABLE dm_threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id   UUID NOT NULL UNIQUE REFERENCES synch_links(id),
    user_a_id       UUID NOT NULL REFERENCES users(id),
    user_b_id       UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_at       TIMESTAMPTZ NOT NULL,   -- last_activity_at + 72 hours, rolling
    active          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_dm_threads_user_a ON dm_threads(user_a_id) WHERE active = TRUE;
CREATE INDEX idx_dm_threads_user_b ON dm_threads(user_b_id) WHERE active = TRUE;
CREATE INDEX idx_dm_threads_expiry ON dm_threads(expiry_at) WHERE active = TRUE;
```

### messages

```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES dm_threads(id),
    sender_id       UUID NOT NULL REFERENCES users(id),
    content_type    media_type NOT NULL,
    content         TEXT,                   -- text content or media URL
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ             -- soft delete (user can delete their own messages)
);

CREATE INDEX idx_messages_thread_id ON messages(thread_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
```

---

## Section 5 — Implicit Feedback and Content Signals

### implicit_feedback

HIGH WRITE TABLE. Every scroll, view, and swipe generates a record. This will be the largest table in the database at scale. Consider time-based partitioning.

```sql
CREATE TABLE implicit_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    content_id      UUID NOT NULL,          -- VibeSnap ID, PulseEntry ID, or Mosaic entry ID
    content_type    VARCHAR(20) NOT NULL,   -- 'vibe_snap', 'pulse_entry', 'parallel_echo'
    action          feedback_action NOT NULL,
    duration_ms     INTEGER,                -- for 'view' and 'watch_full' actions
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create initial partitions (monthly)
CREATE TABLE implicit_feedback_2026_09
    PARTITION OF implicit_feedback
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE INDEX idx_implicit_feedback_content ON implicit_feedback(content_id, action);
CREATE INDEX idx_implicit_feedback_user ON implicit_feedback(user_id, created_at DESC);
```

---

## Section 6 — Vibe-Chain System

### vibe_chains

A chain is a linked sequence of Vibe-Snaps or Pulse entries where each entry responds to the previous.

```sql
CREATE TABLE vibe_chains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    head_content_id UUID NOT NULL,          -- the original snap/entry that started the chain
    head_content_type   VARCHAR(20) NOT NULL,
    entries         JSONB NOT NULL DEFAULT '[]',
    -- Structure: [
    --   { "content_id": "...", "content_type": "...", "user_id": "...",
    --     "city": "...", "country": "...", "added_at": "..." },
    --   ...
    -- ]
    geographic_arc  JSONB NOT NULL DEFAULT '[]',
    -- Structure: ["Seoul, KR", "Nairobi, KE", "Sao Paulo, BR", "Nashville, US"]
    entry_count     INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_chains_head ON vibe_chains(head_content_id);
CREATE INDEX idx_vibe_chains_entry_count ON vibe_chains(entry_count DESC);
```

---

## Section 7 — Monetization Tables

### cosmetics

Catalog of purchasable cosmetic items. No gameplay effect.

```sql
CREATE TABLE cosmetics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(500),
    category        VARCHAR(50) NOT NULL,   -- 'profile_border', 'notification_sound', 'post_aura', 'score_theme'
    price_usd_cents INTEGER NOT NULL,
    asset_url       VARCHAR(1000),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### cosmetic_purchases

```sql
CREATE TABLE cosmetic_purchases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    cosmetic_id     UUID NOT NULL REFERENCES cosmetics(id),
    price_paid_usd_cents    INTEGER NOT NULL,
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, cosmetic_id)   -- one purchase per user per item
);

CREATE INDEX idx_cosmetic_purchases_user ON cosmetic_purchases(user_id);
```

### sponsor_boosts

Records of Visibility Boosts distributed via Sponsored Pulses. A user claims one by watching the sponsor clip.

```sql
CREATE TABLE sponsor_boosts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES pulses(id),
    brand_id        UUID NOT NULL REFERENCES brands(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    boost_multiplier    NUMERIC(3,2) NOT NULL DEFAULT 1.5,  -- visibility weight multiplier
    used            BOOLEAN NOT NULL DEFAULT FALSE,
    used_at         TIMESTAMPTZ,

    UNIQUE (pulse_id, user_id)  -- one boost per user per sponsored pulse
);

CREATE INDEX idx_sponsor_boosts_pulse_user ON sponsor_boosts(pulse_id, user_id);
```

---

## Section 8 — Moderation and Safety

### content_reports

User-submitted reports against Vibe-Snaps, Pulse Entries, Messages, or other users.

```sql
CREATE TABLE content_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id    UUID NOT NULL REFERENCES users(id),
    reported_content_id UUID,               -- NULL if reporting a user directly
    reported_user_id    UUID REFERENCES users(id),
    content_type    VARCHAR(20),
    reason          VARCHAR(50) NOT NULL,   -- 'illegal', 'explicit', 'harassment', 'spam', 'other'
    details         TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'reviewed', 'actioned', 'dismissed'
    reviewed_by     VARCHAR(100),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_reports_status ON content_reports(status, created_at);
CREATE INDEX idx_content_reports_reported_user ON content_reports(reported_user_id);
```

### user_blocks

```sql
CREATE TABLE user_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_user_id UUID NOT NULL REFERENCES users(id),
    blocked_user_id UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (blocker_user_id, blocked_user_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_user_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_user_id);
```

---

## Redis Key Reference

All ephemeral state that requires sub-millisecond access. Nothing here is the source of truth — all data is either derived from PostgreSQL or written back to it on a schedule.

```
# Active Pulse state
pulse:active:{region_wave}
  Type: Hash
  Fields: pulse_id, prompt_text, submission_closes_at, voting_closes_at
  TTL: voting_closes_at

# Pulse leaderboards (global, national, city)
pulse:{pulse_id}:votes:global
pulse:{pulse_id}:votes:{country_code}
pulse:{pulse_id}:votes:{country_code}:{city_slug}
  Type: Sorted Set (ZADD entry_id score=vote_count)
  TTL: voting_closes_at + 1 hour buffer
  Flush to PostgreSQL: every 10 seconds + final flush at voting_closes_at

# Pressure Gauge (global activity velocity)
pressure:gauge:global
  Type: String (float)
  Updated: on every Vibe-Snap submission
  Read: by all connected clients for UI state

# Vibe-Cluster live heat
cluster:{cluster_id}:heat
  Type: String (float)
  Updated: on every Vibe-Snap assignment to the cluster
  Decay: applied by scheduled job every 30 minutes

# Seed similarity buckets (approximate match grouping for Seed detection)
seed:bucket:{embedding_bucket_key}
  Type: Set (member = vibe_snap_id)
  TTL: 7 days

# Rate limiting
ratelimit:vibe_snaps:{user_id}:{date}
  Type: String (integer counter)
  TTL: until end of calendar day UTC
  Limit: 20 (F4 baseline)

# SynchLink matching queue (pending candidate pairs)
synchlink:candidates
  Type: List (JSON objects)
  Consumer: Synch-Link detection worker

# Session state / auth tokens
session:{user_id}
  Type: Hash
  TTL: per auth policy

# WebSocket subscription registry
ws:pulse:{pulse_id}:subscribers
  Type: Set (member = connection_id)
  TTL: voting_closes_at
```

---

## Background Jobs Summary

The following async jobs are required. They run independently of the main API server.

| Job | Trigger | Action |
|---|---|---|
| vote_flush | Every 10 seconds | Sync Redis vote sorted sets to PostgreSQL pulse_entries.vote_count |
| leaderboard_resolve | voting_closes_at reached | Compute final ranks, create Trophies, update Sosh Scores |
| mosaic_generate | voting_closes_at reached | Run Narrative Arc Engine, create Mosaic record |
| heat_decay | Every 30 minutes | Apply decay formula to all active Vibe-Cluster heat values |
| seed_check | On each Vibe-Snap assignment | Check if any Seed has reached threshold (F7: 50), promote to cluster |
| sosh_score_refresh | On Trophy/TideRider/Echo events | Recompute and update sosh_score_snapshots |
| synchlink_expire | Every 15 minutes | Mark expired SynchLinks/DMThreads as inactive |
| pioneer_decay | Daily | Apply decay to inactive Pioneer role holders |
| tide_rider_evaluate | On Vibe-Cluster peak detection | Calculate and award Tide-Rider bonuses |

---

## Migrations Strategy

All schema changes are managed via sequential migration files. Numbering format: `0001_initial_schema.sql`, `0002_add_X.sql`, etc. Never modify existing migrations — always add new ones.

The initial migration creates all tables defined in this document. Tables are created in dependency order (no forward references).

---

*Next document: STACK.md (technology selection based on requirements surfaced by this schema). The schema has confirmed the following hard requirements: Redis sorted sets, PostgreSQL with PostGIS, a separate async Python ML service, and WebSocket support in the API layer.*
