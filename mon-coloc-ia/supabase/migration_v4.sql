-- =============================================================================
-- Mon Coloc IA — Migration v4
-- Ajoute : les objectifs d'épargne (réserves virtuelles sur le solde).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- Pré-requis : migrations v1 à v3 déjà exécutées.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.objectifs (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES auth.users NOT NULL,
    nom             VARCHAR(120) NOT NULL,
    montant_cible   NUMERIC NOT NULL,
    montant_actuel  NUMERIC NOT NULL DEFAULT 0,
    echeance        DATE,
    cree_le         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objectifs_user ON public.objectifs(user_id);

ALTER TABLE public.objectifs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objectifs_all_own" ON public.objectifs;
CREATE POLICY "objectifs_all_own" ON public.objectifs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
