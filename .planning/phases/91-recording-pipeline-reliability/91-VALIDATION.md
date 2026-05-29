---
phase: 91
slug: recording-pipeline-reliability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (E2E) — detected in repo |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx playwright test` |
| **Estimated runtime** | ~60 seconds (unit) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled by the planner — each task that produces verifiable behavior maps to an automated command here.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | — | — | REC-01..05 | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Planner to confirm. Likely additions:
- [ ] Unit stubs for the graceful job-status contract (REC-01/REC-05) — assert non-200 config-missing now returns a discriminated `state` without throwing
- [ ] Unit/integration coverage for idempotency-key reuse on retry (REC-04)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Capture popup shows human-readable failure + Retry + Edit-manually | REC-02 | Requires real recorder UI + browser media APIs | Record audio with Inngest unconfigured; confirm popup shows plain-language reason and both buttons, no raw 503/stack |
| Retry continues same attempt lineage | REC-03 | End-to-end across UI + Inngest dispatch | Trigger failure, tap Retry, confirm same attempt id reused (no double-charge) |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
