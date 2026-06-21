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

### Pre-existing `tsc --noEmit` errors in unrelated suites
- `tests/unit/ai/refine-shared-prompt.test.ts` (es2018 regex flag) — 101-02 RED scaffold, owned by 101-02.
- `tests/unit/estimate/observability.test.ts` (es2018 regex flag) — pre-existing.
- `tests/unit/inngest/generate-estimate-job.test.ts` (mock callable) — pre-existing.
- `tests/unit/notifications/account-emails.test.ts` (Branding type missing fields) — pre-existing.
- `tests/unit/xphere-client.test.ts` (pipeline field) — xphere, explicitly OUT OF SCOPE for Phase 101.
- None touch `lib/estimate/ingest/multimodal.ts` or `lib/estimate/adapters/whatsapp.ts` (both tsc-clean).
