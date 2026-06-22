# Phase 104: Notification Channels & Preferences Revamp - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Mode:** Discuss (interactive — product decisions resolved with the user this session)

<domain>
## Phase Boundary

Revamp the OWNER notification preferences: collapse today's noisy 8-category × 2-channel matrix into a tidy **3-category × 4-channel** model, and make **WhatsApp + SMS real delivery channels** (alongside In-App + Email). Adds a **super-admin panel to create/manage WhatsApp notification templates** (required for proactive WhatsApp sends). Scope = NOTIF-01..07.

This is OWNER-facing notification delivery — distinct from the queued v4.4 Phase 98 "WhatsApp Notifications" (which is about CUSTOMER-facing estimate updates). The planner/researcher MUST reconcile any overlap with Phase 98's template work to avoid duplication.

**Requirements:** NOTIF-01 (3 categories), NOTIF-02 (4 channels matrix), NOTIF-03 (WhatsApp sender), NOTIF-04 (SMS sender via Twilio), NOTIF-05 (phone + opt-in), NOTIF-06 (migration + remap), NOTIF-07 (dispatch routing).
</domain>

<decisions>
## Implementation Decisions (locked with the user 2026-06-21)

### Categories (rows) — NOTIF-01
- Final set is exactly **3**: **Estimates**, **Billing**, **System**.
- **Billing = MERGE of today's Payments + Trial + Quota + Admin** (all plan/money concerns under one category).
- **Remove** the standalone **WhatsApp** category (it is a channel, not an event category) and the **AI Jobs** category.
- `EventCategory` type (`lib/`) reduces to `estimate | billing | system`. The notification dispatch's event→category mapping is updated accordingly (payment/trial/quota/admin events → `billing`).

### Channels (columns) — NOTIF-02
- Final set is **4**: **In-App**, **Email**, **WhatsApp**, **SMS** — each independently toggleable per category (category × channel matrix). The existing "Email digest enabled" master switch still gates email.
- Per-channel preference storage must be extended from `{in_app, email}` to `{in_app, email, whatsapp, sms}` (schema migration).

### Phone number — NOTIF-05
- **Reuse the existing per-user `owner_phone`** (already collected + OTP-verified via the WhatsApp work — `lib/whatsapp/sync-owner-phone.ts`, migration `20260620000001_company_whatsapp_multi_user.sql`, Phase 50 OTP). The SAME verified number serves BOTH WhatsApp and SMS. No separate SMS number, no new profile field.
- Enabling the WhatsApp or SMS channel requires that verified number to exist + an explicit **per-channel opt-in/consent** before any send (SMS especially — cost + consent). If no verified number, the WhatsApp/SMS toggles are disabled with a "verify your phone" affordance.

### WhatsApp sender — NOTIF-03
- Send owner notifications via the existing WhatsApp client. Proactive (out-of-24h-session) messages require an **approved Meta template**.
- **Templates are created/managed in a NEW super-admin panel** (the user explicitly wants this). Scope therefore INCLUDES building an admin WhatsApp-template management UI (create, list, submit/track approval status, map template → notification category). The planner must check whether any template infra already exists (Phase 98 / `lib/whatsapp/`) before building from scratch.

### SMS sender — NOTIF-04
- **Full implementation now** via **Twilio** (origin number + per-message send), using the verified `owner_phone`.
- Gated by explicit **opt-in/consent** + cost acceptance. SMS is a paid channel — the opt-in copy must make that clear.

### Removed-category events — NOTIF-06
- **Drop both for tenants.** AI-job failure/completion notices and inbound-WhatsApp-message notices are **removed entirely from the tenant notification experience** (no category, no toggle, no delivery). (WhatsApp for tenants is becoming super-admin-only anyway; AI-job notices are dropped per the user's decision.)
- Migration: existing per-user preference rows for `payment/trial/quota/admin` collapse into `billing`; rows for `whatsapp/ai_job` are dropped. Pending/feed events in dropped categories are handled gracefully (no orphan UI).

### Dispatch — NOTIF-07
- Route each emitted event to its NEW category, then deliver via ONLY the channels the owner enabled for that category. Each channel send is **best-effort / never-throw** (an unconfigured or failing channel must not sink the others or the event), consistent with the Phase 92 observability rule.

### Scope / structuring note
- This grew during discuss (the super-admin template panel + two new senders + schema migration + UI). It is large for one phase. The planner SHOULD organize it into multiple plans/waves, and MAY recommend splitting into decimal sub-phases (e.g. 104.1 schema+category+UI, 104.2 WhatsApp+SMS senders+phone/opt-in, 104.3 super-admin template panel) if a single phase is too big. Surface that recommendation rather than forcing one mega-phase.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/settings/notifications-form.tsx` — the category × channel matrix UI + `CATEGORIES` array (to reduce to 3) + the in_app/email columns (to extend to 4).
- `components/notifications/category-icon.tsx`, `NotificationFilters.tsx` — category icons/filters (update for the new 3-category set).
- The Phase-77 notification system: schema (`notifications` table + preferences), dispatch, in-app + email senders. Search `lib/notifications`, `lib/actions/settings.ts` (updateNotifications), Phase 77 plans (`.planning/phases/77-notifications-system/`).
- `lib/whatsapp/` — WhatsApp client (sending), `sync-owner-phone.ts`, OTP verification (Phase 50). Reuse for the WhatsApp sender + the verified phone.
- `lib/admin/integrations-providers.ts` — has `email`, `whatsapp`, `sms` (Twilio) provider slugs; the SMS/Twilio integration entry point.
- Twilio MCP / integration — the SMS send path.
- `app/admin/` + `components/admin/admin-nav.tsx` — where the new WhatsApp-template panel lives (add a nav entry + route).
- Migration pattern: `supabase/migrations/` (the preferences schema change + the data migration).

### Established Patterns
- Best-effort, never-throw notification dispatch (Phase 77/92).
- OTP phone verification (Phase 50).
- Super-admin nav + route pattern (`admin-nav.tsx`, `app/admin/*`).
- Per-channel preference storage (extend the existing in_app/email model).

### Integration Points
- Preferences UI (`notifications-form.tsx`) + its server action (`updateNotifications`).
- Notification dispatch (event → category → channel senders).
- New senders: WhatsApp (client + template), SMS (Twilio).
- New super-admin route: WhatsApp template management.
- Schema: preferences channel columns + category remap migration.
</code_context>

<specifics>
## Specific Ideas

- One verified phone (`owner_phone`) drives BOTH WhatsApp + SMS — minimize friction, no second number.
- The super-admin template panel is a first-class deliverable, not an afterthought — proactive WhatsApp depends on it.
- SMS opt-in copy must state it is a paid channel.
- Reconcile with v4.4 Phase 98 (WhatsApp Notifications) so the template infra isn't built twice.
</specifics>

<deferred>
## Deferred Ideas

- Quiet hours / per-channel send windows (NOTIF-08).
- Localized SMS/WhatsApp templates beyond the owner's app language (NOTIF-09).
- Push (web/mobile) channel — the Phase-77 push scaffold stays dormant.
- Customer-facing WhatsApp template notifications — that is v4.4 Phase 98, out of scope here.
</deferred>
