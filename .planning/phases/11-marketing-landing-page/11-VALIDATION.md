---
phase: 11
slug: marketing-landing-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 + jsdom + @testing-library/react |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test -- --run tests/unit/middleware.test.ts tests/unit/components/landing-page.test.tsx` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run tests/unit/middleware.test.ts tests/unit/components/landing-page.test.tsx`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | D-17 | unit | `npm test -- --run tests/unit/middleware.test.ts` | ✅ exists — update | ⬜ pending |
| 11-01-02 | 01 | 0 | LAND-01, LAND-02, LAND-03 | unit | `npm test -- --run tests/unit/components/landing-page.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 11-02-xx | 02 | 1 | LAND-01–05 | unit + manual | `npm test -- --run tests/unit/components/landing-page.test.tsx` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/components/landing-page.test.tsx` — new file; covers LAND-01 (hero renders headline + CTAs), LAND-02 (How It Works renders 3 step cards), LAND-03 (Features grid renders 4 feature cards)
- [ ] `tests/unit/middleware.test.ts` — exists; update: remove test asserting `/` is a protected route; add test asserting `/` is public (unauthenticated request returns 200 / no redirect)

*Existing infrastructure (vitest + jsdom + @testing-library/react) is fully set up — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Responsive layout at all breakpoints | LAND-04 | Viewport/touch testing requires real browser — jsdom cannot simulate iOS Safari or Android Chrome viewport quirks | Open on real/emulated iOS Safari and Android Chrome; verify hero, How It Works, Features, CTA band all render correctly at 375px, 390px, 428px, 768px, 1280px |
| Visual quality: dark theme, #406EF1 glow, #7FA4F4 secondary | LAND-05 | Visual fidelity requires human judgement — automated snapshot tests don't catch design quality regressions at launch | Load `/` in dark mode; verify radial glow visible, primary CTA uses #406EF1, near-black background, no white flash on load |
| Navbar sticky behavior on scroll | D-02 | CSS `position: sticky` + `backdrop-blur` behavior requires real browser rendering | Scroll down from hero; verify navbar stays fixed at top with visible blur effect |
| Authenticated user redirect | D-18 | Requires authenticated Supabase session — not possible in unit test environment | Sign in as a valid user, navigate to `/`, verify redirect to `/dashboard` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
