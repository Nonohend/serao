-- =============================================
-- SERAO Migration v8 — Politiques Storage bucket product-photos
-- Permet aux utilisateurs authentifiés d'uploader leurs fichiers
-- À exécuter dans Supabase → SQL Editor → Run
-- =============================================

-- S'assurer que le bucket est public
UPDATE storage.buckets SET public = true WHERE id = 'product-photos';

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "allow_auth_insert"    ON storage.objects;
DROP POLICY IF EXISTS "allow_auth_update"    ON storage.objects;
DROP POLICY IF EXISTS "allow_auth_delete"    ON storage.objects;
DROP POLICY IF EXISTS "allow_public_select"  ON storage.objects;

-- Lecture publique (tout le monde peut voir les fichiers)
CREATE POLICY "allow_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-photos');

-- Upload : utilisateur authentifié peut insérer dans son propre dossier
CREATE POLICY "allow_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-photos');

-- Suppression : chacun supprime ses propres fichiers
CREATE POLICY "allow_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-photos' AND owner = auth.uid());

-- =============================================
-- DONE
-- =============================================
