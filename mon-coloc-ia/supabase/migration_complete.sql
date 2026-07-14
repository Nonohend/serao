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
-- =============================================================================
-- Mon Coloc IA — Migration v2
-- Ajoute : catégories d'inventaire (maison entière) + journal d'activités.
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- Pré-requis : migration.sql déjà exécutée.
-- =============================================================================

-- 1) Catégorie sur l'inventaire (frigo, epicerie, hygiene, menage, autre).
ALTER TABLE public.inventaire_courses
  ADD COLUMN IF NOT EXISTS categorie VARCHAR(50) NOT NULL DEFAULT 'frigo';

CREATE INDEX IF NOT EXISTS idx_inventaire_categorie
  ON public.inventaire_courses(categorie);

-- 2) Journal d'activités — pour que le coloc IA connaisse la vie de
--    l'utilisateur (sorties, sport, cuisine, projets…).
CREATE TABLE IF NOT EXISTS public.journal_activites (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id        UUID REFERENCES auth.users NOT NULL,
    description    TEXT NOT NULL,
    date_activite  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activites_user
  ON public.journal_activites(user_id);

ALTER TABLE public.journal_activites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activites_all_own" ON public.journal_activites;
CREATE POLICY "activites_all_own" ON public.journal_activites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
-- =============================================================================
-- Mon Coloc IA — Migration v3
-- Ajoute : les entrées d'argent (revenus irréguliers / business).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- Pré-requis : migration.sql et migration_v2.sql déjà exécutées.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.revenus (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES auth.users NOT NULL,
    montant         NUMERIC NOT NULL,
    source          VARCHAR(100),
    description     TEXT,
    date_reception  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenus_user ON public.revenus(user_id);
CREATE INDEX IF NOT EXISTS idx_revenus_date ON public.revenus(date_reception);

ALTER TABLE public.revenus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenus_all_own" ON public.revenus;
CREATE POLICY "revenus_all_own" ON public.revenus
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
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
-- =============================================================================
-- Mon Coloc IA — Migration v7
-- Ajoute : les abonnements aux notifications push (Web Push).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users NOT NULL,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    cree_le     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_all_own" ON public.push_subscriptions;
CREATE POLICY "push_all_own" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- FIN
-- =============================================================================
