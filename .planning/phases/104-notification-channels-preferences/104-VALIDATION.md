---
phase: 104
slug: notification-channels-preferences
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-21
---

# Phase 104 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 (jsdom, globals; setup: inngest-mocks, load-env, seed-admin) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/notifications` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15s (notifications dir), ~3 min (full) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/notifications` (+ the new dir touched)
- **After every plan wave:** `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite green
- **Max feedback latency:** ~15s

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|-----------|-------------------|-------------|--------|
| W0 | 0 | all | unit | `npx vitest run tests/unit/notifications tests/unit/sms tests/unit/admin/whatsapp-templates.test.ts` | ❌ W0 | ⬜ |
| event-map | 1 | NOTIF-01 | unit | `npx vitest run tests/unit/notifications/event-types.test.ts` | ❌ W0 | ⬜ |
| migration | 1 | NOTIF-06 | unit | `npx vitest run tests/unit/notifications/category-migration.test.ts` | ❌ W0 | ⬜ |
| resolve-channels | 1 | NOTIF-02/07 | unit | `npx vitest run tests/unit/notifications/preferences.test.ts` | ✅ extend | ⬜ |
| prefs-form | 1 | NOTIF-01/02 | unit (RTL) | `npx vitest run tests/unit/notifications/preferences-form.test.tsx` | ✅ extend | ⬜ |
| owner-phone | 2 | NOTIF-05 | unit | `npx vitest run tests/unit/notifications/owner-phone.test.ts` | ❌ W0 | ⬜ |
| whatsapp-channel | 2 | NOTIF-03 | unit | `npx vitest run tests/unit/notifications/whatsapp-channel.test.ts` | ❌ W0 | ⬜ |
| sms-client | 2 | NOTIF-04 | unit | `npx vitest run tests/unit/sms/client.test.ts` | ❌ W0 | ⬜ |
| dispatch-4ch | 2 | NOTIF-07 | unit | `npx vitest run tests/unit/notifications/dispatch.test.ts` | ✅ extend | ⬜ |
| template-panel | 3 | 104.3 | unit | `npx vitest run tests/unit/admin/whatsapp-templates.test.ts` | ❌ W0 | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/notifications/event-types.test.ts` — NOTIF-01: `EVENT_CATEGORIES` maps every event to estimate/billing/system (or `_dropped`); no whatsapp/ai_job category
- [ ] `tests/unit/notifications/category-migration.test.ts` — NOTIF-06: extract the JSONB remap into a pure TS fn (payment/trial/quota/admin→billing OR-merge; drop whatsapp/ai_job) that the SQL migration mirrors — unit-test the fn
- [ ] `tests/unit/notifications/whatsapp-channel.test.ts` — NOTIF-03: dispatch WhatsApp branch (opt-in off / no phone / no template → no-op; enabled → `sendWhatsAppTemplate` with registry vars; never-throw)
- [ ] `tests/unit/sms/client.test.ts` — NOTIF-04: `sendSms` payload (From/To/Body, Basic auth), opt-in gate, never-throw
- [ ] `tests/unit/notifications/owner-phone.test.ts` — NOTIF-05: per-user owner_phone resolver + null gate
- [ ] `tests/unit/admin/whatsapp-templates.test.ts` — 104.3: template panel CRUD + `message_template_status_update` webhook; service-role-only RLS
- [ ] EXTEND `dispatch.test.ts` (4-channel routing + a throwing WhatsApp/SMS send does NOT block the in-app insert), `preferences.test.ts` (4 channels + whatsapp/sms gated by opt-in+phone), `preferences-form.test.tsx` (3 categories × 4 channels; whatsapp/sms disabled without a phone)
- Framework install: none — vitest + RTL present.

---

## Manual-Only Verifications (operational — require live creds/approval)

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Live SMS delivery via Twilio | NOTIF-04 | Needs live Twilio creds + a real phone + costs money | In staging with Twilio configured, opt-in SMS, trigger a billing event, confirm the SMS arrives |
| Live proactive WhatsApp via approved template | NOTIF-03 | Needs a Meta-approved template + live WABA | Approve a template in the admin panel (or Meta), opt-in WhatsApp, trigger an event, confirm the WhatsApp message arrives |
| Meta template approval round-trip | 104.3 | Meta-side approval is async + external | Submit a template from the admin panel, confirm the `message_template_status_update` webhook flips its status |
| Preferences migration on prod data | NOTIF-06 | Real existing rows | After migration, spot-check a user's prefs: payment/trial/quota/admin folded into billing, whatsapp/ai_job gone, new channels default sane |

*All deterministic logic (mapping, migration fn, dispatch routing, sender payloads, gating, panel CRUD) is automated above.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (notifications dir)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
