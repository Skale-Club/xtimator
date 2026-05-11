# Phase 50: WhatsApp OTP Number Verification — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-015 Gap 2

## What was built

Two-step verification flow for connecting a WhatsApp number. Replaces the legacy single-step connect that immediately set status='active' without proving ownership of the number. Now: credentials submitted → 6-digit code sent via WhatsApp → user enters code → row activated only on match.

### Files created

- `supabase/migrations/20260511000001_phase50_whatsapp_otp.sql` — adds `verification_code`, `verification_attempts`, `verification_expires_at` columns to `company_whatsapp`
- `tests/unit/whatsapp/otp-verification.test.ts` — 9 tests covering the full flow including rollback, attempts, expiry, and wipe-on-exhaustion

### Files modified

- `lib/actions/whatsapp-settings.ts` — added `requestWhatsAppVerification` (step 1) and `confirmWhatsAppVerification` (step 2); legacy `connectWhatsApp` preserved for backward compat
- `components/settings/whatsapp-connect-card.tsx` — new "pending" UI step shows the OTP entry input after submitting credentials; button label changed to "Send verification code"

## The new flow

```
[Step 1] User submits phone + IDs
   ↓
   requestWhatsAppVerification()
   - upsert row: status='pending' + 6-digit code + 10min expiry
   - sendWhatsAppMessage(to: phone, body: "Code is *123456*...")
   - if send fails → roll back the row, return clear error
   ↓
   UI switches to OTP entry view

[Step 2] User enters code received on their phone
   ↓
   confirmWhatsAppVerification(code)
   - load row, check pending status
   - check expiry → if expired, wipe row, error "expired, start over"
   - if code matches:
       status='active', verified_at=now, code/attempts/expires cleared
   - if code mismatches:
       attempts += 1
       if attempts >= 3 → wipe row, error "too many attempts"
       else → error "N attempts remaining"
```

## Key design decisions

- **10-minute TTL** — long enough for the user to find their phone and read the message, short enough that abandoned attempts don't pollute the table.
- **3 attempts max** — standard practice (Stripe, Google use 3-5). After exhaustion, the row is wiped entirely; user must restart, including receiving a new code. This prevents brute force and forces a fresh state.
- **Rollback on send failure** — if `sendWhatsAppMessage` throws (bad token, wrong phoneNumberId), we delete the row immediately so the user can retry cleanly without seeing stale "pending" state.
- **Legacy `connectWhatsApp` kept** — marked `@deprecated` but functional. Callers can migrate incrementally. The UI already moved to the new flow.
- **Existing rows are not migrated** — companies already connected via the legacy single-step flow keep `status='active'`. Only new connections go through OTP. This avoids forcing all existing users through re-verification.
- **Numeric code, 6 digits, with leading zeros** — `Math.floor(random * 1e6).padStart(6, '0')`. Compatible with `inputMode="numeric"` mobile keyboards.

## Success criteria

| Criterion | Status |
|---|---|
| Step 1: credentials → status='pending' → code via WhatsApp | ✅ |
| Step 2: correct code → status='active', verified_at set, code cleared | ✅ |
| 10min TTL enforced, wipes row on expiry | ✅ |
| Max 3 attempts; wipes row after exhaustion | ✅ |
| Webhook only processes `status='active'` (existing behavior preserved) | ✅ no change to `handler.ts` |
| Test coverage | ✅ 9/9 OTP tests + 103/103 across v2.1 suites |

## UI states

```
┌─ current === null ─────────────────┐
│  Credentials form (phone, IDs)     │
│  [Send verification code] button   │
└────────────────────────────────────┘
       ↓ (action succeeded)
┌─ current.status === 'pending' ─────┐
│  "Verification code sent to +X"    │
│  [______] 6-digit input            │
│  [Verify] [Cancel]                 │
└────────────────────────────────────┘
       ↓ (correct code)
┌─ current.status === 'active' ──────┐
│  ✓ Connected: +X (active)          │
│  Delivery format: [share_link ▼]   │
│  [Disconnect]                      │
└────────────────────────────────────┘
```

## Open follow-ups

- **Resend code link** — if the user didn't receive the code (rare), no in-UI way to re-trigger. Workaround: hit Cancel and re-submit credentials. Could add a `resendVerificationCode()` action later.
- **i18n** — verification message hardcoded in English. SEED-001 i18n system can be used here once the `/api/translate` integration is wired for backend strings.
- **Rate limit on verification requests** — Phase 47 limits per-IP, but a malicious user with valid credentials could trigger N codes/hour. Low risk because they need valid `phoneNumberId` + `wabaId` which only the legitimate owner has.
