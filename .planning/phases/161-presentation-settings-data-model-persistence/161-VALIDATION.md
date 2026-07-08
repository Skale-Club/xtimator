---
phase: 161
slug: presentation-settings-data-model-persistence
status: final
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-08
---

# Phase 161 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/estimate/presentation-settings.test.ts` |
| **Full suite command** | `npm test` (vitest run) |
| **Estimated runtime** | ~2-5s targeted; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/estimate/presentation-settings.test.ts`
- **After every plan wave:** `npm test` (full suite — cheap here, this phase touches no renderers/routes)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| PRESENT-01 | `resolvePresentationSettings(null)` returns full defaults, all 7 sections visible | unit | `npx vitest run tests/unit/estimate/presentation-settings.test.ts -t "NULL"` | ❌ W0 |
| PRESENT-01 | Partial persisted object resolves with every other key defaulted | unit | same file, `-t "partial"` | ❌ W0 |
| PRESENT-02 | Non-destructive-hiding proof: `isSectionVisible` false while underlying content field unchanged | unit | same file, `-t "non-destructive"` | ❌ W0 |
| PRESENT-02 | Round-trip: hide → serialize/deserialize → still hidden → toggle back → visible again, no data loss | unit | same file, `-t "round-trip"` | ❌ W0 |
| PRESENT-03 | `TaxOverride` `mode: 'off'` preserves `preservedRate` distinct from `customRate` across mode flips | unit | same file, `-t "tax override"` | ❌ W0 |
| PRESENT-03 | Malformed tax value degrades to `DEFAULT_TAX_OVERRIDE`, never throws | unit | same file, `-t "malformed tax"` | ❌ W0 |
| PRESENT-04 | `isSectionVisible` is the sole exported visibility predicate (structural export-shape assertion) | unit | same file, `-t "single predicate"` | ❌ W0 |
| PRESENT-05 | `hasEstimateBeenSentOrViewed` true when either `sent_at`/`viewed_at` non-null | unit | same file, `-t "sent or viewed"` | ❌ W0 |
| Retrocompat | Legacy row (no `presentation_settings` key, `undefined`) resolves identically to explicit `null` | unit | same file, `-t "retrocompat"` | ❌ W0 |
| GUARD-03 boundary | `lib/estimate/presentation-settings.ts` never imports `compute-totals` (static check) | unit (static) | `grep -c "compute-totals" lib/estimate/presentation-settings.ts` → 0 | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/presentation-settings.test.ts` — covers PRESENT-01..05 + retrocompat + GUARD-03 boundary (new file, no existing coverage)

*No new fixtures/conftest needed — this codebase's convention is plain object literals with hand-computed goldens (per `tests/unit/estimate/compute-totals-guards.test.ts`).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification — this is a pure data-model/resolver phase with no UI or live-network surface (no RLS, no anon grants, no e2e-only paths).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — plan-checker to confirm before execution
