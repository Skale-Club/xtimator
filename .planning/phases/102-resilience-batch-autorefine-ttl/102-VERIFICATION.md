---
phase: 102-resilience-batch-autorefine-ttl
verified: 2026-06-21T16:27:00Z
status: passed
score: 7/7 must-haves verified
re_verification: null
notes_for_phase_103:
  - concern: "Pre-existing vitest cross-file worker-reuse / shared-mock module-state leakage"
    evidence: "npx vitest run tests/unit/estimate tests/unit/whatsapp → 11 failures (call counts accumulate across files sharing the @/lib/whatsapp/estimate-graph mock); EVERY affected file passes in isolation; reproduces at base with phase-102 work stashed"
    impact: "A flaky cross-file suite would make the Phase 103 CI regression gate unreliable"
    action: "Phase 103 (EVAL — CI regression gate) MUST add a test-harness isolation pass (vi.resetModules + per-file mock reset, or pool:'forks'/isolate:true)"
    attribution: "NOT a Phase 102 regression — documented in deferred-items.md [102-03]"
---

# Phase 102: Resilience — Batch Reporting, Auto-Refine Cap, Replay-Safe TTL — Verification Report

**Phase Goal:** Partial failures degrade gracefully and replays stay correct on the unified engine — a bad WhatsApp message is reported (not silently dropped), the auto-refine cap is configurable with an explicit web user recourse, and session TTLs are replay-safe. HARD-05 (per-item batch isolation + reporting), HARD-06 (configurable auto-refine cap + web recourse), HARD-07 (replay-safe TTL).
**Verified:** 2026-06-21T16:27:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                  | Status     | Evidence |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- | -------- |
| 1   | HARD-07: both WhatsApp TTL mint sites derive expires_at from durable `state.requestedAt ?? Date.now()` | ✓ VERIFIED | whatsapp.ts:407-410 (askDetails), 440-443 (confirm); `SESSION_TTL_MINUTES = 30` unchanged (:62) |
| 2   | HARD-07: requestedAt threaded into both graph entry points, captured outside step.run (replay-safe)    | ✓ VERIFIED | whatsapp-process.ts:73 `const requestedAt = Date.now()` outside step.run (:86); generate-estimate.ts:88 `t0` outside step.run (:106), threaded :129; estimate-graph.ts:102 into core invoke |
| 3   | HARD-06: auto-refine cap is a single named constant, default 1, env-overridable, `<` comparison kept   | ✓ VERIFIED | decide.ts:38-41 `AUTO_REFINE_MAX_ATTEMPTS` (Number guard, default 1); :54 `(state.refineAttempts ?? 0) < AUTO_REFINE_MAX_ATTEMPTS` |
| 4   | HARD-06: web recourse banner renders on `awaiting_details`, reuses existing generate trigger, i18n     | ✓ VERIFIED | needs-details-banner.tsx (Alert+Button, t(), onAddDetails); overview-tab.tsx:85-86 gated render → `setModePickerOpen(true)` |
| 5   | HARD-05: partial-failure batch builds estimate AND single reply notes dropped item(s)                  | ✓ VERIFIED | whatsapp.ts:366-381 ingest carries droppedInputs on partial only; :397,424,477 buildDroppedNote appended into BOTH reply bodies |
| 6   | HARD-05: exactly ONE sendWhatsAppMessage per batch on every path (never-reply invariant)               | ✓ VERIFIED | 3 `sendWhatsAppMessage(ownerPhone` calls — one each in 3 mutually-exclusive paths (finalize-vague :425, confirm :480, onError :505); note appended to body, never a 2nd send |
| 7   | Graph-neutrality stays green: requestedAt + droppedInputs carry no channel token; failure.ts frozen    | ✓ VERIFIED | state.ts:45,65 neutral annotations; graph-neutrality test 2/2 green; failure.ts git diff vs pre-102 baseline EMPTY |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/estimate/graph/nodes/decide.ts` | AUTO_REFINE_MAX_ATTEMPTS const, default 1, `<` preserved | ✓ VERIFIED | :38-41 const with Number.isFinite + `>= 0` guard → 1; :54 `<` comparison intact; channel-neutral (no DB/async/channel import) |
| `lib/estimate/graph/state.ts` | neutral requestedAt + droppedInputs fields | ✓ VERIFIED | :45 requestedAt (epoch ms), :65 droppedInputs `{count, reasons[]}` — both documented channel-neutral; neutrality gate green |
| `lib/estimate/adapters/whatsapp.ts` | both TTL sites from requestedAt; droppedInputs on partial; dedicated note map; ONE send | ✓ VERIFIED | TTL :407,:440; dedicated MEDIA_ITEM_NOTE/buildDroppedNote :70-91 (separate from failureReasonToChannelCopy); SESSION_TTL_MINUTES 30 unchanged; Send fan-out/reducer :103-329 unchanged |
| `lib/estimate/failure.ts` | UNCHANGED vs pre-102 | ✓ VERIFIED | `git diff 7f1f917~1 HEAD -- lib/estimate/failure.ts` returns EMPTY |
| `lib/inngest/functions/whatsapp-process.ts` | requestedAt captured outside step.run, threaded | ✓ VERIFIED | :73 capture outside step.run; :100 passed into invoke |
| `lib/inngest/functions/generate-estimate.ts` | t0 captured outside step.run, threaded as requestedAt | ✓ VERIFIED | :88 `t0` capture; :129 `requestedAt: t0` into core state (web/MCP passthrough today, consistent field) |
| `lib/whatsapp/estimate-graph.ts` | requestedAt threaded into core invoke | ✓ VERIFIED | :59 superset type field; :102 threaded into channel-neutral graph.invoke |
| `components/workspace/needs-details-banner.tsx` (new) | NeedsDetailsBanner, Alert+Button, t(), onAddDetails | ✓ VERIFIED | 46 lines; reuses Alert/AlertTitle/AlertDescription + Button; all copy in t(); onAddDetails prop |
| `components/workspace/overview-tab.tsx` | conditional render on awaiting_details, existing trigger | ✓ VERIFIED | :6 import; :85-86 `project.status === 'awaiting_details'` → `onAddDetails={() => setModePickerOpen(true)}` (same path handleRecord uses :62-64) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| whatsapp-process.ts | estimate-graph.invoke | requestedAt from single handler-entry Date.now() | ✓ WIRED | :73 → :100 |
| generate-estimate.ts | core graph invoke | requestedAt: t0 | ✓ WIRED | :88 → :129 |
| estimate-graph.ts | core graph.invoke | requestedAt into neutral state | ✓ WIRED | :102 |
| whatsapp.ts finalize | whatsapp_sessions.expires_at | `new Date((state.requestedAt ?? Date.now()) + SESSION_TTL_MINUTES*60*1000)` | ✓ WIRED | both branches :408-410, :441-443 |
| decide.ts checkVagueAfterAssessEdge | AUTO_REFINE_MAX_ATTEMPTS | `(state.refineAttempts ?? 0) < AUTO_REFINE_MAX_ATTEMPTS` | ✓ WIRED | :54 |
| whatsapp.ts ingest | core state droppedInputs | summarize failed mediaResults (partial only) | ✓ WIRED | :366-381 |
| whatsapp.ts finalize | single reply body | buildDroppedNote appended to both bodies | ✓ WIRED | :397,:424,:477 |
| overview-tab.tsx | needs-details-banner.tsx | render on awaiting_details, onAddDetails → setModePickerOpen(true) | ✓ WIRED | :85-86 |
| NeedsDetailsBanner CTA | existing CaptureModePicker trigger | onAddDetails callback → setModePickerOpen(true) | ✓ WIRED | banner :40 onClick; host :86 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| needs-details-banner.tsx | `project.status` (host prop) | OverviewTab server `project` prop (existing) | Yes — gated on real status value `awaiting_details` written by web adapter | ✓ FLOWING |
| whatsapp.ts droppedNote | `state.droppedInputs` | ingest summarizes real `ingestGraph.invoke().mediaResults` failures | Yes — count + reasons from actual ok:false items, not hardcoded | ✓ FLOWING |
| whatsapp.ts expiresAt | `state.requestedAt` | Inngest handler-entry Date.now() threaded through graph | Yes — real server timestamp, Date.now() fallback for direct invokers | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| HARD-06 cap default=1 + env override loops N + graph-neutrality + auto-refine-isolation | `vitest run estimate/{auto-refine-cap,graph-neutrality,auto-refine-isolation}` | 3 files / 12 tests passed | ✓ PASS |
| HARD-07 replay-stable expires_at across two finalize invocations | `vitest run whatsapp/replay-safe-ttl.test.ts` | 1 file / 2 tests passed | ✓ PASS |
| HARD-05 partial-failure builds estimate + ONE reply with dropped note; total failure → one reply | `vitest run whatsapp/batch-reporting.test.ts` | 1 file / 2 tests passed | ✓ PASS |
| Never-reply invariant (QA-01) intact | `vitest run whatsapp/never-reply-regression.test.ts` | 1 file / 3 tests passed | ✓ PASS |
| HARD-06 banner renders on awaiting_details, hidden otherwise, CTA fires | `vitest run workspace/needs-details-banner.test.tsx` | 1 file / 4 tests passed | ✓ PASS |

All targeted suites GREEN in isolation (matching the reported observed status).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| HARD-05 | 102-00, 102-03 | Failing batch item isolated + reported per-message | ✓ SATISFIED | droppedInputs flow + buildDroppedNote + batch-reporting test; REQUIREMENTS.md `[x]` + traceability "Complete" |
| HARD-06 | 102-00, 102-02, 102-04 | Configurable auto-refine cap + explicit web recourse | ✓ SATISFIED | AUTO_REFINE_MAX_ATTEMPTS const + NeedsDetailsBanner; cap + banner tests; REQUIREMENTS.md `[x]` + "Complete" |
| HARD-07 | 102-00, 102-01 | Replay-safe TTL from durable state | ✓ SATISFIED | requestedAt threaded + both TTL sites derive from it; replay-safe-ttl test; REQUIREMENTS.md `[x]` + "Complete (102-01)" |

No orphaned requirements — all three IDs mapped to Phase 102 in REQUIREMENTS.md are claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| whatsapp.ts | 88 | `void MEDIA_ITEM_NOTE` (touch to keep reason vocabulary referenced) | ℹ️ Info | Intentional — keeps the dedicated reason map as single source of truth while the count-aggregated line is what surfaces today; documented in-code. Not a stub. |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder. The `return {}` returns in finalize/ingest/onError are correct LangGraph node state-update returns (partial state), not empty stubs — each performs real DB writes and sends before returning.

### Human Verification Required

None blocking. The banner's visual appearance and end-to-end "Add details & regenerate" flow on a live `awaiting_details` project are covered by the RTL test for behavior; visual polish is optional and out of the success-criteria contract.

### Gaps Summary

No gaps. All 7 must-have truths verified, all 9 artifacts pass Levels 1-4 (exist, substantive, wired, data flowing), all 9 key links WIRED, all 3 requirements SATISFIED and marked Complete in REQUIREMENTS.md. failure.ts is byte-identical to the pre-102 baseline (empty git diff). The never-reply invariant holds (exactly one send per batch across all three terminal paths). All targeted tests are GREEN in isolation.

**Phase 103 carry-forward (NOT a Phase 102 gap):** Running `tests/unit/estimate` + `tests/unit/whatsapp` together yields 11 failures from vitest worker-reuse / shared-mock module-state leakage (the `@/lib/whatsapp/estimate-graph` mock accumulates `sendWhatsAppMessage`/`sessionInserts` call counts across files). Reproduced here (11 failed | 285 passed). Every affected file passes in isolation; confirmed pre-existing and documented in `deferred-items.md [102-03]`. Phase 103 (EVAL — CI regression gate) MUST address this with a test-harness isolation pass, otherwise the CI gate will be flaky.

---

_Verified: 2026-06-21T16:27:00Z_
_Verifier: Claude (gsd-verifier)_
