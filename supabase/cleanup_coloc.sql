-- =============================================================================
-- SERAO — Nettoyage des tables « Mon Coloc IA »
--
-- CONTEXTE : les migrations de Mon Coloc IA avaient été exécutées par erreur
-- dans la base SERAO. Le projet Mon Coloc IA possède maintenant sa propre
-- base Supabase (projet « Mon coloc IA »).
--
-- ⚠️  À EXÉCUTER UNIQUEMENT APRÈS avoir :
--   1. Exécuté mon-coloc-ia/supabase/migration_complete.sql dans le projet
--      Supabase « Mon coloc IA »
--   2. Mis à jour les variables d'environnement Vercel de Mon Coloc IA
--      (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
--       SUPABASE_SERVICE_ROLE_KEY) vers le nouveau projet
--   3. Vérifié que l'app Mon Coloc IA fonctionne sur sa nouvelle base
--
-- À coller dans Supabase (projet SERAO) → SQL Editor → Run.
-- =============================================================================

-- Trigger + fonction d'inscription du coloc
DROP TRIGGER IF EXISTS on_auth_user_created_coloc ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_coloc();

-- Tables du coloc (l'ordre respecte les clés étrangères)
DROP TABLE IF EXISTS public.push_subscriptions;
DROP TABLE IF EXISTS public.journal_activites;
DROP TABLE IF EXISTS public.inventaire_courses;
DROP TABLE IF EXISTS public.objectifs;
DROP TABLE IF EXISTS public.depenses;
DROP TABLE IF EXISTS public.revenus;
DROP TABLE IF EXISTS public.projets;
DROP TABLE IF EXISTS public.profil_utilisateur;

-- =============================================================================
-- FIN — la base SERAO ne contient plus que les tables du marketplace.
-- =============================================================================
