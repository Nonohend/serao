-- =============================================
-- SERAO Marketplace - Database schema v1.1
-- Paste this entire file into Supabase SQL Editor and click Run.
-- =============================================

-- ---------------------------------------------
-- Sequences (must come BEFORE tables that use them)
-- ---------------------------------------------
create sequence if not exists public.orders_seq start 1;

-- ---------------------------------------------
-- 1) PROFILES - extends auth.users
-- ---------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nom          text not null,
  email        text not null,
  role         text not null default 'acheteur' check (role in ('acheteur','vendeur','admin')),
  tel          text,
  region       text,
  avatar_url   text,
  bio          text,
  verified     boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nom, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'acheteur')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------
-- 2) CATEGORIES
-- ---------------------------------------------
create table if not exists public.categories (
  id            serial primary key,
  slug          text unique not null,
  nom           text not null,
  emoji         text,
  description   text,
  display_order int default 0
);

insert into public.categories (slug, nom, emoji, display_order) values
  ('vanille',     'Vanille',     E'\U0001F95B', 1),
  ('artisanat',   'Artisanat',   E'\U0001F3A8', 2),
  ('epices',      'Epices',      E'\U0001F336', 3),
  ('cosmetiques', 'Cosmetiques', E'\U0001F9F4', 4),
  ('textiles',    'Textiles',    E'\U0001F9F5', 5),
  ('bijoux',      'Bijoux',      E'\U0001F48E', 6)
on conflict (slug) do nothing;

-- ---------------------------------------------
-- 3) PRODUCTS
-- ---------------------------------------------
create table if not exists public.products (
  id           bigserial primary key,
  vendeur_id   uuid references public.profiles(id) on delete cascade,
  nom          text not null,
  description  text,
  category_id  int references public.categories(id),
  region       text,
  prix         bigint not null check (prix >= 0),
  note         numeric(2,1) default 5.0,
  emoji        text,
  image_url    text,
  badge        text check (badge in ('top','spons','new') or badge is null),
  deliv        text default '3-5 jours',
  stock        int default 1,
  active       boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_products_active on public.products(active) where active = true;
create index if not exists idx_products_vendeur on public.products(vendeur_id);
create index if not exists idx_products_category on public.products(category_id);

-- ---------------------------------------------
-- 4) ORDERS (sequence already created above)
-- ---------------------------------------------
create table if not exists public.orders (
  id           text primary key default 'CMD-' || lpad(nextval('public.orders_seq')::text, 6, '0'),
  acheteur_id  uuid references public.profiles(id) on delete set null,
  product_id   bigint references public.products(id) on delete set null,
  vendeur_id   uuid references public.profiles(id) on delete set null,
  product_nom  text not null,
  montant      bigint not null,
  pay_method   text check (pay_method in ('mvola','orange','airtel','manual')),
  pay_tx_ref   text,
  status       text default 'confirme' check (status in ('confirme','preparation','expedie','transit','livre','annule')),
  livraison    text,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists idx_orders_acheteur on public.orders(acheteur_id);
create index if not exists idx_orders_vendeur on public.orders(vendeur_id);
create index if not exists idx_orders_status on public.orders(status);

-- ---------------------------------------------
-- 5) MESSAGES
-- ---------------------------------------------
create table if not exists public.messages (
  id          bigserial primary key,
  from_user   uuid references public.profiles(id) on delete cascade,
  to_user     uuid references public.profiles(id) on delete cascade,
  channel     text,
  content     text not null,
  read_by     uuid[] default '{}',
  created_at  timestamptz default now(),
  constraint  msg_target check ((to_user is not null) or (channel is not null))
);

create index if not exists idx_messages_channel on public.messages(channel) where channel is not null;
create index if not exists idx_messages_to on public.messages(to_user) where to_user is not null;

-- ---------------------------------------------
-- 6) ARTICLES (blog)
-- ---------------------------------------------
create table if not exists public.articles (
  id          bigserial primary key,
  auteur_id   uuid references public.profiles(id) on delete set null,
  titre       text not null,
  slug        text unique,
  extrait     text,
  contenu     text,
  tags        text[],
  min_lecture int default 5,
  publie      boolean default false,
  publie_at   timestamptz,
  created_at  timestamptz default now()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

alter table public.profiles   enable row level security;
alter table public.products   enable row level security;
alter table public.orders     enable row level security;
alter table public.messages   enable row level security;
alter table public.articles   enable row level security;
alter table public.categories enable row level security;

drop policy if exists "categories readable" on public.categories;
create policy "categories readable" on public.categories for select using (true);

drop policy if exists "profiles select" on public.profiles;
create policy "profiles select" on public.profiles for select using (true);
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update using (auth.uid() = id);

drop policy if exists "products browse" on public.products;
create policy "products browse" on public.products for select using (active = true or auth.uid() = vendeur_id);
drop policy if exists "products insert own" on public.products;
create policy "products insert own" on public.products for insert with check (auth.uid() = vendeur_id);
drop policy if exists "products update own" on public.products;
create policy "products update own" on public.products for update using (auth.uid() = vendeur_id);
drop policy if exists "products delete own" on public.products;
create policy "products delete own" on public.products for delete using (auth.uid() = vendeur_id);

drop policy if exists "orders select own" on public.orders;
create policy "orders select own" on public.orders for select using (auth.uid() = acheteur_id or auth.uid() = vendeur_id);
drop policy if exists "orders insert as buyer" on public.orders;
create policy "orders insert as buyer" on public.orders for insert with check (auth.uid() = acheteur_id);
drop policy if exists "orders update vendor" on public.orders;
create policy "orders update vendor" on public.orders for update using (auth.uid() = vendeur_id);

drop policy if exists "messages select" on public.messages;
create policy "messages select" on public.messages for select using (
  channel is not null or auth.uid() = from_user or auth.uid() = to_user
);
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert with check (auth.uid() = from_user);

drop policy if exists "articles read published" on public.articles;
create policy "articles read published" on public.articles for select using (publie = true or auth.uid() = auteur_id);
drop policy if exists "articles author manage" on public.articles;
create policy "articles author manage" on public.articles for all using (auth.uid() = auteur_id);

-- =============================================
-- STORAGE BUCKET for product photos
-- =============================================

insert into storage.buckets (id, name, public) values ('product-photos','product-photos', true)
  on conflict (id) do nothing;

drop policy if exists "product photos public read" on storage.objects;
create policy "product photos public read" on storage.objects for select using (bucket_id = 'product-photos');

drop policy if exists "product photos auth upload" on storage.objects;
create policy "product photos auth upload" on storage.objects for insert
  with check (bucket_id = 'product-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- DONE
-- =============================================
