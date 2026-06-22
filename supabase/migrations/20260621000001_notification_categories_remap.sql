-- Migration: Notification category remap (Phase 104, NOTIF-06)
--
-- Collapses the legacy 8-category notification_preferences.categories JSONB into
-- the reduced 3-category model (estimate | billing | system). This SQL MIRRORS
-- the unit-tested pure function `migrateCategories()` in
-- `lib/notifications/category-migration.ts` — keep the two in lockstep.
--
-- Per-row rewrite:
--   * billing  = OR-merge of payment/trial/quota/admin (+ any existing billing),
--                per boolean channel (in_app, email). A true in ANY source wins.
--   * estimate = carried through unchanged.
--   * system   = carried through unchanged.
--   * whatsapp / ai_job keys are dropped entirely (no category anymore).
--   * The new paid channels (whatsapp, sms) are NOT synthesized here — they are
--     left absent so the resolver re-defaults them to FALSE (never auto-enable a
--     paid channel — TCPA/cost; opt-in only). NO secrets in this file.
--
-- Idempotency: the WHERE guard only matches rows that still carry a legacy key,
-- so re-running this migration is a no-op (a second run matches nothing).
-- `jsonb_strip_nulls` drops any key whose value resolved to NULL (e.g. an absent
-- estimate/system sub-object), so we never write a literal null.

UPDATE notification_preferences SET categories = jsonb_strip_nulls(
  jsonb_build_object(
    'estimate', categories->'estimate',
    'billing', jsonb_build_object(
      'in_app',
        ( COALESCE((categories#>>'{payment,in_app}')::bool, false)
          OR COALESCE((categories#>>'{trial,in_app}')::bool, false)
          OR COALESCE((categories#>>'{quota,in_app}')::bool, false)
          OR COALESCE((categories#>>'{admin,in_app}')::bool, false)
          OR COALESCE((categories#>>'{billing,in_app}')::bool, false) ),
      'email',
        ( COALESCE((categories#>>'{payment,email}')::bool, false)
          OR COALESCE((categories#>>'{trial,email}')::bool, false)
          OR COALESCE((categories#>>'{quota,email}')::bool, false)
          OR COALESCE((categories#>>'{admin,email}')::bool, false)
          OR COALESCE((categories#>>'{billing,email}')::bool, false) )
    ),
    'system', categories->'system'
  )
)
WHERE categories ?| array['payment','trial','quota','admin','whatsapp','ai_job'];
