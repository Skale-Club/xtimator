-- supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql
-- Phase 192 Plan 01 — URL-02: the REVERSIBLE RECORD for the asset-URL cutover.
--
-- URL-02 requires the production rewrite of persisted `*.supabase.co` storage
-- URLs to same-origin `/storage/{bucket}/{key}` paths to be REVERSIBLE. This
-- table is what makes that true. It is deliberately a TABLE, not a log file:
-- a restore must be a data operation ("write old_value back"), never a
-- reconstruction from parsed text.
--
-- Measured scope (direct query against production 2026-08-06, see
-- .planning/phases/192-url-rewrite-cutover-cdn-verification/CONTEXT.md):
-- 11 occurrences across 4 columns — companies.logo_url (1),
-- platform_branding.logo_url (1), platform_branding.og_image_url (1),
-- platform_branding.landing_content (8, inside ONE jsonb document). That is
-- small enough that every rewritten value is verified individually later in the
-- phase; this table is built for exactness, not for throughput. No batching,
-- windowing, streaming or resumability anywhere in Phase 192.
--
-- --- Design points that are load-bearing — do not "simplify" them away ---
--
-- 1. `old_value` / `new_value` are JSONB, not TEXT. A scalar TEXT column
--    (companies.logo_url), a whole JSONB document
--    (platform_branding.landing_content) and a whole auth.users.user_metadata
--    object then all record IDENTICALLY. A scalar stores as a JSON string.
--
-- 2. For jsonb / user_metadata targets the WHOLE document is stored, not a
--    per-field patch. That is what makes the restore exact and
--    single-statement. The guarantee is DEEP-EQUAL: Postgres `jsonb` does not
--    preserve key order or insignificant whitespace, so a restored document
--    compares equal by VALUE, and no stronger claim about its bytes is made
--    or should be tested for.
--
-- 3. `new_value` exists so a revert can REFUSE to clobber a row that was
--    changed by someone else after the rewrite landed. Plan 02 implements that
--    drift check; without new_value it would be unimplementable.
--
-- 4. `row_pk` is TEXT so a uuid pk (companies.id), the platform_branding
--    singleton ('1') and an auth.users id all render into one column.
--
-- !!! THIS REPO APPLIES MIGRATIONS TO PRODUCTION BY HAND !!!
-- The deploy pipeline (GitHub Actions -> GHCR -> Coolify) ships CODE ONLY and
-- NEVER runs migrations. This file is authored-and-committed here; it does not
-- exist in the production database until a human applies it. Plan 03 applies it
-- by hand and verifies the actual schema afterwards. See
-- docs/STORAGE-MIGRATION.md. Do not assume merging this file changed prod.

create table if not exists public.storage_url_rewrites (
  id           bigint generated always as identity primary key,
  batch_id     uuid        not null,
  target       text        not null,   -- 'companies.logo_url', 'auth.users.user_metadata'
  row_pk       text        not null,   -- pk rendered as text ('1' for the platform_branding singleton)
  value_kind   text        not null check (value_kind in ('text','jsonb','user_metadata')),
  old_value    jsonb       not null,   -- FULL previous value (whole doc for jsonb/user_metadata)
  new_value    jsonb       not null,   -- FULL new value, so revert can detect drift
  rewritten_at timestamptz not null default now(),
  reverted_at  timestamptz
);

-- Rollback and per-batch reporting both read by batch.
create index if not exists storage_url_rewrites_batch_idx
  on public.storage_url_rewrites (batch_id);

-- Plan 02's crash recovery asks "is there an open (un-reverted) batch?" on
-- EVERY apply, so that read is a partial index rather than a full scan.
create index if not exists storage_url_rewrites_open_idx
  on public.storage_url_rewrites (reverted_at)
  where reverted_at is null;

-- One record per row per batch. The crash-resume path may re-record a row it
-- already recorded; this makes that a conflict to be handled, not a silent
-- double-record that would make the restore ambiguous.
create unique index if not exists storage_url_rewrites_batch_row_uniq
  on public.storage_url_rewrites (batch_id, target, row_pk);

-- NO policies created — deny-all for authenticated / anon. Service role
-- bypasses RLS. Mirrors the platform_integrations convention in
-- 20260419000001_platform_admin.sql (D-13). This table holds pre-rewrite copies
-- of platform branding and tenant company rows; no tenant session has any
-- business reading it.
alter table public.storage_url_rewrites enable row level security;

comment on table public.storage_url_rewrites is
  'Phase 192 (URL-02) reversible record for the asset-URL cutover: every persisted *.supabase.co storage URL rewritten to a same-origin /storage/{bucket}/{key} path is recorded here with its FULL previous value (old_value) and full new value (new_value), so a rollback restores exact prior data rather than reconstructing it. MUST NOT be truncated while a rollback is still possible. Deny-all RLS, service-role writes only.';

-- Rollback for THIS MIGRATION (schema only — dropping the table destroys the
-- ability to revert the data rewrite, so only run this if no rewrite batch is
-- outstanding):
--   drop table if exists public.storage_url_rewrites;
--
-- Reminder, repeated because it is the one thing that silently goes wrong here:
-- THIS REPO APPLIES MIGRATIONS TO PRODUCTION BY HAND. The deploy pipeline never
-- runs them (see docs/STORAGE-MIGRATION.md). Apply this file to the production
-- database manually BEFORE running any Phase 192 rewrite script, and verify the
-- actual schema afterwards.
