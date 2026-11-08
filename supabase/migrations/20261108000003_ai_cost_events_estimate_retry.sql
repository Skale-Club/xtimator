-- supabase/migrations/20261108000003_ai_cost_events_estimate_retry.sql
-- Retry spend on the estimate call was silently lost.
--
-- ai_cost_events has a PARTIAL UNIQUE index on (attempt_id, operation_type)
-- WHERE operation_type IN ('audio_minutes','estimate') (Phase 167). That is right
-- for duplicate audio rows, but the estimate call legitimately runs more than once
-- per attempt (schema-repair retry, auto-refine second pass, Inngest retry), and
-- every repeat hit 23505 and was swallowed, so real AI cost went unrecorded.
--
-- recordAICost now re-inserts a colliding 'estimate' row as 'estimate_retry',
-- which the partial index does not cover. The credit debit read-back sums both.
-- Like 'chat', it is NOT added to credit_ledger.operation_type: it is only ever
-- debited as part of the 'estimate' operation.
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
    'chat',
    'estimate_retry'
  ));

COMMENT ON COLUMN public.ai_cost_events.operation_type IS
  'The AI operation this cost belongs to. Six metered ops, MEASURE-ONLY ''chat'' (absorbed spend, never debited), and ''estimate_retry'' (repeat estimate cost for the same attempt; summed with ''estimate'' when debiting).';
