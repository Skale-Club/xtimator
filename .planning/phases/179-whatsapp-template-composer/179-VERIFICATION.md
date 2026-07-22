---
phase: 179-whatsapp-template-composer
verified: 2026-07-22T08:30:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
requirements:
  - id: TMPLCOMP-01
    status: satisfied
  - id: TMPLCOMP-02
    status: satisfied
  - id: TMPLCOMP-03
    status: satisfied
  - id: TMPLCOMP-04
    status: satisfied
  - id: TMPLCOMP-05
    status: satisfied
human_verification:
  - test: "Apply migration 20260722000001 to prod Supabase (server f2b95485 / prmqgcrnpuvpzruyzvuv) and confirm body_text column exists"
    expected: "select column_name ... where column_name='body_text' returns 1 row"
    why_human: "Migrations are applied manually per project convention; not run by CI deploy"
  - test: "Compose a real template, Submit to Meta, confirm 200 + real id, row flips to pending, and Meta WhatsApp Manager shows exact body + example values"
    expected: "Real graph.facebook.com POST succeeds; row.status=pending, meta_template_id set"
    why_human: "Requires a live platform Meta WABA token with whatsapp_business_management scope against real Graph API"
  - test: "After Meta approves/rejects, confirm BOTH the message_template_status_update webhook AND Check status now (direct GET) reflect the same status; if rejected confirm the exact rejected_reason/rejection_reason field name"
    expected: "Both paths converge on the same status; rejection reason surfaced in panel Reason column"
    why_human: "~24h Meta review turnaround + live webhook + live GET; field name is LOW-confidence per research"
  - test: "From a rejected real template, Edit & Resubmit with corrected body; confirm SAME template id flips back to pending (not a new id)"
    expected: "POST /{template_id} item endpoint re-triggers review on the same meta_template_id"
    why_human: "Requires a real rejected/approved Meta template from the live submission above"
---

# Phase 179: WhatsApp Template Composer & Meta Approval Panel — Verification Report

**Phase Goal:** Super-admin composes an HSM template body in-system from ONE ordered variables array, submits REAL components to Meta, verifies approval in-panel (webhook + direct GET), edits+resubmits, and the `variables_schema` write-through makes Phase 174's `expectedVariableCount` send guard live end-to-end.
**Verified:** 2026-07-22T08:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Automated Gate Results

| Gate | Command | Result |
| ---- | ------- | ------ |
| Phase-scoped tests | `npx vitest run tests/unit/whatsapp/template-composer.test.ts meta-templates-client.test.ts + admin/{whatsapp-templates,whatsapp-template-composer,whatsapp-templates-panel} + notifications/whatsapp-registry` | ✓ 6 files, 111 tests passed |
| Full admin+whatsapp sweep | `npx vitest run tests/unit/admin/ tests/unit/whatsapp/` | ✓ 72 passed / 1 skipped, 669 passed / 14 todo |
| Type check | `npx tsc --noEmit -p tsconfig.ci.json` | ✓ exit 0 (clean) |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Admin composes body from ONE ordered params array; body placeholders, `example.body_text`, and `variables_schema` all derive from it with no independent edit path | ✓ VERIFIED | Composer state = `{bodyText, params}`; `addVariable` appends `nextVariableToken(params)`; `buildBodyComponent` derives `text` + `example.body_text` from the same `params`; submit passes `{body_text: bodyText, variables_schema: params}`. Examples only editable in param rows. Free-typed body is validation-gated. |
| 2 | Real components submitted to Meta with correct payload shape, validated before any network call | ✓ VERIFIED | `submitTemplateToMeta` validates STORED body_text (line 169) BEFORE `getWhatsAppPlatformConfig` (174) + `createMetaTemplate` (188); `buildCreatePayload` sends `parameter_format:'positional'`, `allow_category_change:false`, `components:[bodyComponent]`; `createMetaTemplate` does a real `fetch` to `/{wabaId}/message_templates` |
| 3 | Approval verified in-panel via webhook AND direct GET; full 14-event status vocabulary mapped, non-approved distinct | ✓ VERIFIED | `mapMetaEventToStatus` has 14 case labels; paused/disabled/flagged/locked pairwise-distinct + never approved; REINSTATED/UNARCHIVED→approved (lockout fix); `checkTemplateStatus`→`getMetaTemplateStatus` GET by id with dual-field `extractRejectionReason`; webhook route reuses existing `applyTemplateStatusUpdate` |
| 4 | Edit + resubmit hits the item endpoint, flips status back to pending, surfaces rejection reason | ✓ VERIFIED | `updateTemplateAndResubmit`→`updateMetaTemplate` POSTs `/{templateId}` (item endpoint, distinct from collection); on success writes `status:'pending'`, clears `rejection_reason`; panel renders `row.rejection_reason` in Reason column |
| 5 | `variables_schema` write-through makes Phase 174's `expectedVariableCount` send guard live end-to-end | ✓ VERIFIED | `variables_schema` written only at 3 sites (createTemplate default, submit success, resubmit success); `dispatch.ts:265` calls `getApprovedTemplateForEvent`→reads `variables_schema`→`expectedVariableCount`→guard `if (variables.length !== tpl.expectedVariableCount)` at line 277 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/whatsapp/template-composer.ts` | Pure client-safe validation + BODY derivation from one array | ✓ VERIFIED | 135 lines, no server imports; `validateComposerTemplate` (stray-brace + sequential + edge rules), `buildBodyComponent` (string[][] example), `nextVariableToken` sequential-by-construction |
| `lib/whatsapp/meta-templates-client.ts` | server-only Meta Graph wrapper (create/status/update/mapEvent) | ✓ VERIFIED | `import 'server-only'`; real fetch in all 3 endpoints; NEVER-throws contract; 14-event `mapMetaEventToStatus` |
| `lib/actions/admin-whatsapp-templates.ts` | Admin actions wiring composer→Meta→DB | ✓ VERIFIED | requireAdmin first in all 5 gated actions; secrets via `getWhatsAppPlatformConfig` only; 403 scope fallback preserved |
| `components/admin/whatsapp-template-composer.tsx` | Ordered-variable click-to-add UI | ✓ VERIFIED | `'use client'`; Add/Remove variable; live preview; validation-gated Submit; lazy state initializers + remount-by-key |
| `components/admin/whatsapp-templates-panel.tsx` | Panel with submit/check/edit-resubmit | ✓ VERIFIED | Composer is single create entry; per-status action gating; real data via `listTemplates()` |
| `supabase/migrations/20260722000001_...body_text.sql` | Idempotent body_text column add | ✓ VERIFIED | `ADD COLUMN IF NOT EXISTS`; prefix unused before this phase; column comments document write-discipline |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| Composer UI | `createTemplate` action | `onSubmit`→`handleCreateSubmit`→`createTemplate({body_text, variables_schema})` | ✓ WIRED | Single gated entry point |
| `submitTemplateToMeta` | Meta Graph API | `buildCreatePayload`→`createMetaTemplate` real fetch | ✓ WIRED | Payload validated first, non-empty `components` |
| `checkTemplateStatus` | Meta GET-by-id | `getMetaTemplateStatus`→`mapMetaEventToStatus`→DB persist | ✓ WIRED | Shared mapper, dual-field reason |
| `updateTemplateAndResubmit` | Meta item endpoint | `updateMetaTemplate` POST `/{templateId}` | ✓ WIRED | Same meta_template_id, status→pending |
| Webhook route | `applyTemplateStatusUpdate` | `findTemplateStatusChange`→dynamic import (unchanged) | ✓ WIRED | Route file untouched; consumes widened mapper transparently |
| `dispatch.ts` guard | `variables_schema` | `getApprovedTemplateForEvent`→`expectedVariableCount`→count guard | ✓ WIRED | Approved-only DB query; write-through now feeds real counts |
| Admin settings page | Panel | `listTemplates()` (real service-role read)→`<WhatsAppTemplatesPanel templates={...}>` | ✓ WIRED | app/admin/inbox/settings/page.tsx:45,78 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| whatsapp-templates-panel.tsx | `templates` prop | `listTemplates()` — `svc.from('whatsapp_notification_templates').select('*')` | Yes (real service-role DB read) | ✓ FLOWING |
| Meta submit payload | `components` | `buildBodyComponent(bodyText, params)` from stored row | Yes (validated non-empty, no `components:[]` stub) | ✓ FLOWING |
| dispatch guard | `expectedVariableCount` | `getApprovedTemplateForEvent`→`variables_schema.length` | Yes (real ComposerParam[] written by submit/resubmit) | ✓ FLOWING |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TMPLCOMP-01 | 179-01/04 | Ordered-array composer, single source of truth | ✓ SATISFIED | Truth 1; template-composer.ts + composer UI |
| TMPLCOMP-02 | 179-02/03 | Real Meta payload + pre-submit validation | ✓ SATISFIED | Truth 2; buildCreatePayload + submitTemplateToMeta |
| TMPLCOMP-03 | 179-02/03 | In-panel status verification, full enum | ✓ SATISFIED | Truth 3; mapMetaEventToStatus (14) + checkTemplateStatus |
| TMPLCOMP-04 | 179-02/03 | Edit + resubmit | ✓ SATISFIED | Truth 4; updateTemplateAndResubmit item endpoint |
| TMPLCOMP-05 | 179-03 | variables_schema write-through feeding 174 guard | ✓ SATISFIED | Truth 5; 3 write sites + dispatch.ts:277 guard |

### Guard-Against-Regression Checks (VALIDATION.md)

| Constraint | Status | Evidence |
| ---------- | ------ | -------- |
| `app/api/webhooks/whatsapp/route.ts` untouched | ✓ PASS | `git log 648a1d0d~1..64da6697 -- route.ts` empty |
| `lib/notifications/whatsapp-registry.ts` untouched | ✓ PASS | `git log` empty across entire phase |
| `tests/unit/notifications/whatsapp-registry.test.ts` unmodified + green | ✓ PASS | `git log` empty; ran green in phase sweep |
| 5 pre-existing whatsapp-templates.test.ts tests intact | ✓ PASS | Diff across phase = 458 insertions, 0 deletions (purely additive; no import-swap deletions needed) |
| `allow_category_change` defaults false | ✓ PASS | `input.allowCategoryChange ?? false` (line 53) |
| `variables_schema` exactly 3 write sites | ✓ PASS | Lines 122/203/325 (createTemplate default, submit success, resubmit success); 51/280 are type decls |
| Migration idempotent `ADD COLUMN IF NOT EXISTS` | ✓ PASS | Migration line 18 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| whatsapp-templates-panel.tsx | 251 | `STATUS_VARIANT[...] ?? 'outline'` — `limit_exceeded` and `deleted` (mappable by mapMetaEventToStatus) fall through to the generic `outline` variant | ℹ️ Info | Cosmetic only. The exact status STRING is always rendered as badge text (`{row.status}`), so the admin still sees the precise status; only the color variant is generic. Panel comment explicitly reserves the fallback for unmapped statuses. Not a goal blocker. |

No stubs, TODO/placeholder markers, empty-handler patterns, or `components:[]` stubs found in phase files. The former `components:[]` stub in `submitTemplateToMeta` was replaced with a real validated payload.

### Human Verification Required (non-blocking, pre-declared manual-only)

These are inherent live-Meta / deployment confirmations that cannot be automated (external service + ~24h review turnaround). The code paths are real and fully verified structurally; these confirm the live round-trip only.

1. **Apply migration to prod** — apply `20260722000001_...body_text.sql` to prod Supabase (`f2b95485` / `prmqgcrnpuvpzruyzvuv`); verify `body_text` column exists.
2. **Real Meta submission** — compose + Submit to Meta; expect 200 + real id, row→pending, exact body/example in WhatsApp Manager.
3. **Real review + dual-path sync** — after approve/reject, confirm webhook AND Check-status-now converge; confirm real `rejected_reason` field name.
4. **Real edit-and-resubmit** — from a rejected template, Edit & Resubmit; confirm SAME id flips to pending.

### Gaps Summary

No gaps. All 5 observable truths verified, all 6 artifacts pass exists/substantive/wired/data-flowing, all 7 key links wired, all 5 requirements satisfied, all 7 regression guards hold, phase-scoped + full test sweeps green, and `tsc -p tsconfig.ci.json` clean. The single Info-level note (limit_exceeded/deleted badge variant fallback) is cosmetic and by-design. The 4 human-verification items are inherent live-Meta/deployment confirmations, not code gaps.

---

_Verified: 2026-07-22T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
