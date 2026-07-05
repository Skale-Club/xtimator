# Requirements: Xtimator — Milestone v4.16 Admin Inbox Consolidation

**Defined:** 2026-07-05
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Consolidate the three scattered super-admin WhatsApp surfaces into a single coherent **Inbox** — one nav item, a two-pane master-detail conversation viewer (Xphere-style, on the same page, replacing the drawer overlay), and an Inbox "Settings" area folding in Accounts + Templates. Read-only; credentials stay in Integrations. Design reference: the Xphere inbox at `C:\Users\Vanildo\Dev\xphere` (same stack).

> **Locked decisions (non-negotiable):**
> - **Read-only.** The Inbox is a super-admin inspection tool — visualize conversations, never reply/send. Keeps the deliberate read-only posture from the v4.13 WAADM work (the current admin page already renders "Read-only. Shows up to the last 30 days of messages.").
> - **Inbox = operations, Integrations = credentials.** Conversations + Accounts (provisioning) + Templates live under the Inbox surface. The raw Meta credentials (API token + Phone Number ID + WABA ID + Display Number + AI system prompt) STAY in `/admin/integrations/whatsapp`, alongside the other integration secrets (Stripe/Twilio). Do NOT move credentials into the Inbox.
> - **Two-pane master-detail, not a modal drawer.** The conversation thread renders in a persistent right pane on the same page as the list — replacing the current right-side `Sheet` overlay. Mirrors the Xphere inbox layout.
> - **User-facing rename only; internal naming stays.** The slug + nav label + page copy become "Inbox" (`/admin/whatsapp` → `/admin/inbox`, per the owner's "altere tudo, inclusive o slug"). But the data layer (`lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp*.ts`) and DB tables (`whatsapp_*`) keep their WhatsApp names — the data is channel-specific; "Inbox" is the forward-looking multi-channel container. This keeps the blast radius contained.
> - **Reuse, do not rebuild.** Reuse `listAdminWhatsAppConversations`/`parseAdminWhatsAppFilters` (list + filters + pagination), `loadAdminConversationThread` (thread + 30-day history + signed media), `MessageBubble` (thread rendering), `AdminWhatsAppAccounts` (provisioning), `WhatsAppTemplatesPanel` (templates). The refactor is UI/routing, not a data-layer rewrite.
> - **Tests ship in the same change.** Renaming `/admin/whatsapp` breaks path/existence assertions in several test files (unit + e2e) — those updates are part of the milestone, not follow-up.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Inbox Route Consolidation & Settings

- [x] **INBOX-01**: The super-admin left-nav shows a single **Inbox** item (`/admin/inbox`) in place of the two separate "WhatsApp" and "WA Templates" items. The old routes `/admin/whatsapp` and `/admin/whatsapp-templates` redirect to `/admin/inbox` and `/admin/inbox/settings` respectively (no broken bookmarks). Every hardcoded `/admin/whatsapp` / `/admin/whatsapp-templates` reference (nav, pagination URLs, filter `router.replace`, `revalidatePath`) is retargeted.
- [x] **INBOX-03**: A gear/"Settings" affordance in the Inbox header opens `/admin/inbox/settings`, a tabbed page with **Accounts** (the existing company-config + authorized-sender provisioning UI) and **Templates** (the existing Meta-template builder), reusing the current components unchanged. A back affordance returns to the Inbox. `revalidatePath` for account mutations targets the new settings route.
- [x] **INBOX-04**: Integrations > WhatsApp (credentials) is unchanged; the data layer file names and DB tables stay `whatsapp_*`; and all affected test files (unit path/existence assertions + the e2e admin-whatsapp spec) are updated to the new `/admin/inbox` routes and pass green.

### Inbox Master-Detail Viewer

- [ ] **INBOX-02**: `/admin/inbox` presents a two-pane master-detail conversation viewer — a scrollable conversation list on the left (Xphere-style rows: contact name, last-message preview, timestamp, unread indicator, hover + selected states; company as a secondary label) with the existing search/filters and server-side pagination, and the conversation thread on the right pane on the same page (reusing `loadAdminConversationThread` + `MessageBubble`, read-only, with the 30-day note). Selecting a conversation updates `?conversation=<id>` (shallow) and loads its thread without a modal overlay; a direct link / refresh SSR-selects that thread; an empty-state prompts to pick a conversation. Mobile collapses to a single column (list ↔ thread with a back affordance).

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

- **INBOXX-01**: Two-way replies from the super-admin Inbox (send messages via the Meta API), with consent/compliance + audit trail.
- **INBOXX-02**: Multi-channel Inbox (Instagram/SMS/etc. joining the same container, like Xphere), including a third contact-info panel.
- **INBOXX-03**: Realtime updates (Supabase Realtime subscriptions for new messages/conversations, as Xphere does).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reply/send from the Inbox | Locked read-only decision; deferred to INBOXX-01 |
| Moving credentials out of Integrations | Locked — Integrations remains the credentials home |
| Renaming the data layer / DB tables to `inbox_*` | Data is channel-specific WhatsApp; only user-facing surface renames |
| Third contact-info panel / realtime / multi-channel | Xphere-parity extras deferred to INBOXX-02/03 |
| Touching tenant WhatsApp surfaces (tombstone, notification channel) | Out of scope — admin-only consolidation |

## Traceability

Every v1 requirement maps to exactly one phase. Coverage: 4/4 mapped, 0 orphans, 0 duplicates. Phase numbering continues the global counter (v4.15 ended at Phase 153 → this milestone starts at Phase 154).

| Requirement | Phase | Status |
|-------------|-------|--------|
| INBOX-01 | Phase 154 — Inbox Route Consolidation & Settings | Complete |
| INBOX-03 | Phase 154 — Inbox Route Consolidation & Settings | Complete |
| INBOX-04 | Phase 154 — Inbox Route Consolidation & Settings | Complete |
| INBOX-02 | Phase 155 — Inbox Master-Detail Viewer | Pending |

**Phase → requirement rollup:**
- **Phase 154 — Inbox Route Consolidation & Settings**: INBOX-01, INBOX-03, INBOX-04
- **Phase 155 — Inbox Master-Detail Viewer**: INBOX-02 (depends on Phase 154)

---
*Requirements defined: 2026-07-05 — milestone v4.16 Admin Inbox Consolidation. Phase numbering continues the global counter — v4.15 ended at Phase 153, so this milestone starts at Phase 154.*
