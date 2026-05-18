-- ============================================================================
-- admin_audit_log — immutable trail of super-admin actions
-- ============================================================================
-- Every consequential action taken from /admin/* (saving an integration key,
-- changing active AI provider, forcing a tenant tier, granting bonus credits,
-- editing landing CMS, publishing a blog post, updating branding/SEO, etc.)
-- writes one row here. Useful for compliance, post-mortems, and answering
-- "who changed this and when".
--
-- Rows are intentionally append-only at the application layer (no UPDATE/DELETE
-- helpers). Service role can purge directly if retention policy demands it.
--
-- Read access: admins only (verified at the application layer via requireAdmin;
-- the table also has RLS forbidding all client access so even a leaked anon
-- key cannot read it).

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email     TEXT NOT NULL,                -- denormalized so log survives user deletion
  action          TEXT NOT NULL,                -- machine-readable verb, e.g. 'integration.save', 'tier.force'
  target_type     TEXT NULL,                    -- 'integration' | 'company' | 'blog_post' | 'branding' | 'landing' | 'seo'
  target_id       TEXT NULL,                    -- provider name | company UUID | post slug, etc.
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- action-specific extras (NEVER include raw secrets — log last4 only)
  ip              INET NULL,                    -- request IP if available
  user_agent      TEXT NULL                     -- request UA if available
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx       ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx      ON public.admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx      ON public.admin_audit_log (target_type, target_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies → no client access at all. Service role bypasses RLS by design.

COMMENT ON TABLE public.admin_audit_log IS 'Immutable trail of super-admin actions (Phase 71+). Append-only at the application layer.';
COMMENT ON COLUMN public.admin_audit_log.metadata IS 'Action-specific JSONB. NEVER store raw secrets — only safe projections (last4, ids, before/after diffs).';
