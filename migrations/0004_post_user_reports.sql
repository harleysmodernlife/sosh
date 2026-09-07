CREATE TABLE IF NOT EXISTS public.post_reports (
    post_id     UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reason      VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, reported_by)
);

CREATE TABLE IF NOT EXISTS public.user_reports (
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reason      VARCHAR(200),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, reported_by)
);
