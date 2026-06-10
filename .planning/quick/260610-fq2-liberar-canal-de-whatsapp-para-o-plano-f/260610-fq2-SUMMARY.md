---
quick_id: 260610-fq2
description: Liberar canal de WhatsApp para o plano free
date: 2026-06-10
commit: 2b91496
status: complete
---

# Quick Task 260610-fq2 Summary

## What changed

Enabled the WhatsApp channel for `free`-tier companies by flipping a single
entitlement flag.

- `lib/entitlements.ts` — `tiers.free.whatsappEnabled`: `false` → `true`.

## Why one line was enough

WhatsApp access is gated exclusively through `getEntitlements(tier).whatsappEnabled`.
Three call sites consume it, all now unblocked for free tier:

1. `lib/whatsapp/handler.ts:345` — inbound processor (no longer sends the
   "not available on your current plan" reply / no longer short-circuits before
   draft creation).
2. `app/api/estimates/[id]/send-whatsapp/route.ts:87` — outbound send route
   (no longer returns 403).
3. `app/(app)/projects/[id]/page.tsx:115` — WhatsApp send button now renders.

The Settings → Integrations connect flow was already plan-agnostic, so no change
was needed there.

## Tests

- Updated `tests/unit/entitlements.test.ts` — assertion flipped to expect
  `tiers.free.whatsappEnabled === true`.
- Updated stale `it.todo` wording in `tests/unit/whatsapp/entitlement-gate.test.ts`.
- `tests/unit/whatsapp/handler.test.ts` unchanged — it mocks `getEntitlements`
  directly, so it still validates the gate mechanism (rejects when the flag is
  false) independent of the free-tier default.
- Ran: `vitest run entitlements.test.ts handler.test.ts` → 19 passed.

## Notes / follow-ups

- **Operational cost:** Meta bills per WhatsApp conversation. This removes the
  monetization gate on a paid-cost channel for all free users — the explicit
  intent of the request.
- Sending still requires a connected + verified number
  (`company_whatsapp.status === 'active'`); that gate is unchanged.

## Commits

- `2b91496` feat(quick-260610-fq2): enable WhatsApp channel for free tier
