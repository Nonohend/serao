-- =============================================================================
-- Mon Coloc IA — Migration v7
-- Ajoute : les abonnements aux notifications push (Web Push).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users NOT NULL,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    cree_le     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_all_own" ON public.push_subscriptions;
CREATE POLICY "push_all_own" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
