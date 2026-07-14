-- =============================================
-- SERAO Migration v10 — Réparation KYC + durcissement sécurité
-- (déjà appliquée automatiquement le 2026-07-14 — gardée ici pour trace)
--
-- Constat : schema_v5 n'avait jamais été appliqué entièrement en production.
-- Il manquait : profiles.kyc_statut, la table kyc_demandes, le bucket
-- kyc-documents et les RPC admin. Le flux de vérification d'identité était
-- donc cassé (upload impossible, statut jamais lu).
-- Cette migration ré-applique schema_v5 (idempotent) puis durcit la sécurité
-- selon les advisors Supabase.
-- =============================================

-- 1) Ré-exécuter schema_v5.sql en entier (idempotent) si ce n'est pas fait.

-- 2) Durcissement : les RPC sensibles ne doivent pas être appelables par anon
REVOKE EXECUTE ON FUNCTION public.create_order(bigint,text,text,double precision,double precision,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.open_order_dispute(text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upload_payment_proof(text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_kyc(text,text,text,text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_user_rating(uuid,integer,text,text,text) FROM anon;

-- 3) Les fonctions trigger n'ont pas besoin d'être exposées via l'API REST
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_user_rating() FROM anon, authenticated;

-- 4) Bucket public product-photos : supprimer les policies SELECT trop larges
--    qui permettaient de LISTER tous les fichiers du bucket. L'accès aux
--    objets via URL publique reste fonctionnel (bucket public).
DROP POLICY IF EXISTS "allow_public_select" ON storage.objects;
DROP POLICY IF EXISTS "product photos public read" ON storage.objects;

-- 5) À activer À LA MAIN dans le dashboard (pas possible en SQL) :
--    Authentication → Settings → « Leaked password protection » (HaveIBeenPwned)
