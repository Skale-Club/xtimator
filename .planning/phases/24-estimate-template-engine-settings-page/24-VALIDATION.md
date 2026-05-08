---
phase: 24
slug: estimate-template-engine-settings-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 24 — Validation Strategy

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
| 24-01-01 | 01 | 0 | PLAINTEXT-03 | unit stub | `npx vitest run tests/unit/utils/estimate-template.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | PLAINTEXT-03 | unit | `npx vitest run tests/unit/utils/estimate-template.test.ts` | ✅ after W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | PLAINTEXT-05 | manual | Navigate to `/settings/estimate-templates` | — | ⬜ pending |
| 24-01-04 | 01 | 1 | PLAINTEXT-05 | manual | Save form, refresh, verify values persist | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/utils/estimate-template.test.ts` — RED stubs for PLAINTEXT-03:
  - `resolveTemplate()` with all NULL fields returns default greeting/opener/closer/signature
  - `resolveTemplate()` with stored values returns stored values (not defaults)
  - Variable substitution replaces `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, `{items_breakdown}`
  - Empty string fields treated as NULL (use default)

*Existing Vitest infrastructure covers all phase requirements — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings page renders 4 textarea fields with correct labels and helper text | PLAINTEXT-05 | UI rendering — not covered by unit tests | Navigate to `/settings/estimate-templates`, verify 4 textareas: Greeting, Opening, Closing, Signature |
| Save action persists template to DB and survives browser refresh | PLAINTEXT-05 | Requires real Supabase session | Fill all 4 fields, click Save, hard-refresh, verify values are retained |
| Estimate Templates card appears on `/settings` below Price Book card | PLAINTEXT-05 | UI layout — visual check | Navigate to `/settings`, verify card with FileText icon and link to `/settings/estimate-templates` |
| Company with no saved template gets sensible defaults in preview | PLAINTEXT-03 | Requires real company session with NULL template columns | Fresh company, navigate to template settings, verify placeholders show default text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
