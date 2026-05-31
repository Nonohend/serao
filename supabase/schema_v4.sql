-- =============================================
-- SERAO Migration v4 — Sécurité & intégrité
-- Corrige :
--   S1  élévation de privilège à l'inscription (rôle dans les métadonnées)
--   S2  auto-promotion admin via update profil
--   S3  fuite des emails/téléphones de tous les membres
--   S4  montant des commandes contrôlé par le client
--   +   table reviews (notes réelles) + RPC de stats publiques
-- Idempotent : peut être ré-exécuté sans danger.
-- À coller dans Supabase → SQL Editor → Run.
-- Pré-requis : schema.sql, schema_v2.sql et schema_v3.sql déjà exécutés.
-- =============================================

-- ---------------------------------------------------------------
-- S1 — Le rôle ne peut JAMAIS venir du navigateur à l'inscription.
-- handle_new_user() n'accepte que 'acheteur' ou 'vendeur' ; toute
-- autre valeur (dont 'admin') est rétrogradée en 'acheteur'.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  req_role text := coalesce(new.raw_user_meta_data->>'role', 'acheteur');
begin
  if req_role not in ('acheteur','vendeur') then
    req_role := 'acheteur';
  end if;
  insert into public.profiles (id, nom, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)),
    new.email,
    req_role
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- S2 — Un membre ne peut plus modifier role / verified / email.
-- Les privilèges au niveau COLONNE priment sur la RLS : on retire
-- le droit UPDATE global et on ne ré-autorise que les colonnes sûres.
-- ---------------------------------------------------------------
revoke update on public.profiles from authenticated, anon;
revoke insert on public.profiles from authenticated, anon;  -- l'insertion se fait via le trigger uniquement
grant update (nom, tel, region, avatar_url, bio) on public.profiles to authenticated;

-- La policy de ligne reste : on ne peut éditer QUE sa propre ligne.
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Devenir vendeur : via une fonction contrôlée (jamais 'admin',
-- ne touche pas un compte déjà admin).
create or replace function public.request_vendor()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  update public.profiles
     set role = 'vendeur', updated_at = now()
   where id = auth.uid() and role = 'acheteur';
end;
$$;
grant execute on function public.request_vendor() to authenticated;

-- ---------------------------------------------------------------
-- S3 — Stop à l'aspiration des emails / téléphones.
--   • anon ne lit plus AUCUN profil.
--   • authenticated ne voit que les colonnes publiques des autres.
--   • email / tel / bio : réservés au propriétaire (via sa session
--     auth.users) et à l'admin (via la RPC admin_list_users).
-- ---------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant select (id, nom, role, region, avatar_url, verified, created_at)
  on public.profiles to authenticated;

drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles
  for select using (auth.uid() is not null);

-- Admin : lecture COMPLÈTE (emails inclus) via RPC sécurisée.
create or replace function public.admin_list_users()
returns setof public.profiles
language sql security definer set search_path = public
as $$
  select * from public.profiles
  where public.is_admin()
  order by created_at desc;
$$;
grant execute on function public.admin_list_users() to authenticated;

-- Admin : changer le rôle d'un membre (impossible en direct depuis
-- que la colonne role est verrouillée pour authenticated).
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs';
  end if;
  if p_role not in ('acheteur','vendeur','admin') then
    raise exception 'Rôle invalide';
  end if;
  update public.profiles set role = p_role, updated_at = now() where id = p_user;
end;
$$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------
-- S4 — Le montant d'une commande est calculé CÔTÉ SERVEUR.
-- On bloque l'INSERT direct ; tout passe par create_order(), qui lit
-- le prix réel du produit. Le client ne peut plus falsifier le montant.
-- ---------------------------------------------------------------
revoke insert on public.orders from authenticated, anon;
drop policy if exists "orders insert as buyer" on public.orders;

create or replace function public.create_order(
  p_product_id bigint,
  p_pay_method text,
  p_livraison  text default null
)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  prod   public.products;
  newrow public.orders;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  select * into prod from public.products where id = p_product_id and active = true;
  if not found then
    raise exception 'Produit introuvable ou inactif';
  end if;
  if p_pay_method not in ('mvola','orange','airtel','manual') then
    raise exception 'Moyen de paiement invalide';
  end if;

  insert into public.orders
    (acheteur_id, product_id, vendeur_id, product_nom, montant, pay_method, pay_tx_ref, status, livraison)
  values
    (auth.uid(), prod.id, prod.vendeur_id, prod.nom,
     prod.prix,                                   -- montant serveur, non falsifiable
     p_pay_method,
     'TXN-' || to_char(now(),'YYMMDDHH24MISS') || '-' || floor(random()*1000)::int,
     'confirme',
     p_livraison)
  returning * into newrow;

  return newrow;
end;
$$;
grant execute on function public.create_order(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------
-- Réalisme — Avis produits : la note n'est plus codée en dur (5.0),
-- elle est la moyenne des avis laissés par les acheteurs.
-- ---------------------------------------------------------------
create table if not exists public.reviews (
  id          bigserial primary key,
  product_id  bigint references public.products(id) on delete cascade,
  auteur_id   uuid references public.profiles(id) on delete cascade,
  note        int not null check (note between 1 and 5),
  commentaire text,
  created_at  timestamptz default now(),
  unique (product_id, auteur_id)
);
create index if not exists idx_reviews_product on public.reviews(product_id);

alter table public.reviews enable row level security;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant usage, select on sequence public.reviews_id_seq to authenticated;

drop policy if exists "reviews read" on public.reviews;
create policy "reviews read" on public.reviews for select using (true);
drop policy if exists "reviews write own" on public.reviews;
create policy "reviews write own" on public.reviews
  for insert with check (auth.uid() = auteur_id);
drop policy if exists "reviews update own" on public.reviews;
create policy "reviews update own" on public.reviews
  for update using (auth.uid() = auteur_id) with check (auth.uid() = auteur_id);
drop policy if exists "reviews delete own" on public.reviews;
create policy "reviews delete own" on public.reviews
  for delete using (auth.uid() = auteur_id or public.is_admin());

-- Recalcule products.note à chaque insertion / modif / suppression d'avis.
create or replace function public.recalc_product_note()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  pid bigint := coalesce(new.product_id, old.product_id);
begin
  update public.products p
     set note = coalesce(
           (select round(avg(note)::numeric, 1) from public.reviews where product_id = pid),
           5.0)
   where p.id = pid;
  return null;
end;
$$;
drop trigger if exists trg_reviews_recalc on public.reviews;
create trigger trg_reviews_recalc
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_product_note();

-- ---------------------------------------------------------------
-- Réalisme — Statistiques publiques réelles (page d'accueil).
-- N'expose que des compteurs, aucune donnée personnelle.
-- ---------------------------------------------------------------
create or replace function public.platform_stats()
returns json
language sql security definer set search_path = public
as $$
  select json_build_object(
    'produits',  (select count(*) from public.products where active),
    'vendeurs',  (select count(distinct vendeur_id) from public.products where active and vendeur_id is not null),
    'membres',   (select count(*) from public.profiles),
    'commandes', (select count(*) from public.orders)
  );
$$;
grant execute on function public.platform_stats() to anon, authenticated;

-- =============================================
-- DONE
-- =============================================
