-- =============================================================================
-- Mon Coloc IA — Migration de la base de données
-- À coller dans Supabase → SQL Editor → Run.
-- Idempotent : peut être ré-exécuté sans danger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) profil_utilisateur — étend auth.users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profil_utilisateur (
    id                     UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    updated_at             TIMESTAMP WITH TIME ZONE,
    budget_mensuel_cible   NUMERIC DEFAULT 1000.00,
    a_un_frigo             BOOLEAN DEFAULT TRUE,
    a_un_congelo           BOOLEAN DEFAULT TRUE,
    a_des_plaques          BOOLEAN DEFAULT TRUE,
    a_un_microondes        BOOLEAN DEFAULT TRUE,
    rythme_de_vie          TEXT,
    niveau_energie_soir    INT DEFAULT 3
);

-- -----------------------------------------------------------------------------
-- 2) depenses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.depenses (
    id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                   UUID REFERENCES auth.users NOT NULL,
    montant                   NUMERIC NOT NULL,
    categorie                 VARCHAR(100) NOT NULL,
    description               TEXT,
    date_transaction          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    est_gaspillage            BOOLEAN DEFAULT FALSE,
    montant_arrondi_virtuel   NUMERIC DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_depenses_user       ON public.depenses(user_id);
CREATE INDEX IF NOT EXISTS idx_depenses_date       ON public.depenses(date_transaction);

-- -----------------------------------------------------------------------------
-- 3) inventaire_courses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventaire_courses (
    id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id                     UUID REFERENCES auth.users NOT NULL,
    depense_id                  UUID REFERENCES public.depenses(id) ON DELETE SET NULL,
    nom_produit                 VARCHAR(255) NOT NULL,
    date_achat                  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    jours_conservation_estimes  INT NOT NULL,
    statut                      VARCHAR(50) DEFAULT 'en_stock' -- 'en_stock', 'consomme', 'gaspille'
);

CREATE INDEX IF NOT EXISTS idx_inventaire_user   ON public.inventaire_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_inventaire_statut ON public.inventaire_courses(statut);

-- -----------------------------------------------------------------------------
-- 4) Création automatique du profil à l'inscription
-- Noms suffixés « _coloc » pour ne JAMAIS entrer en collision avec d'autres
-- projets partageant la même base (ex : un trigger on_auth_user_created existant).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_coloc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profil_utilisateur (id, updated_at)
  VALUES (NEW.id, NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_coloc ON auth.users;
CREATE TRIGGER on_auth_user_created_coloc
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_coloc();

-- -----------------------------------------------------------------------------
-- 5) Row Level Security — chaque utilisateur ne voit que ses propres données
-- -----------------------------------------------------------------------------
ALTER TABLE public.profil_utilisateur ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_courses ENABLE ROW LEVEL SECURITY;

-- profil_utilisateur
DROP POLICY IF EXISTS "profil_select_own" ON public.profil_utilisateur;
CREATE POLICY "profil_select_own" ON public.profil_utilisateur
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profil_insert_own" ON public.profil_utilisateur;
CREATE POLICY "profil_insert_own" ON public.profil_utilisateur
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profil_update_own" ON public.profil_utilisateur;
CREATE POLICY "profil_update_own" ON public.profil_utilisateur
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- depenses
DROP POLICY IF EXISTS "depenses_all_own" ON public.depenses;
CREATE POLICY "depenses_all_own" ON public.depenses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- inventaire_courses
DROP POLICY IF EXISTS "inventaire_all_own" ON public.inventaire_courses;
CREATE POLICY "inventaire_all_own" ON public.inventaire_courses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
