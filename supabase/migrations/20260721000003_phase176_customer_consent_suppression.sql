-- supabase/migrations/20260721000003_phase176_customer_consent_suppression.sql
-- Phase 176 (CUST-03): schema foundation for end-customer SMS consent /
-- suppression / quiet-hours. Net-new `clients`-scoped consent columns (NOT
-- a reuse of the owner-scoped `notification_preferences` table), a generated
-- `phone_normalized` column for robust inbound-phone matching, plus an
-- append-only `client_message_events` audit table for inbound STOP/START/
-- HELP replies. Pure schema — no application logic. Plans 176-04 (pre-send
-- gate) and 176-05 (inbound webhook) read/write these columns and land
-- after this one.
--
-- Idempotent: safe to re-run (ADD COLUMN/CREATE TABLE/CREATE INDEX IF NOT
-- EXISTS throughout). NOT applied to remote directly — deploy is
-- CI->GHCR->Coolify; migrations are applied manually per project
-- convention (see supabase/migrations/20260718000001_phase171_...).
--
-- Deviations from 176-RESEARCH.md's literal schema recommendation (plan-
-- checker pass, documented here for the eventual prod-apply reviewer):
--   1. `client_message_events.company_id` is NULLABLE with ON DELETE SET
--      NULL (research listed it non-null "tenant scope for RLS" but also
--      required that an inbound event whose From-phone matches NO client
--      anywhere must still be recorded, never dropped — those two
--      requirements conflict when there is no tenant to attach the row to).
--      A fully-unresolved event gets company_id = NULL, client_id = NULL,
--      is still inserted, and simply isn't visible to any tenant via RLS
--      (NULL never matches `IN (...)`) — it stays queryable by
--      service-role/support for manual review.
--   2. `company_id` uses ON DELETE SET NULL, NOT ON DELETE CASCADE — this
--      is an audit/compliance trail; deleting a company must never
--      silently erase its STOP/consent history. The row survives with
--      company_id = NULL (same shape as a never-resolved event) rather
--      than vanishing.
--   3. When an inbound phone number matches clients in MULTIPLE companies
--      (the CUST-03 Messaging Service is shared platform-wide, so a STOP
--      to that one number is sender-agnostic), 176-05 inserts ONE row per
--      matched company (fan-out) — this suppresses every tenant
--      relationship at that phone number, not just one.

BEGIN;

-- ============================================================================
-- Part 1: clients — consent/suppression columns
-- ============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sms_consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (sms_consent_status IN ('granted', 'revoked', 'unknown')),
  ADD COLUMN IF NOT EXISTS sms_consent_method TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_text TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sms_opted_out_at TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.sms_consent_status IS
  'Phase 176 (CUST-03): granted|revoked|unknown, default unknown. "unknown" is NOT the same as "granted" — the 176-04 pre-send gate treats it as non-sendable by default (fail-closed). Whether/how a business can override fail-closed for unknown is a deliberately deferred, config-driven Operational Decision (research doc #2) — not resolved by this migration.';

COMMENT ON COLUMN public.clients.sms_opted_out_at IS
  'Phase 176 (CUST-03): timestamp of the most recent STOP/opt-out event for this client. This is the fast/authoritative suppression check (single indexed read via idx_clients_sms_opted_out), deliberately redundant with sms_consent_status=''revoked''.';

-- Part 1b: phone_normalized generated column — closes a format-drift hole.
-- clients.phone is free text with no enforced format, so exact-string
-- matching against Twilio's E.164 `From` misses formatted variants like
-- "(555) 123-4567". A STORED generated column normalizes once at write
-- time and is indexed for O(1) lookup.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT
    GENERATED ALWAYS AS (
      RIGHT(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10)
    ) STORED;

COMMENT ON COLUMN public.clients.phone_normalized IS
  'Phase 176 (CUST-03): generated, read-only — last 10 digits of clients.phone with all non-digit characters stripped (NANP subscriber number, ignoring leading country code/formatting). Matched by 176-05''s inbound webhook against regexp_replace(from_e164, ''\D'', '''', ''g'') last-10-digits. A phone that is null or has fewer than 10 digits produces a short/empty string, excluded from matching by the partial index below — never a false-positive collision target. Residual limitation accepted: international/VOIP numbers with fewer than 10 digits, or two different real customers sharing the same last-10-digit sequence across different country codes. Twilio''s own carrier-level Advanced Opt-Out block remains a backstop even when app-level matching misses.';

-- Indexes (all needed — different query patterns).
-- 176-05's inbound-webhook reverse lookup (From phone -> matching client rows, across companies).
CREATE INDEX IF NOT EXISTS idx_clients_phone_normalized ON public.clients(phone_normalized) WHERE phone_normalized <> '';
-- 176-04's pre-send gate hot-path suppression check (partial index — cheap, only suppressed rows).
CREATE INDEX IF NOT EXISTS idx_clients_sms_opted_out ON public.clients(id) WHERE sms_opted_out_at IS NOT NULL;

-- ============================================================================
-- Part 2: client_message_events — append-only audit table
-- ============================================================================
-- Records every inbound STOP/START/HELP keyword event, even when the
-- inbound phone number cannot be matched to any client row. Never updated
-- or deleted, only inserted.

CREATE TABLE IF NOT EXISTS public.client_message_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  from_phone          TEXT NOT NULL,
  keyword_type        TEXT NOT NULL CHECK (keyword_type IN ('stop', 'start', 'help', 'other')),
  raw_body            TEXT,
  twilio_message_sid  TEXT NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.client_message_events IS
  'Phase 176 (CUST-03): append-only audit trail for inbound STOP/START/HELP SMS replies. company_id/client_id are nullable with ON DELETE SET NULL (audit trail survives company/client deletion; an unresolved event with no matching client anywhere is still inserted with company_id=NULL, client_id=NULL rather than dropped). When one phone number matches clients in multiple companies, one row is inserted per matched company (fan-out) — the Messaging Service is shared platform-wide so a STOP is sender-agnostic. No unique constraint on twilio_message_sid (Postgres treats NULLs as distinct, so a company_id-inclusive unique index would not dedupe unresolved rows) — 176-05 handles inbound-webhook idempotency at the application level (check-then-insert against idx_client_message_events_sid; a benign TOCTOU race under concurrent redelivery is accepted and documented in 176-05).';

CREATE INDEX IF NOT EXISTS idx_client_message_events_company_id ON public.client_message_events(company_id);
CREATE INDEX IF NOT EXISTS idx_client_message_events_from_phone ON public.client_message_events(from_phone);
CREATE INDEX IF NOT EXISTS idx_client_message_events_sid ON public.client_message_events(twilio_message_sid);

ALTER TABLE public.client_message_events ENABLE ROW LEVEL SECURITY;

-- Writes to this table happen ONLY via the service-role inbound webhook
-- (176-05) — service role bypasses RLS entirely, so only a SELECT policy
-- is needed for authenticated tenant users (mirrors estimate_deliveries:
-- "Status updates are done server-side via service role... No
-- authenticated UPDATE policy needed").
CREATE POLICY "client_message_events_select" ON public.client_message_events FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_members.company_id FROM company_members WHERE company_members.user_id = (SELECT auth.uid())));

COMMIT;
