# Phase 101 — Deferred / Out-of-Scope Items

Discoveries logged during execution that are NOT in the current plan's scope.
Do NOT fix these in the plan that logged them.

## From 101-01 (UNIFY-01 shared ingestion + WhatsApp swap)

### Pre-existing test-isolation leakage in the full `tests/unit/estimate` + `tests/unit/whatsapp` sweep
- **Discovered during:** 101-01 Task 2 verification (full regression sweep).
- **Symptom:** When the whole `tests/unit/estimate tests/unit/whatsapp` set runs together
  (alphabetical order), four suites fail that all PASS in isolation:
  `tests/unit/estimate/channel-adapter.test.ts`, `tests/unit/estimate/step-runner.test.ts`,
  `tests/unit/whatsapp/confirm.test.ts`, `tests/unit/whatsapp/never-reply-regression.test.ts`.
- **Root cause (not mine):** the 101-00 Wave-0 RED scaffolds (`refine-node.test.ts`,
  `generate-refine-equivalence.test.ts`) `vi.mock`/`importActual`-spy shared modules
  (`@/lib/ai/prompt-builder`, provider adapters, `@/lib/estimate/graph/*`) and the mock
  state leaks across files in the same worker, double-counting `sendWhatsAppMessage`
  and breaking the help-message / adapter-factory assertions.
- **Proof it is pre-existing:** stashing the 101-01 Task 2 whatsapp.ts edit and re-running
  the same sweep reproduces the SAME failures (14 baseline vs the RED scaffolds). The four
  suspect suites pass 18/18 when run together in isolation, both before and after 101-01.
- **Owner / fix path:** the RED suites belong to 101-02 / 101-03; once those waves implement
  `makeRefineNode` / `buildRefineGraph` / shared-prompt refine mode (turning those RED suites
  GREEN and removing the `expect.fail`/computed-mock scaffolding), re-run the full sweep and,
  if leakage persists, add `vi.resetModules()`/`vi.restoreAllMocks()` isolation in the
  refine scaffolds. NOT fixed in 101-01 (out of scope — pre-existing, not caused by the
  ingestion module or the 2-call-site WhatsApp swap).

## From 101-02 (HARD-02/UNIFY-02 shared refine prompt)

### Cross-suite mock leakage is BROADER than the refine scaffolds (re-attribution)
- **Discovered during:** 101-02 Task 2 verification (full `tests/unit/estimate` + `tests/unit/whatsapp` sweep).
- **Refined root cause:** with ALL refine RED scaffolds excluded (`refine-node`, `no-checkpointer`,
  `generate-refine-equivalence`, `refine-shared-prompt`) AND 101-02 source changes stashed, the same
  four suites still fail in the combined sweep: `channel-adapter`, `step-runner`,
  `whatsapp/confirm`, `whatsapp/never-reply-regression`. So the worker-reuse module-registry leak is
  PRE-EXISTING and independent of the refine scaffolds — the 101-01 attribution (blaming
  refine-node/equivalence) was incomplete. Some other suite in the estimate/whatsapp set leaks first.
- **What 101-02 verified GREEN:** the plan's stated gate — `tests/unit/ai` + `tests/unit/estimate`
  together = 133/133 GREEN (excluding only the two 101-03-owned RED scaffolds whose target modules
  don't exist yet). The 101-02 suites (`refine-shared-prompt`, extended `prompt-builder`,
  `generate-refine-equivalence`) do NOT leak into ai/estimate siblings. All six affected suites pass
  26/26 in isolation. The whatsapp leakage combo is OUT OF SCOPE for 101-02 (touches only `lib/ai/`).
- **Owner / fix path:** a future test-hardening pass (or 101-03 when it implements the refine
  node/graph) should add `vi.resetModules()` / `vi.restoreAllMocks()` to whichever suite leaks first
  in the estimate/whatsapp ordering, or set `test.isolate`/pool config. NOT a product regression —
  every suite is green in isolation; this is a vitest worker-reuse artifact only.

### Pre-existing `tsc --noEmit` errors in unrelated suites
- `tests/unit/ai/refine-shared-prompt.test.ts` (es2018 regex flag) — 101-02 RED scaffold, owned by 101-02.
- `tests/unit/estimate/observability.test.ts` (es2018 regex flag) — pre-existing.
- `tests/unit/inngest/generate-estimate-job.test.ts` (mock callable) — pre-existing.
- `tests/unit/notifications/account-emails.test.ts` (Branding type missing fields) — pre-existing.
- `tests/unit/xphere-client.test.ts` (pipeline field) — xphere, explicitly OUT OF SCOPE for Phase 101.
- None touch `lib/estimate/ingest/multimodal.ts` or `lib/estimate/adapters/whatsapp.ts` (both tsc-clean).
