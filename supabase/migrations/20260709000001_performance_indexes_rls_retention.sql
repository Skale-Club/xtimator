-- Performance hardening bundle (Supabase advisor sweep, 2026-07-09):
--   1. Missing indexes on hot foreign-key / filter columns flagged by the
--      Supabase performance advisor. Every tenant RLS check funnels through
--      `SELECT id FROM companies WHERE user_id = auth.uid()` (or the Phase 82
--      company_members variant) and dashboard/list queries filter these FKs —
--      all seq-scanned today. This ONLY covers columns still missing an index
--      AFTER 20260706000007 (which already added the estimate_items /
--      estimate_sections / estimate_activity / photos / recordings / clients /
--      company_price_book(company_id) / price_book_item_options set); those are
--      deliberately not repeated here.
--   2. RLS initplan fixes (advisor "auth_rls_initplan" WARN). Policies that call
--      auth.uid()/auth.jwt() bare re-evaluate the function once PER ROW. Wrapping
--      each as a scalar subquery `(SELECT auth.uid())` lets the planner hoist it
--      to a one-time InitPlan. Semantics are identical. Only policies still
--      unwrapped in the FINAL migration state are touched here — the
--      price_book_item_options rewrite (20260706000007) and the price_book_imports
--      rewrite (Phase 82, 20260526000001) already wrap their auth calls.
--
-- Retention/cleanup for the append-only event tables (usage_events,
-- ai_cost_events, pipeline_events, tour_events, price_research_cache) is handled
-- by the Inngest cron in lib/inngest/functions/retention-cleanup.ts — NOT here —
-- to match the recent cleanup convention (notification-cleanup, cleanup-audio).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------

-- Every tenant RLS subquery resolves the caller's companies via
-- `SELECT id FROM companies WHERE user_id = auth.uid()` — the single hottest
-- lookup in the schema and it had no index on user_id.
CREATE INDEX IF NOT EXISTS idx_companies_user_id
  ON public.companies(user_id);

-- Dashboard "current estimates" filter (company_id + is_current).
CREATE INDEX IF NOT EXISTS idx_estimates_company_current
  ON public.estimates(company_id, is_current);

-- getProjectsByCompany paginates by (company_id, created_at DESC) WITHOUT the
-- archived/deleted predicate, so the existing partial index
-- idx_projects_active_by_company (WHERE archived_at IS NULL AND deleted_at IS
-- NULL) does not cover it. A full index is required.
CREATE INDEX IF NOT EXISTS idx_projects_company_created
  ON public.projects(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_client_id
  ON public.projects(client_id);

CREATE INDEX IF NOT EXISTS idx_estimate_photos_company_id
  ON public.estimate_photos(company_id);

CREATE INDEX IF NOT EXISTS idx_estimate_deliveries_estimate_id
  ON public.estimate_deliveries(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_deliveries_company_id
  ON public.estimate_deliveries(company_id);

CREATE INDEX IF NOT EXISTS idx_estimate_signatures_estimate_id
  ON public.estimate_signatures(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_signatures_company_id
  ON public.estimate_signatures(company_id);

-- company_members PK is (user_id, company_id) — its leading column is user_id,
-- so it cannot serve the company_id-first lookups the tenant RLS subqueries do.
CREATE INDEX IF NOT EXISTS idx_company_members_company_id
  ON public.company_members(company_id);

CREATE INDEX IF NOT EXISTS idx_company_price_book_folder_id
  ON public.company_price_book(folder_id);

CREATE INDEX IF NOT EXISTS idx_price_book_folders_company_id
  ON public.price_book_folders(company_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_company_id
  ON public.knowledge_entries(company_id);

CREATE INDEX IF NOT EXISTS idx_tour_events_company_created
  ON public.tour_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_company_id
  ON public.whatsapp_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_id
  ON public.whatsapp_messages(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_client_id
  ON public.whatsapp_conversations(client_id);

-- ---------------------------------------------------------------------------
-- 2. RLS initplan fixes — wrap auth.uid()/auth.jwt() as scalar subqueries
-- ---------------------------------------------------------------------------

-- notifications: members read their personal + company-wide rows. Semantics
-- preserved exactly (company scoped by the JWT company_id claim, plus own /
-- company-wide rows).
DROP POLICY IF EXISTS "notifications_select_own_company" ON public.notifications;
CREATE POLICY "notifications_select_own_company" ON public.notifications
  FOR SELECT
  USING (
    company_id = ((SELECT auth.jwt()) ->> 'company_id')::uuid
    AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
  );

-- notification_preferences: per-user own-row read/write.
DROP POLICY IF EXISTS "notification_preferences_select_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_own" ON public.notification_preferences
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notification_preferences_update_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_own" ON public.notification_preferences
  FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notification_preferences_insert_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_insert_own" ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- platform_admins: the three platform_admins policies (and the storage.objects
-- platform-brand policies) call the SECURITY DEFINER helper is_platform_admin().
-- When the planner inlines this STABLE SQL function into a policy, its bare
-- auth.uid() is re-evaluated per row. Wrap it once so the inlined form hoists to
-- an InitPlan. Function attributes (STABLE / SECURITY DEFINER / search_path) and
-- grants are unchanged; semantics identical.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())
  )
$$;

COMMIT;
