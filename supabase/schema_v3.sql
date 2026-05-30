-- =============================================
-- SERAO Migration v3
-- Adds: users can delete/edit their own messages + DELETE event in realtime
-- =============================================

-- Allow users to delete their own messages (admin already allowed via is_admin())
drop policy if exists "messages delete own" on public.messages;
create policy "messages delete own" on public.messages
  for delete using (auth.uid() = from_user);

-- Allow users to edit (update content of) their own messages
drop policy if exists "messages update own" on public.messages;
create policy "messages update own" on public.messages
  for update using (auth.uid() = from_user)
  with check (auth.uid() = from_user);

-- Make sure DELETE events broadcast properly via realtime (REPLICA IDENTITY FULL)
alter table public.messages replica identity full;

-- =============================================
-- DONE
-- =============================================
