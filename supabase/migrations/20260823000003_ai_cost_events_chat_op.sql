-- supabase/migrations/20260823000003_ai_cost_events_chat_op.sql
-- Deep-audit finding CR13: absorbed chat spend is invisible to calibration.
--
-- app/api/chat/route.ts deliberately records NO credit mutation (chat is an
-- absorbed cost per v4.7 — the tenant is never charged for a conversation).
-- But it also recorded no `ai_cost_events` row at all, so that spend is
-- missing from aggregateAiCostByOperation and the CALIB-02 margin model
-- counts it as exactly zero. Absorbed must mean "not billed", never
-- "not measured".
--
-- The operation_type CHECK (Phase 110, 20260624000003) enumerates the six
-- metered operations; 'chat' is a MEASURE-ONLY seventh. It is deliberately
-- NOT added to credit_ledger.operation_type — that CHECK still lists only the
-- four chargeable ops, so a chat row can never become a debit.
--
-- Idempotent: the constraint is dropped by name and recreated.

ALTER TABLE public.ai_cost_events
  DROP CONSTRAINT IF EXISTS ai_cost_events_operation_type_check;

ALTER TABLE public.ai_cost_events
  ADD CONSTRAINT ai_cost_events_operation_type_check
  CHECK (operation_type IN (
    'estimate',
    'photo_batch',
    'audio_minutes',
    'price_research',
    'translation',
    'vision',
    'chat'
  ));

COMMENT ON COLUMN public.ai_cost_events.operation_type IS
  'The AI operation this cost belongs to. Six metered ops plus MEASURE-ONLY ''chat'' (absorbed spend: recorded for calibration, never debited — credit_ledger.operation_type still excludes it).';
