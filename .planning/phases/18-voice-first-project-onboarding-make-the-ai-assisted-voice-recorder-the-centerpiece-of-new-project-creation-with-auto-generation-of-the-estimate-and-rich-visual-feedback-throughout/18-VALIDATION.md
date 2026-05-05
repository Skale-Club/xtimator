---
phase: 18
slug: voice-first-project-onboarding
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> See `18-RESEARCH.md` § Validation Architecture for the full mapping of the 9 ROADMAP success criteria to test files.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (3 projects: chromium, mobile-safari, mobile-chrome) |
| **Config file** | `vitest.config.ts` + `playwright.config.ts` |
| **Quick run command** | `bun test:unit` |
| **Full suite command** | `bun test:unit && bun test:e2e` |
| **Estimated runtime** | ~30s unit / ~2min e2e |

---

## Sampling Rate

- **After every task commit:** Run `bun test:unit`
- **After every plan wave:** Run `bun test:unit && bun test:e2e --project=chromium`
- **Before `/gsd:verify-work`:** Full suite (all 3 Playwright projects) must be green
- **Max feedback latency:** 30 seconds (unit), 2 minutes (e2e)

---

## Per-Task Verification Map

> Filled by gsd-planner during planning. Each task gets a row tying it to a ROADMAP success criterion.
> Tentative criterion IDs P18-01…P18-09 from RESEARCH.md correspond to ROADMAP success criteria 1-9.

| Task ID | Plan | Wave | Criterion | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------|-----------|-------------------|-------------|--------|
| _to be populated by planner_ | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Test scaffolds that must exist before implementation tasks run. From RESEARCH.md § Validation Architecture.

- [ ] `tests/unit/wizard-client-only.test.ts` — covers P18-01 (1-step wizard)
- [ ] `tests/e2e/capture-fullscreen-shell.spec.ts` — covers P18-02 (full-screen layout escape)
- [ ] `tests/unit/recorder-duration-cap.test.ts` — covers P18-03 (10-min cap + auto-stop)
- [ ] `tests/unit/recorder-warning-thresholds.test.ts` — covers P18-04 (60s warning + color escalation)
- [ ] `tests/unit/processing-stepper.test.tsx` — covers P18-05 (4-stage stepper)
- [ ] `tests/unit/transcript-reveal.test.tsx` — covers P18-06 (transcript revealed mid-flow)
- [ ] `tests/e2e/voice-first-flow.spec.ts` — covers P18-07 (auto-fire generation + redirect to editor)
- [ ] `tests/e2e/skip-recording.spec.ts` — covers P18-08 (escape hatch)
- [ ] `tests/e2e/recorder-mobile.spec.ts` — covers P18-09 (mobile-safari + mobile-chrome compatibility)

*If pg_cron is unavailable on the Supabase project, add:*
- [ ] `tests/unit/cleanup-route-auth.test.ts` — Vercel Cron `CRON_SECRET` validation (RESEARCH.md fallback)

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Recorder works on real iOS Safari (physical device) | P18-09 | iOS WebKit AudioContext bugs cannot be reliably reproduced in Playwright mobile-safari project | Open `/projects/[id]/capture` on a real iPhone; record 30s; confirm waveform animates, timer ticks, mic permission prompt appears once, transcript populates after stop |
| Mic permission revoke mid-recording | Pitfalls | No browser API to programmatically revoke permission | Start recording; revoke mic permission via browser site settings; confirm UI surfaces an error and does not save a silent blob |
| Tab background → 10-min cap accuracy | P18-03 | Background tab throttling is browser-specific | Start recording; switch tab for 5+ minutes; return; confirm timer + auto-stop fired at correct wall-clock time |
| Visual progress ring smoothness | P18-02, P18-04 | Subjective animation quality | Watch the ring fill over 10 minutes; confirm no jank, smooth color transitions at 8:00 and 9:30 |
| Skip recording → orphan project visible/hidden | D-03 | Cron schedule is 24h+; can't wait in CI | Create draft project, skip recording, verify it doesn't appear in dashboard/sidebar; manually run cleanup; confirm row is deleted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all 9 ROADMAP success criteria (P18-01…P18-09)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit) / 2min (e2e)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills task map)

**Approval:** pending
