---
phase: 102
slug: resilience-batch-autorefine-ttl
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 102 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 (+ @testing-library/react for the banner test) |
| **Config file** | `vitest.config.ts` (jsdom, `@` alias to root) |
| **Quick run command** | `npx vitest run tests/unit/estimate tests/unit/whatsapp` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30s (targeted), ~2–3 min (full) |

---

## Sampling Rate

- **After every task commit:** the test file(s) for that task
- **After every plan wave:** `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| W0 | 00 | 0 | all | unit | `npx vitest run tests/unit/estimate/auto-refine-cap.test.ts tests/unit/whatsapp/replay-safe-ttl.test.ts tests/unit/whatsapp/batch-reporting.test.ts tests/unit/workspace/needs-details-banner.test.tsx` | ❌ W0 | ⬜ pending |
| cap | — | 1 | HARD-06 | unit | `npx vitest run tests/unit/estimate/auto-refine-cap.test.ts` | ❌ W0 | ⬜ pending |
| ttl | — | 1 | HARD-07 | unit | `npx vitest run tests/unit/whatsapp/replay-safe-ttl.test.ts` | ❌ W0 | ⬜ pending |
| batch-report | — | 1 | HARD-05 | unit | `npx vitest run tests/unit/whatsapp/batch-reporting.test.ts` | ❌ W0 | ⬜ pending |
| recourse-ui | — | 1 | HARD-06 | unit (RTL) | `npx vitest run tests/unit/workspace/needs-details-banner.test.tsx` | ❌ W0 | ⬜ pending |
| neutrality | — | 1 | invariant | unit | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ✅ green | ⬜ pending |
| never-reply | — | 1 | invariant | unit | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ✅ green | ⬜ pending |
| autorefine-iso | — | 1 | invariant | unit | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ✅ green | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/auto-refine-cap.test.ts` — HARD-06: default cap=1 loops once (unchanged); `AUTO_REFINE_MAX_ATTEMPTS=N` loops while `refineAttempts < N` then finalize (drive `checkVagueAfterAssessEdge`; set/reset env in before/afterEach)
- [ ] `tests/unit/whatsapp/replay-safe-ttl.test.ts` — HARD-07: same `requestedAt` → identical `expires_at` across two finalize invocations (mirror the chainable-Supabase mock from never-reply-regression)
- [ ] `tests/unit/whatsapp/batch-reporting.test.ts` — HARD-05: partial failure (1 of 2 ok:false) → estimate built + ONE reply noting the dropped item; total failure → existing no-input path, still ONE reply
- [ ] `tests/unit/workspace/needs-details-banner.test.tsx` — HARD-06 recourse UI: renders on `project.status==='awaiting_details'`, hidden otherwise, CTA fires the existing generate trigger (RTL)
- [ ] Verify `@testing-library/react` is a devDependency before writing the banner test (repo has client-component tests — expected present)
- No framework install needed (vitest present)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The recourse banner end-to-end: a vague estimate leaves the project in awaiting_details, the banner shows, "Add details & regenerate" re-runs generation | HARD-06 | Full generate→assess→awaiting_details→UI→regenerate loop needs a running app + a deliberately vague input | In staging, generate from a deliberately thin input; confirm the project shows the recourse banner and the CTA regenerates |
| WhatsApp partial-batch reply wording on a real device | HARD-05 | Live WhatsApp delivery | Send a batch with one corrupt voice note + one good text; confirm one reply that builds the estimate and notes the dropped note |

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
