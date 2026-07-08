---
phase: 160
slug: url-contract-public-access-security
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 160 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit/integration), Playwright (e2e) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/share-query.test.ts tests/unit/estimates/share-link.test.ts` |
| **Full suite command** | `npm test` (vitest run — full unit+integration suite) |
| **Estimated runtime** | ~30-60s for the targeted files above; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick command above (existing share-query + share-link suites must stay green — this IS the PUBURL-02 regression guard)
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green, plus the new `tests/integration/estimates-public-token-rls.test.ts` security-regression test must pass
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

*To be completed by the planner as tasks are assigned IDs — see `.planning/phases/160-url-contract-public-access-security/160-RESEARCH.md`'s "Validation Architecture" section for the full per-requirement test design (PUBURL-01..06), which every task's `<acceptance_criteria>` should draw from directly.*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PUBURL-01 | unit | `npx vitest run tests/unit/estimates/public-token.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUBURL-03 | integration | `npx vitest run tests/integration/estimates-public-token-rls.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PUBURL-05 | unit | `npx vitest run tests/unit/share-query.test.ts` | ✅ (extend existing) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimates/public-token.test.ts` — stubs for `getEstimateByPublicToken`/`buildEstimatePublicPath` (PUBURL-01, PUBURL-04)
- [ ] `tests/integration/estimates-public-token-rls.test.ts` — anon-client negative-test stub (PUBURL-03), modeled on the existing `tests/integration/price-book-rls.test.ts` harness (`describe.skip` when Supabase env vars are absent)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| A real pre-existing `/estimate/{share_token}` link (sent before this phase shipped) still opens, logs a view, and allows accept/decline post-deploy | PUBURL-02 | Requires a live deployed environment with a real pre-existing estimate row — not reproducible in CI | After deploy, open a known real share link in a browser; confirm the page renders, `estimates.viewed_at` updates, and Accept/Decline buttons work |
| Custom-domain white-label rendering remains unaffected (confirmed dead code path — see RESEARCH.md finding) | PUBURL-06 | Behavior is "nothing changes because the code was already dead" — no live custom-domain tenant exists to test against | N/A — satisfied by the documented dead-code finding in RESEARCH.md; no manual test needed unless a future phase revives white-label routing |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — planner/executor to finalize Per-Task Verification Map with real task IDs
