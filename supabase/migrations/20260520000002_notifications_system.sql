-- ============================================================================
-- notifications + notification_preferences (Phase 77)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  link_url        TEXT NULL,
  resource_type   TEXT NULL,
  resource_id     TEXT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at         TIMESTAMPTZ NULL,
  pinned          BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS notifications_company_user_created_idx
  ON public.notifications (company_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_company_created_idx
  ON public.notifications (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (company_id, user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_event_type_idx
  ON public.notifications (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_resource_idx
  ON public.notifications (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS notifications_cleanup_idx
  ON public.notifications (created_at) WHERE pinned = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: members of the company can read their personal + company-wide rows
DROP POLICY IF EXISTS "notifications_select_own_company" ON public.notifications;
CREATE POLICY "notifications_select_own_company" ON public.notifications
  FOR SELECT
  USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: service role only (no policies -> blocked for anon/authenticated)

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories              JSONB NOT NULL DEFAULT '{}'::jsonb,
  push_subscription       JSONB NULL,
  email_digest_enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_own" ON public.notification_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_update_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_own" ON public.notification_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_preferences_insert_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_insert_own" ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.notifications IS 'Per-user / per-company event feed (Phase 77). Insert/update/delete via service role only.';
COMMENT ON COLUMN public.notifications.metadata IS 'Event-specific JSONB. NEVER include raw secrets. dedupe_key supported for idempotency.';
COMMENT ON TABLE public.notification_preferences IS 'Per-user channel preferences. categories shape: { [EventCategory]: { in_app: bool, email: bool } }';
