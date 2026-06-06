# Quick Task 260602-jns: Move WhatsApp Integration to Admin-Only

**Date:** 2026-06-02
**Status:** Complete
**Commits:** f476606, 7eaba97

## What was done

### Task 1 — DB migration + dead code removal (f476606)

- **Created** `supabase/migrations/20260602000001_simplify_company_whatsapp.sql` — drops 8 columns: `phone_number`, `phone_number_id`, `waba_id`, `status`, `verified_at`, `verification_code`, `verification_attempts`, `verification_expires_at`. Column `delivery_format` is kept (used by `send-estimate.ts`).
- **Deleted** `components/settings/whatsapp-connect-card.tsx` — full per-company OTP connect UI removed.
- **Rewrote** `lib/actions/whatsapp-settings.ts` — stripped to `updateDeliveryFormat` only; removed `requestWhatsAppVerification`, `confirmWhatsAppVerification`, `disconnectWhatsApp`, `updateWhatsAppStatus`, and all OTP helpers.
- **Deleted** `tests/unit/whatsapp/otp-verification.test.ts` and `tests/unit/whatsapp/whatsapp-status-flow.test.ts` — tests for removed flows.

### Task 2 — Settings page + webhook routing (7eaba97)

- **Replaced** WhatsApp connect section in `app/(app)/settings/integrations/page.tsx` with a read-only "Platform-managed" info card. Removed `WhatsAppConnectCard` import, `createServiceClient`/`getActiveCompanyId` calls, and the `company_whatsapp` fetch.
- **Fixed** inbound routing in `app/api/webhooks/whatsapp/route.ts`: replaced broken `company_whatsapp.phone_number = +{fromPhone}` lookup (sender ≠ our platform number) with:
  1. `whatsapp_conversations.contact_phone = +{fromPhone}` ORDER BY `last_message_at DESC` — routes to most-recently-active company thread
  2. Fallback: `clients.phone = +{fromPhone}` — handles new contacts with no prior conversation

## Key invariants preserved

- `lib/whatsapp/send-estimate.ts` still reads `company_whatsapp.delivery_format` — column survived the migration.
- Admin WhatsApp API token management at `/admin/integrations/whatsapp` — unchanged, already correct.
- HMAC webhook signature verification — unchanged.
