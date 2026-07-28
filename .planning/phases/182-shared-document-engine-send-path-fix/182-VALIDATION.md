---
phase: 182
slug: shared-document-engine-send-path-fix
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-27
---

# Phase 182 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit/integration), tsc for types |
| **Config file** | `vitest.config.ts` / `tsconfig.ci.json` |
| **Quick run command** | `pnpm vitest run tests/unit/pdf tests/unit/estimate` |
| **Full suite command** | `pnpm vitest run tests/unit tests/eval && npx tsc -p tsconfig.ci.json --noEmit` |
| **Estimated runtime** | ~60-120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the touched area
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 182-01-T1 | 182-01 | 1 | ENGINE-01 | typecheck | `npx tsc -p tsconfig.ci.json --noEmit` | ✅ created this task | ⬜ pending |
| 182-01-T2 | 182-01 | 1 | ENGINE-01, ENGINE-02, ENGINE-03 | typecheck | `npx tsc -p tsconfig.ci.json --noEmit` | ✅ created this task | ⬜ pending |
| 182-01-T3 | 182-01 | 1 | ENGINE-01, ENGINE-02 | unit (state-tolerant live-source label parity + value snapshot + format + geometry `it.fails` + import-boundary purity) | `npx vitest run tests/unit/estimate/document-format.test.ts tests/unit/estimate/document-label-parity.test.ts tests/unit/estimate/pt-px-conversion-source.test.ts tests/unit/estimate/document-engine-boundary.test.ts` | ✅ created this task | ⬜ pending |
| 182-02-T1 | 182-02 | 2 | ENGINE-01, ENGINE-02 | unit (regression + geometry `it.fails`→`it()`; label-parity test unmodified, auto-adapts) | `npx vitest run tests/unit/estimate/document-page-view.test.tsx tests/unit/estimate/document-totals-view.test.tsx tests/unit/estimate/document-bill-to.test.tsx tests/unit/estimate/document-alignment.test.tsx tests/unit/estimate/presentation-settings-cross-surface.test.tsx tests/unit/estimate/inline-project-name.test.tsx tests/unit/estimate/pt-px-conversion-source.test.ts tests/unit/estimate/document-label-parity.test.ts` | ✅ existing + modified this task | ⬜ pending |
| 182-02-T2 | 182-02 | 2 | ENGINE-01, ENGINE-03 (partial) | unit (regression; label-parity test unmodified, auto-adapts to full post-adoption) | `npx vitest run tests/unit/pdf tests/unit/estimate/document-label-parity.test.ts` | ✅ existing, unmodified | ⬜ pending |
| 182-03-T1 | 182-03 | 1 | PDFPAR-04 | typecheck (strict — NonNullable company) | `npx tsc -p tsconfig.ci.json --noEmit` | ✅ created this task | ⬜ pending |
| 182-03-T2 | 182-03 | 1 | PDFPAR-04 | unit (resolver acceptance — 7 cases) | `npx vitest run tests/unit/pdf/render-estimate-pdf-resolver.test.ts` | ✅ created this task | ⬜ pending |
| 182-04-T1 | 182-04 | 2 | PDFPAR-04 | typecheck | `npx tsc -p tsconfig.ci.json --noEmit` | ✅ existing, modified this task | ⬜ pending |
| 182-04-T2 | 182-04 | 2 | PDFPAR-04 | unit (regression + new template-selection case) | `npx vitest run tests/unit/whatsapp/pdf-delivery.test.ts tests/unit/estimate/delivery-insert-format.test.ts` | ✅ existing, modified this task | ⬜ pending |
| 182-04-T3 | 182-04 | 2 | PDFPAR-04 | typecheck | `npx tsc -p tsconfig.ci.json --noEmit` | ✅ existing, modified this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Label-parity golden test (shared labels == LIVE per-surface labels for en/pt/es, regex-extracted — not a hand-typed transcription compared to itself) — proves zero-visible-change before deletion of local copies. State-tolerant per renderer file (re-verification fix, NEW-1): the SAME test file switches each renderer's branch from live-source extraction to import-adoption once Plan 182-02 removes its local map, with zero edits to the test and zero intra-plan red window. Values are locked permanently via a committed snapshot (NEW-2). (182-01-T3)
- [x] Shared-resolver acceptance test (template selection + signed-snapshot application + preparedBy + photo pre-resolution + cheap/expensive context split, mirroring `tests/unit/whatsapp/pdf-delivery.test.ts`'s mocking pattern) (182-03-T2)
- [x] Geometry single-source regression test (static grep, digit-boundary regex — not `\b`, which fails to match "1056" inside "1056px": no bare 612/792/816/1056 literals outside the shared module; the two currently-dirty sources are declared `it.fails` so the tree is never red) (182-01-T3, redesigned per plan-checker BLOCKER 2/4)
- [x] Import-boundary purity test (lib/estimate/document/* imports no `@react-pdf/renderer`, no `react`, no `components/*`) (182-01-T3, added per plan-checker info 14)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email/WhatsApp PDF visually renders tenant template | PDFPAR-04 | Real send needs live providers | Send test estimate by email + WhatsApp in staging; compare against Download PDF |

---

## Nyquist Compliance Notes (plan-checker revision pass, final re-verification)

- **Never-red guarantee (geometry):** `tests/unit/estimate/pt-px-conversion-source.test.ts`'s two known-failing checks (estimate-document.tsx, estimate-editor.tsx both carry live geometry literals as of Plan 182-01) are declared with vitest's `it.fails(...)`, which reports GREEN when the wrapped assertion throws as expected. The full suite is green at every commit, including Plan 182-01's. Plan 182-02 converts both to plain `it()` once it removes the literals — if it forgets, `it.fails` itself starts reporting a real failure (unexpectedly passing), closing the loop.
- **Live-source baseline, not self-referential, state-tolerant (NEW-1 fix):** `document-label-parity.test.ts` (Plan 182-01) regex-extracts key/value pairs directly from the 4 renderer files' CURRENT label-map declarations and compares them to `LABELS`, rather than comparing a hand-typed transcription to itself. The test is state-tolerant: live-source parity pre-adoption, import-adoption + value snapshot post-adoption — never red at any commit; 182-02 does not modify it. This closed a genuine intra-plan red window a re-verification pass found: the original design had Plan 182-02 "repoint" the test in a separate task commit AFTER the commit that deletes the local maps, which would have been red in between.
- **Value coverage after adoption (NEW-2 fix):** once all 4 renderers move to the (value-blind) import-adoption branch, `expect(LABELS).toMatchSnapshot()` is the one remaining check that still guards the actual label VALUES — committed as `tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap`, mirroring the existing `document-alignment.test.tsx.snap` precedent already in this repo.
- **Parallel-wave isolation:** all 4 plans carry an `<execution_note>` telling the executor to ignore `tsc`/`vitest` errors in files outside that plan's own `files_modified` during per-task verification — those belong to the concurrent same-wave plan. The authoritative gate is the full-suite run at each wave boundary.
- **Strict-mode type safety:** Plan 182-03's `EstimatePdfContext.company` is explicitly `NonNullable<EstimateContextResult['company']>` (not the bare indexed-access type), since the runtime null-guard in `resolveEstimatePdfContext` doesn't propagate into a separately declared interface field.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task across all 4 plans has one)
- [x] Wave 0 covers all MISSING references (label-parity, resolver acceptance, geometry source, import-boundary purity — all 4 created in Wave 1)
- [x] No watch-mode flags (`vitest run`, never `--watch`, throughout)
- [x] Feedback latency < 180s (scoped commands complete in well under 30s; full suite ~60-120s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (plan-checker revision pass + final re-verification — 5 blockers + 6 warnings + 1 final blocker (NEW-1, intra-plan red window) + 1 cheap improvement (NEW-2, value snapshot) addressed across all 4 plans; see per-plan `<must_haves>`/`<verification>` sections for the resulting concrete fixes)
