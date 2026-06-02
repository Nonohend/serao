-- =============================================
-- SERAO Migration v5 — Vérification d'identité (KYC)
-- Ajoute :
--   K1  Colonne kyc_statut sur profiles
--   K2  Table kyc_demandes + RLS
--   K3  Bucket privé kyc-documents + policies storage
--   K4  RPC submit_kyc()       — côté vendeur
--   K5  RPC admin_list_kyc()   — côté admin
--   K6  RPC admin_review_kyc() — côté admin
-- Idempotent : peut être ré-exécuté sans danger.
-- À coller dans Supabase → SQL Editor → Run.
-- Pré-requis : schema_v4.sql déjà exécuté.
-- =============================================

-- ---------------------------------------------------------------
-- K1 — Colonne kyc_statut sur profiles
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_statut text
  NOT NULL DEFAULT 'non_soumis'
  CHECK (kyc_statut IN ('non_soumis','en_attente','approuve','rejete'));

-- Autoriser les membres à lire leur propre kyc_statut
-- (column-level grant, RLS empêche la lecture des autres en pratique)
GRANT SELECT (kyc_statut) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------
-- K2 — Table kyc_demandes
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kyc_demandes (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  vendeur_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statut          text        NOT NULL DEFAULT 'en_attente'
                              CHECK (statut IN ('en_attente','approuve','rejete')),
  doc_type        text        NOT NULL DEFAULT 'CIN'
                              CHECK (doc_type IN ('CIN','Passeport','Permis')),
  nin             text,
  nom_complet     text,
  date_naissance  text,
  cin_recto_path  text,
  cin_verso_path  text,
  selfie_path     text,
  motif_rejet     text,
  reviewed_by     uuid        REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_vendeur  ON public.kyc_demandes(vendeur_id);
CREATE INDEX IF NOT EXISTS idx_kyc_statut   ON public.kyc_demandes(statut);

ALTER TABLE public.kyc_demandes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.kyc_demandes TO authenticated;

-- Vendeur : lecture de ses propres demandes
DROP POLICY IF EXISTS "kyc_own_select" ON public.kyc_demandes;
CREATE POLICY "kyc_own_select" ON public.kyc_demandes
  FOR SELECT USING (auth.uid() = vendeur_id);

-- Admin : tout
DROP POLICY IF EXISTS "kyc_admin_all" ON public.kyc_demandes;
CREATE POLICY "kyc_admin_all" ON public.kyc_demandes
  FOR ALL USING (public.is_admin());

-- ---------------------------------------------------------------
-- K3 — Bucket privé kyc-documents + policies storage
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,               -- bucket PRIVÉ
  10485760,            -- 10 Mo max par fichier
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Vendeur : upload dans son propre dossier
DROP POLICY IF EXISTS "kyc_storage_upload" ON storage.objects;
CREATE POLICY "kyc_storage_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Vendeur : lire ses propres fichiers ; Admin : tout lire
DROP POLICY IF EXISTS "kyc_storage_read" ON storage.objects;
CREATE POLICY "kyc_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- Vendeur : supprimer ses propres fichiers
DROP POLICY IF EXISTS "kyc_storage_delete" ON storage.objects;
CREATE POLICY "kyc_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------
-- K4 — submit_kyc() : soumission côté vendeur
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_kyc(
  p_doc_type       text,
  p_nin            text,
  p_nom_complet    text,
  p_date_naissance text,
  p_cin_recto_path text,
  p_cin_verso_path text DEFAULT NULL,
  p_selfie_path    text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF p_doc_type NOT IN ('CIN','Passeport','Permis') THEN
    RAISE EXCEPTION 'Type de document invalide';
  END IF;

  -- Supprimer toute demande précédente non approuvée (retentative autorisée)
  DELETE FROM public.kyc_demandes
  WHERE vendeur_id = auth.uid() AND statut != 'approuve';

  -- Insérer la nouvelle demande
  INSERT INTO public.kyc_demandes (
    vendeur_id, doc_type, nin, nom_complet, date_naissance,
    cin_recto_path, cin_verso_path, selfie_path, statut
  ) VALUES (
    auth.uid(), p_doc_type, p_nin, p_nom_complet, p_date_naissance,
    p_cin_recto_path, p_cin_verso_path, p_selfie_path, 'en_attente'
  )
  RETURNING id INTO v_id;

  -- Mettre à jour le statut KYC sur le profil
  UPDATE public.profiles
     SET kyc_statut = 'en_attente', updated_at = now()
   WHERE id = auth.uid();

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_kyc(text,text,text,text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------
-- K5 — admin_list_kyc() : liste complète pour l'admin
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_kyc()
RETURNS TABLE(
  id              uuid,
  statut          text,
  doc_type        text,
  nin             text,
  nom_complet     text,
  date_naissance  text,
  cin_recto_path  text,
  cin_verso_path  text,
  selfie_path     text,
  motif_rejet     text,
  created_at      timestamptz,
  reviewed_at     timestamptz,
  vendeur_id      uuid,
  vendeur_nom     text,
  vendeur_email   text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    k.id, k.statut, k.doc_type, k.nin, k.nom_complet, k.date_naissance,
    k.cin_recto_path, k.cin_verso_path, k.selfie_path,
    k.motif_rejet, k.created_at, k.reviewed_at,
    k.vendeur_id, p.nom AS vendeur_nom, p.email AS vendeur_email
  FROM public.kyc_demandes k
  JOIN public.profiles p ON p.id = k.vendeur_id
  WHERE public.is_admin()
  ORDER BY
    CASE k.statut WHEN 'en_attente' THEN 0 ELSE 1 END,
    k.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_kyc() TO authenticated;

-- ---------------------------------------------------------------
-- K6 — admin_review_kyc() : approuver ou rejeter
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_kyc_id uuid,
  p_statut text,         -- 'approuve' ou 'rejete'
  p_motif  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vendeur_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF p_statut NOT IN ('approuve','rejete') THEN
    RAISE EXCEPTION 'Statut invalide : utiliser approuve ou rejete';
  END IF;

  SELECT vendeur_id INTO v_vendeur_id
    FROM public.kyc_demandes WHERE id = p_kyc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande KYC introuvable';
  END IF;

  UPDATE public.kyc_demandes
     SET statut      = p_statut,
         motif_rejet = CASE WHEN p_statut = 'rejete' THEN p_motif ELSE NULL END,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at  = now()
   WHERE id = p_kyc_id;

  UPDATE public.profiles
     SET kyc_statut = p_statut,
         updated_at = now()
   WHERE id = v_vendeur_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_review_kyc(uuid,text,text) TO authenticated;

-- =============================================
-- DONE
-- =============================================
