---
phase: 18
slug: voice-first-project-onboarding
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-05
last_updated: 2026-05-05
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
| **Quick run command** | `npm test` (vitest) |
| **Full suite command** | `npm test && npm run test:e2e` |
| **Estimated runtime** | ~30s unit / ~2min e2e |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npx playwright test --project=chromium tests/e2e/capture-*.spec.ts tests/e2e/voice-first-flow.spec.ts tests/e2e/skip-recording.spec.ts tests/e2e/recorder-mobile.spec.ts`
- **Before `/gsd:verify-work`:** Full suite (all 3 Playwright projects) must be green
- **Max feedback latency:** 30 seconds (unit), 2 minutes (e2e)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Criterion | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-----------|-----------|-------------------|-------------|--------|
| 18-01 T1 — Wave 0 test scaffolds | 18-01 | 1 | P18-01..09 | unit + e2e | `npx vitest run tests/unit/wizard-client-only.test.ts tests/unit/recorder-duration-cap.test.ts tests/unit/recorder-warning-thresholds.test.ts tests/unit/processing-stepper.test.tsx tests/unit/transcript-reveal.test.tsx tests/unit/api/generate-estimate-name-patch.test.ts` (failing/skipped is expected at this stage) | ❌ Wave 0 scaffold | ⬜ pending |
| 18-01 T2 — Schema reduction + eager-create wizard | 18-01 | 1 | P18-01 | unit | `npx vitest run tests/unit/wizard-client-only.test.ts` | ❌ → ✅ in this task | ⬜ pending |
| 18-01 T3 — (capture) route group + minimal client shell | 18-01 | 1 | P18-02, P18-08 | tsc + structural | `npx tsc --noEmit && ls "app/(capture)/layout.tsx" "app/(capture)/projects/[id]/capture/page.tsx" "app/(capture)/projects/[id]/capture/capture-client.tsx" "app/(capture)/projects/[id]/capture/loading.tsx"` | ❌ → ✅ in this task | ⬜ pending |
| 18-02 T1 — Presentational components + waveform extension | 18-02 | 2 | P18-04, P18-05, P18-06 | unit | `npx vitest run tests/unit/processing-stepper.test.tsx tests/unit/transcript-reveal.test.tsx tests/unit/recorder-warning-thresholds.test.ts` | ❌ → ✅ in this task | ⬜ pending |
| 18-02 T2 — Full-screen CaptureRecorder + auto-fire orchestration | 18-02 | 2 | P18-02, P18-03, P18-04, P18-05, P18-06, P18-09 | unit | `npx vitest run tests/unit/recorder-duration-cap.test.ts tests/unit/recorder-warning-thresholds.test.ts tests/unit/processing-stepper.test.tsx tests/unit/transcript-reveal.test.tsx` | ❌ → ✅ in this task | ⬜ pending |
| 18-03 T1 — Tool schema extension + project-name patch | 18-03 | 3 | P18-07 | unit | `npx vitest run tests/unit/api/generate-estimate-name-patch.test.ts` | ❌ → ✅ in this task | ⬜ pending |
| 18-03 T2 — Cleanup migration + Vercel cron fallback + auth-gate | 18-03 | 3 | D-03 | unit + integration | `npx vitest run tests/unit/cleanup-route-auth.test.ts` | ❌ → ✅ in this task | ⬜ pending |
| 18-03 T3 — Finalize e2e + phase gate + 18-VALIDATION refresh | 18-03 | 3 | P18-02, P18-07, P18-08, P18-09 | e2e | `npx playwright test --project=chromium tests/e2e/capture-fullscreen-shell.spec.ts tests/e2e/skip-recording.spec.ts tests/e2e/recorder-mobile.spec.ts tests/e2e/voice-first-flow.spec.ts --list` | ❌ → ✅ in this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Test scaffolds that must exist before implementation tasks run. From RESEARCH.md § Validation Architecture.

- [ ] `tests/unit/wizard-client-only.test.ts` — covers P18-01 (1-step wizard) — **GREEN after 18-01 T2**
- [ ] `tests/e2e/capture-fullscreen-shell.spec.ts` — covers P18-02 (full-screen layout escape) — **GREEN after 18-03 T3**
- [ ] `tests/unit/recorder-duration-cap.test.ts` — covers P18-03 (10-min cap + auto-stop) — **GREEN after 18-02 T2**
- [ ] `tests/unit/recorder-warning-thresholds.test.ts` — covers P18-04 (60s warning + color escalation) — **GREEN after 18-02 T1**
- [ ] `tests/unit/processing-stepper.test.tsx` — covers P18-05 (4-stage stepper) — **GREEN after 18-02 T1**
- [ ] `tests/unit/transcript-reveal.test.tsx` — covers P18-06 (transcript revealed mid-flow) — **GREEN after 18-02 T1**
- [ ] `tests/e2e/voice-first-flow.spec.ts` — covers P18-07 (auto-fire generation + redirect to editor) — **GREEN after 18-03 T3**
- [ ] `tests/e2e/skip-recording.spec.ts` — covers P18-08 (escape hatch) — **GREEN after 18-03 T3**
- [ ] `tests/e2e/recorder-mobile.spec.ts` — covers P18-09 (mobile-safari + mobile-chrome) — **GREEN after 18-03 T3**
- [ ] `tests/unit/api/generate-estimate-name-patch.test.ts` — covers P18-07 (D-05 tool schema + name patch) — **GREEN after 18-03 T1**
- [ ] `tests/integration/cleanup-orphan-projects.test.ts` — covers D-03 (skipped without `DATABASE_URL`) — **structurally GREEN after 18-03 T2**
- [ ] `tests/unit/cleanup-route-auth.test.ts` — covers Vercel Cron `CRON_SECRET` validation (RESEARCH.md fallback) — **GREEN after 18-03 T2**

---

## Manual-Only Verifications

| Behavior | Criterion | Why Manual | Test Instructions |
|----------|-----------|------------|-------------------|
| Recorder works on real iOS Safari (physical device) | P18-09 | iOS WebKit AudioContext bugs cannot be reliably reproduced in Playwright mobile-safari project | Open `/projects/[id]/capture` on a real iPhone; record 30s; confirm waveform animates, timer ticks, mic permission prompt appears once, transcript populates after stop, redirect lands on populated estimate editor |
| Recorder works on real Android Chrome (physical device) | P18-09 | Same — emulator does not exercise real Web Audio | Open same URL on real Android; same checks |
| Mic permission revoke mid-recording | Pitfall 2 | No browser API to programmatically revoke permission | Start recording; revoke mic permission via browser site settings; confirm UI surfaces an error toast and does NOT save a silent blob |
| Tab background → 10-min cap accuracy | P18-03 | Background tab throttling is browser-specific and cannot be deterministically reproduced in Playwright | Start recording; switch tab for 5+ minutes; return; confirm timer + auto-stop fired at the correct wall-clock time (within 1 second of 10:00) |
| Visual progress ring smoothness | P18-02, P18-04 | Subjective animation quality | Watch the ring fill over 10 minutes; confirm no jank, smooth color transitions at 8:00 and 9:30 |
| Skip recording → orphan project visible/hidden across cron run | D-03 | Cron schedule is 24h+; can't wait in CI | Create draft project, skip recording, verify it doesn't appear in dashboard/sidebar; manually run `SELECT public.cleanup_orphan_draft_projects()` (or `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/cleanup-orphan-projects`); confirm row is deleted after 24h elapsed |
| Full pipeline: client pick → record → transcribe → AI estimate → editor | P18-07 | Requires real OpenAI Whisper key + Anthropic Claude key + microphone access — out of scope for CI smoke | Set `E2E_FULL_PIPELINE=1` and run `npx playwright test tests/e2e/voice-first-flow.spec.ts -t "full pipeline"` against a real environment |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (per `<verify>` blocks across plans 18-01/02/03)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task in every plan has a vitest or tsc command)
- [x] Wave 0 covers all 9 ROADMAP success criteria (P18-01…P18-09) plus D-03 + D-15
- [x] No watch-mode flags
- [x] Feedback latency < 30s (unit) / 2min (e2e)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** GREEN — proceed to `/gsd:execute-phase 18`.

---

*Note: `wave_0_complete` flips to `true` once plan 18-01 task 1 lands the 10 scaffold files. Last task of plan 18-03 (T3) flips this entry plus the per-task status column to ✅.*
