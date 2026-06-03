-- =============================================
-- SERAO Migration v6 — Localisation GPS des commandes
-- Ajoute :
--   G1  Colonnes GPS sur orders (delivery_lat, delivery_lng, delivery_address)
--   G2  update de create_order() pour accepter les coordonnées
--   G3  Colonne lat/lng sur profiles pour les vendeurs
-- Idempotent : peut être ré-exécuté sans danger.
-- À coller dans Supabase → SQL Editor → Run.
-- Pré-requis : schema_v5.sql déjà exécuté.
-- =============================================

-- ---------------------------------------------------------------
-- G1 — Colonnes GPS sur orders
-- ---------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat  double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng  double precision,
  ADD COLUMN IF NOT EXISTS delivery_address text;

-- ---------------------------------------------------------------
-- G2 — update de create_order() pour accepter les coordonnées GPS
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_product_id  bigint,
  p_pay_method  text,
  p_livraison   text    DEFAULT NULL,
  p_delivery_lat   double precision DEFAULT NULL,
  p_delivery_lng   double precision DEFAULT NULL,
  p_delivery_address text           DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  prod   public.products;
  newrow public.orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  SELECT * INTO prod FROM public.products WHERE id = p_product_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit introuvable ou inactif';
  END IF;
  IF p_pay_method NOT IN ('mvola','orange','airtel','manual') THEN
    RAISE EXCEPTION 'Moyen de paiement invalide';
  END IF;

  INSERT INTO public.orders
    (acheteur_id, product_id, vendeur_id, product_nom, montant,
     pay_method, pay_tx_ref, status, livraison,
     delivery_lat, delivery_lng, delivery_address)
  VALUES
    (auth.uid(), prod.id, prod.vendeur_id, prod.nom, prod.prix,
     p_pay_method,
     'TXN-' || to_char(now(),'YYMMDDHH24MISS') || '-' || floor(random()*1000)::int,
     'confirme',
     p_livraison,
     p_delivery_lat, p_delivery_lng, p_delivery_address)
  RETURNING * INTO newrow;

  RETURN newrow;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_order(bigint, text, text, double precision, double precision, text) TO authenticated;

-- ---------------------------------------------------------------
-- G3 — Colonnes GPS sur profiles (position du vendeur)
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;

-- Autoriser les vendeurs à mettre à jour leur propre position
GRANT UPDATE (lat, lng) ON public.profiles TO authenticated;

-- =============================================
-- DONE
-- =============================================
