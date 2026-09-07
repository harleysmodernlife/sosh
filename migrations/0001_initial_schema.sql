-- =============================================================================
-- Sösh — Migration 0001: Initial Schema
-- =============================================================================
-- All tables are created here. The v0.1 API touches a subset only.
-- See MVP.md for which tables are active in v0.1.
-- See SCHEMA.md for full documentation of every table and field.
--
-- Run via Supabase SQL Editor or:
--   psql $DATABASE_URL_SYNC -f migrations/0001_initial_schema.sql
-- =============================================================================

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
CREATE TYPE user_role AS ENUM ('pioneer', 'trend_scout', 'ambassador', 'admin');
CREATE TYPE location_type AS ENUM (
    'residential', 'commercial', 'transit',
    'outdoor', 'unknown'
);
CREATE TYPE pulse_region_wave AS ENUM ('asia_pacific', 'emea', 'americas');

-- =============================================================================
-- SECTION 1: USERS AND ROLES
-- =============================================================================

CREATE TABLE public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username        VARCHAR(30) UNIQUE,
    display_name    VARCHAR(60),
    city            VARCHAR(100),
    country_code    VARCHAR(2),             -- ISO 3166-1 alpha-2
    region_wave     pulse_region_wave,
    push_token      VARCHAR(500),           -- Expo push token
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_users_country_code ON public.users(country_code);
CREATE INDEX idx_users_region_wave ON public.users(region_wave);
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_city ON public.users(city);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read any profile"
    ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE USING (auth.uid() = id);


CREATE TABLE public.user_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role        VARCHAR(30) NOT NULL,   -- 'admin', 'pioneer', 'trend_scout', 'ambassador'
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by  VARCHAR(50),
    active      BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role) WHERE active = TRUE;


-- Denormalized Sösh Score snapshot.
-- v0.1: score = trophy_count * 10. Other fields remain 0 until v0.2.
CREATE TABLE public.sosh_score_snapshots (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    score                   INTEGER NOT NULL DEFAULT 0,
    championship_score      INTEGER NOT NULL DEFAULT 0,
    trend_discovery_score   INTEGER NOT NULL DEFAULT 0,
    community_signal_score  INTEGER NOT NULL DEFAULT 0,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sosh_score ON public.sosh_score_snapshots(score DESC);


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


-- Note: mosaic_id FK is added after mosaics table is created (see bottom).
CREATE TABLE public.pulses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt              VARCHAR(500) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'voting', 'resolving', 'resolved')),
    type                pulse_type NOT NULL DEFAULT 'standard',
    region_wave         pulse_region_wave,
    city                VARCHAR(100),           -- scope for city-level Pulse
    country_code        VARCHAR(2),
    brand_id            UUID REFERENCES public.brands(id),
    submission_ends_at  TIMESTAMPTZ NOT NULL,
    voting_ends_at      TIMESTAMPTZ NOT NULL,
    mosaic_id           UUID,                   -- FK added below after mosaics created
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulses_status ON public.pulses(status);
CREATE INDEX idx_pulses_region_wave ON public.pulses(region_wave);
CREATE INDEX idx_pulses_created_at ON public.pulses(created_at DESC);
CREATE INDEX idx_pulses_city ON public.pulses(city) WHERE city IS NOT NULL;


-- HIGH WRITE during Pulse windows.
-- vote_count is DENORMALIZED — written via Redis sorted set, flushed every 10s.
CREATE TABLE public.pulse_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id            UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_type        VARCHAR(10) NOT NULL CHECK (content_type IN ('video', 'photo', 'text')),
    text_content        VARCHAR(140),
    media_url           VARCHAR(1000),
    media_key           VARCHAR(1000),          -- R2 object key
    moderation_status   VARCHAR(20) NOT NULL DEFAULT 'approved'
                            CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    city                VARCHAR(100),
    country_code        VARCHAR(2),
    vote_count          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (pulse_id, user_id)
);

CREATE INDEX idx_pulse_entries_pulse_id ON public.pulse_entries(pulse_id);
CREATE INDEX idx_pulse_entries_user_id ON public.pulse_entries(user_id);
CREATE INDEX idx_pulse_entries_leaderboard ON public.pulse_entries(pulse_id, vote_count DESC)
    WHERE moderation_status = 'approved';


-- Individual vote audit log.
CREATE TABLE public.votes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id    UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    entry_id    UUID NOT NULL REFERENCES public.pulse_entries(id) ON DELETE CASCADE,
    voter_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (entry_id, voter_id)
);

CREATE INDEX idx_votes_entry_id ON public.votes(entry_id);
CREATE INDEX idx_votes_voter_id ON public.votes(voter_id);
CREATE INDEX idx_votes_pulse_id ON public.votes(pulse_id);


-- Permanent Cultural Passport. One trophy per Pulse win per user.
CREATE TABLE public.trophies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pulse_id        UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    entry_id        UUID NOT NULL REFERENCES public.pulse_entries(id) ON DELETE CASCADE,
    title           VARCHAR(30) NOT NULL DEFAULT 'city_rep'
                        CHECK (title IN ('city_rep', 'national_rep', 'global_face')),
    city            VARCHAR(100),
    country_code    VARCHAR(2),
    vote_count      INTEGER NOT NULL DEFAULT 0,
    awarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (pulse_id, user_id)    -- one trophy per pulse per user
);

CREATE INDEX idx_trophies_user_id ON public.trophies(user_id);
CREATE INDEX idx_trophies_pulse_id ON public.trophies(pulse_id);
CREATE INDEX idx_trophies_awarded_at ON public.trophies(awarded_at DESC);


-- Final resolved leaderboard snapshot per Pulse.
CREATE TABLE public.leaderboard_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    entry_id        UUID NOT NULL REFERENCES public.pulse_entries(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rank            INTEGER NOT NULL,
    vote_count      INTEGER NOT NULL,
    city            VARCHAR(100),
    country_code    VARCHAR(2),
    scope           VARCHAR(20) NOT NULL DEFAULT 'city',
    resolved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (pulse_id, user_id, scope)
);

CREATE INDEX idx_leaderboard_results_pulse_id ON public.leaderboard_results(pulse_id);


-- Mosaic: top 20 entries after voting closes, stored as ordered array of entry UUIDs.
CREATE TABLE public.mosaics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id        UUID NOT NULL UNIQUE REFERENCES public.pulses(id) ON DELETE CASCADE,
    entry_ids       UUID[] NOT NULL DEFAULT '{}',
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Deferred FK: pulses.mosaic_id → mosaics(id)
ALTER TABLE public.pulses
    ADD CONSTRAINT fk_pulses_mosaic_id
    FOREIGN KEY (mosaic_id) REFERENCES public.mosaics(id) ON DELETE SET NULL;


-- =============================================================================
-- SECTION 3: VIBE-CLUSTER SYSTEM (v0.2 — tables exist, API inactive in v0.1)
-- =============================================================================

CREATE TABLE public.vibe_clusters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100),
    heat_level          NUMERIC(5,2) NOT NULL DEFAULT 0,
    contributor_count   INTEGER NOT NULL DEFAULT 0,
    trend_velocity      NUMERIC(5,2) NOT NULL DEFAULT 0,
    originator_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_clusters_heat ON public.vibe_clusters(heat_level DESC);


CREATE TABLE public.vibe_snaps (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    media_url           VARCHAR(1000),
    content_type        VARCHAR(10) NOT NULL CHECK (content_type IN ('video', 'photo', 'text')),
    text_content        VARCHAR(280),
    location_type       location_type NOT NULL DEFAULT 'unknown',
    location_country    VARCHAR(2),
    location_city       VARCHAR(100),
    location_point      GEOMETRY(Point, 4326),
    assigned_cluster_id UUID REFERENCES public.vibe_clusters(id) ON DELETE SET NULL,
    moderation_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_snaps_user_id ON public.vibe_snaps(user_id);
CREATE INDEX idx_vibe_snaps_cluster ON public.vibe_snaps(assigned_cluster_id, created_at DESC);
CREATE INDEX idx_vibe_snaps_location ON public.vibe_snaps USING GIST(location_point);


CREATE TABLE public.tide_rider_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    cluster_id          UUID NOT NULL REFERENCES public.vibe_clusters(id) ON DELETE CASCADE,
    vibe_snap_id        UUID NOT NULL REFERENCES public.vibe_snaps(id) ON DELETE CASCADE,
    cluster_rank_at_post INTEGER NOT NULL,
    final_bonus         INTEGER NOT NULL,
    awarded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tide_rider_events_user_id ON public.tide_rider_events(user_id);


-- =============================================================================
-- SECTION 4: SYNCH-LINK SYSTEM (v0.2 — tables exist, API inactive in v0.1)
-- =============================================================================

CREATE TABLE public.synch_links (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_b_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    trigger_type            VARCHAR(20) NOT NULL,
    similarity_score        NUMERIC(4,3) NOT NULL,
    stage                   synch_link_stage NOT NULL DEFAULT 'shared_space',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_at               TIMESTAMPTZ NOT NULL,
    active                  BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
);

CREATE INDEX idx_synch_links_user_a ON public.synch_links(user_a_id) WHERE active = TRUE;
CREATE INDEX idx_synch_links_user_b ON public.synch_links(user_b_id) WHERE active = TRUE;


CREATE TABLE public.parallel_echoes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    synch_link_id           UUID NOT NULL UNIQUE REFERENCES public.synch_links(id) ON DELETE CASCADE,
    prompt_text             VARCHAR(500) NOT NULL,
    user_a_response_url     VARCHAR(1000),
    user_a_text_content     VARCHAR(280),
    user_a_responded_at     TIMESTAMPTZ,
    user_b_response_url     VARCHAR(1000),
    user_b_text_content     VARCHAR(280),
    user_b_responded_at     TIMESTAMPTZ,
    both_responded          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


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


CREATE TABLE public.messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_type    VARCHAR(10) NOT NULL,
    content         TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_messages_thread_id ON public.messages(thread_id, sent_at DESC);


-- =============================================================================
-- SECTION 5: IMPLICIT FEEDBACK (partitioned by month)
-- =============================================================================

CREATE TABLE public.implicit_feedback (
    id              UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_id      UUID NOT NULL,
    content_type    VARCHAR(20) NOT NULL,
    action          feedback_action NOT NULL,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

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
    head_content_type   VARCHAR(20) NOT NULL,
    entries             JSONB NOT NULL DEFAULT '[]',
    entry_count         INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vibe_chains_head ON public.vibe_chains(head_content_id);


-- =============================================================================
-- SECTION 7: MONETIZATION (v0.2+)
-- =============================================================================

CREATE TABLE public.cosmetics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(500),
    category        VARCHAR(50) NOT NULL,
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

CREATE TABLE public.sponsor_boosts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pulse_id            UUID NOT NULL REFERENCES public.pulses(id) ON DELETE CASCADE,
    brand_id            UUID NOT NULL REFERENCES public.brands(id),
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    boost_multiplier    NUMERIC(3,2) NOT NULL DEFAULT 1.5,
    used                BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (pulse_id, user_id)
);


-- =============================================================================
-- SECTION 8: MODERATION AND SAFETY
-- =============================================================================

CREATE TABLE public.content_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    entry_id            UUID REFERENCES public.pulse_entries(id) ON DELETE CASCADE,
    reported_user_id    UUID REFERENCES public.users(id) ON DELETE CASCADE,
    reason              VARCHAR(50) NOT NULL,
    details             TEXT,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_reports_status ON public.content_reports(status, created_at);


CREATE TABLE public.user_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    blocked_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON public.user_blocks(blocked_id);


-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.sosh_score_snapshots (user_id, score, updated_at)
    VALUES (NEW.id, 0, NOW())
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.verification_statuses (user_id, verified, age_verified, under_18)
    VALUES (NEW.id, FALSE, FALSE, FALSE)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- END OF MIGRATION 0001
-- =============================================================================
-- Tables active in v0.1 API:
--   users, user_roles, sosh_score_snapshots, brands, pulses,
--   pulse_entries, votes, trophies, leaderboard_results, mosaics,
--   content_reports, user_blocks
--
-- Tables present but inactive until v0.2+:
--   vibe_clusters, vibe_snaps, tide_rider_events,
--   synch_links, parallel_echoes, verification_statuses,
--   dm_threads, messages, implicit_feedback, vibe_chains,
--   cosmetics, cosmetic_purchases, sponsor_boosts
-- =============================================================================
