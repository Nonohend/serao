-- =============================================================================
-- Mon Coloc IA — Migration v2
-- Ajoute : catégories d'inventaire (maison entière) + journal d'activités.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- Pré-requis : migration.sql déjà exécutée.
-- =============================================================================

-- 1) Catégorie sur l'inventaire (frigo, epicerie, hygiene, menage, autre).
ALTER TABLE public.inventaire_courses
  ADD COLUMN IF NOT EXISTS categorie VARCHAR(50) NOT NULL DEFAULT 'frigo';

CREATE INDEX IF NOT EXISTS idx_inventaire_categorie
  ON public.inventaire_courses(categorie);

-- 2) Journal d'activités — pour que le coloc IA connaisse la vie de
--    l'utilisateur (sorties, sport, cuisine, projets…).
CREATE TABLE IF NOT EXISTS public.journal_activites (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID REFERENCES auth.users NOT NULL,
    description    TEXT NOT NULL,
    date_activite  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activites_user
  ON public.journal_activites(user_id);

ALTER TABLE public.journal_activites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activites_all_own" ON public.journal_activites;
CREATE POLICY "activites_all_own" ON public.journal_activites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
