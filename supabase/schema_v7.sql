-- =============================================
-- SERAO Migration v7 — Profils, Boutiques & Notes utilisateurs
-- Idempotent.
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_name        text,
  ADD COLUMN IF NOT EXISTS shop_description text,
  ADD COLUMN IF NOT EXISTS shop_banner_url  text,
  ADD COLUMN IF NOT EXISTS rating_avg       numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count     integer      NOT NULL DEFAULT 0;

GRANT UPDATE (shop_name, shop_description, shop_banner_url) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_ratings (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluateur_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evalue_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note           integer     NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire    text,
  order_id       text        REFERENCES public.orders(id) ON DELETE SET NULL,
  context        text        NOT NULL DEFAULT 'vendeur'
                             CHECK (context IN ('vendeur','acheteur')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_rating CHECK (evaluateur_id <> evalue_id),
  UNIQUE (evaluateur_id, evalue_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_evalue ON public.user_ratings(evalue_id);
ALTER TABLE public.user_ratings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_ratings TO anon, authenticated;
GRANT INSERT ON public.user_ratings TO authenticated;

DROP POLICY IF EXISTS "ratings_read" ON public.user_ratings;
CREATE POLICY "ratings_read" ON public.user_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "ratings_insert" ON public.user_ratings;
CREATE POLICY "ratings_insert" ON public.user_ratings
  FOR INSERT WITH CHECK (auth.uid() = evaluateur_id AND auth.uid() <> evalue_id);

CREATE OR REPLACE FUNCTION public.recalc_user_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target_id uuid := COALESCE(NEW.evalue_id, OLD.evalue_id);
BEGIN
  UPDATE public.profiles
    SET rating_avg   = COALESCE((SELECT ROUND(AVG(note)::numeric, 2) FROM public.user_ratings WHERE evalue_id = target_id), 0),
        rating_count = (SELECT COUNT(*) FROM public.user_ratings WHERE evalue_id = target_id),
        updated_at   = now()
  WHERE id = target_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_rating ON public.user_ratings;
CREATE TRIGGER trg_user_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.user_ratings
  FOR EACH ROW EXECUTE FUNCTION public.recalc_user_rating();

CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id uuid)
RETURNS TABLE(id uuid, nom text, role text, region text, avatar_url text, bio text,
  shop_name text, shop_description text, shop_banner_url text,
  verified boolean, rating_avg numeric, rating_count integer, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, nom, role, region, avatar_url, bio,
         shop_name, shop_description, shop_banner_url,
         verified, rating_avg, rating_count, created_at
  FROM public.profiles WHERE id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_user_rating(
  p_evalue_id   uuid,
  p_note        integer,
  p_commentaire text DEFAULT NULL,
  p_order_id    text DEFAULT NULL,
  p_context     text DEFAULT 'vendeur'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF auth.uid() = p_evalue_id THEN RAISE EXCEPTION 'Impossible de se noter soi-même'; END IF;
  IF p_note NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Note invalide (1-5)'; END IF;
  INSERT INTO public.user_ratings (evaluateur_id, evalue_id, note, commentaire, order_id, context)
  VALUES (auth.uid(), p_evalue_id, p_note, p_commentaire, p_order_id, p_context)
  ON CONFLICT (evaluateur_id, evalue_id) DO UPDATE
    SET note=p_note, commentaire=p_commentaire, order_id=p_order_id
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_user_rating(uuid, integer, text, text, text) TO authenticated;

-- DONE
