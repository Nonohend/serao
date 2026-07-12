-- =============================================================================
-- Mon Coloc IA — Migration v3
-- Ajoute : les entrées d'argent (revenus irréguliers / business).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- Pré-requis : migration.sql et migration_v2.sql déjà exécutées.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.revenus (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES auth.users NOT NULL,
    montant         NUMERIC NOT NULL,
    source          VARCHAR(100),
    description     TEXT,
    date_reception  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenus_user ON public.revenus(user_id);
CREATE INDEX IF NOT EXISTS idx_revenus_date ON public.revenus(date_reception);

ALTER TABLE public.revenus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenus_all_own" ON public.revenus;
CREATE POLICY "revenus_all_own" ON public.revenus
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
