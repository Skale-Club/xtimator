---
phase: 25
slug: plain-text-tab-copy-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest with jsdom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/utils/estimate-template.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/utils/estimate-template.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 0 | PLAINTEXT-02 | unit stub (RED) | `npx vitest run tests/unit/utils/estimate-template.test.ts 2>&1 \| head -20` | ✅ (extend existing) | ⬜ pending |
| 25-01-02 | 01 | 1 | PLAINTEXT-02 | unit (GREEN) | `npx vitest run tests/unit/utils/estimate-template.test.ts` | ✅ after W0 | ⬜ pending |
| 25-02-01 | 02 | 2 | PLAINTEXT-01 | manual | Check PlainTextCard renders in Send tab | — | ⬜ pending |
| 25-02-02 | 02 | 2 | PLAINTEXT-02,04 | manual | Copy button + Reset behavior in browser | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/utils/estimate-template.test.ts` — extend existing file with RED stubs for `buildItemsBreakdown`:
  - `buildItemsBreakdown()` returns section header in square brackets on its own line
  - `buildItemsBreakdown()` formats items as `Description: $price` with colon separator
  - `buildItemsBreakdown()` adds blank line between section blocks
  - `buildItemsBreakdown()` handles empty estimate (no sections) without crashing
  - `buildItemsBreakdown()` uses `formatCurrency` for prices (USD format)

*File already exists from Phase 24 — no new file creation needed. Add a `describe('buildItemsBreakdown', () => { ... })` block.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plain Text card visible in Send tab | PLAINTEXT-01 | UI rendering — DOM not testable in jsdom without full React setup | Navigate to any project with an estimate → Send tab → scroll to see Plain Text card |
| Copy button writes to clipboard + shows toast | PLAINTEXT-02 | `navigator.clipboard` not available in jsdom | Click Copy → check toast "Copied to clipboard!" + paste into any text field |
| Edited text does not affect saved template | PLAINTEXT-04 | Requires running app with real Supabase session | Edit text in card → copy → navigate to /settings/estimate-templates → verify template unchanged |
| Reset button reverts to generated text | PLAINTEXT-04 | UI behavior — requires running app | Edit text → click Reset → verify textarea reverts to original generated text |
| Template variables resolved correctly | PLAINTEXT-03 | Requires real company data | Generated text should show real client name, company name, owner name, total, items |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
