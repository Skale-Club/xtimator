---
phase: 179
slug: whatsapp-template-composer
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-22
---

# Phase 179 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Covers TMPLCOMP-01 (ordered-array composer), TMPLCOMP-02 (real Meta payload + pre-submit validation), TMPLCOMP-03 (in-panel status verification, full status enum), TMPLCOMP-04 (edit + resubmit), and TMPLCOMP-05 (variables_schema write-through + the admin-whatsapp-templates.ts Wave-0 test gap the research found).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing, `vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` — `include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', ...]` |
| **Quick run command** | `npx vitest run tests/unit/whatsapp/template-composer.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/whatsapp tests/unit/admin/whatsapp-templates.test.ts tests/unit/admin/whatsapp-template-composer.test.tsx tests/unit/admin/whatsapp-templates-panel.test.tsx` (phase-scoped) |
| **Estimated runtime** | ~5-10s per targeted file; ~20-30s phase-scoped full sweep |

No new test dependencies — `@testing-library/react` is already installed and already used for the sibling Phase 173 admin editor/panel tests this phase's UI plan (179-04) directly mirrors. Pure-logic modules (179-01, half of 179-02) need zero mocks. `global.fetch` mocking (179-02) mirrors `tests/unit/ai/openrouter-timeout.test.ts`'s convention. Server-action tests (179-03) mirror the existing `tests/unit/admin/whatsapp-templates.test.ts`'s Supabase-client-mock convention, extended with a `.select().eq().single()` read chain the existing helper lacks.

---

## Sampling Rate

- **Per task commit:** targeted `npx vitest run <specific test file>` (every task names its own file in `<verify><automated>`).
- **Per wave merge:**
  - Wave 1 (179-01 + 179-02, parallel, file-disjoint): `npx vitest run tests/unit/whatsapp/template-composer.test.ts tests/unit/whatsapp/meta-templates-client.test.ts`
  - Wave 2 (179-03): `npx vitest run tests/unit/admin/whatsapp-templates.test.ts`
  - Wave 3 (179-04): `npx vitest run tests/unit/admin/whatsapp-template-composer.test.tsx tests/unit/admin/whatsapp-templates-panel.test.tsx`
- **Phase gate:** full `npx vitest run tests/unit` green + `npx tsc -p tsconfig.ci.json --noEmit` exits 0, before `/gsd:verify-work`. Additionally re-run `npx vitest run tests/unit/notifications/whatsapp-registry.test.ts` in isolation — this phase makes `expectedVariableCount` live for the first time; the existing Phase 174 guard tests must stay green UNMODIFIED (this phase does not touch `whatsapp-registry.ts`).
- **Max feedback latency:** <10s per task, <30s per wave.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|---------------------|-------------|
| TMPLCOMP-01/02 | `validateComposerTemplate` mirrors every Meta auto-reject rule (sequential/gapped/duplicate tokens, leading/trailing variable, missing example, 1024-char limit) and reports ALL violations in one pass | unit | `npx vitest run tests/unit/whatsapp/template-composer.test.ts` (179-01 Task 1) | ❌ W0 |
| TMPLCOMP-01 | `buildBodyComponent` derives Meta's exact verified BODY component shape from the ordered array — no independent duplicate | unit | `npx vitest run tests/unit/whatsapp/template-composer.test.ts` (179-01 Task 1) | ❌ W0 |
| TMPLCOMP-02 | `createMetaTemplate` sends `allow_category_change: false` by default (fail-closed, research Open Q2) and never throws on a non-200/network error | unit (mocked fetch) | `npx vitest run tests/unit/whatsapp/meta-templates-client.test.ts` (179-02 Task 1) | ❌ W0 |
| TMPLCOMP-03 | `extractRejectionReason` defensively reads BOTH `rejected_reason` and `rejection_reason`, normalizing Meta's `'NONE'` sentinel to `null` (research LOW-confidence field-name flag) | unit | `npx vitest run tests/unit/whatsapp/meta-templates-client.test.ts` (179-02 Task 1) | ❌ W0 |
| TMPLCOMP-03 | `mapMetaEventToStatus` resolves the FULL Meta event vocabulary to DISTINCT statuses — PAUSED/DISABLED/FLAGGED/LOCKED pairwise-distinct and never `'approved'` | unit | `npx vitest run tests/unit/whatsapp/meta-templates-client.test.ts` (179-02 Task 1) | ❌ W0 |
| TMPLCOMP-04 | `updateMetaTemplate` hits the item endpoint (`/{template_id}`), structurally distinct from `createMetaTemplate`'s collection endpoint | unit (mocked fetch) | `npx vitest run tests/unit/whatsapp/meta-templates-client.test.ts` (179-02 Task 1) | ❌ W0 |
| TMPLCOMP-02 | `submitTemplateToMeta` refuses an incomplete draft BEFORE any Meta call, and sends a real non-empty `components` payload for a valid draft | unit (mocked meta-templates-client) | `npx vitest run tests/unit/admin/whatsapp-templates.test.ts` (179-03 Task 1) | ⚠️ partial — file exists but never exercised this path (research finding) |
| TMPLCOMP-05 | On successful submission, `variables_schema` is written in the SAME update call that flips `status` to `'pending'` | unit | `npx vitest run tests/unit/admin/whatsapp-templates.test.ts` (179-03 Task 1) | ❌ W0 (new assertion) |
| TMPLCOMP-03 | `checkTemplateStatus` reuses the shared `mapMetaEventToStatus`, persists the mapped result, never throws | unit (mocked meta-templates-client) | `npx vitest run tests/unit/admin/whatsapp-templates.test.ts` (179-03 Task 2) | ❌ W0 |
| TMPLCOMP-04 | `updateTemplateAndResubmit` validates first (before any DB read), guards on a missing `meta_template_id`, and on success clears `rejection_reason` + flips to `'pending'` | unit (mocked meta-templates-client) | `npx vitest run tests/unit/admin/whatsapp-templates.test.ts` (179-03 Task 2) | ❌ W0 |
| TMPLCOMP-01 | Composer UI: "Add variable" always appends the NEXT sequential token (never free-typed), live preview substitutes examples, validation errors disable Submit | unit (RTL) | `npx vitest run tests/unit/admin/whatsapp-template-composer.test.tsx` (179-04 Task 1) | ❌ W0 |
| TMPLCOMP-03 | Panel: every one of the 10 known statuses renders a DISTINCT badge, never falling through to the generic `outline` fallback | unit (RTL) | `npx vitest run tests/unit/admin/whatsapp-templates-panel.test.tsx` (179-04 Task 2) | ❌ W0 |
| TMPLCOMP-03/04 | Panel: Check status now / Edit & Resubmit visibility is correctly gated per row status/meta_template_id, and each calls the correct action with the correct arguments | unit (RTL) | `npx vitest run tests/unit/admin/whatsapp-templates-panel.test.tsx` (179-04 Task 2) | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/whatsapp/template-composer.test.ts` — covers TMPLCOMP-01/02 pure derivation+validation logic (179-01 Task 1; new file, new module)
- [ ] `tests/unit/whatsapp/meta-templates-client.test.ts` — covers TMPLCOMP-02/03/04 Meta HTTP wrapper + status mapping (179-02 Task 1; new file, new module)
- [ ] `tests/unit/admin/whatsapp-template-composer.test.tsx` — covers the composer UI's own behavior (179-04 Task 1; new file, new component)
- [ ] `tests/unit/admin/whatsapp-templates-panel.test.tsx` — covers the panel's own wiring (179-04 Task 2; new file — no prior coverage existed for this panel at all, confirmed by directory listing before planning)
- [x] `tests/unit/admin/whatsapp-templates.test.ts` — pre-existing (Phase 104.3), but research confirmed its `submitTemplateToMeta` coverage never exercised a real success path (the mock helper lacks a `.select().eq().single()` chain, so the existing "does NOT throw" test only proves the catch-block path). 179-03 Task 1 extends this file's mock helper and adds the missing success-path assertions — the actual Wave-0 gap this phase's research flagged, now closed via extension rather than a parallel new file (keeps one canonical test file per source file).

*Framework already installed — no `npm install` needed.*

---

## Hidden Regressions the Plan MUST Guard Against

- **The 5 pre-existing `tests/unit/admin/whatsapp-templates.test.ts` tests must stay green with their ORIGINAL assertions intact.** 179-03 Task 1 may extend the file's mock helpers additively (a second factory function, e.g. `makeTemplatesClientWithRow`) but must not rewrite `makeTemplatesClient` or any of the 5 existing `it(...)` blocks' expectations. Verification: `git diff` on this file after 179-03 shows only additions plus the `mapMetaEventToStatus` import-swap (no deleted/changed assertion lines in the 5 original tests).
- **`lib/notifications/whatsapp-registry.ts` must NOT be touched by any plan in this phase.** `getApprovedTemplateForEvent`'s `expectedVariableCount: Array.isArray(data.variables_schema) ? data.variables_schema.length : 0` line is the Phase 174 guard this phase makes real — it works unmodified because `.length` behaves identically whether `variables_schema` holds bare label strings or the richer `ComposerParam[]` objects this phase now writes. Verification: `git diff --name-only` across all 4 plans excludes `lib/notifications/whatsapp-registry.ts`; re-run `tests/unit/notifications/whatsapp-registry.test.ts` unmodified and confirm it stays green.
- **`app/api/webhooks/whatsapp/route.ts` must NOT need any code change.** `findTemplateStatusChange` already forwards `event`/`reason` generically; the widened `mapMetaEventToStatus` (179-02) is consumed transparently through the EXISTING `applyTemplateStatusUpdate` call this route already makes. Verification: `git diff --name-only` across all 4 plans excludes this file.
- **`allow_category_change` must default to `false`, never `true` or unset-and-implicitly-Meta's-default.** This is a locked, fail-closed design constraint (research Open Question 2 resolved conservatively) — a regression here would silently let Meta recategorize a UTILITY template, which this milestone's CUST-03/04 opt-in logic treats as meaningfully different. Verification: `tests/unit/whatsapp/meta-templates-client.test.ts`'s `buildCreatePayload` default-case test is a permanent gate on this — never weaken it.
- **`variables_schema` must be written ONLY inside `submitTemplateToMeta`'s and `updateTemplateAndResubmit`'s success paths — never as a side effect of `createTemplate` alone drifting from what was actually sent to Meta.** `createTemplate` may store an initial DRAFT value (so a draft can be resumed before ever submitting), but the AUTHORITATIVE write that matters for the guard is the submission-success write. Verification: `grep -n "variables_schema:" lib/actions/admin-whatsapp-templates.ts` — exactly 3 occurrences expected: the `createTemplate` insert default, the `submitTemplateToMeta` success update, and the `updateTemplateAndResubmit` success update. A 4th occurrence anywhere else is a regression signal.
- **Migration idempotency.** `supabase/migrations/20260722000001_phase179_whatsapp_template_body_text.sql` must use `ADD COLUMN IF NOT EXISTS` — safe to re-run, consistent with every migration in this repo. Prefix `20260722000001` — nothing dated 2026-07-22 exists yet (verified before planning).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Migration applies cleanly to prod | TMPLCOMP-01/05 (schema) | Deploy is CI→GHCR→Coolify; migrations are applied manually per project convention | After merge, manually apply `20260722000001_phase179_whatsapp_template_body_text.sql` to the prod Supabase project (server `f2b95485` / `prmqgcrnpuvpzruyzvuv`) — after Phase 172/175/176/177/178's migrations if not already applied. Verify via `select column_name from information_schema.columns where table_name='whatsapp_notification_templates' and column_name='body_text'` (expect 1 row). |
| Real end-to-end Meta submission | TMPLCOMP-02 | Requires a live platform Meta WABA token with `whatsapp_business_management` scope, exercised against the real `graph.facebook.com` | Compose a real template in the admin panel, click Submit to Meta, confirm a 200 response with a real `id` and the row flips to `pending`; confirm in Meta WhatsApp Manager that the submitted template shows the exact body + example values entered. |
| Real Meta review outcome + status sync | TMPLCOMP-03 | ~24h Meta review turnaround; requires the live webhook AND the live GET endpoint | After Meta approves or rejects the real submission above, confirm BOTH paths reflect it: (a) the `message_template_status_update` webhook flips the row automatically, and (b) "Check status now" independently confirms the same status via direct GET — and if rejected, confirm the exact `rejected_reason`/`rejection_reason` field name Meta actually returns (research flagged this as LOW confidence; adjust `extractRejectionReason` if the live field name differs from either name currently read). |
| Real edit-and-resubmit round-trip | TMPLCOMP-04 | Requires a real rejected (or approved) template from the above | From a rejected real template, use Edit & Resubmit with a corrected body; confirm Meta's response flips the SAME template id back to `pending` (not a new id), and that Meta WhatsApp Manager shows the updated body under review. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task in every plan has one)
- [x] Wave 0 covers all MISSING references (4 new test files + 1 extended existing file, all owned by their respective plan's task)
- [x] No watch-mode flags (`vitest run`, never bare `vitest`)
- [x] Feedback latency <10s per task, <30s per wave
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Initial plan-phase pass. This phase makes the Phase 174 `expectedVariableCount` send-time guard live for the first time (previously always a structural no-op against the 5 static REGISTRY fallback entries) — the `variables_schema` write-discipline and the `whatsapp-registry.ts`-must-stay-untouched constraint above are treated as load-bearing, not stylistic. Ready for `/gsd:execute-phase 179`.
