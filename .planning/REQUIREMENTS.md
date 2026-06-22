# Requirements: v4.6 Notification Channels & Preferences

**Goal:** Restructure the owner notification preferences into a clean 3-category × 4-channel matrix, and make WhatsApp + SMS real delivery channels (not just In-App + Email).

**Started:** 2026-06-21
**Status:** Defining requirements

## Why this milestone (the gap)

The notification preferences page (`components/settings/notifications-form.tsx`) currently exposes 8 categories (Estimates, Payments, Trial, Quota, WhatsApp, AI Jobs, Admin, System) across only 2 delivery channels (In-App, Email). Two problems: (1) the category list is noisy and conceptually muddled — "WhatsApp" is listed as a *category* when it is really a *delivery channel*, and Payments/Trial/Quota/Admin are all the same concern (billing/plan); (2) owners can only be notified in-app or by email, with no WhatsApp or SMS delivery. This milestone fixes both: a tidy 3-category model and 4 working delivery channels.

**Source:** product discussion 2026-06-21 (this session).

---

## v1 Requirements (this milestone)

### NOTIF — Notification Channels & Preferences

- [x] **NOTIF-01**: The notification preferences page presents exactly 3 event categories — **Estimates**, **Billing** (merging today's Payments + Trial + Quota + Admin), and **System**. The standalone "WhatsApp" and "AI Jobs" categories are removed.
- [x] **NOTIF-02**: Notification delivery supports 4 channels — **In-App**, **Email**, **WhatsApp**, **SMS** — each independently toggleable per category (a category × channel matrix), gated by the existing email master switch where applicable.
- [ ] **NOTIF-03**: A WhatsApp notification sender delivers owner notifications via the existing WhatsApp client (using an approved template for proactive/out-of-24h-session messages).
- [ ] **NOTIF-04**: An SMS notification sender delivers owner notifications via Twilio (origin number + per-message send).
- [ ] **NOTIF-05**: The owner's phone number used for WhatsApp/SMS is collected and validated, with explicit per-channel opt-in/consent before any message is sent.
- [x] **NOTIF-06**: Existing per-user preferences and the event→category mapping are migrated to the new model (payment/trial/quota/admin → billing; events in the removed whatsapp/ai_job categories are handled per a documented decision — re-routed or dropped).
- [ ] **NOTIF-07**: Notification dispatch routes each event to its (new) category and delivers ONLY via the channels the owner enabled for that category, never throwing if a channel is unconfigured (best-effort per channel).

---

## Future Requirements (deferred)

- **NOTIF-08** (deferred): Quiet hours / per-channel send windows.
- **NOTIF-09** (deferred): Localized SMS/WhatsApp templates beyond the owner's app language.

## Out of Scope (explicit exclusions)

- **Customer-facing WhatsApp template notifications** (sending estimate updates to the END CLIENT) — that is the separate queued v4.4 Phase 98 work; this milestone is about the OWNER's own notification preferences.
- **Push (web/mobile) channel** — not in this milestone (the Phase 77 push scaffold stays dormant).
- **A full notifications redesign** — this restructures categories + adds channels; it does not redesign the notification feed/inbox.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(filled by roadmap)_ | | |
