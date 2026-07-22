---
phase: 173
slug: super-admin-template-editor
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-21
---

# Phase 173 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `173-01-PLAN.md` / `173-02-PLAN.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.4` + `@testing-library/react` `^16.3.2` (unit/component) + jsdom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/notifications/template-validation.test.ts tests/unit/admin/notification-templates-actions.test.ts tests/unit/admin/notification-template-editor.test.tsx` |
| **Full suite command** | `npm test` (unit) |
| **Estimated runtime** | ~8s quick; ~90s full unit |

---

## Sampling Rate

- **Per task commit:** quick command above (~8s)
- **Per wave merge:** `npx vitest run tests/unit/notifications tests/unit/admin` (~20s)
- **Phase gate:** `npm test` full unit sweep + `npx tsc --noEmit -p tsconfig.ci.json` before verification
- **Max feedback latency:** 20s per task, 30s per wave.

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| TMPL-04 | `validateTemplateVariables` rejects an unknown `{{var}}` in subject/title/body, naming it in `error`; accepts a fully-whitelisted body | unit | `npx vitest run tests/unit/notifications/template-validation.test.ts` | ✅ (173-01 Task 1/2) |
| TMPL-04 | `admin.bonus_credits_granted`'s empty catalog rejects ANY `{{var}}` reference — CREDITUI-04 guard re-pointed at the editor's save gate | unit | `npx vitest run tests/unit/notifications/copy-tenant-neutrality.test.ts` | ✅ (173-01 Task 1/2, extends existing file) |
| TMPL-02 | `listNotificationTemplates`/`saveNotificationTemplate`/`sendTestNotification` all call `requireAdmin()`; `saveNotificationTemplate` upserts `notification_templates` on `(scope,event_type,channel)` conflict with the correct nulled subject/title per channel | unit (mocked service client) | `npx vitest run tests/unit/admin/notification-templates-actions.test.ts` | ✅ (173-01 Task 1/2) |
| TMPL-04 | `saveNotificationTemplate` rejects an unknown variable WITHOUT calling `upsert` (server-side enforcement, not just client) | unit (mocked service client) | `npx vitest run tests/unit/admin/notification-templates-actions.test.ts` | ✅ (173-01 Task 1/2) |
| TMPL-05 | `sendTestNotification` routes to exactly one of Resend (email) / `sendSms` (sms) / `sendTelegramMessage` (telegram) per `target`, renders with `SAMPLE_COPY_CONTEXT` first, never throws on provider failure | unit (mocked Resend/Twilio/Telegram clients) | `npx vitest run tests/unit/admin/notification-templates-actions.test.ts` | ✅ (173-01 Task 1/2) |
| TMPL-03 | Editor renders exactly the selected event's variable catalog as chips (zero for `admin.bonus_credits_granted`) and a live preview matching real `renderTemplate()` output against the pinned `SAMPLE_COPY_CONTEXT` fixture | integration (RTL) | `npx vitest run tests/unit/admin/notification-template-editor.test.tsx` | ❌ W0 (173-02 Task 2) |
| TMPL-04 | Typing an unknown variable in the editor shows a named inline error and disables Save BEFORE any server round trip | integration (RTL) | `npx vitest run tests/unit/admin/notification-template-editor.test.tsx` | ❌ W0 (173-02 Task 2) |
| TMPL-05 | Clicking a test-send button calls `sendTestNotification` with the CURRENT in-progress (unsaved) field values, not the last-saved row | integration (RTL, mocked action) | `npx vitest run tests/unit/admin/notification-template-editor.test.tsx` | ❌ W0 (173-02 Task 2) |
| TMPL-02 | `/admin/notifications` route type-checks, is `requireAdmin`-gated first (before any service-client read), and the sidebar nav links to it | static (`tsc`) + manual | `npx tsc --noEmit -p tsconfig.ci.json` | ❌ W0 (173-02 Task 1) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/unit/notifications/template-validation.test.ts` — TMPL-04 core gate (173-01 Task 1 RED, Task 2 GREEN — done)
- [x] `tests/unit/notifications/copy-tenant-neutrality.test.ts` (extended, not replaced) — CREDITUI-04 re-pointed at the DB/editor era (173-01 Task 1 RED, Task 2 GREEN — done)
- [x] `tests/unit/admin/notification-templates-actions.test.ts` — admin-gate posture, save-validation enforcement, 3-transport test-send routing (173-01 Task 1 RED, Task 2 GREEN — done)
- [ ] `tests/unit/admin/notification-template-editor.test.tsx` — client-side chip/preview/validation/test-send wiring (173-02 Task 2, not yet executed — pending)

*Framework already installed — no `npm install` needed. All 4 files are net-new test surfaces (or, for `copy-tenant-neutrality.test.ts`, a net-new describe block appended to an existing file) written RED-first per each plan's Task 1/Task 2 TDD split.*

---

## Hidden Regressions the Plan MUST Guard Against

- **`copy-tenant-neutrality.test.ts`'s original 2 tests** (locking `buildNotificationCopy('admin.bonus_credits_granted', ...)` never rendering a digit) MUST stay byte-unmodified and green — 173-01 Task 1 ONLY appends a new `describe` block.
- **`tests/unit/admin/whatsapp-templates.test.ts`** and **`tests/unit/admin/telegram-chat-id-save.test.ts`** MUST stay green — this phase adds sibling admin actions/tests, it does not touch the WhatsApp registry or Telegram chat-id save action.
- **`tests/unit/notifications/template-resolver.test.ts` / `template-seed-completeness.test.ts` / `dispatch.test.ts`** (Phase 172) MUST stay green — this phase reads `template-seed.ts`/`event-types.ts`/`template-engine.ts` but does not modify them, and does not touch `dispatch.ts`/`template-resolver.ts`.
- **`lib/notifications/sample-context.ts` and `lib/notifications/template-catalog.ts` must carry NO `'server-only'` import** — a regression here silently breaks the client-side live preview (it would fail at build/bundle time, not at runtime, so the `tsc`/grep check in 173-01's own verification is the guard, not a UI test).
- **`app/admin/inbox/settings/page.tsx`'s Templates tab (WhatsApp registry panel)** must remain fully functional and byte-unmodified — the human-verify checkpoint (173-02 Task 3) explicitly re-checks this.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full browse → edit → preview → save → test-send flow against a real admin session | TMPL-02/03/04/05 | Requires a signed-in platform admin + live Supabase + (optionally) live Resend/Twilio/Telegram credentials | See 173-02 Task 3's `<how-to-verify>` steps 1-8 |
| Test-send delivers a real email/SMS/Telegram message end to end | TMPL-05 | Requires live provider credentials in `platform_integrations`; automated tests only prove the routing/render logic against mocks | Configure at least one provider in `/admin/integrations`, click its test-send button, confirm receipt on the actual device/inbox |
| Glassmorphism visual consistency with the Phase-71 design system | (UI hint) | Automated tests don't assert on visual styling | Visual scan of `/admin/notifications` against `/admin/inbox/settings` for consistent `Card variant="glass"` / spacing / typography |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (173-02 Task 3 is a checkpoint, preceded by 2 automated tasks; 173-01's 2 tasks are both automated)
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency <20s per task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — awaiting execution.
