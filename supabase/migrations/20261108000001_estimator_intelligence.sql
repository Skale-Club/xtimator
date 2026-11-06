-- SEED-057: a smarter estimator (output contract v2, company price history).
--
-- Idempotent: every statement is safe to re-run. NOT applied by the deploy.
--
-- DEPLOY ORDER. The application code is written so that it keeps working
-- before this migration lands: the new columns are written in the same insert
-- and that insert is retried WITHOUT them when the database says the column does
-- not exist (isMissingColumnError), so until this is applied each generation pays
-- one extra failed write; no hot-path SELECT names a new column; and the
-- company-history price source stays silent until price_observations exists and
-- has rows. So the order is not load-bearing for correctness, but apply this
-- BEFORE enabling anything that depends on the new data (the AI assumptions
-- panel, company history). ESTIMATOR_TWO_STEP does not need it.
--
-- estimates.ai_meta
--   Owner-facing, AI-produced context for one estimate: assumptions,
--   exclusions, open_questions, scope_confidence and the structure-quality
--   score + findings. NEVER rendered on a client-facing surface.
--
-- estimate_items.confidence / basis / optional
--   Per-line AI metadata: how sure the model is, the one-line source of the
--   quantity ("from the 12x14 ft room stated in the audio"), and whether the
--   line is an optional add-on.
--
-- estimate_items.price_source
--   Gains 'company_history': the unit price came from the company's own median
--   on accepted estimates (precedence: price book > company history >
--   researched > model estimate).
--
-- price_observations
--   One row per priced line of an ACCEPTED estimate (client_response accepted
--   or signed), keyed by a normalised concept + unit. Service-role only (RLS
--   enabled, no client policies), like price_research_cache.

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS ai_meta JSONB;

ALTER TABLE public.estimate_items
  ADD COLUMN IF NOT EXISTS confidence TEXT,
  ADD COLUMN IF NOT EXISTS basis TEXT,
  ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_confidence_check;
ALTER TABLE public.estimate_items
  ADD CONSTRAINT estimate_items_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('low', 'medium', 'high'));

ALTER TABLE public.estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_price_source_researched_check;
ALTER TABLE public.estimate_items
  DROP CONSTRAINT IF EXISTS estimate_items_price_source_values_check;
ALTER TABLE public.estimate_items
  ADD CONSTRAINT estimate_items_price_source_values_check
  CHECK (
    price_source IS NULL
    OR price_source IN ('price_book', 'ai_estimate', 'researched', 'company_history')
  );

CREATE TABLE IF NOT EXISTS public.price_observations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  estimate_id   uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  concept_key   text NOT NULL,
  unit          text NOT NULL DEFAULT '',
  unit_price    numeric(12,2) NOT NULL CHECK (unit_price > 0),
  currency_code text NOT NULL DEFAULT 'USD',
  source        text NOT NULL DEFAULT 'accepted_estimate'
                CHECK (source IN ('accepted_estimate', 'price_book', 'researched')),
  observed_at   timestamptz NOT NULL DEFAULT now()
);

-- One observation per (estimate, concept, unit): recording the same accepted
-- estimate twice (a retry, a re-sign) is a no-op. Deliberately NOT a partial
-- index: PostgREST's upsert (ON CONFLICT (cols) DO NOTHING) cannot infer a
-- partial index. Rows with a NULL estimate_id never collide (NULLs are distinct).
CREATE UNIQUE INDEX IF NOT EXISTS price_observations_estimate_concept_uniq
  ON public.price_observations (estimate_id, concept_key, unit);

-- "Median of the company's last 10 observations of this concept + unit".
CREATE INDEX IF NOT EXISTS price_observations_lookup_idx
  ON public.price_observations (company_id, concept_key, unit, observed_at DESC);

-- Service-role-only: RLS ENABLED with NO anon/authenticated policies. Tenants
-- never read or write this directly; the service role bypasses RLS.
ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_observations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.price_observations TO service_role;

COMMENT ON TABLE public.price_observations IS
  'SEED-057: unit prices a company actually charged on accepted estimates, by normalised concept + unit. Feeds the company_history price source.';

NOTIFY pgrst, 'reload schema';
