-- Quick task 260529-lc0: allow whatsapp_sessions.state = 'awaiting_details'
-- so the WhatsApp bot can ask the owner for more details when an inbound
-- message is too vague to price (estimate total == 0 OR no line items),
-- instead of generating/sending a $0 estimate.
-- The inline CHECK created in 20260510000002_phase40_whatsapp.sql is named
-- whatsapp_sessions_state_check by Postgres. Drop + re-add with the new value.
-- Idempotent: guarded by constraint existence / no-op if already includes value.

DO $do$
BEGIN
  -- Drop the existing CHECK (inline auto-named) if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_sessions_state_check'
      AND conrelid = 'public.whatsapp_sessions'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_sessions
      DROP CONSTRAINT whatsapp_sessions_state_check;
  END IF;

  -- Re-add with 'awaiting_details' included
  ALTER TABLE public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_state_check
    CHECK (state IN ('awaiting_input','awaiting_confirm','awaiting_edit','awaiting_details'));
END $do$;
