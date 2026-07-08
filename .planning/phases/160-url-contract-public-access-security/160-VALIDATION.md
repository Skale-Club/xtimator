---
phase: 160
slug: url-contract-public-access-security
status: final
nyquist_compliant: true
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

| Task | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|------|------|------|-------------|-----------|-------------------|-------------|--------|
| 160-01 (migration + public-url.ts) | 01 | 1 | PUBURL-01, PUBURL-03, PUBURL-04 | unit (static migration-contract guard) | `npx vitest run tests/unit/phase160-public-url-contract-migration.test.ts tests/unit/estimates/public-url.test.ts` | ❌ W0 | ⬜ pending |
| 160-02 (query layer + live RLS test) | 02 | 1 | PUBURL-02, PUBURL-03, PUBURL-05 | unit + integration (live anon RLS) | `npx vitest run tests/unit/estimates/public-token.test.ts tests/integration/estimates-public-token-rls.test.ts` | ❌ W0 | ⬜ pending |
| 160-03 (friendly route + e2e parity) | 03 | 2 | PUBURL-01, PUBURL-02, PUBURL-05, PUBURL-06 | e2e (gated on live Supabase creds) | `npx playwright test estimate-friendly-url.spec.ts` | ❌ W0 | ⬜ pending |
| 160-04 (call-site migration + sweep) | 04 | 2 | PUBURL-04 | unit + grep sweep | `npx vitest run tests/unit/webhooks/connect-events.test.ts tests/unit/estimates/no-hardcoded-share-url.test.ts` | mixed (extends existing + new) | ⬜ pending |
| 160-05 (new-estimate wiring + backfill) | 05 | 2 | PUBURL-01 | unit | `npx vitest run tests/unit/services/generate-estimate.test.ts` | ✅ (extend existing) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Verified by gsd-plan-checker (2026-07-08): PUBURL-03 doubly enforced (static regex guard in 160-01 + genuine live-DB anon-client negative test in 160-02, not a mock) — see checker report for full cross-reference of file/line citations.*

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

**Approval:** approved 2026-07-08 — plan-checker verification passed (2 non-blocking warnings, both documentation-sync/coverage-quality notes, no functional risk)
