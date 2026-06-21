---
phase: 101
slug: unified-multimodal-refine-graph
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 |
| **Config file** | `vitest.config.ts` (jsdom, `@` alias to root) |
| **Quick run command** | `npx vitest run tests/unit/ai tests/unit/estimate` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30s (targeted), ~2–3 min (full) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/ai tests/unit/estimate`
- **After every plan wave:** `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green + `npx tsc --noEmit` clean
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| W0 | 00 | 0 | all | unit | `npx vitest run tests/unit/estimate/multimodal-ingest.test.ts tests/unit/ai/refine-shared-prompt.test.ts tests/unit/estimate/refine-node.test.ts` | ❌ W0 | ⬜ pending |
| ingest | — | 1 | UNIFY-01 | unit | `npx vitest run tests/unit/estimate/multimodal-ingest.test.ts` | ❌ W0 | ⬜ pending |
| shared-prompt | — | 1 | HARD-02, UNIFY-02 | unit | `npx vitest run tests/unit/ai/refine-shared-prompt.test.ts tests/unit/ai/prompt-builder.test.ts` | ❌/⚠️ | ⬜ pending |
| refine-node | — | 1 | UNIFY-03 | unit | `npx vitest run tests/unit/estimate/refine-node.test.ts` | ❌ W0 | ⬜ pending |
| route-contract | — | 2 | HARD-01 | unit | `npx vitest run tests/unit/api/refine-route-contract.test.ts` | ❌ W0 | ⬜ pending |
| equivalence | — | 2 | HARD-01 (crit 5) | unit | `npx vitest run tests/unit/estimate/generate-refine-equivalence.test.ts` | ❌ W0 | ⬜ pending |
| neutrality | — | 2 | invariant | unit | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ✅ green | ⬜ pending |
| never-throw | — | 2 | invariant | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` | ✅ green | ⬜ pending |
| no-checkpointer | — | 2 | invariant | unit | `npx vitest run tests/unit/estimate/no-checkpointer.test.ts` | ✅ extend | ⬜ pending |
| wa-never-reply | — | 2 | invariant | unit | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ✅ green | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/multimodal-ingest.test.ts` — UNIFY-01: audio Blobs + base64 photos + text → `{transcripts, photoDescriptions, texts}`; per-item failure skipped, not thrown (mock transcribeAudioOR/analyzePhotoOR)
- [ ] `tests/unit/ai/refine-shared-prompt.test.ts` — HARD-02/UNIFY-02: no bespoke refine prompt remains in either adapter (grep openrouter.ts + gemini.ts); both call `buildSystemPrompt(...,{mode:'refine'})`
- [ ] `tests/unit/estimate/refine-node.test.ts` — UNIFY-03: refine node never throws; maps ProvidersUnavailableError→provider_unavailable, InvalidEstimateOutputError→invalid_output; success → `{ refined }`
- [ ] `tests/unit/api/refine-route-contract.test.ts` — HARD-01: response shape `{ success, refined, instruction }` + 422/429/demo-guard/400 preserved; failure → `{ error, code }` (drive JSON back-compat path — multipart hangs in jsdom)
- [ ] `tests/unit/estimate/generate-refine-equivalence.test.ts` — criterion 5: both call shared ingestion + `buildSystemPrompt`; bespoke-prompt deletion asserted
- [ ] EXTEND `tests/unit/ai/prompt-builder.test.ts` — refine-mode cases (language/price-book/security reuse; instruction sanitization via `<instruction>` escaped tag)
- [ ] EXTEND `tests/unit/estimate/no-checkpointer.test.ts` — assert `buildRefineGraph` compiles without a checkpointer
- Framework install: none — vitest present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Editor refine UX unchanged end-to-end (record voice / attach photo / type, preview, save) | HARD-01 | Full FormData multipart + editor preview can't run in jsdom | In staging, open an estimate, refine via text + voice + photo; confirm the preview renders and Save persists, identical to before |
| Live refine fallback (OpenRouter outage → Gemini) produces a valid refined preview | UNIFY-03 | Requires a real provider outage | In staging, break the OpenRouter key, refine; confirm a valid refined estimate still returns |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
