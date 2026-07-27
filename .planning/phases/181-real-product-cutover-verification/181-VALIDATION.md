---
phase: 181
slug: real-product-cutover-verification
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-27
---

# Phase 181 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (chromium / mobile-safari / mobile-chrome) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/settings` |
| **Full suite command** | `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` |
| **Estimated runtime** | ~230s full suite; <15s quick |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/settings` (plus any new demo-settings test file that task created)
- **After every settings-gating task:** re-run the extended/new Playwright spec on `chromium` at minimum
- **After every plan wave:** `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval`
- **Before `/gsd:verify-work`:** Full suite green + extended Playwright spec green on `chromium`, `mobile-safari`, `mobile-chrome`
- **Max feedback latency:** ~60 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 181-01-* | 01 | 1 | PARITY-01 | unit | `npx vitest run tests/unit/settings/demo-tab-visibility.test.ts` | ❌ W0 | ⬜ pending |
| 181-01-* | 01 | 1 | PARITY-03 | unit | new/extended unit test for `TeamSection`/`NotificationsForm` demo props | ❌ W0 | ⬜ pending |
| 181-02-* | 02 | 2 | PARITY-02 | e2e | `npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` (extended) | ⚠️ extend existing | ⬜ pending |
| 181-02-* | 02 | 2 | CUTOVER-03 | e2e | same spec, `--project=mobile-safari --project=mobile-chrome` | ⚠️ extend existing | ⬜ pending |
| 181-03-* | 03 | 3 | CUTOVER-01 | static/manual | grep sweep for bare `href="/demo"` + `next build` link check | ❌ W0 (optional sweep test) | ⬜ pending |
| 181-03-* | 03 | 3 | CUTOVER-02 | manual | N/A — documentation review | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/settings/demo-tab-visibility.test.ts` — asserts `SettingsNav`'s demo-filtered `ITEMS` output shows exactly Company/Team/Notifications, hides the rest.
- [ ] Extend an existing `tests/unit/settings/*` file (or new file) — asserts `TeamSection` with `canManage=false` hides Invite/manage controls in demo context, and `NotificationsForm`'s new `readOnly` prop disables its Switches and swaps footer copy.
- [ ] Extended assertions in `tests/e2e/demo-session-isolation.spec.ts` (or a new sibling spec) — PARITY-01/02/03 page-content and settings-nav-visibility checks, run across all 3 configured Playwright projects.
- [ ] Optional: static sweep test asserting no remaining bare `href="/demo"` reference exists in `app/`/`components/` after the landing-CTA cutover (cheap regression guard).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| `DEMO-WORKSPACE.md` accurately describes the current host-isolated architecture | CUTOVER-02 | Documentation accuracy is not automatable | Read the rewritten doc against the actual code paths it describes (`lib/demo/session.ts`, `app/demo/entry/route.ts`) and confirm no stale references remain |
| Production `demo.xtimator.com` DNS/Coolify domain + Supabase redirect allow-list are actually configured | CUTOVER-02, CUTOVER-03 (production leg) | External infra state, outside repository control (per REQUIREMENTS.md Out-of-Scope table); Phase 180 already established this pattern as operator-owned | After deploy, an operator visits `https://demo.xtimator.com/demo/entry` and confirms it resolves and completes the handoff |

---

## Validation Sign-Off

- [x] Every phase requirement has an automated verification path (except CUTOVER-02's doc-accuracy leg and the production-DNS leg of CUTOVER-03, both manual by nature).
- [x] Sampling continuity: quick command after every task, full suite after every wave.
- [x] Wave 0 names every missing test artifact.
- [x] Commands contain no watch-mode flags.
- [x] Quick feedback latency target is under 60 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.
- [ ] Wave 0 test artifacts implemented and green.
- [ ] Production DNS/Coolify manual verification completed (operator, post-deploy).

**Approval:** strategy approved 2026-07-27; implementation evidence pending.
