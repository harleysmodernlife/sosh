-- In-app notification inbox
CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type        VARCHAR(30) NOT NULL,  -- 'like', 'comment', 'follow', 'pulse', 'trophy', 'results', 'milestone'
    actor_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- who triggered it
    post_id     UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    pulse_id    UUID REFERENCES public.pulses(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id, created_at DESC);
