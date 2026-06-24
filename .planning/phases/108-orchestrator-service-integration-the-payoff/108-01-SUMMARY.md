---
phase: 108-orchestrator-service-integration-the-payoff
plan: 01
subsystem: metering / quota
tags: [quota, entitlements, usage_events, price-research, migration]
requires:
  - lib/quota.ts (checkQuota / recordUsage / EventType / QUOTA_TO_EVENT)
  - lib/entitlements.ts (Entitlements + getEntitlements)
  - usage_events table (Phase 55)
provides:
  - "price_researched usage event (count-based, 1 unit/search, idempotent)"
  - "price_research QuotaType + QUOTA_TO_EVENT mapping"
  - "checkQuota('price_research') gating against a per-tier monthly allowance"
  - "maxPriceResearchPerMonth allowance field on every Entitlements tier"
  - "idempotent migration widening usage_events.event_type CHECK"
affects:
  - "Plan 108-03 orchestrator (researchUnmatchedPrices) — consumes checkQuota + recordUsage"
tech-stack:
  added: []
  patterns:
    - "Count-based quota gated BEFORE the non-estimate early-return (clean skip, never hard-fail)"
    - "Idempotent CHECK widening via DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT"
    - "null = unlimited allowance (never Infinity — JSON-safe)"
key-files:
  created:
    - supabase/migrations/20260624000002_phase108_usage_event_price_researched.sql
    - tests/unit/quota-price-research.test.ts
  modified:
    - lib/quota.ts
    - lib/entitlements.ts
    - tests/unit/entitlements.test.ts
decisions:
  - "Per-tier research allowance: free 50 / trial 200 / pro 1000 / business null (unlimited), sized from ~$0.005/search OpenRouter web-research cost"
  - "checkQuota price_research branch placed BEFORE the !== 'estimate' early-return so it is gated (not short-circuited to allowed:true/remaining:null)"
  - "recordUsage needs NO body change — it already accepts any EventType and dedups via check-then-insert"
metrics:
  duration_minutes: 4
  completed: 2026-06-24
  tasks: 2
  files: 5
  commits: 2
---

# Phase 108 Plan 01: Metering Primitives Summary

Landed the metering primitives the price-research orchestrator (Plan 108-03) composes: a count-based `price_researched` usage event (1 unit/search, idempotent via the existing `recordUsage` dedup), a per-tier monthly research allowance on `Entitlements`, and a `checkQuota('price_research')` gating branch that returns a clean `{allowed:false}` over-allowance skip rather than a hard fail. No orchestrator/integration here — quota + entitlements + migration only.

## What Shipped

**Task 1 — price_researched event + widened CHECK** (commit `6320557`)
- New idempotent migration `20260624000002_phase108_usage_event_price_researched.sql`: `DROP CONSTRAINT IF EXISTS usage_events_event_type_check` + re-`ADD` listing all four values (`estimate_generated`, `photo_analyzed`, `audio_transcribed`, `price_researched`). Mirrors the phase106 header-comment style. NO secrets.
- `lib/quota.ts`: `'price_research'` added to `QuotaType`, `'price_researched'` to `EventType`, `price_research: 'price_researched'` to `QUOTA_TO_EVENT`. `recordUsage` unchanged (already idempotent + EventType-generic).
- `tests/unit/quota-price-research.test.ts` (9 tests): migration static contract (readFileSync — DROP/ADD, all four values, idempotent, no secrets), union/mapping assertions, and a chainable-mock `recordUsage` dedup test (new key inserts `event_type:'price_researched'` once; same key → no-op).

**Task 2 — allowance + checkQuota gating** (commit `37acf01`)
- `lib/entitlements.ts`: new documented `maxPriceResearchPerMonth: number | null` on `Entitlements` + all 4 tiers (free 50 / trial 200 / pro 1000 / business null).
- `lib/quota.ts` `checkQuota`: a `quotaType === 'price_research'` branch placed BEFORE the existing `!== 'estimate'` early-return. Reads the company tier, gets `maxPriceResearchPerMonth`, returns `{allowed:true, remaining:null}` for a null (unlimited) limit, else counts this month's `price_researched` events (UTC month boundary, `.eq('event_type', QUOTA_TO_EVENT.price_research)`) and returns `{allowed: count < limit, remaining: Math.max(0, limit - count)}`. The estimate/photo_batch/audio_minutes paths are byte-unchanged.
- `tests/unit/entitlements.test.ts` (extended): allowance presence/values on every tier + `getEntitlements` resolution + 3 checkQuota cases (free at 50 → allowed:false/remaining:0; free at 0 → allowed:true/remaining:50; business null → allowed:true/remaining:null).

## Verification

- `npx vitest run tests/unit/entitlements.test.ts tests/unit/quota-price-research.test.ts tests/unit/quota.test.ts` → 3 files / 34 passed (existing quota.test.ts estimate branch unaffected).
- Full `npx vitest run` → **271 files passed | 3 skipped, 1899 passed | 2 skipped | 33 todo** (was 270/1884 at the 107-03 baseline; +1 file / +15 assertions, no regressions).
- `npx tsc --noEmit` clean on all modified files.
- Grep acceptance: `maxPriceResearchPerMonth` ×5 (type + 4 tiers), `price_research` ×7 in quota.ts, `price_researched` ×2 in quota.ts + ×3 in migration.
- gitleaks ran on both commits (normal hooked commits, NO `--no-verify`) — no leaks found.

## Deviations from Plan

None — plan executed exactly as written.

## Operational Deferral

- Migration `20260624000002_phase108_usage_event_price_researched.sql` is NOT applied to the remote DB. Deploy is owned by CI→GHCR→Coolify — apply via the pipeline, never build/migrate on the VPS. (Carries forward alongside the deferred phase106 migration `20260624000001`.)

## Known Stubs

None. The primitives are dormant only in the sense that no production caller invokes `checkQuota('price_research')` / `recordUsage(..., 'price_researched', ...)` yet — Plan 108-03 (orchestrator) wires them in. No hardcoded/empty values flow to any UI.

## Self-Check: PASSED
- supabase/migrations/20260624000002_phase108_usage_event_price_researched.sql — FOUND
- tests/unit/quota-price-research.test.ts — FOUND
- lib/quota.ts / lib/entitlements.ts / tests/unit/entitlements.test.ts — modified
- commit 6320557 — FOUND
- commit 37acf01 — FOUND
