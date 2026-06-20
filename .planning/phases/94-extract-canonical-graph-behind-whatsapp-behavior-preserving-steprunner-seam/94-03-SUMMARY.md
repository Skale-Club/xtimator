---
phase: 94-extract-canonical-graph-behind-whatsapp-behavior-preserving-steprunner-seam
plan: 03
subsystem: estimate-graph
tags: [channel-adapter, whatsapp, langgraph, refactor, behavior-preserving]
dependency_graph:
  requires:
    - "lib/estimate/graph (94-02 shared core: buildEstimateGraph(adapter, {runner}), EstimateState, ChannelAdapter/StepRunner contracts)"
    - "lib/estimate/quality/vagueness.ts (94-02 channel-neutral isVagueEstimate)"
  provides:
    - "lib/estimate/adapters/whatsapp.ts (makeWhatsAppAdapter closure-factory: ingest/finalize/onError)"
    - "lib/estimate/adapters/default.ts (web/MCP adapter stub for Phase 95)"
    - "lib/whatsapp/estimate-graph.ts (thin wiring composing core + WhatsApp adapter; stable buildEstimateGraph())"
  affects:
    - "lib/inngest/functions/whatsapp-process.ts (invokes shared graph via orchestrate-estimate step; channel:'whatsapp')"
    - "tests/unit/inngest/whatsapp-process-job.test.ts (source-text anchor — now RED pending 94-04 path update)"
tech_stack:
  added: []
  patterns:
    - "ChannelAdapter as closure-factory (mirrors makeQueryTools): companyId/ownerPhone/messages closure-captured, never graph-input fields"
    - "WhatsApp-superset Annotation (WhatsAppEstimateState) defined inside the adapter for the internal Send fan-out; core annotation stays neutral"
    - "Per-invocation adapter construction inside zero-arg buildEstimateGraph().invoke() to preserve the stable external contract"
    - "failure-as-state copy selection: onError reads state.failure?.reason (generation_failed vs no_usable_input)"
key_files:
  created:
    - "lib/estimate/adapters/whatsapp.ts"
    - "lib/estimate/adapters/default.ts"
  modified:
    - "lib/whatsapp/estimate-graph.ts"
    - "lib/inngest/functions/whatsapp-process.ts"
decisions:
  - "3-fn adapter surface (D-05): vague-vs-confirm folded INSIDE finalize (reads state.isVague); Phase 96 splits a dedicated refine edge"
  - "ingest runs its OWN internal compiled sub-graph (supervisor → Send[] → processMessage → gather) so the Send fan-out + commutative mediaResults reducer are preserved verbatim inside the adapter (D-08)"
  - "WhatsApp messages/ownerPhone/companyId are closure-captured by the per-invocation adapter (NOT core state channels) — keeps the core annotation strictly channel-neutral (D-07)"
  - "ingest signals no-usable-input via failure?:{reason:'no_usable_input'} so the core checkInputsEdge routes to the adapter onError (preserves source checkInputsEdge → sendError semantics)"
metrics:
  duration_min: 7
  tasks: 3
  files_changed: 4
  completed: 2026-06-20
---

# Phase 94 Plan 03: WhatsApp ChannelAdapter + Graph Rewire Summary

WhatsApp now runs entirely on the shared channel-neutral estimate graph: a closure-factory `makeWhatsAppAdapter` holds all WhatsApp side-effects (Send media fan-out + download/transcribe/vision ingest, askDetails-vs-confirm finalize, two-copy onError), `lib/whatsapp/estimate-graph.ts` is a thin wiring layer composing the 94-02 core with that adapter behind a byte-stable `buildEstimateGraph()`, and the QA-01 frozen never-throw/always-reply regression stays green with zero assertion changes — proving behavior is preserved.

## What Was Built

### Task 1 — WhatsApp ChannelAdapter closure-factory (`lib/estimate/adapters/whatsapp.ts`)
- `makeWhatsAppAdapter({ companyId, supabase, ownerPhone, messages? })` returns a `ChannelAdapter` (`{ channel:'whatsapp', ingest, finalize, onError }`). `companyId`/`ownerPhone`/`messages` are CLOSURE params (mirrors `makeQueryTools`), never edge-fn/graph inputs — the T-lrf-01 multi-tenant isolation invariant.
- Defines a WhatsApp-superset `WhatsAppEstimateState` Annotation HERE (core fields + `ownerPhone`/`messages`/`currentMessage`/`mediaResults` with the commutative reducer `(cur,update)=>[...cur,...update]`, default `()=>[]`). The core annotation (94-02) stays neutral.
- `ingest`: runs an internal compiled sub-graph (`supervisor → Send[] fan-out → processMessage[] (parallel) → gather`) relocated VERBATIM from the source — text→insert recordings; audio→download+storage upload+transcribe+insert; image→download+upload+vision+insert; never re-throws (T-mq2-01 → `mediaResults ok:false`). Enforces the has-usable-input precondition (`mediaResults.some(ok)`) and signals `failure:{reason:'no_usable_input'}` when none.
- `finalize`: branches on `state.isVague` — askDetails (`revertVagueEstimate` + `awaiting_details` session TTL + `buildAskDetailsMessage` reply) vs sendConfirmation (`awaiting_confirm` session + estimate read + `'Estimate ready - ...'` reply). Message copy kept byte-identical.
- `onError`: picks the copy by `state.failure?.reason` — generation-failed vs no-input (byte-identical to source `sendError` lines 407-408).
- `channel-adapter.test.ts` GREEN (2/2).

### Task 2 — default web/MCP adapter stub (`lib/estimate/adapters/default.ts`)
- `makeDefaultAdapter({ companyId, supabase })` returns a minimal `ChannelAdapter` (`channel:'web'`): passthrough `ingest` (`{}`), no-op `finalize` (`{}`), no-op `onError` (`{}`). Top-of-file comment marks it a Phase 94 stub filled in Phase 95 (CHAN-02/03/04). Zero WhatsApp imports; tsc-clean.

### Task 3 — rewire `estimate-graph.ts` + repoint `whatsapp-process.ts`
- `lib/whatsapp/estimate-graph.ts` is now a thin wiring layer: zero-arg `buildEstimateGraph()` returns `{ invoke(initial) }` which, per invocation, lifts tenant scope + messages out of the WhatsApp-superset initial state, constructs the WhatsApp adapter (closure-captures them), composes `buildEstimateGraph(adapter)` from `@/lib/estimate/graph`, and invokes it with the channel-neutral core state (`channel:'whatsapp'`). The duplicated node bodies are gone — they live in the adapter.
- `lib/inngest/functions/whatsapp-process.ts`: kept `step.run('orchestrate-estimate')` + `buildEstimateGraph(` tokens, added `channel: 'whatsapp'` to the `graph.invoke({...})` initial state. `onFailure` + `refresh-typing` untouched.
- QA-01 frozen test (`never-reply-regression.test.ts`) GREEN (3/3) with NO assertion changes; full `tests/unit/estimate` + `tests/unit/whatsapp/ask-details.test.ts` green.

## Test Status

- `npx vitest run tests/unit/estimate/channel-adapter.test.ts` → 2/2 GREEN (ENGINE-02).
- `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` → 3/3 GREEN (QA-01, assertions unchanged).
- `npx vitest run tests/unit/estimate tests/unit/whatsapp` → 232 passed | 28 todo | 3 skipped.
- `grep -rE "@/lib/whatsapp|sendWhatsAppMessage|ownerPhone|WhatsAppMessage" lib/estimate/graph` → ZERO (core stayed neutral).
- `tsc --noEmit` clean for all new/changed phase-94 files.
- **EXPECTED RED (pending 94-04):** `tests/unit/inngest/whatsapp-process-job.test.ts` — 2/5 fail. It greps `lib/whatsapp/estimate-graph.ts` (source-text anchor) for tokens that this rewire moved into the adapter/core (`generationFailed`, `checkGeneratedEdge`, `isVagueEstimate(`, `buildAskDetailsMessage(`, `revertVagueEstimate(`, `generateEstimateForProject(`, `awaiting_details`, the `addConditionalEdges('generateEstimate', checkGeneratedEdge` wiring). This is Pitfall 1 (the source-text trap) and is 94-04's job to fix by updating the test's `readFileSync` PATHS to the new homes (a path update, allowed under D-13). NOT fixed here. The 3 passing assertions (id/idempotency, `orchestrate-estimate` + `buildEstimateGraph(`, `onFailure`/`sendFallbackReply`) confirm the durability boundary is preserved.

## Deviations from Plan

None - plan executed exactly as written. The `messages?` factory param on `makeWhatsAppAdapter` (added during Task 3 to support the per-invocation closure capture of inbound messages while keeping the channel-adapter unit test's `{companyId, supabase, ownerPhone}` construction valid) is an in-spec implementation detail of the Task 1 closure-factory + Task 3 composition, not a behavioral deviation.

## Known Stubs

- `lib/estimate/adapters/default.ts` — intentional Phase 94 stub (passthrough ingest, no-op finalize/onError). Real web/MCP behavior is wired in Phase 95 (CHAN-02/03/04), per D-02 and the plan's Task 2 spec. Not used by any production path this phase (only the WhatsApp adapter is wired).

## Deferred Issues

Pre-existing, out-of-scope tsc errors observed (NOT introduced by this plan, NOT in phase-94 files — logged, not fixed per SCOPE BOUNDARY):
- `app/admin/integrations/actions.ts` + `lib/billing/stripe-client.ts` — Stripe API version literal mismatch (`2026-04-22.dahlia` vs `2026-05-27.dahlia`).
- `tests/unit/notifications/account-emails.test.ts` — `Branding` type mismatch (3 occurrences).

## Notes for Downstream

- **94-04 (next):** update `tests/unit/inngest/whatsapp-process-job.test.ts` `readFileSync` targets so the moved tokens are asserted at their new homes (`lib/estimate/adapters/whatsapp.ts` for `revertVagueEstimate`/`buildAskDetailsMessage`/`awaiting_details`; `lib/estimate/graph/nodes/*` for `generateEstimateForProject`/`checkGeneratedEdge`/`failure`). Assertions must change only to track the intentional `generationFailed → failure` contract rename; flag any other change.
- **Phase 95:** fill `lib/estimate/adapters/default.ts` (real has-usable-input guard in ingest; decide re-throw-vs-surface in onError).
- **Phase 96:** split a dedicated `refine` edge out of the WhatsApp adapter's `finalize` when auto-refine lands (currently the vague-vs-confirm branch is folded inside finalize per the 3-fn D-05 surface).
- **Deferred-decomposition (PITFALLS Pitfall 2):** the `SESSION_TTL_MINUTES`/`expiresAt` `Date.now()` mint inside finalize is flagged in-code; coalesce TTL from state when AI nodes are promoted to their own `step.run` via the injected StepRunner.

## Self-Check: PASSED

- Created files all FOUND: `lib/estimate/adapters/whatsapp.ts`, `lib/estimate/adapters/default.ts`, rewired `lib/whatsapp/estimate-graph.ts`, repointed `lib/inngest/functions/whatsapp-process.ts`, `94-03-SUMMARY.md`.
- Commits all FOUND: `bc57d2f` (Task 1), `ea3c6f7` (Task 2), `877088b` (Task 3).
