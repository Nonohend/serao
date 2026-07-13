-- =============================================================================
-- Mon Coloc IA — Migration v6
-- Ajoute : le solde de départ (recalage du solde réel sans toucher à
-- l'historique — utile quand on saisit a posteriori de vieilles opérations).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- =============================================================================

ALTER TABLE public.profil_utilisateur
  ADD COLUMN IF NOT EXISTS solde_initial NUMERIC NOT NULL DEFAULT 0;

-- =============================================================================
-- FIN
-- =============================================================================
