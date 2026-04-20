-- EstimateBuilder Pro / Xtimator — Platform Admin Migration
-- Phase 8: Platform Admin Panel for Centralized API Integrations
-- Plan 01: Database foundation (3 tables + trigger + storage bucket + seed)
--
-- Creates:
--   1. public.platform_admins        — super-admin membership (self-referential RLS)
--   2. public.prevent_last_admin_removal() + trigger
--   3. public.platform_integrations  — encrypted API keys (deny-all RLS, service role only)
--   4. public.platform_branding      — singleton (id=1) seeded with app_name='Xtimator'
--   5. Storage bucket `platform-brand` (public read, super-admin write)
--
-- Idioms replicated from 20260409000001_initial_schema.sql:
--   - RLS policy uses (SELECT auth.uid()) wrapped subquery
--   - Storage bucket insert + per-operation storage.objects policies
--   - ON CONFLICT (id) DO NOTHING for idempotent seeds

-- ============================================================
-- 1. platform_admins (D-05)
-- ============================================================

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  notes text
);

alter table public.platform_admins enable row level security;

-- Self-referential: only existing admins can see / mutate admin rows
create policy "platform_admins_select_admins_only" on public.platform_admins
  for select to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())));

create policy "platform_admins_insert_admins_only" on public.platform_admins
  for insert to authenticated
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())));

create policy "platform_admins_delete_admins_only" on public.platform_admins
  for delete to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())));

-- ============================================================
-- 2. Last-admin-removal guard trigger (D-08, ADMIN-03)
-- ============================================================

create or replace function public.prevent_last_admin_removal() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.platform_admins) <= 1 then
    raise exception 'Cannot remove the last platform admin';
  end if;
  return old;
end;
$$;

create trigger trg_prevent_last_admin_removal
  before delete on public.platform_admins
  for each row execute function public.prevent_last_admin_removal();

-- ============================================================
-- 3. platform_integrations (D-03, D-04)
-- ============================================================

create table public.platform_integrations (
  provider text primary key,
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  metadata jsonb default '{}'::jsonb
);

alter table public.platform_integrations enable row level security;
-- NO policies created — deny-all for authenticated / anon. Service role bypasses RLS (D-13).

-- ============================================================
-- 4. platform_branding (singleton) (D-09)
-- ============================================================

create table public.platform_branding (
  id int primary key default 1 check (id = 1),
  app_name text not null,
  logo_url text,
  primary_color text,
  email_from_name text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.platform_branding enable row level security;
-- NO policies — loader always uses service role; pre-auth pages read via server-only loader.

-- Seed the singleton with the platform rebrand target.
insert into public.platform_branding (id, app_name) values (1, 'Xtimator')
  on conflict (id) do nothing;

-- ============================================================
-- 5. Storage bucket `platform-brand` (D-11, ADMIN-09)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('platform-brand', 'platform-brand', true, 5242880, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create policy "platform_brand_insert_admins" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'platform-brand'
    and exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
  );

create policy "platform_brand_update_admins" on storage.objects for update to authenticated
  using (
    bucket_id = 'platform-brand'
    and exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'platform-brand'
    and exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
  );

create policy "platform_brand_delete_admins" on storage.objects for delete to authenticated
  using (
    bucket_id = 'platform-brand'
    and exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
  );

-- SELECT policy omitted: bucket is public=true, so all clients can read logo URLs
-- (needed for pre-auth login page per Research §Key Pattern 7 "Public read for platform-brand").
