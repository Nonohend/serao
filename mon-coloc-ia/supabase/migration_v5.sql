-- =============================================================================
-- Mon Coloc IA — Migration v5
-- Ajoute : les projets (business) et leur lien avec dépenses & entrées.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- Pré-requis : migrations v1 à v4 déjà exécutées.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.projets (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID REFERENCES auth.users NOT NULL,
    nom          VARCHAR(120) NOT NULL,
    description  TEXT,
    statut       VARCHAR(20) NOT NULL DEFAULT 'actif', -- 'actif', 'termine', 'pause'
    cree_le      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projets_user ON public.projets(user_id);

ALTER TABLE public.projets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projets_all_own" ON public.projets;
CREATE POLICY "projets_all_own" ON public.projets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Lien projet sur les dépenses et les entrées d'argent.
ALTER TABLE public.depenses
  ADD COLUMN IF NOT EXISTS projet_id UUID REFERENCES public.projets(id) ON DELETE SET NULL;

ALTER TABLE public.revenus
  ADD COLUMN IF NOT EXISTS projet_id UUID REFERENCES public.projets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_depenses_projet ON public.depenses(projet_id);
CREATE INDEX IF NOT EXISTS idx_revenus_projet ON public.revenus(projet_id);

-- =============================================================================
-- FIN
-- =============================================================================
