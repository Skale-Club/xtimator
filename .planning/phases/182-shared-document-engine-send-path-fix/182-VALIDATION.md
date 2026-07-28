---
phase: 182
slug: shared-document-engine-send-path-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-27
---

# Phase 182 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit/integration), tsc for types |
| **Config file** | `vitest.config.ts` / `tsconfig.ci.json` |
| **Quick run command** | `pnpm vitest run tests/unit/pdf tests/unit/estimate` |
| **Full suite command** | `pnpm vitest run tests/unit tests/eval && npx tsc -p tsconfig.ci.json --noEmit` |
| **Estimated runtime** | ~60-120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the touched area
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

*Populated by the planner — see plan `<automated>` fields. Baseline expectations:*

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | ENGINE-01 | unit (label parity golden) | vitest run scoped | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | PDFPAR-04 | unit (resolver acceptance) | vitest run scoped | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | ENGINE-02 | static grep (no second pt/px literal) | vitest run scoped | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Label-parity golden test (shared labels == current per-surface labels for en/pt/es) — proves zero-visible-change before deletion of local copies
- [ ] Shared-resolver acceptance test (template selection + signed-snapshot application, mirroring `tests/unit/pdf/estimate-pdf-totals.test.tsx` element-walk pattern)
- [ ] Geometry single-source regression test (static grep: no raw 612/792/816/1056 literals outside the shared module)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email/WhatsApp PDF visually renders tenant template | PDFPAR-04 | Real send needs live providers | Send test estimate by email + WhatsApp in staging; compare against Download PDF |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
