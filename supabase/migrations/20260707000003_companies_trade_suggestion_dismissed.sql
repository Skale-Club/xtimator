-- QUICK-psh-03: durable dismissal for the Settings -> Company industry-mismatch
-- suggestion (lib/queries/company.ts getTradeSuggestion). No lightweight
-- per-company JSONB settings blob exists to piggyback on, and estimate_activity
-- rows always carry a NOT NULL project_id (unsuitable for a company-level
-- dismissal marker) — so this is the plan's authorized fallback: a single
-- timestamp column. getTradeSuggestion only counts trade_mismatch_detected
-- activity rows created AFTER this timestamp, so dismissing silences the
-- CURRENT pattern without permanently blocking a genuinely new one later.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trade_suggestion_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.companies.trade_suggestion_dismissed_at IS
  'QUICK-psh-03: stamped when the owner dismisses the Settings -> Company primary-trade suggestion. getTradeSuggestion (lib/queries/company.ts) only counts trade_mismatch_detected estimate_activity rows created AFTER this timestamp.';
