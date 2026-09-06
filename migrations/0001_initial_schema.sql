-- =============================================================================
-- Sösh — Migration 0001: Initial Schema
-- =============================================================================
-- All tables are created here. The v0.1 API touches a subset only.
-- See MVP.md for which tables are active in v0.1.
-- See SCHEMA.md for full documentation of every table and field.
--
-- Run via Supabase CLI:
--   supabase db push
-- Or directly against local dev:
--   psql $DATABASE_URL -f migrations/0001_initial_schema.sql
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;        -- geospatial types and functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid() on older PG versions

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

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

-- =============================================================================
-- SECTION 1: USERS AND ROLES
-- =============================================================================

-- Application user profile. id matches auth.users(id) from Supabase Auth.
-- Row is auto-created by the handle_new_user() trigger below.
CREATE TABLE public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        VARCHAR(30) UNIQUE,
    display_name    VARCHAR(60),
    city            VARCHAR(100),
    country         VARCHAR(2),             -- ISO 3166-1 alpha-2
    region_wave     pulse_region_wave,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ             -- soft delete
);

CREATE INDEX idx_users_country ON public.users(country);
CREATE INDEX idx_users_region_wave ON public.users(region_wave);
CREATE INDEX idx_users_username ON public.users(username);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;


-- Special role assignments: pioneer, trend_scout, ambassador
CREATE TABLE public.user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role            user_role NOT NULL,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by      VARCHAR(50),            -- 'system', 'admin', or granting user_id
    decay_factor    NUMERIC(3,2) DEFAULT 1.0,
    active          BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role) WHERE active = TRUE;


-- Denormalized Sösh Score. Source of truth is the event tables.
-- Updated by background job on each score-affecting event.
-- v0.1: championship_score only (trophy_count * 10). Other components are 0.
CREATE TABLE public.sosh_score_snapshots (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    total_score                 INTEGER NOT NULL DEFAULT 0,
    championship_score          INTEGER NOT NULL DEFAULT 0,   -- 40% weight (future)
    trend_discovery_score       INTEGER NOT NULL DEFAULT 0,   -- 35% weight (future, v0.2)
    community_signal_score      INTEGER NOT NULL DEFAULT 0,   -- 25% weight (future, v0.2)
    pioneer_floor               INTEGER NOT NULL DEFAULT 0,
    last_computed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sosh_score_total ON public.sosh_score_snapshots(total_score DESC);


-- =============================================================================
-- SECTION 2: PULSES
-- =============================================================================

CREATE TABLE public.brands (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(200) NOT NULL,
    country_of_origin   VARCHAR(2),
    contact_email       VARCHAR(255),
    founding_partner    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Note: mosaic_id FK is added after mosaics table is created (see bottom of file).
CREATE TABLE public.pulses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_text             VARCHAR(500) NOT NULL,
    type                    pulse_type NOT NULL DEFAULT 'standard',
    region_wave             pulse_region_wave NOT NULL,
    brand_id                UUID REFERENCES public.brands(id),
    start_time              TIMESTAMPTZ NOT NULL,
    submission_closes_at    TIMESTAMPTZ NOT NULL,   -- start_time + 15 minutes
    voting_closes_at        TIMESTAMPTZ NOT NULL,   -- submission_closes_at + 2 hours
    mosaic_id               UUID,                   -- FK constraint added below
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulses_region_wave ON public.pulses(region_wave);
CREATE INDEX idx_pulses_start_time ON public.pulses(start_time DESC);
CREATE INDEX idx_pulses_brand_id ON public.pulses(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX idx_pulses_active ON public.pulses(submission_closes_at)
    WHERE voting_closes_at > NOW();


-- HIGH WRITE during Pulse windows.
-- vote_count is DENORMALIZED — written via Redis sorted set, flushed every 10s.
-- The votes table is the audit log.
CREATE TABLE public.pulse_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    media_url       VARCHAR(1000),           -- NULL until background upload completes
    media_type      media_type NOT NULL,
    text_content    VARCHAR(280),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    region          VARCHAR(2),              -- ISO country code at submission time
    city            VARCHAR(100),
    status          entry_status NOT NULL DEFAULT 'pending',
    filter_result   filter_result NOT NULL DEFAULT 'pending',
    vote_count      INTEGER NOT NULL DEFAULT 0,   -- DENORMALIZED (see Redis strategy)
    city_rank       INTEGER,
    national_rank   INTEGER,
    global_rank     INTEGER,

    UNIQUE (pulse_id, user_id)
);

CREATE INDEX idx_pulse_entries_pulse_id ON public.pulse_entries(pulse_id);
CREATE INDEX idx_pulse_entries_user_id ON public.pulse_entries(user_id);
CREATE INDEX idx_pulse_entries_leaderboard ON public.pulse_entries(pulse_id, vote_count DESC)
    WHERE status = 'active';
CREATE INDEX idx_pulse_entries_regional ON public.pulse_entries(pulse_id, region, vote_count DESC)
    WHERE status = 'active';


-- Individual vote audit log.
-- Actual vote counts live in Redis sorted sets, flushed to pulse_entries.vote_count.
CREATE TABLE public.votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    entry_id        UUID NOT NULL REFERENCES public.pulse_entries(id) ON DELETE CASCADE,
    voter_user_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    voted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (entry_id, voter_user_id)
);

CREATE INDEX idx_votes_entry_id ON public.votes(entry_id);
CREATE INDEX idx_votes_voter_user_id ON public.votes(voter_user_id);
CREATE INDEX idx_votes_pulse_id ON public.votes(pulse_id);


-- Permanent Cultural Passport entries. One per Pulse win per user.
CREATE TABLE public.trophies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pulse_id            UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    entry_id            UUID NOT NULL REFERENCES public.pulse_entries(id) ON DELETE CASCADE,
    title               trophy_title NOT NULL,
    scope_label         VARCHAR(100) NOT NULL,
    final_vote_count    INTEGER NOT NULL,
    awarded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trophies_user_id ON public.trophies(user_id);
CREATE INDEX idx_trophies_pulse_id ON public.trophies(pulse_id);
CREATE INDEX idx_trophies_awarded_at ON public.trophies(awarded_at DESC);


-- Final resolved leaderboard per scope per Pulse. Stored as snapshot.
CREATE TABLE public.leaderboard_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    scope           VARCHAR(20) NOT NULL,   -- 'global', 'national', 'city'
    scope_label     VARCHAR(100) NOT NULL,
    ranked_entries  JSONB NOT NULL,
    -- [{ entry_id, user_id, vote_count, rank, city, region }]
    resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (pulse_id, scope, scope_label)
);

CREATE INDEX idx_leaderboard_results_pulse_id ON public.leaderboard_results(pulse_id);


-- Baked by Narrative Arc Engine after voting closes.
-- v0.1: simple ranked list. v0.2+: documentary sequence.
CREATE TABLE public.mosaics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id            UUID NOT NULL UNIQUE REFERENCES public.pulses(id) ON DELETE CASCADE,
    narrative_sequence  JSONB NOT NULL,
    -- v0.1 structure: [{ entry_id, user_id, region, city, vote_count, rank }]
    -- v0.2 structure: adds narrative_position field
    published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Deferred FK: pulses.mosaic_id → mosaics(id)
-- Added here after mosaics table exists.
ALTER TABLE public.pulses
    ADD CONSTRAINT fk_pulses_mosaic_id
    FOREIGN KEY (mosaic_id) REFERENCES public.mosaics(id) ON DELETE SET NULL;


-- =============================================================================
-- SECTION 3: VIBE-CLUSTER SYSTEM (v0.2 — tables exist, API inactive in v0.1)
-- =============================================================================

CREATE TABLE public.vibe_clusters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100),
    proposed_names      JSONB,
    heat_level          NUMERIC(5,2) NOT NULL DEFAULT 0,
    contributor_count   INTEGER NOT NULL DEFAULT 0,
    trend_velocity      NUMERIC(5,2) NOT NULL DEFAULT 0,
    originator_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    top_content_ids     JSONB,
    geographic_spread   JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_clusters_heat ON public.vibe_clusters(heat_level DESC);
CREATE INDEX idx_vibe_clusters_created ON public.vibe_clusters(created_at DESC);


CREATE TABLE public.vibe_snaps (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    media_url               VARCHAR(1000),
    media_type              media_type NOT NULL,
    text_content            VARCHAR(280),
    capture_timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location_type           location_type NOT NULL DEFAULT 'unknown',
    location_country        VARCHAR(2),
    location_city           VARCHAR(100),
    location_point          GEOMETRY(Point, 4326),  -- binned ~1km, not precise GPS
    device_orientation      VARCHAR(20),
    imu_stillness_score     NUMERIC(3,2),
    imu_fidget_score        NUMERIC(3,2),
    imu_scroll_velocity     VARCHAR(10),
    assigned_cluster_id     UUID REFERENCES public.vibe_clusters(id) ON DELETE SET NULL,
    seed_flag               BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score        NUMERIC(3,2),
    tide_rider_eligible     BOOLEAN NOT NULL DEFAULT FALSE,
    cluster_rank_at_post    INTEGER,
    originator_flag         BOOLEAN NOT NULL DEFAULT FALSE,
    status                  entry_status NOT NULL DEFAULT 'pending',
    filter_result           filter_result NOT NULL DEFAULT 'pending',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_snaps_user_id ON public.vibe_snaps(user_id);
CREATE INDEX idx_vibe_snaps_cluster ON public.vibe_snaps(assigned_cluster_id, capture_timestamp DESC)
    WHERE status = 'active';
CREATE INDEX idx_vibe_snaps_seeds ON public.vibe_snaps(seed_flag, capture_timestamp DESC)
    WHERE seed_flag = TRUE AND status = 'active';
CREATE INDEX idx_vibe_snaps_location ON public.vibe_snaps USING GIST(location_point);


CREATE TABLE public.seeds (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    first_vibe_snap_id      UUID NOT NULL REFERENCES public.vibe_snaps(id) ON DELETE CASCADE,
    similar_snap_ids        JSONB NOT NULL DEFAULT '[]',
    similar_count           INTEGER NOT NULL DEFAULT 1,
    threshold               INTEGER NOT NULL DEFAULT 50,
    promoted                BOOLEAN NOT NULL DEFAULT FALSE,
    promoted_cluster_id     UUID REFERENCES public.vibe_clusters(id) ON DELETE SET NULL,
    trend_scout_surfaced    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_at             TIMESTAMPTZ
);

CREATE INDEX idx_seeds_similar_count ON public.seeds(similar_count DESC) WHERE promoted = FALSE;
CREATE INDEX idx_seeds_first_user ON public.seeds(first_user_id);


CREATE TABLE public.tide_rider_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    cluster_id              UUID NOT NULL REFERENCES public.vibe_clusters(id) ON DELETE CASCADE,
    vibe_snap_id            UUID NOT NULL REFERENCES public.vibe_snaps(id) ON DELETE CASCADE,
    post_timestamp          TIMESTAMPTZ NOT NULL,
    cluster_rank_at_post    INTEGER NOT NULL,
    cluster_peak_rank       INTEGER NOT NULL,
    diversity_multiplier    NUMERIC(3,2) NOT NULL,
    base_bonus              INTEGER NOT NULL,
    final_bonus             INTEGER NOT NULL,
    awarded_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tide_rider_events_user_id ON public.tide_rider_events(user_id);
CREATE INDEX idx_tide_rider_events_cluster_id ON public.tide_rider_events(cluster_id);


-- =============================================================================
-- SECTION 4: SYNCH-LINK SYSTEM (v0.2 — tables exist, API inactive in v0.1)
-- =============================================================================

-- user_a_id is always the lexicographically smaller UUID to prevent duplicate links.
CREATE TABLE public.synch_links (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_b_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    trigger_type            VARCHAR(20) NOT NULL CHECK (trigger_type IN ('pulse_entry', 'vibe_snap')),
    trigger_content_a_id    UUID NOT NULL,
    trigger_content_b_id    UUID NOT NULL,
    similarity_score        NUMERIC(4,3) NOT NULL,
    threshold_at_creation   NUMERIC(4,3) NOT NULL,
    stage                   synch_link_stage NOT NULL DEFAULT 'shared_space',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_at               TIMESTAMPTZ NOT NULL,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (user_a_id, user_b_id, trigger_content_a_id),
    CHECK (user_a_id < user_b_id)   -- enforce ordering to prevent duplicates
);

CREATE INDEX idx_synch_links_user_a ON public.synch_links(user_a_id) WHERE active = TRUE;
CREATE INDEX idx_synch_links_user_b ON public.synch_links(user_b_id) WHERE active = TRUE;
CREATE INDEX idx_synch_links_expiry ON public.synch_links(expiry_at) WHERE active = TRUE;


CREATE TABLE public.shared_space_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id   UUID NOT NULL REFERENCES public.synch_links(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action          VARCHAR(30) NOT NULL CHECK (action IN ('view', 'emoji_react', 'prompt_respond')),
    content         VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shared_space_events_link ON public.shared_space_events(synch_link_id);
CREATE INDEX idx_shared_space_events_user ON public.shared_space_events(synch_link_id, user_id);


CREATE TABLE public.parallel_echoes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id           UUID NOT NULL UNIQUE REFERENCES public.synch_links(id) ON DELETE CASCADE,
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
    user_a_shared_to_feed   BOOLEAN NOT NULL DEFAULT FALSE,
    user_b_shared_to_feed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parallel_echoes_link ON public.parallel_echoes(synch_link_id);


-- Stores verification result booleans only. No document data ever stored here.
CREATE TABLE public.verification_statuses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    provider        verification_provider,
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at     TIMESTAMPTZ,
    age_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    under_18        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE public.dm_threads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id       UUID NOT NULL UNIQUE REFERENCES public.synch_links(id) ON DELETE CASCADE,
    user_a_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_b_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_at           TIMESTAMPTZ NOT NULL,
    active              BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_dm_threads_user_a ON public.dm_threads(user_a_id) WHERE active = TRUE;
CREATE INDEX idx_dm_threads_user_b ON public.dm_threads(user_b_id) WHERE active = TRUE;
CREATE INDEX idx_dm_threads_expiry ON public.dm_threads(expiry_at) WHERE active = TRUE;


CREATE TABLE public.messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_type    media_type NOT NULL,
    content         TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_messages_thread_id ON public.messages(thread_id, sent_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);


-- =============================================================================
-- SECTION 5: IMPLICIT FEEDBACK (partitioned by month)
-- =============================================================================

-- This will be the largest table at scale. Monthly partitioning from day one.
CREATE TABLE public.implicit_feedback (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_id      UUID NOT NULL,
    content_type    VARCHAR(20) NOT NULL CHECK (content_type IN ('vibe_snap', 'pulse_entry', 'parallel_echo')),
    action          feedback_action NOT NULL,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Initial partitions. Add new monthly partitions before the month starts.
-- TODO: set up a cron job or Supabase function to auto-create future partitions.
CREATE TABLE public.implicit_feedback_2026_09
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE public.implicit_feedback_2026_10
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE public.implicit_feedback_2026_11
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE public.implicit_feedback_2026_12
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

CREATE TABLE public.implicit_feedback_2027_01
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE public.implicit_feedback_2027_02
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE public.implicit_feedback_2027_03
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE public.implicit_feedback_2027_04
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE public.implicit_feedback_2027_05
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE public.implicit_feedback_2027_06
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE public.implicit_feedback_2027_07
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE public.implicit_feedback_2027_08
    PARTITION OF public.implicit_feedback
    FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE INDEX idx_implicit_feedback_content ON public.implicit_feedback(content_id, action);
CREATE INDEX idx_implicit_feedback_user ON public.implicit_feedback(user_id, created_at DESC);


-- =============================================================================
-- SECTION 6: VIBE-CHAINS (v0.2)
-- =============================================================================

CREATE TABLE public.vibe_chains (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    head_content_id     UUID NOT NULL,
    head_content_type   VARCHAR(20) NOT NULL CHECK (head_content_type IN ('vibe_snap', 'pulse_entry')),
    entries             JSONB NOT NULL DEFAULT '[]',
    -- [{ content_id, content_type, user_id, city, country, added_at }]
    geographic_arc      JSONB NOT NULL DEFAULT '[]',
    -- ["Seoul, KR", "Nairobi, KE", "Nashville, US"]
    entry_count         INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_chains_head ON public.vibe_chains(head_content_id);
CREATE INDEX idx_vibe_chains_entry_count ON public.vibe_chains(entry_count DESC);


-- =============================================================================
-- SECTION 7: MONETIZATION (v0.2+)
-- =============================================================================

CREATE TABLE public.cosmetics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(500),
    category        VARCHAR(50) NOT NULL CHECK (category IN (
                        'profile_border', 'notification_sound',
                        'post_aura', 'score_theme'
                    )),
    price_usd_cents INTEGER NOT NULL,
    asset_url       VARCHAR(1000),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE public.cosmetic_purchases (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    cosmetic_id             UUID NOT NULL REFERENCES public.cosmetics(id),
    price_paid_usd_cents    INTEGER NOT NULL,
    purchased_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, cosmetic_id)
);

CREATE INDEX idx_cosmetic_purchases_user ON public.cosmetic_purchases(user_id);


CREATE TABLE public.sponsor_boosts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id            UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    brand_id            UUID NOT NULL REFERENCES public.brands(id),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claimed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    boost_multiplier    NUMERIC(3,2) NOT NULL DEFAULT 1.5,
    used                BOOLEAN NOT NULL DEFAULT FALSE,
    used_at             TIMESTAMPTZ,

    UNIQUE (pulse_id, user_id)
);

CREATE INDEX idx_sponsor_boosts_pulse_user ON public.sponsor_boosts(pulse_id, user_id);


-- =============================================================================
-- SECTION 8: MODERATION AND SAFETY
-- =============================================================================

CREATE TABLE public.content_reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reported_content_id     UUID,
    reported_user_id        UUID REFERENCES public.users(id) ON DELETE CASCADE,
    content_type            VARCHAR(20),
    reason                  VARCHAR(50) NOT NULL CHECK (reason IN (
                                'illegal', 'explicit', 'harassment', 'spam', 'other'
                            )),
    details                 TEXT,
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
                                'pending', 'reviewed', 'actioned', 'dismissed'
                            )),
    reviewed_by             VARCHAR(100),
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_reports_status ON public.content_reports(status, created_at);
CREATE INDEX idx_content_reports_reported_user ON public.content_reports(reported_user_id);


CREATE TABLE public.user_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id != blocked_user_id)
);

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks(blocker_user_id);
CREATE INDEX idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);


-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Auto-create user profile, score snapshot, and verification status rows
-- when a new Supabase Auth user registers.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, created_at)
    VALUES (NEW.id, NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.sosh_score_snapshots (
        user_id, total_score, championship_score,
        trend_discovery_score, community_signal_score, pioneer_floor
    )
    VALUES (NEW.id, 0, 0, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.verification_statuses (
        user_id, verified, age_verified, under_18
    )
    VALUES (NEW.id, FALSE, FALSE, FALSE)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Update last_active_at on users whenever their score snapshot is refreshed.
CREATE OR REPLACE FUNCTION public.update_user_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.users
    SET last_active_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_score_update_last_active
    AFTER UPDATE ON public.sosh_score_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.update_user_last_active();


-- =============================================================================
-- END OF MIGRATION 0001
-- =============================================================================
-- Tables active in v0.1 API:
--   users, user_roles, sosh_score_snapshots, brands, pulses,
--   pulse_entries, votes, trophies, leaderboard_results, mosaics,
--   content_reports, user_blocks
--
-- Tables present but inactive until v0.2+:
--   vibe_clusters, vibe_snaps, seeds, tide_rider_events,
--   synch_links, shared_space_events, parallel_echoes,
--   verification_statuses, dm_threads, messages,
--   implicit_feedback, vibe_chains, cosmetics,
--   cosmetic_purchases, sponsor_boosts
-- =============================================================================
