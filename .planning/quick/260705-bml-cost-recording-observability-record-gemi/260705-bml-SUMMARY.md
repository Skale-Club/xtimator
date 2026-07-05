---
phase: quick-260705-bml
plan: 01
subsystem: ai-observability
tags: [observability, cost-recording, fallback, sentry, gemini]
requires:
  - lib/billing/record-ai-cost.ts (recordAICost — unchanged, measure-only)
  - "@sentry/nextjs (captureMessage)"
provides:
  - Gemini fallback adapter now records a gemini/null-cost ai_cost_events row on successful generate + refine
  - callWithFallback emits a never-throw Sentry signal on the successful-fallback branch
affects:
  - lib/ai/providers/gemini.ts
  - lib/ai/with-fallback.ts
tech-stack:
  added: []
  patterns:
    - "AWAIT (not void) never-throw recordAICost on the Gemini adapter, mirroring openrouter.ts:236"
    - "try/catch-swallowed Sentry side-effect, mirroring lib/observability/capture.ts captureBackgroundError"
    - "null-vs-0 cost discipline: realCostUsd null (NEVER 0) still COUNTS a Gemini-served event"
key-files:
  created:
    - tests/unit/ai/gemini-cost-capture.test.ts
  modified:
    - lib/ai/providers/gemini.ts
    - lib/ai/with-fallback.ts
    - tests/unit/ai/with-fallback.test.ts
decisions:
  - "Gemini generate uses input.costContext ids; refine uses randomUUID + null ids (RefineEstimateInput carries no costContext) — mirrors the proven OpenRouter refine path"
  - "Vision (analyzePhotoGemini) + transcription (transcribeAudioGemini) cost recording DEFERRED with in-code NOTE comments — no costContext param, would be an uncorrelated null-id row; threading it through signatures + call sites is out of scope"
  - "Silent-fallback Sentry signal is company-agnostic (op + primary error only) to preserve the multi-tenant invariant; escalates warning->error only on a billing/auth primary-error string match"
metrics:
  duration: ~7m
  completed: 2026-07-05
  tasks: 2
  files: 4
  commits: 2
---

# Phase quick-260705-bml Plan 01: Cost-Recording Observability Summary

Closed two in-code observability gaps that let an OpenRouter-out-of-credits outage be served silently by the Gemini fallback for hours with zero cost rows and zero alerts: the Gemini adapter now records a null-cost gemini `ai_cost_events` row on every successful generate + refine, and `callWithFallback` emits a never-throw Sentry signal (escalating to `error` on billing/auth primary failures) whenever the fallback silently serves a request.

## What Was Built

### FIX-1 — Gemini fallback adapter records a null-cost event (Task 1)

`lib/ai/providers/gemini.ts` previously made ZERO `recordAICost` calls, so any Gemini-served estimate was invisible in `ai_cost_events`. Added an AWAITED, never-throw, null-cost `recordAICost` on the successful `generateEstimate` and `refineEstimate` paths, mirroring the proven OpenRouter adapter pattern (openrouter.ts:236):

- `generateEstimate` — records `{ provider: 'gemini', model: 'gemini-2.5-flash', operationType: 'estimate', realCostUsd: null }` with `attemptId`/`companyId`/`projectId` from `input.costContext` (falling back to `randomUUID()` + null ids when absent). Correlation ids come ONLY from the trusted, non-LLM `costContext` — never from the model's returned `args`.
- `refineEstimate` — same call with a `randomUUID()` attemptId and null ids (`RefineEstimateInput` carries no `costContext`, matching openrouter.ts:134).
- `realCostUsd` is strictly `null` (NEVER 0) — the null-vs-0 discipline means a null-cost row still COUNTS the "served by gemini, cost unknown" event rather than biasing calibration toward zero.
- The call is AWAITED (not `void`): inside an Inngest step a floating promise can be dropped when the invocation freezes. `recordAICost` is internally never-throw, so awaiting is safe and can never affect the estimate return.
- `analyzePhotoGemini` (vision) and `transcribeAudioGemini` (audio_minutes) DEFERRED with in-code `// NOTE:` comments — they take no `costContext`, so recording there would be an uncorrelated null-id row.

New `tests/unit/ai/gemini-cost-capture.test.ts` asserts generate/refine each record exactly one gemini/estimate/null-cost row, ids come from costContext (generate) or randomUUID+null (refine), `realCostUsd` is null and not 0, and the LLM-derived `suggested_client_name` never leaks into correlation ids.

### FIX-2 — Surface the silent fallback via a never-throw Sentry signal (Task 2)

`lib/ai/with-fallback.ts` `callWithFallback` returned `fallbackFired: true` but never logged or alerted, so a successful silent degradation was undetectable. Added a private `reportSilentFallback(op, primaryErr)` helper (fully try/catch-swallowed, mirroring `captureBackgroundError`) called on the SUCCESSFUL-fallback branch ONLY, before the `servedBy: 'fallback'` return:

- Emits exactly one `Sentry.captureMessage` at level `warning`, tags `{ op, ai_fallback: 'served_by_fallback' }`, `extra.primaryError` carrying the primary error string.
- Escalates to level `error` + tag `ai_primary_down: 'billing_or_auth'` when the primary error string matches `/402|insufficient credits|401|user not found|not configured/i` (an account-level failure an operator must act on, not a transient blip).
- Company-agnostic — the signal carries op + primary error only, no `companyId` (multi-tenant invariant).
- Never-throw: a throwing Sentry mock leaves the fallback result fully intact.

`tests/unit/ai/with-fallback.test.ts` extended with 6 observability cases (warning emission, 402/credits escalation, 401/auth escalation, happy-path silence, both-fail silence, never-throw). Every pre-existing contract case (`.cause===primary`, `fallbackCause`, both-fail `ProvidersUnavailableError`, `InvalidEstimateOutputError` rethrow, primary-called-once) is byte-identical and green.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the prescribed TDD RED→GREEN flow (no REFACTOR step needed for either). No CLAUDE.md adjustments, no architectural (Rule 4) escalations, no auth gates.

## Invariants Preserved

- `lib/billing/record-ai-cost.ts` UNCHANGED — the measure-only invariant guard (`tests/unit/billing/measure-only-invariant.test.ts`) stays green; FIX-1 only imports and calls `recordAICost`.
- `callWithFallback` control flow, return shape, `.cause===primary` contract, `fallbackCause`, the both-fail `ProvidersUnavailableError` path, and the `InvalidEstimateOutputError` rethrow are all unchanged.
- No DB migration, no charging arithmetic, no secrets.

## Verification

Sanity greps:
- `grep -c "await recordAICost(" lib/ai/providers/gemini.ts` → 2 (generate + refine).
- `grep -c "Sentry.captureMessage" lib/ai/with-fallback.ts` → 1.
- `git diff` shows `lib/billing/record-ai-cost.ts` untouched.
- Both vision/transcription DEFER notes present.

Full gate:
- `npx tsc --noEmit -p tsconfig.ci.json` → exit 0 (clean).
- `npx vitest run tests/unit tests/eval` → 2829 passed, 24 todo, 2 skipped, 1 failed.
  - The single failure is the KNOWN pre-existing parallel-only flake `tests/unit/company-action.test.ts > INSERT branch...` (a 5000ms test timeout under full parallel load, in a file this plan does not touch). Confirmed green in isolation: re-running `npx vitest run tests/unit/company-action.test.ts` passes 11/11 in 3.72s. This is not a regression from either fix.

Targeted per-task runs (all green):
- Task 1: `npx vitest run tests/unit/ai/gemini-cost-capture.test.ts tests/unit/ai/gemini-adapter.test.ts tests/unit/billing/measure-only-invariant.test.ts` → 12 passed.
- Task 2: `npx vitest run tests/unit/ai/with-fallback.test.ts` → 11 passed.

## Commits

- `a711a3f1` — feat(quick-260705-bml): record null-cost gemini ai_cost_events row on fallback generate + refine
- `4e24784c` — feat(quick-260705-bml): surface silent OpenRouter->Gemini fallback via never-throw Sentry signal

## Self-Check: PASSED

All created/modified files exist on disk; both task commits (`a711a3f1`, `4e24784c`) are present in git history. No missing items.
