---
phase: 99
slug: unified-error-model-provider-fallback
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-21
---

# Phase 99 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 |
| **Config file** | `vitest.config.ts` (include `tests/unit/**`) |
| **Quick run command** | `npx vitest run tests/unit/ai tests/unit/estimate` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (targeted dirs); full suite ~2–3 min |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/ai tests/unit/estimate`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| W0 | 00 | 0 | HARD-03/04 | unit | `npx vitest run tests/unit/ai/with-fallback.test.ts tests/unit/estimate/failure-mapping.test.ts` | ❌ W0 | ⬜ pending |
| gen-fallback | — | 1 | HARD-03 | unit | `npx vitest run tests/unit/ai/with-fallback.test.ts -t "primary success"` | ❌ W0 | ⬜ pending |
| fallback-fires | — | 1 | HARD-03 | unit | `npx vitest run tests/unit/ai/with-fallback.test.ts -t "fallback fired"` | ❌ W0 | ⬜ pending |
| both-fail | — | 1 | HARD-03 | unit | `npx vitest run tests/unit/ai/with-fallback.test.ts -t "both fail"` | ❌ W0 | ⬜ pending |
| single-call | — | 1 | HARD-03/QA-03 | unit | `npx vitest run tests/unit/ai/with-fallback.test.ts -t "single call"` | ❌ W0 | ⬜ pending |
| transcribe-fb | — | 1 | HARD-03 | unit | `npx vitest run tests/unit/ai/transcribe-fallback.test.ts` | ❌ W0 | ⬜ pending |
| vision-gemini | — | 1 | HARD-03 | unit | `npx vitest run tests/unit/ai/gemini-adapter.test.ts -t "vision"` | ⚠️ extend | ⬜ pending |
| failure-map | — | 1 | HARD-04 | unit | `npx vitest run tests/unit/estimate/failure-mapping.test.ts` | ❌ W0 | ⬜ pending |
| superset | — | 1 | HARD-04 | unit | `npx vitest run tests/unit/estimate/failure-mapping.test.ts -t "superset"` | ❌ W0 | ⬜ pending |
| refine-surface | — | 1 | HARD-04 | route | `npx vitest run tests/unit/api/refine-error-surface.test.ts` | ❌ W0 | ⬜ pending |
| never-throw | — | 1 | HARD-04 inv | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` | ✅ extend | ⬜ pending |
| always-reply | — | 1 | HARD-04 inv | unit | `npx vitest run tests/unit/estimate/channel-adapter.test.ts` | ✅ keep green | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/ai/with-fallback.test.ts` — primary-success / fallback-fired / both-fail / single-call-on-success (HARD-03)
- [ ] `tests/unit/ai/transcribe-fallback.test.ts` — key-absent path preserved + failure-based fallback (HARD-03)
- [ ] extend `tests/unit/ai/gemini-adapter.test.ts` — `analyzePhotoGemini` vision from base64+mime (HARD-03)
- [ ] `tests/unit/estimate/failure-mapping.test.ts` — `FailureReason`→`XtimatorError` map + strict-superset assertion (HARD-04)
- [ ] `tests/unit/api/refine-error-surface.test.ts` — refine returns typed JSON `{ error, code }`, not opaque 500 (HARD-04)
- [ ] extend `tests/unit/estimate/never-throw.test.ts` — both-providers-down resolves to `{ failure: { reason: 'provider_unavailable' } }` (invariant)
- [ ] shared mock helper: a `vi.fn()` provider pair (primary throws / succeeds) — colocate or small helper

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live OpenRouter→Gemini fallback on a real provider outage | HARD-03 | Requires a real provider 5xx, not reproducible deterministically in unit tests | In staging, revoke/break the OpenRouter key, trigger a generate; confirm the estimate still generates via Gemini and `fallbackFired` is logged |

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
