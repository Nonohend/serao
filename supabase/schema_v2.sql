-- =============================================
-- SERAO Marketplace - Migration v2
-- Adds: admin role policies + Realtime on messages + storage update policy
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to re-run (idempotent).
-- =============================================

-- ---------------------------------------------
-- 1) Helper: is the current user an admin?
-- ---------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------
-- 2) Admin RLS policies (admins see/edit everything)
-- ---------------------------------------------

drop policy if exists "admin all profiles" on public.profiles;
create policy "admin all profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all products" on public.products;
create policy "admin all products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all orders" on public.orders;
create policy "admin all orders" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all messages" on public.messages;
create policy "admin all messages" on public.messages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all articles" on public.articles;
create policy "admin all articles" on public.articles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------
-- 3) Enable Realtime on messages table
-- (Required for the in-app live chat to receive INSERTs)
-- ---------------------------------------------

do $$
begin
  -- add table to publication if not already there
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end$$;

-- ---------------------------------------------
-- 4) Vendor can update/delete their own product photos
-- ---------------------------------------------

drop policy if exists "product photos auth update" on storage.objects;
create policy "product photos auth update" on storage.objects
  for update using (bucket_id = 'product-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "product photos auth delete" on storage.objects;
create policy "product photos auth delete" on storage.objects
  for delete using (bucket_id = 'product-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================
-- DONE
-- After running this:
-- 1) To promote yourself to admin, run this once with your email:
--      update public.profiles set role = 'admin' where email = 'YOUR@EMAIL.com';
-- 2) Then log out and log back in on the site to refresh your session role.
-- =============================================
