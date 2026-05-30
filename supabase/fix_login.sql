-- ====================================================
-- FIX: force la connexion (mot de passe + email confirme + admin)
-- ====================================================

create extension if not exists pgcrypto;

-- Reset password to 'serao2026' for both accounts
update auth.users
set encrypted_password = crypt('serao2026', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
where email in ('bm3722061@gmail.com', 'nohannsamby@gmail.com');

-- Make them admin
update public.profiles set role = 'admin'
where email in ('bm3722061@gmail.com', 'nohannsamby@gmail.com');

-- Verify
select p.email, p.role, (u.email_confirmed_at is not null) as confirmed
from public.profiles p
left join auth.users u on u.id = p.id
where p.email in ('bm3722061@gmail.com', 'nohannsamby@gmail.com');
