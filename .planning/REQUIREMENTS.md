# Requirements: Xtimator — Milestone v4.21 Notification Center

**Defined:** 2026-07-21
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Unify all outbound messaging into a single admin-manageable Notification Center serving three distinct audiences — platform admins (Telegram), tenants (in-app/email/WhatsApp/SMS), and end customers (email/SMS only) — with every message template editable with variables from the super-admin panel instead of hardcoded copy. Research: [research/SUMMARY.md](research/SUMMARY.md) (+ STACK/FEATURES/ARCHITECTURE/PITFALLS).

> **Locked decisions (owner-confirmed 2026-07-21):**
> - **Telegram scope:** ALL platform events, each with a per-event toggle in the admin panel; select critical events carry a `locked` flag and always deliver. Outbound-only, HTML `parse_mode`, single admin chat (multi-admin binding deferred). Extends the EXISTING `lib/telegram/client.ts` + `notifyOps()` pipe — not a new integration.
> - **Template editing is super-admin-only for v1** — NO tenant-level template overrides. Tenant identity flows through variables (`{{business_name}}` etc.) in global templates.
> - **WhatsApp is reserved exclusively for owner↔Xtimator conversation.** End customers NEVER receive WhatsApp. Tenant proactive WhatsApp notifications ARE re-enabled this milestone via the EXISTING HSM registry (Meta-approved templates required — operational task); WhatsApp body editing in the new template editor is deferred (positional `{{n}}` mismatch).
> - **Dedicated Twilio Messaging Service for end-customer SMS** — separate from the shared owner-notification number (which 6 apps share); Advanced Opt-Out handles STOP/START/HELP. Operational task: provision in Twilio Console, config via admin panel (`platform_integrations`, never env).
> - **No templating library** — hand-rolled ~40-line `{{var}}` interpolator with per-channel output escaping (HTML-escape for email/Telegram, plain for SMS, sanitized ordered params for WhatsApp HSM). Handlebars rejected: helper-execution CVE surface against admin-editable DB templates.
> - **Fallback discipline:** DB template → static built-in copy → never block a send (generalizes the proven `whatsapp-registry.ts` pattern). The resolver ships before or atomically with the editor.
> - **Tenant-scoped `notify()` and platform-scoped `notifyOps()` remain parallel pipelines** — they never share a table.
> - **Agentic send is confirmation-gated** (the `confirm.ts` state-machine pattern, NOT `manage-tools.ts` immediate-write) with injection-resistant recipient validation. Synchronous send (agent needs same-turn success/failure).
> - **End-customer consent/STOP infra is a hard prerequisite gate** before any end-customer or agentic SMS ships — HIGH/legal severity per PITFALLS.md.
> - **Model orchestration:** Fable orchestrates, Opus validates, Sonnet executes, Haiku does the simplest work.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Platform Alerts — Telegram (PLAT)

- [ ] **PLAT-01**: A typed platform-event catalog (tenant signup, payment received, job failure, quota exhaustion, critical platform errors) exists as a new union distinct from the tenant-scoped `EventType`, and every cataloged platform event routes through `notifyOps()` to Telegram.
- [ ] **PLAT-02**: Super-admin can toggle each platform event's Telegram delivery on/off from the admin panel (per-event toggle matrix persisted in DB).
- [ ] **PLAT-03**: Events flagged `locked` (critical) always deliver to Telegram regardless of the toggle matrix.

### Template System (TMPL)

- [ ] **TMPL-01**: A `notification_templates` table models event_type × channel × audience with subject/body containing `{{var}}` placeholders, seeded from the current hardcoded copy so day-one behavior is byte-equivalent.
- [ ] **TMPL-02**: Super-admin can browse and edit every template (by audience, event, channel) from a Notification Center admin page.
- [ ] **TMPL-03**: The editor shows the per-event variable catalog inline and renders a live preview with sample data before save.
- [ ] **TMPL-04**: Saving a template with an unknown variable (not in that event's catalog) is rejected with a clear error — a template that would render `{{client_name}}` literally can never be activated.
- [ ] **TMPL-05**: Super-admin can test-send any template to themselves (email/SMS/Telegram) with sample data from the editor.
- [ ] **TMPL-06**: A fallback resolver renders the DB template when present and valid, and falls back to the built-in copy on any miss/parse error — a broken template NEVER blocks a send (proven by tests that corrupt a template and assert delivery).
- [ ] **TMPL-07**: Template rendering escapes output per channel — HTML-escape for email/Telegram HTML, plain text for SMS, sanitized (newline-stripped) ordered params for WhatsApp HSM — closing the existing `sendWhatsAppTemplate()` sanitization gap.

### Tenant Notifications (TNT)

- [ ] **TNT-01**: All existing `notify()` call sites resolve their copy through the template resolver (callers pass a context object; `copy.ts` survives only as the fallback source).
- [ ] **TNT-02**: The existing per-category channel preference matrix (in_app/email/whatsapp/sms) keeps working unchanged through the template cutover — proven by the existing preference tests staying green.
- [ ] **TNT-03**: Tenant proactive WhatsApp notifications are re-enabled: the forced-off gate is lifted, approved HSM templates from the existing registry drive the whatsapp channel, and sends respect the tenant's opt-in preference. (Operational dependency: templates authored + APPROVED in Meta WhatsApp Manager.)

### End-Customer Messaging (CUST)

- [ ] **CUST-01**: The system can send a templated email to an end customer where the sender identity reads as the tenant's business (`{{business_name}} via Xtimator` friendly-from — honest, never deceptive).
- [ ] **CUST-02**: The system can send a templated SMS to an end customer through a dedicated Twilio Messaging Service (separate from the shared owner-notification number), with the tenant's business name leading the body.
- [ ] **CUST-03**: End-customer contact records carry consent/suppression state; STOP is honored (Twilio Advanced Opt-Out + a suppression check before EVERY send), and a suppressed recipient can never be messaged by any path — manual or agentic.
- [ ] **CUST-04**: A platform-wide quiet-hours guard prevents end-customer SMS outside acceptable local hours.
- [ ] **CUST-05**: Every end-customer message is logged in a `customer_messages` audit table (company, recipient, channel, provider, template/free-form, trigger source, status) — modeled on `estimate_deliveries`.

### Agentic Send (AGENT)

- [ ] **AGENT-01**: The owner can ask the WhatsApp assistant to send an SMS or email to one of their clients; the assistant drafts the message and requires explicit owner confirmation (confirm-gated state machine) before anything is sent.
- [ ] **AGENT-02**: The same send capability is exposed as an MCP tool with the same confirmation and validation gates as the WhatsApp path.
- [ ] **AGENT-03**: The agentic recipient must resolve to an existing client of the owner's company — arbitrary phone numbers/emails are rejected, recipient and body are re-validated server-side at send time (prompt-injection cannot redirect a message), and sends are rate-limited per company.

## Future Requirements (deferred)

- **FUT-01**: WhatsApp HSM body editing in the template editor (positional `{{n}}` parameter model needs its own design pass + Meta API validation research).
- **FUT-02**: Self-service Telegram chat binding via `/start` deep link (multi-admin registration).
- **FUT-03**: Delivery-status dashboard (Resend/Twilio webhook ingestion surfaced in admin UI beyond the audit log).
- **FUT-04**: Template version history / rollback.
- **FUT-05**: Tenant-level template overrides (revisit only if variables can't express what tenants ask for).
- **FUT-06**: Two-way end-customer reply threading (WhatsApp stays the only two-way channel by design).
- **FUT-07**: Per-tenant sender reputation isolation (Twilio subaccounts / dedicated pools) — only if real deliverability degradation is observed.
- **FUT-08**: Per-tenant configurable quiet hours.

## Out of Scope (this milestone)

- **WhatsApp for end customers** — locked out; owner↔Xtimator conversation only.
- **Visual drag-and-drop email builder** — plain editor + `{{var}}` insertion + preview is the v1 bar.
- **Telegram MarkdownV2** — HTML `parse_mode` stays the single formatting convention.
- **Inbound SMS/email routing** beyond Twilio's automatic STOP handling — no second inbox system.
- **Marketing/bulk messaging** — end-customer sends are strictly transactional (narrower TCPA bar); campaign features are a different product decision.

## Traceability

| Requirement | Phase | Status |
|-------------|----------|--------|
| PLAT-01 | Phase 175 | Pending |
| PLAT-02 | Phase 175 | Pending |
| PLAT-03 | Phase 175 | Pending |
| TMPL-01 | Phase 172 | Pending |
| TMPL-02 | Phase 173 | Pending |
| TMPL-03 | Phase 173 | Pending |
| TMPL-04 | Phase 173 | Pending |
| TMPL-05 | Phase 173 | Pending |
| TMPL-06 | Phase 172 | Pending |
| TMPL-07 | Phase 172 | Pending |
| TNT-01 | Phase 174 | Pending |
| TNT-02 | Phase 174 | Pending |
| TNT-03 | Phase 174 | Pending |
| CUST-01 | Phase 177 | Pending |
| CUST-02 | Phase 177 | Pending |
| CUST-03 | Phase 176 | Pending |
| CUST-04 | Phase 176 | Pending |
| CUST-05 | Phase 177 | Pending |
| AGENT-01 | Phase 178 | Pending |
| AGENT-02 | Phase 178 | Pending |
| AGENT-03 | Phase 178 | Pending |
