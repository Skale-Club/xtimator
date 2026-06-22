-- Phase 104 (NOTIF-05) — Per-channel opt-in / consent columns on
-- notification_preferences.
--
-- SMS + WhatsApp are paid/consent-gated channels. We store explicit, auditable
-- opt-in evidence rather than inferring consent from a toggle alone (TCPA — this
-- is a US-market product). The dispatch SMS branch sends ONLY when
-- `sms_opt_in_at IS NOT NULL` (plus a phone on file + the per-category toggle on).
--
--   - sms_opt_in_at          : when the owner consented to PAID SMS notifications
--   - sms_opt_in_consent_text : the exact paid-channel copy shown at opt-in (audit)
--   - whatsapp_opt_in_at      : when the owner opted into WhatsApp notifications
--
-- RLS: these columns inherit notification_preferences' existing own-row policies
-- (`user_id = auth.uid()`) — no new policy is needed, and no service-role-only
-- exposure is introduced.
--
-- Idempotent via IF NOT EXISTS so re-running is a no-op. NO secrets.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_opt_in_consent_text TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ;
