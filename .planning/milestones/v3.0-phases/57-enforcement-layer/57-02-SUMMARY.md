---
phase: 57-enforcement-layer
plan: 02
subsystem: api
tags: [whatsapp, entitlements, quota, enforcement, tdd]

# Dependency graph
requires:
  - phase: 57-01
    provides: getEntitlements() in lib/entitlements.ts + Entitlements type with whatsappEnabled
  - phase: 42-inbound-processing
    provides: processInboundMessages() in lib/whatsapp/handler.ts
provides:
  - WhatsApp entitlement gate in processInboundMessages — free-tier companies blocked before any Meta download
affects: [57-enforcement-layer, whatsapp, quota]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Entitlement check as first substantive action in processInboundMessages (before project create, before message loop)"
    - "Tier query via supabase.from('companies').select('tier').eq('id', companyId).single() — same pattern as checkQuota"
    - "Rejection reply includes /settings/billing upgrade URL per QUOTA-06"

key-files:
  created: []
  modified:
    - lib/whatsapp/handler.ts
    - tests/unit/whatsapp/handler.test.ts

key-decisions:
  - "Entitlement gate placed immediately after messages.length===0 guard and ownerPhone declaration — before lastMessageId, project creation, and message dispatch loop"
  - "companyTier added to makeSupabaseMock opts — companies table handler returns { tier: companyTier } from single() for test isolation"
  - "Default mockGetEntitlements in beforeEach returns whatsappEnabled:true so existing 7 tests are unaffected"

patterns-established:
  - "WhatsApp entitlement gate pattern: tier query → getEntitlements → !whatsappEnabled → sendWhatsAppMessage(upgrade) → return"

requirements-completed: [QUOTA-05, QUOTA-06]

# Metrics
duration: 8min
completed: 2026-05-14
---

# Phase 57 Plan 02: WhatsApp Entitlement Gate Summary

**WhatsApp entitlement check injected at top of processInboundMessages — free-tier companies rejected before any Meta media download or AI call, with /settings/billing upgrade reply.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-14T00:52:27Z
- **Completed:** 2026-05-14T01:00:14Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Free-tier companies (whatsappEnabled: false) receive an upgrade notification reply and are rejected before downloadWhatsAppMedia() is called — preventing Whisper/Vision costs
- Entitlement check uses the established supabase.from('companies').select('tier') pattern (consistent with checkQuota internals from plan 57-01)
- Upgrade reply body includes '/settings/billing' per QUOTA-06 requirement
- All 8 handler tests pass (7 pre-existing + 1 new gate test)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — handler entitlement test stub (RED)** - `f898d1c` (test)
2. **Task 2: Add entitlement gate to processInboundMessages (GREEN)** - `c26b512` (feat)

## Files Created/Modified

- `lib/whatsapp/handler.ts` — Added `import { getEntitlements }` + companies tier query + `!whatsappEnabled` early-return block before project creation and message loop
- `tests/unit/whatsapp/handler.test.ts` — Added `vi.mock('@/lib/entitlements')`, `companyTier` opt in makeSupabaseMock, companies table handler, default mockGetEntitlements in beforeEach, and 'WhatsApp entitlement gate' describe block

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `lib/whatsapp/handler.ts` — modified with getEntitlements import at line 21, entitlement check at lines 180-197
- Commits f898d1c and c26b512 verified in git log
- getEntitlements (line 187) appears before downloadWhatsAppMedia (lines 343, 388) — position verified
