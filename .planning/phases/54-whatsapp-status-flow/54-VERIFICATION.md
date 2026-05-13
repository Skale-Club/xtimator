---
phase: 54-whatsapp-status-flow
verified: 2026-05-13T18:40:00Z
status: gaps_found
score: 3/4 must-haves verified
gaps:
  - truth: "Status transitions follow the full pipeline: pending (credentials submitted, awaiting OTP) -> verified (OTP confirmed) -> active (auto-approved post-verification) -> suspended (admin-controlled)"
    status: partial
    reason: "REQUIREMENTS.md WASTATUS-02 checkbox is unchecked. The code auto-activates directly (pending -> active) skipping the 'verified' intermediate state. The ROADMAP Success Criterion 2 says 'auto-transitions to active without admin approval' — which the code satisfies — but the REQUIREMENTS.md text describes a three-step pipeline that includes 'verified' as an intermediate state. The checkbox has not been updated to reflect the implementation decision. Either the checkbox needs to be checked (if intentional skip is accepted) or the test needs to verify the 'verified' intermediate step is in scope."
    artifacts:
      - path: "lib/actions/whatsapp-settings.ts"
        issue: "confirmWhatsAppVerification sets status='active' directly (line 158). The 'verified' state is never written. This matches the ROADMAP intent but contradicts the REQUIREMENTS.md description of the pipeline."
      - path: ".planning/REQUIREMENTS.md"
        issue: "WASTATUS-02 checkbox is unchecked ([ ]) despite implementation being present. Either the implementation doesn't fully satisfy the requirement as written, or the checkbox was not updated after deliberate design decision to skip 'verified' intermediate state."
    missing:
      - "Update REQUIREMENTS.md to check WASTATUS-02 if the team accepts auto-activation (pending -> active, no verified intermediate) as the intended design"
      - "OR clarify if 'verified' must be a distinct intermediate state written before 'active' — and implement accordingly"
  - truth: "REQUIREMENTS.md WASTATUS-04 checkbox is unchecked despite the gate being implemented and tested"
    status: partial
    reason: "REQUIREMENTS.md shows WASTATUS-04 as unchecked ([ ]) even though the webhook route has .eq('status', 'active') gate at line 94, and the unit tests verify the gate passes/blocks correctly (7/7 tests pass). This is a documentation gap, not a code gap."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "WASTATUS-04 checkbox is unchecked ([ ]) despite implementation existing in app/api/webhooks/whatsapp/route.ts line 94 and confirmed by passing unit tests"
    missing:
      - "Check WASTATUS-04 checkbox in REQUIREMENTS.md — implementation is verified working"
human_verification:
  - test: "Navigate to /settings/integrations with a connected WhatsApp account (status=active). Confirm 'Active' badge shows in green, 'Suspend' button is visible, no raw text like '(active)' appears anywhere."
    expected: "Green 'Active' badge displayed; 'Suspend' button visible below delivery format selector; Disconnect button still present"
    why_human: "Badge colors and button states require browser rendering"
  - test: "Click 'Suspend' on an active connection. Confirm toast fires, badge changes to red 'Suspended', 'Reactivate' button appears in place of 'Suspend'."
    expected: "Toast 'WhatsApp connection suspended.' fires; badge turns red 'Suspended'; Reactivate button appears; Suspend button disappears"
    why_human: "Optimistic state update and toast behavior require live UI interaction"
  - test: "With a suspended connection, click 'Reactivate'. Confirm toast fires, badge returns to green 'Active', 'Suspend' button reappears."
    expected: "Toast 'WhatsApp connection reactivated.' fires; badge returns to green 'Active'; Suspend button reappears"
    why_human: "State transition roundtrip requires live UI interaction"
---

# Phase 54: WhatsApp Status Flow Verification Report

**Phase Goal:** The WhatsApp connection status pipeline is fully wired — UI shows accurate labels, transitions follow the correct sequence, admins can suspend and reactivate, and the message handler enforces the active gate
**Verified:** 2026-05-13T18:40:00Z
**Status:** gaps_found (documentation gaps; code implementation is complete)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | UI displays human-readable status labels (Pending, Verified, Active, Suspended) — no raw enum values | VERIFIED | `StatusBadge` component and `STATUS_LABELS` map in `whatsapp-connect-card.tsx` lines 58-78; raw `({current.status})` text confirmed absent |
| 2 | After OTP confirmation, status auto-transitions to `active` (no admin approval required) | VERIFIED | `confirmWhatsAppVerification` sets `status: 'active'` at line 158; WASTATUS-02 tests confirm `lastUpdate.status === 'active'` and `!== 'verified'` |
| 3 | Owner can suspend and reactivate from the UI, both actions persist and reflect immediately | VERIFIED | `updateWhatsAppStatus` server action exported at line 244; Suspend button at card line 306, Reactivate button at line 317; optimistic `setCurrent` at card line 201 |
| 4 | Inbound messages from non-active connections are silently ignored | VERIFIED | Webhook route `.eq('status', 'active')` at line 94; WASTATUS-04 tests confirm `processInboundWithDebounce` not called when query returns null |

**Score:** 4/4 truths verified in code

**Documentation gap (not blocking code):** REQUIREMENTS.md checkboxes for WASTATUS-02 and WASTATUS-04 are unchecked despite implementations passing tests. These require checkbox updates.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/actions/whatsapp-settings.ts` | `updateWhatsAppStatus` server action | VERIFIED | Exported at line 244, correct signature `(status: 'active' | 'suspended') => Promise<WhatsAppSettingsResult>`, calls `supabase.from('company_whatsapp').update({ status }).eq('company_id', companyId)`, calls `revalidatePath('/settings/integrations')` |
| `components/settings/whatsapp-connect-card.tsx` | `StatusBadge` + suspend/reactivate buttons | VERIFIED | `StatusBadge` defined at line 65, `STATUS_LABELS` at line 58, `onUpdateStatus` at line 194, Suspend button at line 306, Reactivate button at line 317 |
| `tests/unit/whatsapp/whatsapp-status-flow.test.ts` | 7 unit tests for WASTATUS-02/03/04 | VERIFIED | File exists, 7 tests across 3 describe blocks, all pass (`npx vitest run` exits 0) |
| `app/api/webhooks/whatsapp/route.ts` | `status='active'` gate | VERIFIED | `.eq('status', 'active')` present at line 94 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `whatsapp-connect-card.tsx` | `lib/actions/whatsapp-settings.ts` | `import { updateWhatsAppStatus }` | WIRED | Import confirmed at card line 16; `updateWhatsAppStatus(newStatus)` called at card line 196 |
| `whatsapp-connect-card.tsx` | Local state | `setCurrent({ ...current, status: newStatus })` | WIRED | Optimistic update at card line 201, pattern matches plan spec |
| `lib/actions/whatsapp-settings.ts` | `company_whatsapp` table | `supabase.from('company_whatsapp').update({ status })` | WIRED | Lines 251-254 in whatsapp-settings.ts; unit tests confirm DB update payload |
| `app/api/webhooks/whatsapp/route.ts` | `company_whatsapp` table | `.eq('status', 'active')` | WIRED | Line 94 in route.ts; gate rejects any non-active row |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `whatsapp-connect-card.tsx` | `current` (WhatsAppStatus) | `initial` prop from server component | Real DB row passed as prop | FLOWING — prop comes from server, not hardcoded empty |
| `whatsapp-connect-card.tsx` | `current.status` after suspend/reactivate | `setCurrent({ ...current, status: newStatus })` then `router.refresh()` | Real DB write via `updateWhatsAppStatus` then page revalidation | FLOWING |
| `app/api/webhooks/whatsapp/route.ts` | `whatsappConfig` | `supabase.from('company_whatsapp').select('company_id').eq(...).eq('status', 'active').single()` | Real DB query with status filter | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 7 unit tests pass | `npx vitest run tests/unit/whatsapp/whatsapp-status-flow.test.ts` | 7 passed (1 file), Duration 6.75s | PASS |
| `updateWhatsAppStatus` exported | `grep "export async function updateWhatsAppStatus" lib/actions/whatsapp-settings.ts` | Line 244 matches | PASS |
| No raw enum text in card | `grep "current\.status)" whatsapp-connect-card.tsx` | No matches | PASS |
| Webhook status gate present | `grep "eq('status', 'active')" app/api/webhooks/whatsapp/route.ts` | Line 94 matches | PASS |
| StatusBadge defined | `grep "StatusBadge\|STATUS_LABELS" whatsapp-connect-card.tsx` | Multiple matches (lines 58, 65, 278) | PASS |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WASTATUS-01 | 54-02-PLAN.md | Human-readable status labels in UI | SATISFIED | `STATUS_LABELS` map + `StatusBadge` component, all four enum values mapped |
| WASTATUS-02 | 54-01-PLAN.md | Status auto-transitions from pending to active after OTP | SATISFIED (code) / UNCHECKED (docs) | `confirmWhatsAppVerification` sets `status: 'active'` directly; 2 unit tests confirm; REQUIREMENTS.md checkbox not updated |
| WASTATUS-03 | 54-01-PLAN.md, 54-02-PLAN.md | Owner can suspend and reactivate | SATISFIED | `updateWhatsAppStatus` server action + Suspend/Reactivate buttons in UI; 3 unit tests confirm |
| WASTATUS-04 | 54-01-PLAN.md | Webhook gate enforces status=active | SATISFIED (code) / UNCHECKED (docs) | `.eq('status', 'active')` in route.ts; 2 unit tests confirm; REQUIREMENTS.md checkbox not updated |

**Orphaned requirements:** None. All four WASTATUS IDs claimed by plans are accounted for.

**Documentation gap:** REQUIREMENTS.md checkboxes for WASTATUS-02 and WASTATUS-04 are `[ ]` (unchecked) despite both being implemented and passing tests. The ROADMAP correctly marks the phase as completed. The REQUIREMENTS.md needs two checkbox updates.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/settings/whatsapp-connect-card.tsx` | 244, 360, 375, 392 | `placeholder=` attribute | Info | HTML input placeholder attributes — not a stub, expected behavior |

No blockers or warnings found. The `placeholder` matches are Input field example text, not implementation stubs.

---

## Human Verification Required

### 1. Active Status Badge Display

**Test:** Navigate to `/settings/integrations` with a WhatsApp connection in `active` status
**Expected:** Green badge labeled "Active" is displayed; "Suspend" button is visible below the delivery format selector; no raw text like "(active)" appears anywhere in the card
**Why human:** Badge color rendering and absence of raw enum text require browser visual inspection

### 2. Suspend Action Roundtrip

**Test:** Click "Suspend" on an active connection
**Expected:** Toast "WhatsApp connection suspended." fires; badge changes to red "Suspended"; "Reactivate" button appears; "Suspend" button disappears; page state is consistent on refresh
**Why human:** Optimistic UI update sequence and toast behavior require live interaction

### 3. Reactivate Action Roundtrip

**Test:** With a suspended connection, click "Reactivate"
**Expected:** Toast "WhatsApp connection reactivated." fires; badge returns to green "Active"; "Suspend" button reappears
**Why human:** State transition roundtrip from suspended back to active requires live UI

*(Note: Task 2 in 54-02-PLAN.md was a human-verify checkpoint — 54-02-SUMMARY.md records it as "approved by user". The above items are included for completeness, as the automated verifier cannot confirm the visual approval record independently.)*

---

## Gaps Summary

Two documentation gaps exist — both are checkbox-only issues in REQUIREMENTS.md, not code failures:

**Gap 1 — WASTATUS-02 unchecked:** The requirement text describes a pipeline that includes `verified` as an intermediate state ("pending → verified → active"). The code implements auto-activation, going directly from `pending` to `active`. The ROADMAP Success Criterion 2 explicitly endorses this shortcut. The implementation is correct per the ROADMAP, but the REQUIREMENTS.md checkbox was never updated. Resolution: check the WASTATUS-02 box and optionally clarify the description to say "pending → active (direct, no verified intermediate)".

**Gap 2 — WASTATUS-04 unchecked:** The webhook gate (`.eq('status', 'active')`) has been in `route.ts` since Phase 40 infrastructure. Unit tests confirm it blocks non-active connections. The checkbox was not updated. Resolution: check the WASTATUS-04 box.

No code gaps. All 4 observable truths are verified in the codebase. All 7 unit tests pass. All key links are wired. No anti-patterns blocking goal achievement.

---

_Verified: 2026-05-13T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
