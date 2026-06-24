-- ============================================================================
-- price_research_cache (Phase 106 — RCACHE-01, RCACHE-02)
--
-- Per-tenant, TTL-bounded cache of researched regional market prices. The cached
-- VALUE is a NEUTRAL market datum (unit_price/currency/source/confidence/expires_at)
-- — never client/margin/job text. company_id is a KEY column for tenant scoping +
-- RLS uniformity, NOT secret content.
--
-- RLS is SERVICE-ROLE-ONLY BY DESIGN (mirrors whatsapp_notification_templates +
-- pipeline_events posture): RLS is ENABLED but ZERO anon/authenticated policies are
-- defined, so tenants can neither read nor write. The service role bypasses RLS; the
-- cache module reads/writes via requireServiceClient(). This is platform/service data.
--
-- Idempotent (IF NOT EXISTS). NO secrets. NOT applied to remote here — deploy is
-- owned by CI->GHCR->Coolify; never build/migrate on the VPS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_research_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  normalized_name text NOT NULL,
  region          text NOT NULL,                 -- canonical "city|state"
  currency_code   text NOT NULL DEFAULT 'USD',
  unit_price      numeric(12,2) NOT NULL,
  source          text,                           -- which provider produced it (audit)
  confidence      numeric,                        -- optional, nullable
  expires_at      timestamptz NOT NULL,           -- created_at + TTL (lazy purge: expired = miss)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, normalized_name, region, currency_code)
);

CREATE INDEX IF NOT EXISTS price_research_cache_lookup_idx
  ON public.price_research_cache (company_id, normalized_name, region, currency_code);
CREATE INDEX IF NOT EXISTS price_research_cache_expires_idx
  ON public.price_research_cache (expires_at);

-- Service-role-only: RLS ENABLED with NO anon/authenticated policies. Deny-all for
-- clients; the service role bypasses RLS. (Mirrors whatsapp_notification_templates.)
ALTER TABLE public.price_research_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.price_research_cache IS
  'Per-tenant researched-price cache (Phase 106). Service-role-only: RLS enabled with zero tenant policies; read/write via requireServiceClient(). Value is a neutral market datum. NEVER store client/job text here.';
