---
phase: 110-real-cost-capture-foundation-measure-only-mode
verified: 2026-06-24T14:25:00Z
status: passed
score: 12/12 must-haves verified
human_verification:
  - test: "Apply migration 20260624000003 to remote and confirm a real OpenRouter generate + a real transcribe produce ai_cost_events rows in production"
    expected: "One ai_cost_events row per AI op, real_cost_usd populated (or NULL when provider gives no cost), correlated by attempt_id; no credit movement anywhere"
    why_human: "Requires the deploy pipeline (CI->GHCR->Coolify) to apply the authored-only migration + a live OpenRouter/Whisper call; cannot be exercised from static verification"
---

# Phase 110: Real Cost Capture Foundation (Measure-Only Mode) Verification Report

**Phase Goal:** The system records the real USD cost of every AI operation — OpenRouter calls (via `usage.cost`) and computed Whisper/STT cost (audio minutes × configurable rate) — correlated to the existing attempt instrumentation, running in MEASURE-ONLY mode (no charging, no credit movement) so real per-operation cost is collected in production before any billing exists. Prerequisite for the credit ledger (Phase 112).
**Verified:** 2026-06-24T14:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Append-only `ai_cost_events` table exists, keyed by attempt_id + operation_type, service-role writes only, super-admin SELECT | ✓ VERIFIED | Migration `20260624000003`: `CREATE TABLE IF NOT EXISTS public.ai_cost_events`, RLS enabled, deny-all clients (no INSERT/UPDATE/DELETE policy), single super-admin SELECT policy via `platform_admins`, 3 indexes incl. `ai_cost_events_attempt_id` |
| 2 | `recordAICost()` writes one row and NEVER throws on DB failure | ✓ VERIFIED | `record-ai-cost.ts:53-71` — try → `requireServiceClient().from('ai_cost_events').insert(...)` → catch → `console.warn` → returns void. Mirrors `recordPipelineEvent` exactly. `record-ai-cost.test.ts` green |
| 3 | Unknown cost recorded as NULL, never 0 (null vs 0 discipline) | ✓ VERIFIED | `real_cost_usd: ev.realCostUsd` passed THROUGH (line 60). NUMERIC(12,6) NULLABLE in migration. No `?? 0` on any cost value (grep clean). Guard test asserts `not.toMatch(/realCostUsd \?\? 0/)` |
| 4 | New billing path contains zero credit/debit/balance/ledger/markup code (measure-only) | ✓ VERIFIED | `grep -i credit\|debit\|ledger\|balance\|markup` on both cost modules → 0 hits. Only import is `requireServiceClient`. Static guard `measure-only-invariant.test.ts` passes |
| 5 | Every OpenRouter response's `usage.cost` (USD) captured and recorded | ✓ VERIFIED | `openrouter.ts:214` `json.usage?.cost ?? null`; `openrouter-client.ts:215` (vision) + `:310` (translation). All `void recordAICost(...)` |
| 6 | When `usage.cost` absent, real_cost_usd recorded as null (never 0) | ✓ VERIFIED | All three sites use `json.usage?.cost ?? null`. `openrouter-cost-capture.test.ts` pins present→value, absent→null, usage-entirely-absent→null |
| 7 | attemptId/companyId reach the adapter via non-LLM costContext, never from model output | ✓ VERIFIED | Data-flow trace: inngest `attemptId` → `graph.invoke` → `state.attemptId` annotation → generate node builds `costContext` from `state` (not `parsed`) → `estimateInput.costContext` → adapter `args.costContext`. Correlation ids never read from `json.choices`/`parsed` |
| 8 | No deprecated `usage:{include:true}` flag, no `/api/v1/generation` lookup | ✓ VERIFIED | `grep usage:\s*\{\s*include` → 0; `grep api/v1/generation` → 0 (repo-wide). Cost read inline from the chat-completion response |
| 9 | Whisper cost computed as (duration_seconds / 60) × WHISPER_USD_PER_MINUTE and recorded | ✓ VERIFIED | `whisper-cost.ts`: env-overridable const (default 0.006) + pure `computeWhisperCostUsd`. Wired in `transcribe-audio.ts:200` on terminal-success path |
| 10 | Zero/unknown duration records real_cost_usd = null (never 0) | ✓ VERIFIED | `whisper-cost.ts:23` `if (!(s > 0)) return null` (handles 0/null/undefined/negative/NaN). `whisper-cost.test.ts` covers the full null-vs-0 ladder |
| 11 | Cost capture stands on attempt_id alone — no usage_event dependency | ✓ VERIFIED | `transcribe-audio.ts:195-204` records by `attemptId` only; no `recordUsage`/`audio_transcribed` event created. Migration keys on `attempt_id` (not usage_event FK) |
| 12 | Measure-only: cost module imports NO credit/ledger/debit/balance/markup logic, guarded by passing test | ✓ VERIFIED | `measure-only-invariant.test.ts` — 3 static assertions (no forbidden tokens, only requireServiceClient import, no `?? 0` coercion). Passes in the suite |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260624000003_phase110_ai_cost_events.sql` | append-only table, RLS, super-admin SELECT | ✓ VERIFIED | `CREATE TABLE IF NOT EXISTS`, idempotent indexes, CHECK enums, NULLABLE real_cost_usd. Authored-only (deploy via pipeline) |
| `lib/billing/record-ai-cost.ts` | never-throw recordAICost + AICostInput | ✓ VERIFIED | 71 lines, exports both, single safe import, never-throws |
| `lib/billing/whisper-cost.ts` | rate const + pure compute helper | ✓ VERIFIED | Exports WHISPER_USD_PER_MINUTE + computeWhisperCostUsd; pure, no DB, no charging |
| `lib/ai/providers/openrouter.ts` | estimate/refine cost capture | ✓ VERIFIED | `usage.cost` typed, costContext threaded through callTool, void recordAICost in parse block |
| `lib/ai/openrouter-client.ts` | vision + translation cost capture | ✓ VERIFIED | Both sites read usage.cost, optional costContext param, void recordAICost |
| `lib/ai/types.ts` | optional costContext on EstimateInput | ✓ VERIFIED | `costContext?` at line 78 |
| `lib/inngest/functions/transcribe-audio.ts` | duration_seconds load + recordAICost on success | ✓ VERIFIED | loadCompanyForRecording selects duration_seconds; void recordAICost after terminal-success pipeline event |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| record-ai-cost.ts | ai_cost_events | `from('ai_cost_events').insert(...)` | ✓ WIRED | Line 56 |
| record-ai-cost.ts | requireServiceClient | import from @/lib/supabase/service | ✓ WIRED | Line 28, sole import |
| inngest generate-estimate | graph state attemptId | graph.invoke carries attemptId | ✓ WIRED | attemptId promoted to graph input → state annotation |
| transcribe-audio.ts | recordings.duration_seconds | loadCompanyForRecording select | ✓ WIRED | Line 33 select + line 47 return |
| transcribe-audio.ts | ai_cost_events (via recordAICost) | void recordAICost on success | ✓ WIRED | Line 195 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| openrouter.ts callTool | realCostUsd | `json.usage?.cost` from live OpenRouter response | Yes (real provider cost; null when absent) | ✓ FLOWING |
| openrouter.ts callTool | costContext.attemptId | inngest → graph state → estimateInput (trusted, non-LLM) | Yes (real attempt lineage) | ✓ FLOWING |
| transcribe-audio.ts | realCostUsd | computeWhisperCostUsd(recordings.duration_seconds) | Yes (computed from real DB duration) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Cost/billing/observability suites pass | `npx vitest run tests/unit/ai tests/unit/billing tests/unit/observability` | 31 files / 176 tests passed | ✓ PASS |
| No deprecated OpenRouter cost forms | grep `usage:{include}` + `api/v1/generation` | 0 hits | ✓ PASS |
| No `?? 0` on cost values | grep cost paths | 0 hits (only unrelated Stripe webhook + a comment) | ✓ PASS |
| Measure-only guard enforces no charging tokens | included in vitest run | passes | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| COST-01 | 110-02 | Capture real USD cost of every OpenRouter call via usage.cost | ✓ SATISFIED | Truths 5-8; 3 OpenRouter sites read `usage.cost`, no deprecated forms |
| COST-02 | 110-03 | Compute Whisper/STT cost from audio minutes × configurable rate | ✓ SATISFIED | Truths 9-10; whisper-cost.ts + transcribe-audio wiring |
| COST-03 | 110-01 | Record real cost per AI op correlated to attempt instrumentation | ✓ SATISFIED | Truths 1-2, 11; ai_cost_events keyed by attempt_id, recordAICost helper |
| CALIB-01 | 110-01 | Cost capture runs in measure-only mode (no charging) | ✓ SATISFIED | Truths 4, 12; static invariant guard passes, zero charging code |

All four declared requirement IDs accounted for and verifiably implemented. REQUIREMENTS.md maps exactly COST-01/02/03 + CALIB-01 to Phase 110 — no orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| transcribe-audio.ts | 195-204 | Gemini fallback records `provider:'openai'` not `'gemini'` (110-03 truth said `'gemini'`/null) | ℹ️ Info | Documented deviation. The Gemini fallback is hidden inside `transcribeAudioOR`, so the job cannot observe which provider ran; it records the common OpenAI case with the computed cost. Critically it never GUESSES a Gemini rate and never records 0 — null-vs-0 discipline intact. Precise attribution deferred to a follow-up (needs a `transcribeAudioOR` return-value change). Does not block the goal |
| migration | 36 | `CREATE POLICY` lacks IF NOT EXISTS / DROP guard | ℹ️ Info | Identical to the phase-92 `pipeline_events` migration it explicitly mirrors. Table/index creation IS idempotent; policy re-run risk is the same accepted profile as the precedent. Authored-only, applied once by the deploy pipeline |

No 🛑 blocker or ⚠️ warning anti-patterns. No TODO/FIXME/placeholder/stub patterns in the cost paths.

### Human Verification Required

1. **Production measure-only confirmation** — Apply migration `20260624000003` via the CI→GHCR→Coolify pipeline, then trigger a real estimate generation and a real audio transcription.
   - Expected: `ai_cost_events` rows appear (one per AI op), `real_cost_usd` populated from `usage.cost` / computed Whisper math (NULL where the provider returns no cost), each correlated by `attempt_id`; zero credit/balance movement anywhere.
   - Why human: requires the deploy pipeline to apply the authored-only migration plus live OpenRouter/Whisper API calls — not reachable from static verification.

### Gaps Summary

No goal-blocking gaps. All 12 observable truths are VERIFIED, all 7 artifacts exist/substantive/wired/flowing, all 5 key links wired, all 4 requirements satisfied, and the full cost/billing/observability suite is green (176 tests). The phase-critical correctness points hold in the actual code: OpenRouter cost is read as `json.usage?.cost ?? null` at all three call sites with NO deprecated `usage:{include:true}` and NO `/api/v1/generation` lookup; there is no `?? 0` / `real_cost_usd: 0` in any cost path; the cost module imports only `requireServiceClient` and a passing static guard locks the measure-only invariant; `recordAICost` mirrors `recordPipelineEvent` (try/catch → console.warn → void); the migration is idempotent at the table/index level with deny-all client RLS + super-admin SELECT mirroring `pipeline_events`.

Two informational notes (not gaps): the Whisper Gemini-fallback provider attribution is approximated as `provider:'openai'` (documented follow-up; never guesses/zeros a Gemini cost), and the migration's `CREATE POLICY` follows the same non-IF-NOT-EXISTS pattern as its `pipeline_events` precedent. One item routed to human verification: end-to-end production confirmation after the deploy pipeline applies the authored-only migration.

---

_Verified: 2026-06-24T14:25:00Z_
_Verifier: Claude (gsd-verifier)_
