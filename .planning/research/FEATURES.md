# Feature Research

**Domain:** Notification Center — three-audience outbound messaging (platform-admin Telegram alerts, super-admin DB-driven template editor, end-customer email/SMS) for a B2B2C service-business SaaS
**Researched:** 2026-07-21
**Confidence:** MEDIUM-HIGH — grounded in the existing Xtimator codebase (HIGH) + WebSearch findings cross-referenced against official docs (Postmark, Customer.io, Resend, Twilio, Telegram) where fetched directly (MEDIUM-HIGH); a few ecosystem claims are WebSearch-only (flagged LOW below). Context7 MCP tools were not available in this session — Resend/Twilio/Telegram claims were instead verified via direct WebFetch of official doc pages.

**Audience legend:** `[PA]` = Platform-Admin (Xtimator ops team, via Telegram) · `[TN]` = Tenant (business owner, via in-app/email/WhatsApp/SMS) · `[EC]` = End-Customer (tenant's client, via email/SMS only) · `[ALL]` = spans multiple audiences (the template editor itself)

## Existing Foundation (do not re-spec, but load-bearing for every feature below)

| Capability | File(s) | What it already does |
|---|---|---|
| Telegram outbound client | `lib/telegram/client.ts` | Single bot token + single `chat_id` from `platform_integrations`, HTML `parse_mode`, throws `[Telegram] not configured` when dormant |
| Ops-alert fan-out | `lib/observability/ops-alert.ts` | `notifyOps()` — Redis SETNX dedupe (fail-open) → Sentry → Telegram, each stage independently swallowed; **today scoped to system-health only** (AI down, cron failures), not general platform events (signup/payment/quota) |
| Telegram admin config UI | `lib/admin/integrations-providers.ts` (`showTelegramConfig`) | Bot token + chat_id form + "send test alert" button already exists in `/admin/integrations` — precedent for test-send UX, but **no per-event toggle, single recipient only, chat_id found manually via `getUpdates`** |
| Tenant notification dispatch | `lib/notifications/dispatch.ts` (`notify()`) | Single fan-out entry point: resolves channel prefs → dedupe → in_app insert → email/whatsapp/sms via Inngest, every branch best-effort/never-throw |
| Tenant event catalog | `lib/notifications/event-types.ts` | Typed `EventType` union + `EVENT_CATEGORIES` (estimate/billing/system) + `DEFAULT_PREFERENCES` per category — **tenant-scoped only, no platform-level event catalog exists yet** |
| Tenant copy (hardcoded) | `lib/notifications/copy.ts` | `buildNotificationCopy()` — the exact thing this milestone converts from hardcoded switch/case to DB-driven templates |
| WhatsApp template registry (precedent for the fallback pattern) | `lib/notifications/whatsapp-registry.ts` | `getApprovedTemplateForEvent()` — DB row (`whatsapp_notification_templates`, name/language/status only) wins, falls back to a static in-code map on any DB miss/error. **This exact fallback shape is the one to reuse/generalize for the new template resolver.** |
| Email send | `lib/email/*` (Resend) | `notification-emails.ts`, `payment-emails.ts`, `invite-emails.ts`, `account-emails.ts` — existing hardcoded-copy senders |
| SMS send | `lib/sms/client.ts` (Twilio) | Bare REST-over-fetch `sendSms(to, body)`, creds from `platform_integrations`, never-throw |
| Encrypted credential pattern | `lib/platform-config.ts`, `lib/admin/integrations-providers.ts` | The `platform_integrations` table + admin UI is the established home for ANY new provider secret (Telegram bot token already lives here — no new pattern needed) |
| Channel-neutral agent tools | `lib/agent-tools/`, `lib/whatsapp/agent.ts`, MCP server (v4.9/v4.10) | WhatsApp assistant + MCP already share one neutral tool-calling core — the "agentic send" feature is a NEW tool added to this existing layer, not a new channel integration |

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Audience | Why Expected | Complexity | Notes |
|---|---|---|---|---|
| Per-event Telegram toggle matrix | `[PA]` | Locked decision: "ALL platform events, toggleable" | LOW | Extends `notifyOps`/admin-integrations UI; needs a NEW platform-event catalog (today's `EventType` is tenant-scoped) |
| Variable placeholder catalog per event, documented in the editor | `[ALL]` | Every template editor (Postmark, Customer.io) shows "available variables" alongside the edit box — users can't write `{{x}}` they can't see | LOW-MEDIUM | Postmark uses Mustache; Customer.io uses Liquid (`{{customer.first_name}}`) with sample data shown inline — reuse Xtimator's existing `{{var}}` convention from the milestone spec, don't adopt a new templating DSL |
| Live preview with sample data | `[ALL]` | Table stakes across Postmark/Customer.io — editing raw `{{var}}` text blind is error-prone | MEDIUM | Needs a per-event sample-context object (e.g., `{client_name: "Jane Doe", estimate_number: "EST-1042"}`) to render before save |
| Test-send | `[PA]` `[TN]` `[EC]` | Already precedented for Telegram ("send a test alert" button exists); Postmark/Customer.io both let you send a test email to yourself before activating | LOW | For Telegram: reuse existing button pattern. For email/SMS: new, but same shape (send to admin's own address/phone with sample data) |
| Fallback when template missing/broken | `[ALL]` | Never block a send because of a bad DB edit — this is a SAFETY property, not a nice-to-have | LOW | Precedented TWICE already (`whatsapp-registry.ts` DB→static fallback; `notify()`'s never-throw philosophy) — generalize the SAME pattern, don't invent a new one |
| Template save validation (no unresolved `{{var}}`, no unknown variable names) | `[ALL]` | Prevents shipping a template that silently renders `{{client_name}}` literally to a real customer | LOW-MEDIUM | Validate against the per-event variable catalog at save time |
| STOP / opt-out compliance for end-customer SMS | `[EC]` | Legally mandated (TCPA/CTIA, A2P 10DLC campaign registration terms) — reply STOP must be honored immediately with an automated confirmation, non-negotiable | LOW (if using Twilio Messaging Service's built-in Advanced Opt-Out) / MEDIUM (if hand-rolled) | Twilio's Advanced Opt-Out auto-handles STOP/START/HELP keywords when messages route through a Messaging Service — verify Xtimator's existing SMS sending already uses one before building custom STOP logic |
| Sender identity that reads as the tenant's business, not "Xtimator" | `[EC]` | The entire point of "on behalf of" messaging — a customer receiving "Your estimate from Xtimator" instead of "Your estimate from Jane's Plumbing" breaks trust in the tenant's brand | LOW-MEDIUM | Email: `From: {{business_name}} via Xtimator <notify@xtimator.com>` or similar friendly-from pattern (Gmail now penalizes deceptive friendly-from, so include "via Xtimator" honesty). SMS: body should open with the business name since there's no separate from-name field on a shared long code |
| Delivery status at least logged (sent/delivered/bounced/failed) | `[PA]` mainly, `[TN]` optionally | Any transactional-messaging system needs to know when a send silently failed | LOW (webhook receipt + log) / MEDIUM (surfaced in UI) | Resend webhooks: `email.sent/delivered/bounced/failed/complained/delivery_delayed`. Twilio status callbacks: `queued/sent/delivered/undelivered/failed` (out-of-order arrival possible — handlers must not assume ordering) |
| Respect the existing per-category channel matrix for tenant notifications | `[TN]` | Not new work but a HARD dependency — new DB-driven tenant templates must still resolve through `in_app/email/whatsapp/sms` per-category prefs already shipped | LOW | Just don't break `lib/notifications/preferences.ts` — the template layer replaces COPY, not the channel-resolution logic |

### Differentiators (Competitive Advantage)

| Feature | Audience | Value Proposition | Complexity | Notes |
|---|---|---|---|---|
| Agentic send ("send an SMS to my client about X") | `[TN]` → `[EC]` | Voice/chat-first value prop extended to messaging — no competitor field-service SaaS lets the owner just ASK the assistant to text a client; this is Xtimator's core differentiation applied to notifications | MEDIUM | New tool on the EXISTING `lib/agent-tools/` neutral layer (WhatsApp assistant + MCP already share it per v4.9/v4.10) — the send primitive (Twilio/Resend) already exists, this is a thin tool wrapper + confirmation UX |
| One unified template repository for BOTH tenant AND end-customer messages | `[ALL]` | Most vendors (Customer.io, Intercom) serve ONE audience; Xtimator's super-admin manages tenant notifications AND end-customer copy from a single screen — genuinely less common | MEDIUM | Straightforward once the schema models `audience` as a dimension alongside `event_type`/`channel` |
| Non-toggleable "critical" Telegram events (e.g., platform outage) that always fire regardless of the toggle matrix | `[PA]` | Prevents an admin from accidentally silencing a page-me-now event while decluttering routine noise | LOW | A simple `locked: boolean` flag on select platform events; small but meaningfully safer than a flat toggle-everything design |
| Inline variable insert-picker (click to insert `{{client_name}}` vs. copy-pasting from a legend) | `[PA]` (editor UX) | Customer.io's code editor shows available attributes alongside a Liquid editor; a picker beats a static legend for editing speed | LOW-MEDIUM | Pure UX polish — safe to defer past v1 without harming the core feature |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Audience | Why Requested | Why Problematic | Alternative |
|---|---|---|---|---|
| Tenant-level template overrides | `[TN]` | "Typical" template editors (Customer.io, Intercom) let each account customize its own copy — feels like an obvious ask | **Explicitly locked OUT for v1** — doubles the editing surface, RLS/authorization complexity, and conflicts with the milestone's single-source-of-truth goal | Ship the `{{business_name}}`/`{{brand_color}}`-style variables so tenant identity still shows through a GLOBAL template; revisit per-tenant overrides only if multiple tenants explicitly ask for copy beyond what variables can express |
| WhatsApp as an end-customer channel | `[EC]` | WhatsApp already exists in the stack and has the richest formatting/interactivity — tempting to reuse for customer messaging too | **Explicitly locked OUT** — WhatsApp is reserved exclusively for owner↔Xtimator conversation; mixing it into customer-facing sends would blur that boundary and risks HSM-template compliance issues on a channel not built for it | Email + SMS only, per locked scope |
| Full drag-and-drop visual email builder (MailMason/Postmark-style WYSIWYG) | `[PA]` (editor) | "Real" template editors look like this — feels like the professional bar | Heavy build (rich-text/DnD engine, HTML sanitization, cross-client rendering testing) for a v1 that only needs transactional variable substitution, not marketing-grade design | A plain rich-text-lite editor (or even markdown-to-HTML) with `{{var}}` insertion + live preview is sufficient; defer a visual builder until template volume/design needs justify it |
| Per-tenant sender reputation isolation (Twilio subaccounts, dedicated IP pools per tenant) | `[EC]` infra | The "correct" architecture for large multi-tenant email/SMS platforms per current best-practice writeups (MailChannels, MailerSend) | Significant operational lift (subaccount provisioning, per-tenant DNS/SPF/DKIM, monitoring) with no evidence yet that Xtimator's current volume creates shared-reputation risk | Shared platform sender (current Resend/Twilio setup) with tenant identity carried in From-name/body copy; revisit isolation only if real deliverability degradation from one tenant's behavior is observed |
| Two-way end-customer conversation threading for SMS/email replies | `[EC]` | "Why can't the client just reply and it becomes a conversation" feels natural once messaging exists | Explicitly out of scope — WhatsApp is the ONLY two-way channel by design; building inbound SMS/email handling means a second inbox/routing system this milestone doesn't need | End-customer messages should close with a clear "call/text {{business_phone}}" or similar, not invite a reply-and-continue flow |
| Per-tenant custom quiet-hours scheduling UI | `[EC]` (sending) | Feels like a natural "let each business set their own send window" config | Scope creep for v1 — a single sane platform-wide quiet-hours guard (avoid sending 9pm–8am recipient-local time) already satisfies the compliance-risk reason this matters | Hardcode/derive one platform-wide default guard (from area code or company timezone); expose per-tenant configurability only if requested later |
| Telegram MarkdownV2 formatting | `[PA]` | MarkdownV2 supports spoilers/underline that HTML parse_mode doesn't | MarkdownV2 requires escaping 18 special characters — far more error-prone than HTML (which only needs `<`, `>`, `&` escaped) — and the existing `ops-alert.ts` already uses HTML successfully | Keep `parse_mode: 'HTML'` (existing convention in `lib/telegram/client.ts`/`ops-alert.ts`) for the new event alerts too — don't introduce a second formatting mode |

## Feature Dependencies

```
[Platform-event catalog (NEW)] (PA)
    └──requires──> [none — new typed union, sibling to lib/notifications/event-types.ts]
    └──enables────> [Telegram per-event toggle matrix] (PA)

[Telegram per-event toggle matrix] (PA)
    └──requires──> [Platform-event catalog (NEW)]
    └──requires──> [Existing Telegram client + platform_integrations config] (already shipped)
    └──enhances──> [Telegram chat registration/binding flow] (PA, v1.x — multi-admin)

[notification_templates schema + per-event variable catalog] (ALL)
    └──requires──> [none — new table]
    └──enables───> [Super-admin template editor (edit/preview/test-send)]
    └──enables───> [End-customer email/SMS templates]
    └──enables───> [Tenant template migration off lib/notifications/copy.ts]

[Fallback-to-default resolver] (ALL)
    └──requires──> [notification_templates schema]
    └──reuses────> [Pattern already proven in lib/notifications/whatsapp-registry.ts]
    └──gates─────> [Every send path — nothing may send without this safety net in place]

[Super-admin template editor] (PA editing, serves TN + EC copy)
    └──requires──> [notification_templates schema + variable catalog]
    └──requires──> [Fallback-to-default resolver] (must exist before templates go live, or a bad edit blocks sends)
    └──enables───> [Test-send] (PA/TN/EC)

[End-customer email/SMS templates + send path] (EC)
    └──requires──> [Super-admin template editor] (no end-customer copy exists today — must be authored)
    └──requires──> [Existing lib/email/* (Resend) + lib/sms/client.ts (Twilio)]
    └──requires──> [STOP/opt-out + sender-identity resolution] (NEW logic)

[Agentic send tool] (TN → EC)
    └──requires──> [End-customer email/SMS templates + send path] (the underlying capability it invokes)
    └──requires──> [lib/agent-tools/ neutral tool layer] (already shipped, v4.9/v4.10)

[Tenant-level template overrides] ──conflicts──> [Locked v1 scope: super-admin-only editing, no tenant overrides]
[WhatsApp end-customer channel] ──conflicts──> [Locked scope: WhatsApp reserved for owner↔Xtimator conversation]
```

### Dependency Notes

- **Platform-event catalog must exist before the Telegram toggle matrix:** today's `EventType`/`EVENT_CATEGORIES` in `lib/notifications/event-types.ts` models TENANT-facing categories (estimate/billing/system). The milestone's "tenant signup, payment, job failures, quota, critical errors" are Xtimator-ops-facing events — a distinct catalog dimension that doesn't exist yet. Building the toggle UI before this catalog exists has nothing to bind toggles to.
- **Fallback resolver must ship before (or atomically with) the template editor going live:** the moment templates become the source of truth for a send, an admin typo/broken edit becomes a production incident unless the resolver degrades gracefully. `whatsapp-registry.ts`'s DB-row-falls-back-to-static-map is the proven shape to generalize — do not treat this as optional polish.
- **End-customer templates require the editor, not just the schema:** unlike tenant notifications (which have `copy.ts` to migrate FROM), there is no existing end-customer copy anywhere in the codebase — it must be authored net-new through the editor, which makes the editor a hard prerequisite rather than a parallel-track feature.
- **Agentic send depends on the send path being real, not stubbed:** the WhatsApp assistant/MCP tool is a thin wrapper: it cannot be built usefully before end-customer email/SMS actually sends via real templates — sequence it after, not alongside.
- **STOP/opt-out logic depends on knowing whether Twilio Advanced Opt-Out already applies:** if Xtimator's SMS sends already route through a Twilio Messaging Service, STOP/START/HELP may already be auto-handled at the platform level — verify before building custom compliance logic (avoids duplicate/conflicting opt-out state).

## MVP Definition

### Launch With (v1)

- [ ] Platform-event catalog (NEW typed union) covering tenant signup, payment, job failures, quota, critical errors `[PA]` — essential, nothing else in the Telegram feature has anything to bind to without it
- [ ] Telegram per-event toggle matrix in admin panel `[PA]` — essential, this is the locked "ALL platform events, toggleable" requirement
- [ ] `notification_templates` table (event_type × channel × audience, body/subject with `{{var}}` placeholders) + per-event variable catalog `[ALL]` — essential foundation for everything else
- [ ] Super-admin template editor: list by event, edit body/subject, live preview with sample data `[ALL]` — essential, the core deliverable
- [ ] Test-send from the editor (email/SMS/Telegram) `[PA]` `[TN]` `[EC]` — essential; Telegram precedent already exists, extend to the other two channels
- [ ] Fallback-to-default resolver (DB template missing/broken → safe default, never block a send) `[ALL]` — essential safety net, generalizes the existing WhatsApp-registry pattern
- [ ] End-customer email templates (client_name, business_name, estimate_number, link, etc.) wired to a real send path `[EC]` — essential per locked scope
- [ ] End-customer SMS templates + STOP/opt-out compliance verified against existing Twilio setup `[EC]` — essential, legally required
- [ ] Sender-identity resolution for end-customer messages (business name surfaces, not just "Xtimator") `[EC]` — essential for the messaging to feel legitimately from the tenant
- [ ] Agentic send tool exposed to WhatsApp assistant + MCP `[TN]`→`[EC]` — essential, explicit locked target feature

### Add After Validation (v1.x)

- [ ] Self-service Telegram chat binding via `/start` deep link (multiple admins register themselves without manual `getUpdates` lookup) `[PA]` — trigger: more than 1-2 platform admins need alerts, current manual chat_id lookup becomes a support burden
- [ ] Delivery-status surfaced in admin UI (Resend/Twilio webhook ingestion beyond raw logging) `[PA]` — trigger: need visibility into bounce/failure rates once template send volume grows
- [ ] Inline variable-picker/autocomplete in the template editor `[PA]` — trigger: editor UX friction reported by whoever maintains templates
- [ ] Template version history / rollback `[PA]` — trigger: a bad template edit ships and there's no fast undo

### Future Consideration (v2+)

- [ ] Tenant-level template overrides `[TN]` — locked out for v1; defer until tenants explicitly request copy beyond what variables (`{{business_name}}`, etc.) can express
- [ ] Per-tenant sender reputation isolation (Twilio subaccounts / dedicated pools) `[EC]` infra — defer until real deliverability degradation is observed at scale
- [ ] Two-way end-customer SMS/email reply threading `[EC]` — defer; WhatsApp stays the only two-way channel by design
- [ ] Per-tenant configurable quiet-hours `[EC]` — defer; ship one platform-wide guard first

## Feature Prioritization Matrix

| Feature | Audience | User Value | Implementation Cost | Priority |
|---|---|---|---|---|
| Platform-event catalog | PA | HIGH | LOW | P1 |
| Telegram per-event toggle matrix | PA | HIGH | LOW | P1 |
| `notification_templates` schema + variable catalog | ALL | HIGH | MEDIUM | P1 |
| Super-admin template editor + preview | ALL | HIGH | MEDIUM | P1 |
| Test-send | PA/TN/EC | MEDIUM | LOW | P1 |
| Fallback-to-default resolver | ALL | HIGH | LOW | P1 |
| End-customer email templates + send | EC | HIGH | MEDIUM | P1 |
| End-customer SMS templates + STOP compliance | EC | HIGH | MEDIUM | P1 |
| Sender-identity resolution | EC | HIGH | LOW-MEDIUM | P1 |
| Agentic send tool (WhatsApp/MCP) | TN→EC | HIGH | MEDIUM | P1 |
| Self-service Telegram binding flow | PA | MEDIUM | MEDIUM | P2 |
| Delivery-status dashboard | PA | MEDIUM | MEDIUM | P2 |
| Inline variable-picker UX | PA | LOW | LOW | P2 |
| Template version history | PA | LOW | MEDIUM | P3 |
| Tenant-level template overrides | TN | MEDIUM | HIGH | P3 (locked out v1) |
| Per-tenant sender isolation | EC infra | LOW today | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (this milestone)
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Postmark / Customer.io | Intercom | Xtimator's Approach |
|---|---|---|---|
| Variable placeholder syntax | Postmark: Mustache. Customer.io: Liquid (`{{customer.first_name}}`), code editor shows sample data + available attributes inline | Merge-tag picker UI | Keep the existing `{{var}}` convention already used in `copy.ts`/milestone spec — no new templating engine dependency, server-resolved with a per-event sample-data preview |
| Test send | Postmark: edit JSON test variables (not saved with template), send test email, switch HTML/text | Preview + test send to admin | Reuse the EXISTING Telegram "send test alert" button pattern; extend the same UX shape to email/SMS from the same editor screen |
| Per-account customization | Both support per-customer/workspace template overrides as a core feature | Yes | Explicitly NOT included in v1 (locked decision) — single global template per event, template variables carry tenant identity instead |
| Fallback on missing/broken template | Not always graceful — a bad Liquid reference can break the send | Falls back to a default | Xtimator's existing `whatsapp-registry.ts` DB-falls-back-to-static-map pattern is a stronger baseline than what was found documented for the competitors above — generalize it, don't weaken it |
| Sender identity for multi-tenant sends | MailerSend/MailChannels writeups stress platform-published guides for tenants on DNS/SPF/DKIM + honest friendly-from naming (Gmail now penalizes deceptive friendly-from) | N/A (single-tenant product) | Friendly-from with an honest "via Xtimator" qualifier + business name leading the SMS body — avoids the deceptive-friendly-from trap while still reading as the tenant's business |

## Sources

**Codebase (HIGH confidence, verified directly):**
- `lib/telegram/client.ts`, `lib/observability/ops-alert.ts`, `lib/admin/integrations-providers.ts`, `lib/platform-config.ts`
- `lib/notifications/{dispatch,copy,event-types,whatsapp-registry,preferences}.ts`
- `lib/email/*` (Resend), `lib/sms/client.ts` (Twilio)

**Official docs (verified via WebFetch, HIGH-MEDIUM confidence):**
- [Resend webhook event types](https://resend.com/docs/dashboard/webhooks/event-types)
- [Twilio outbound message status tracking](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status)
- [Telegram deep links (official)](https://core.telegram.org/api/links)
- [Postmark transactional email best practices 2026](https://postmarkapp.com/guides/transactional-email-best-practices)
- [Postmark MailMason template toolset](https://postmarkapp.com/mailmason)
- [Customer.io transactional email docs](https://docs.customer.io/journeys/send/transactional/email/)
- [Customer.io email code editor (Liquid variables)](https://docs.customer.io/journeys/email-code-editor/)

**WebSearch, cross-referenced (MEDIUM confidence):**
- [Telegram MarkdownV2 escape guide](https://botnamefinder.com/blog/telegram-markdownv2-escape-characters)
- [grammY ParseMode reference](https://grammy.dev/ref/types/parsemode)
- [Telegram deep linking (aiogram docs)](https://docs.aiogram.dev/en/latest/utils/deep_linking.html)
- [A2P 10DLC compliance guide 2026 (Textbolt)](https://textbolt.com/blog/10dlc-compliance/)
- [A2P 10DLC compliance guide (Sakari)](https://sakari.io/blog/meeting-10dlc-compliance-with-opt-ins)
- [TCPA quiet hours guide (ReadySMS)](https://readysms.io/blog/quiet-hours-sms-rules)
- [SMS quiet hours 2026 (MessageBlink)](https://www.messageblink.com/sms-quiet-hours-what-they-are-in-2026/)
- [Multi-tenant transactional email guide (MailerSend)](https://www.mailersend.com/blog/multi-tenant-email-sending)
- [Multi-tenant email deliverability 2026 (MailChannels)](https://www.mailchannels.com/multi-tenant-email-deliverability/)

**LOW confidence (single-source WebSearch summaries, not independently fetched — flag for validation if load-bearing):**
- Twilio Advanced Opt-Out auto-handling of STOP/START/HELP specifically requiring a Messaging Service — WebSearch summaries did not confirm this explicitly; verify against Twilio's own Advanced Opt-Out docs before relying on it instead of custom STOP logic
- Gmail's stricter stance against deceptive "friendly-from" names — sourced from a WebSearch summary of a MailerSend blog post, not Google's own sender guidelines page

---
*Feature research for: Notification Center (three-audience) — Xtimator v4.21*
*Researched: 2026-07-21*
