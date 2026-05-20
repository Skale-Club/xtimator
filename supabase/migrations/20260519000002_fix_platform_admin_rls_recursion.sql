-- Xtimator — Fix platform_admins RLS recursion
--
-- Bug: 20260419000001_platform_admin.sql created three "self-referential"
-- RLS policies on public.platform_admins (EXISTS over platform_admins inside
-- the policy body) plus three platform_brand_* policies on storage.objects
-- that referenced platform_admins via the same inline EXISTS. After Supabase
-- Storage migration 58 (operation-ergonomics, 2026-05-06) the PG planner
-- expansion exposed the latent recursion: every authenticated INSERT into
-- storage.objects raised SQLSTATE 42P17 ("infinite recursion detected in
-- policy for relation \"platform_admins\""), which storage-api surfaces as
-- "The database schema is invalid or incompatible." — blocking all uploads.
--
-- Fix: introduce a SECURITY DEFINER helper public.is_platform_admin() that
-- runs as the function owner with RLS bypassed on its own SELECT, and rewrite
-- all six policies to call it instead of inlining the recursive EXISTS.

-- ============================================================
-- 1. SECURITY DEFINER helper
-- ============================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  )
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_platform_admin() to service_role;

-- ============================================================
-- 2. Rebuild public.platform_admins policies (replace inline EXISTS)
-- ============================================================

drop policy if exists "platform_admins_select_admins_only" on public.platform_admins;
create policy "platform_admins_select_admins_only" on public.platform_admins
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists "platform_admins_insert_admins_only" on public.platform_admins;
create policy "platform_admins_insert_admins_only" on public.platform_admins
  for insert to authenticated
  with check (public.is_platform_admin());

drop policy if exists "platform_admins_delete_admins_only" on public.platform_admins;
create policy "platform_admins_delete_admins_only" on public.platform_admins
  for delete to authenticated
  using (public.is_platform_admin());

-- ============================================================
-- 3. Rebuild storage.objects platform-brand policies (replace inline EXISTS)
-- ============================================================

drop policy if exists "platform_brand_insert_admins" on storage.objects;
create policy "platform_brand_insert_admins" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'platform-brand'
    and public.is_platform_admin()
  );

drop policy if exists "platform_brand_update_admins" on storage.objects;
create policy "platform_brand_update_admins" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'platform-brand'
    and public.is_platform_admin()
  )
  with check (
    bucket_id = 'platform-brand'
    and public.is_platform_admin()
  );

drop policy if exists "platform_brand_delete_admins" on storage.objects;
create policy "platform_brand_delete_admins" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'platform-brand'
    and public.is_platform_admin()
  );

-- ============================================================
-- Smoke probe (run in SQL editor as the authenticated role after this migration):
--   SET LOCAL ROLE authenticated;
--   -- expect: no recursion error, returns false for non-admin users
--   SELECT public.is_platform_admin();
-- ============================================================
