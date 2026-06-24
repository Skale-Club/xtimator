-- ============================================================================
-- usage_events.event_type CHECK widening (Phase 108 — RMETER-01)
--
-- Adds the new count-based 'price_researched' event so the price-research
-- orchestrator (Plan 108-03) can meter each search via the existing
-- recordUsage() idempotent insert. One unit per search.
--
-- The phase55 migration created the CHECK inline on the column, so Postgres
-- auto-named it usage_events_event_type_check (the default <table>_<column>_check
-- form). DROP CONSTRAINT IF EXISTS makes a name mismatch non-fatal; re-ADD lists
-- all four allowed values. Idempotent: re-running drops then re-adds the same
-- constraint, never errors.
--
-- NO secrets. NOT applied to remote here — deploy is owned by CI->GHCR->Coolify;
-- never build/migrate on the VPS.
-- ============================================================================

ALTER TABLE usage_events
  DROP CONSTRAINT IF EXISTS usage_events_event_type_check;

ALTER TABLE usage_events
  ADD CONSTRAINT usage_events_event_type_check
    CHECK (event_type IN (
      'estimate_generated',
      'photo_analyzed',
      'audio_transcribed',
      'price_researched'
    ));

COMMENT ON CONSTRAINT usage_events_event_type_check ON usage_events IS
  'Allowed usage event types. Phase 108 widened to include price_researched (1 unit per regional price-research search, idempotent via recordUsage).';
