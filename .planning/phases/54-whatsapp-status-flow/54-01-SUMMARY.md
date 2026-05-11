---
phase: 54-whatsapp-status-flow
plan: 01
subsystem: whatsapp
tags: [whatsapp, server-action, status-management, unit-tests]
dependency_graph:
  requires:
    - 50-whatsapp-otp-verification (OTP flow: requestWhatsAppVerification + confirmWhatsAppVerification)
    - 40-webhook-infrastructure (company_whatsapp table + status gate in route.ts)
  provides:
    - updateWhatsAppStatus server action (suspend/reactivate)
    - unit tests for WASTATUS-02, WASTATUS-03, WASTATUS-04
  affects:
    - lib/actions/whatsapp-settings.ts (new export)
    - tests/unit/whatsapp/whatsapp-status-flow.test.ts (new file)
tech_stack:
  added: []
  patterns:
    - getAuthContext + supabase.update + revalidatePath (same as updateDeliveryFormat)
    - In-memory supabase mock (otp-verification.test.ts pattern)
    - vi.waitFor for fire-and-forget after() async assertion
key_files:
  created:
    - tests/unit/whatsapp/whatsapp-status-flow.test.ts
  modified:
    - lib/actions/whatsapp-settings.ts
decisions:
  - updateWhatsAppStatus placed after updateDeliveryFormat — consistent ordering of status/config actions
  - vi.waitFor used for WASTATUS-04 active-path assertion because route calls after() fire-and-forget (not awaited)
  - makeServiceSupabase factory used for WASTATUS-04 instead of vi.mocked(requireServiceClient) to avoid mock-reference tracking issues
metrics:
  duration: 16min
  completed_date: "2026-05-11"
  tasks: 2
  files: 2
---

# Phase 54 Plan 01: WhatsApp Status Flow — Server Action + Tests Summary

**One-liner:** `updateWhatsAppStatus` server action with WASTATUS-02/03/04 unit tests covering OTP activation, suspend/reactivate, and webhook active-gate.

## What Was Built

### Task 1: updateWhatsAppStatus server action (947aaea)

Appended `updateWhatsAppStatus(status: 'active' | 'suspended'): Promise<WhatsAppSettingsResult>` to `lib/actions/whatsapp-settings.ts`. Follows the identical pattern as `updateDeliveryFormat`: getAuthContext → supabase.update({ status }) → revalidatePath('/settings/integrations') → return { ok: true }.

### Task 2: Status flow unit tests (722dcbe)

Created `tests/unit/whatsapp/whatsapp-status-flow.test.ts` with 7 passing tests across three describe blocks:

- **WASTATUS-02** (OTP sets active): Confirms `confirmWhatsAppVerification` writes `status: 'active'` (not 'verified') and clears verification fields. Two tests.
- **WASTATUS-03** (suspend/reactivate): Covers suspend path, reactivate path, and unauthenticated guard for `updateWhatsAppStatus`. Three tests.
- **WASTATUS-04** (webhook gate): Verifies `processInboundWithDebounce` is NOT called when `company_whatsapp` query returns null (non-active status), and IS called when an active row is found. Two tests.

## Key Technical Findings

### vi.waitFor required for WASTATUS-04 active-path test

The webhook route calls `after(async () => { await handleInboundMessage(payload) })` without awaiting the result. The `after()` mock calls `fn()` synchronously, but `fn()` is an async function — the returned Promise is not awaited by the route. `await POST(req)` resolves before `handleInboundMessage` finishes. Using `vi.waitFor(() => expect(mock).toHaveBeenCalledOnce(), { timeout: 2000 })` polls until the assertion passes, correctly handling the async execution.

### Mock call tracking vs mock behavior

During WASTATUS-04 development, `vi.mocked(requireServiceClient).mock.calls.length` consistently showed 0 even though the supabase FROM method WAS being called (confirmed by side-effect logging). The `makeServiceSupabase(...)` factory approach (passing the mock return value via `.mockReturnValue`) works correctly at the behavior level — the assertion targets `processInboundWithDebounceMock` behavior, not requireServiceClient call counts.

## Deviations from Plan

None — plan executed exactly as written. The vi.waitFor usage is an implementation detail of the test, not a deviation from the plan's acceptance criteria.

## Self-Check

- [x] `lib/actions/whatsapp-settings.ts` exports `updateWhatsAppStatus` (line 244)
- [x] `tests/unit/whatsapp/whatsapp-status-flow.test.ts` exists with 7 passing tests
- [x] `npx vitest run tests/unit/whatsapp/whatsapp-status-flow.test.ts` exits 0
- [x] `npx tsc --noEmit` clean for whatsapp-settings and status-flow files
- [x] Task 1 commit: 947aaea
- [x] Task 2 commit: 722dcbe

## Self-Check: PASSED
