---
phase: 96
slug: intelligence-parity-auto-refine-needs-details-surfacing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 96 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 96-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (jsdom env, `globals: true`, `@`→repo root alias, `server-only` stubbed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/estimate/` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | quick ~15s · full ~90s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/estimate/`
- **After every plan wave:** Run `npx vitest run tests/unit/` (behavior-preserving gate — WhatsApp + existing Inngest tests stay green)
- **Before `/gsd:verify-work`:** Full suite green, PLUS ENGINE-01 audit: `graph-neutrality.test.ts` confirms `auto-refine.ts` has no WhatsApp imports
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| SMART-01 | autoRefine fires exactly once when vague; second pass vague routes to finalize (not autoRefine again) | unit (behavioral) | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| SMART-02 | recordUsage fires once per graph completion (not per AI call inside autoRefine) | unit (implicit — existing inngest coverage) | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` | ✅ exists | ⬜ pending |
| SMART-03 | default adapter finalize writes `projects.status = 'awaiting_details'` on vague+refineAttempts>=1 | unit (behavioral) | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| SMART-04 | `needsDetails: true` appears in graph return value (surfaced via poll output automatically) | unit (behavioral) | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| SMART-05 | WhatsApp QA-01 never-throw/always-reply stays green | unit (frozen regression) | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ✅ exists | ⬜ pending |
| QA-02 | Multi-tenant isolation: autoRefine + default adapter finalize chain `.eq('company_id', companyId)` from closure; no LLM-suppliable override | unit (isolation) | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ❌ Wave 0 gap | ⬜ pending |
| ENGINE-01 | `lib/estimate/graph/nodes/auto-refine.ts` has zero WhatsApp import paths | unit (static anchor) | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ✅ exists (needs extension) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/auto-refine-isolation.test.ts` — NEW file covering SMART-01, SMART-03, SMART-04, QA-02:
  - **Test A (SMART-01/QA-02)**: autoRefine node increments `refineAttempts`, resets `estimateId`/`isVague`, appends refine prompt — mocks `requireServiceClient()`, verifies DB calls chain `.eq('company_id', ...)` from closure (not from graph input), verifies the node does NOT accept a companyId override via graph state
  - **Test B (SMART-03)**: default adapter `finalize` with `{ isVague: true, refineAttempts: 1 }` writes `projects.status = 'awaiting_details'` and chains `.eq('company_id', companyId)` (closure value), calls `revertVagueEstimate`, returns `{ needsDetails: true }` (SMART-04)
  - **Test C (QA-02 source anchor)**: source-text check that `lib/estimate/graph/nodes/auto-refine.ts` reads `state.companyId` (trusted) and has no reference to any override mechanism
- [ ] Extend `tests/unit/estimate/graph-neutrality.test.ts` — add `'lib/estimate/graph/nodes/auto-refine.ts'` to the `REQUIRED_CORE_FILES` array and add `'auto-refine'` to the neutrality source scan

*All other required test infrastructure (vitest, mocking helpers) exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live web estimate that generates a vague result triggers autoRefine and eventually sets `projects.status = 'awaiting_details'` in the DB | SMART-03 | Requires live Inngest worker + Anthropic API + vague input | Optional smoke: create a project with a single-word description ("roof"), generate estimate, check `projects` row in Supabase — `status` should be `awaiting_details` after the job completes. Non-blocking — covered by unit tests. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
