---
phase: 173-super-admin-template-editor
plan: 01
subsystem: notifications
tags: [validation, server-actions, resend, twilio-sms, telegram, admin-panel, e164]

# Dependency graph
requires:
  - phase: 172-notification-templates-db
    provides: notification_templates table (UNIQUE scope,event_type,channel), EVENT_TEMPLATE_SEED canonical catalog, template-engine.ts (renderTemplate/extractVariables), template-resolver.ts (TemplateScope/TemplateChannel types)
provides:
  - "SAMPLE_COPY_CONTEXT: exhaustive Record<EventType, CopyContext> fixture for live preview + test-send"
  - "TENANT_TEMPLATE_CATALOG / EDITABLE_CHANNELS / getEventVariableCatalog: client-safe event/variable catalog"
  - "validateTemplateVariables: the one save/preview gate enforcing TMPL-04's unknown-variable rejection + CREDITUI-04's empty-catalog guard + malformed-token hardening"
  - "listNotificationTemplates / saveNotificationTemplate / sendTestNotification: requireAdmin-gated server actions mirroring admin-whatsapp-templates.ts's CRUD shape"
affects: [173-02-super-admin-template-editor-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "validateTemplateVariables gate: strict extractVariables() token diff + a separate any-brace regex pass that flags residual {{...}} sequences extractVariables can't parse (malformed tokens rejected, not silently pass-through)"
    - "requireAdmin() as literal first line of every exported server action, before any service-client or transport touch"
    - "server-action test-send never persists — renders in-memory against SAMPLE_COPY_CONTEXT and dispatches directly, independent of resolveNotificationCopy's DB read path"

key-files:
  created:
    - lib/notifications/sample-context.ts
    - lib/notifications/template-catalog.ts
    - lib/notifications/template-validation.ts
    - lib/actions/admin-notification-templates.ts
    - tests/unit/notifications/template-validation.test.ts
    - tests/unit/admin/notification-templates-actions.test.ts
  modified:
    - lib/admin/audit-log.ts
    - tests/unit/notifications/copy-tenant-neutrality.test.ts
    - .planning/phases/173-super-admin-template-editor/173-VALIDATION.md

key-decisions:
  - "validateTemplateVariables adds a second, broader {{...}}-pair regex (ANY_BRACE_PATTERN) alongside extractVariables()'s strict \\w+ pattern, so a malformed token like {{client.name}} or {{client-name}} — which extractVariables silently skips because the render engine treats it as inert literal text — is still rejected at save/test-send time instead of shipping to a tenant verbatim (plan-checker INFO-1 hardening)."
  - "sendTestNotification's sms branch E.164-validates the admin-typed toPhone (same /^\\+[1-9]\\d{7,14}$/ pattern already used in send-sms/route.ts, send-whatsapp/route.ts, and admin/integrations/actions.ts) before ever calling sendSms (plan-checker WARNING-1 hardening). The recipient is admin-supplied by design — this is a platform-admin trust-tier test-send to the operator's own phone, not the tenant/customer messaging service, so no additional consent/rate-limit gate was added."
  - "Empty-after-render body check happens in sendTestNotification after validation but before any transport dispatch — proven with a whitespace-only body against a real (non-mocked) SAMPLE_COPY_CONTEXT fixture rather than mocking the fixture module, keeping the test simpler while covering the same code path."
  - "173-VALIDATION.md's Wave-0 frontmatter (wave_0_complete) and checkbox list were fixed to reflect that these test files are authored DURING the phase, not pre-existing: wave_0_complete flipped true->false (173-02's editor RTL test file still doesn't exist), and the 3 files this plan produced are checked off as done while the 4th (173-02 Task 2) is marked pending."

patterns-established:
  - "Pattern: any future free-text {{var}} validator in this codebase should follow the two-pass approach here (strict-token diff + any-brace residual-literal check) rather than trusting the render engine's pass-through-on-no-match behavior as implicitly safe."

requirements-completed: [TMPL-02, TMPL-04, TMPL-05]

# Metrics
duration: 35min
completed: 2026-07-21
---

# Phase 173 Plan 01: Template Validation + Admin Server-Action Layer Summary

**`validateTemplateVariables` (extractVariables-diff + malformed-brace hardening) gates `saveNotificationTemplate`'s upsert and `sendTestNotification`'s 3-transport (Resend/Twilio SMS/Telegram) dispatch, both `requireAdmin`-gated server actions mirroring `admin-whatsapp-templates.ts`.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 (TDD RED -> GREEN)
- **Files created:** 6 (4 lib, 2 test)
- **Files modified:** 2 (audit-log.ts AuditAction union, copy-tenant-neutrality.test.ts append)

## Accomplishments
- Built the client-safe `SAMPLE_COPY_CONTEXT` fixture (all 17 `EventType` keys, `tsc`-exhaustive) and `TENANT_TEMPLATE_CATALOG`/`getEventVariableCatalog`, both importable directly from plan 173-02's client components (no `'server-only'` marker, grep-verified).
- Built `validateTemplateVariables`, the single gate TMPL-04 depends on: rejects any `{{var}}` outside the event's `EVENT_TEMPLATE_SEED` whitelist, names every unknown variable, and structurally re-derives the CREDITUI-04 guard (`admin.bonus_credits_granted`'s empty catalog rejects ANY reference, no special-casing).
- Added plan-checker INFO-1 hardening: a second, broader `{{...}}`-pair regex catches malformed tokens (`{{client.name}}`, `{{client-name}}`) that `extractVariables()`'s strict `\w+` pattern can't parse and would otherwise silently pass through to a tenant as literal braces.
- Built the three `requireAdmin`-gated server actions (`listNotificationTemplates`, `saveNotificationTemplate`, `sendTestNotification`) mirroring `admin-whatsapp-templates.ts`'s shape. `saveNotificationTemplate` validates BEFORE touching the service client (proven: mocked `upsert` never called on an unknown variable) and upserts on `(scope,event_type,channel)` with `variables` always sourced from `EVENT_TEMPLATE_SEED` (never client input).
- Added plan-checker WARNING-1 hardening: `sendTestNotification`'s sms branch E.164-validates the admin-typed phone before calling `sendSms`.
- Fixed `173-VALIDATION.md`'s Wave-0 frontmatter/checkboxes to reflect actual authoring state (see key-decisions).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing tests for validation + server actions** - `bdbba7da` (test)
2. **Task 2 (GREEN): catalog, validation gate, admin server actions** - `442bfc6e` (feat)

_TDD plan: RED then GREEN, no separate REFACTOR commit needed — GREEN implementation required no cleanup pass._

## Files Created/Modified
- `lib/notifications/sample-context.ts` - `SAMPLE_COPY_CONTEXT: Record<EventType, CopyContext>`, the 17 locked fixture values from the plan's `<interfaces>` table
- `lib/notifications/template-catalog.ts` - `TENANT_TEMPLATE_CATALOG`, `EDITABLE_CHANNELS`, `getEventVariableCatalog`, derived from `EVENT_TEMPLATE_SEED` + `EVENT_CATEGORIES`
- `lib/notifications/template-validation.ts` - `validateTemplateVariables`: strict-token diff (via `extractVariables`) + any-brace malformed-token check (INFO-1)
- `lib/actions/admin-notification-templates.ts` - `listNotificationTemplates`/`saveNotificationTemplate`/`sendTestNotification`, `'use server'`
- `lib/admin/audit-log.ts` - added `notification_template.save` / `notification_template.test_send` to `AuditAction`
- `tests/unit/notifications/template-validation.test.ts` - 11 cases covering TMPL-04, CREDITUI-04, and INFO-1
- `tests/unit/admin/notification-templates-actions.test.ts` - 15 cases covering the admin-gate/validation-gate/3-transport contracts + WARNING-1
- `tests/unit/notifications/copy-tenant-neutrality.test.ts` - appended `admin.bonus_credits_granted template-editor guard` describe block (2 new tests), pre-existing 2 tests byte-unmodified
- `.planning/phases/173-super-admin-template-editor/173-VALIDATION.md` - Wave-0 frontmatter/checkbox correction (INFO-2)

## Decisions Made
See `key-decisions` in frontmatter — malformed-token hardening (INFO-1), E.164 sms-recipient hardening (WARNING-1), empty-render-body test approach, and the 173-VALIDATION.md Wave-0 fix (INFO-2).

## Validation error-message format

```
Unknown variable{s} {{name1}}, {{name2}} — not in the <eventType> catalog (<catalogVar1>, <catalogVar2>).
```

For an empty catalog (e.g. `admin.bonus_credits_granted`):

```
Unknown variable{s} {{credits}} — this event has no editable variables.
```

## Upsert payload shape (exact, matches `<interfaces>`)

```ts
await svc.from('notification_templates').upsert(
  {
    scope: input.scope,
    event_type: input.eventType,
    channel: input.channel,
    subject: input.channel === 'email' ? (input.subject ?? null) : null,
    title: input.channel === 'in_app' ? (input.title ?? null) : null,
    body: input.body,
    variables: EVENT_TEMPLATE_SEED[input.eventType].variables,
    is_active: input.isActive,
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'scope,event_type,channel' },
).select().single()
```

## Test-send 3-transport routing table

| `target` | Recipient | Mode | Transport | Never-throw handling |
|---|---|---|---|---|
| `email` | `admin.email` | `html` | `getIntegrationKey('resend')` -> `await import('resend')` -> `resend.emails.send`, subject `[TEST] <label>` | unconfigured key -> `{ok:false}`; send exception caught |
| `sms` | admin-typed `input.toPhone`, **E.164-validated** (`/^\+[1-9]\d{7,14}$/`) before dispatch | `text` | `sendSms(toPhone, renderedBody)` (already never-throw) | missing/malformed phone -> `{ok:false}` before any call; provider `{ok:false,error}` propagated as `{ok:false,message}` |
| `telegram` | platform ops chat_id (configured, not admin-supplied) | `html` | `sendTelegramMessage(renderedBody)` (THROWS on failure) | wrapped in try/catch, mirrors `sendTelegramTestAlert` |

Recipient note: the sms/email test-send targets are **admin-supplied by design** — this is a platform-admin trust-tier utility (the operator testing against their own inbox/phone/shared ops number), not the tenant-facing messaging service, so E.164 format validation is the only guard needed (no consent/rate-limit gate, unlike tenant-facing sms).

## Confirmation for plan 173-02

`TENANT_TEMPLATE_CATALOG`, `SAMPLE_COPY_CONTEXT`, and `validateTemplateVariables` are all importable directly into client components — none of `sample-context.ts`, `template-catalog.ts`, or `template-validation.ts` carry a server-guard import (grep-verified: `grep -L "server-only" lib/notifications/sample-context.ts lib/notifications/template-catalog.ts lib/notifications/template-validation.ts` lists all three). `lib/actions/admin-notification-templates.ts`'s three exports (`listNotificationTemplates`, `saveNotificationTemplate`, `sendTestNotification`) are ready to be called from 173-02's editor component via standard Next.js server-action wiring.

## Deviations from Plan

### Auto-fixed Issues

**1. [Orchestrator-directed hardening - INFO-1] Malformed-token rejection in `validateTemplateVariables`**
- **Found during:** Task 1/2 (plan-checker addition, not a bug found mid-execution — added per explicit instruction extending the plan)
- **Issue:** `extractVariables()`'s strict `\w+`-only regex silently skips a malformed token like `{{client.name}}` or `{{client-name}}` (by design, per `template-engine.ts`'s no-code-execution pass-through contract) — without an additional check, such a token would save successfully and render literally to a tenant.
- **Fix:** Added a second, broader `{{...}}`-pair regex (`ANY_BRACE_PATTERN`) in `template-validation.ts` that flags any residual brace pair whose inner content isn't a clean, catalog-known `\w+` token.
- **Files modified:** `lib/notifications/template-validation.ts`, `tests/unit/notifications/template-validation.test.ts`
- **Verification:** 2 new test cases (`{{client.name}}`, `{{client-name}}`) both assert `valid: false`.
- **Committed in:** `442bfc6e` (Task 2 commit, tests in `bdbba7da`)

**2. [Orchestrator-directed hardening - WARNING-1] E.164 validation for the sms test-send recipient**
- **Found during:** Task 2 (plan-checker addition)
- **Issue:** `sendTestNotification`'s sms branch would otherwise pass an arbitrary admin-typed string straight to `sendSms`/Twilio.
- **Fix:** Added the repo's standard `/^\+[1-9]\d{7,14}$/` E.164 check before calling `sendSms`, returning `{ok:false, message}` on a malformed number without any transport call.
- **Files modified:** `lib/actions/admin-notification-templates.ts`, `tests/unit/admin/notification-templates-actions.test.ts`
- **Verification:** test asserts `sendSms` never called for `toPhone: 'not-a-phone'`.
- **Committed in:** `442bfc6e` (Task 2 commit, tests in `bdbba7da`)

**3. [Orchestrator-directed doc fix - INFO-2] 173-VALIDATION.md Wave-0 frontmatter/checkboxes**
- **Found during:** post-implementation docs pass
- **Issue:** `wave_0_complete: true` and all four `[x]` Wave-0 checkboxes were set before any of the four test files existed — inaccurate at execution start.
- **Fix:** Set `wave_0_complete: false` (173-02's `notification-template-editor.test.tsx` still doesn't exist), checked off the 3 files this plan produced as done, left the 4th `[ ]` pending, and updated the corresponding "File Exists" column entries in the Per-Task Verification Map from `❌ W0` to `✅`.
- **Files modified:** `.planning/phases/173-super-admin-template-editor/173-VALIDATION.md`
- **Committed in:** (this plan's final docs commit)

---

**Total deviations:** 3 (all orchestrator-directed additions to the plan, not bugs found mid-execution)
**Impact on plan:** All three extend the plan's own stated guarantees (TMPL-04's "never saveable" claim, test-send safety, and validation-doc accuracy) with no scope creep beyond what was explicitly requested.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. `sendTestNotification`'s Resend/Twilio/Telegram transports read existing `platform_integrations` config (already covered by prior phases); this plan adds no new secret/env requirement.

## Next Phase Readiness
Plan 173-02 (the editor UI, wave 2) can now import `TENANT_TEMPLATE_CATALOG`, `SAMPLE_COPY_CONTEXT`, and `validateTemplateVariables` directly into client components for chip rendering, live preview, and inline unknown-variable errors, and can call `listNotificationTemplates`/`saveNotificationTemplate`/`sendTestNotification` as server actions. No blockers.

---
*Phase: 173-super-admin-template-editor*
*Completed: 2026-07-21*

## Self-Check: PASSED

All created files found on disk (sample-context.ts, template-catalog.ts, template-validation.ts, admin-notification-templates.ts, both new test files, 173-01-SUMMARY.md, 173-VALIDATION.md). Both task commits (`bdbba7da`, `442bfc6e`) found in git history.
