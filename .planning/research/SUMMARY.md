# Project Research Summary

**Project:** Xtimator v4.21 — Notification Center
**Domain:** Multi-audience outbound messaging (platform-admin Telegram alerts, super-admin DB-driven template editor, end-customer email/SMS, agentic send) layered onto a live, multi-tenant SaaS notification pipeline
**Researched:** 2026-07-21
**Confidence:** HIGH (stack + architecture, grounded directly in the shipped codebase) / MEDIUM (SMS compliance and general Telegram/WhatsApp platform behavior, WebSearch-sourced)

## Executive Summary

This milestone is a brownfield integration study, not a greenfield build. Two of its three headline capabilities already exist in production: Telegram outbound send (`lib/telegram/client.ts` + `notifyOps()`, shipped 2026-07-05) is ~70% done — the remaining work is widening its event catalog and adding per-event toggles, not building a Telegram integration. The DB-driven template engine has a proven pattern to generalize (`whatsapp-registry.ts`'s DB-row-falls-back-to-static-map), and needs no new npm dependency — a hand-rolled ~40-line `{{var}}` interpolator with per-channel escaping is the right call, deliberately rejecting Handlebars (CVE/trust-model mismatch for admin-editable DB templates) and any Telegram bot framework (send-only needs zero update-routing machinery). The genuinely new work is the end-customer agentic-send pipeline: no table, no neutral capability, no tool exists today, and it introduces the first LLM-authored message sent to a real third party.

The recommended architecture keeps three pipelines structurally separate rather than unifying them: the existing tenant-scoped `notify()` (gains DB-template resolution, stays `company_id`-required), the existing platform-scoped `notifyOps()` (gains a per-event Telegram toggle, stays company-agnostic), and a new synchronous, confirmation-gated agentic-send capability (mirrors `app/api/estimates/[id]/send-sms/route.ts`'s direct-call precedent, not `notify()`'s Inngest fire-and-forget). Template resolution slots inside `notify()` per channel — not at the 9 call sites — using an additive, zero-regression rollout: the DB starts empty, everything falls back to the current hardcoded `copy.ts`/`whatsapp-registry.ts` behavior until templates are authored.

The main risks are not technical unknowns but discipline and compliance gaps. Moving `copy.ts` from a compile-time-exhaustive switch to a runtime DB lookup silently drops the TypeScript safety net that today prevents a "new event, forgotten copy" bug — this must be closed with a seed migration and a CI diff check, not discovered in production. WhatsApp's Meta-approved HSM templates use strictly positional `{{n}}` parameters that structurally conflict with a named-variable editor; treat WhatsApp as a separate, later sub-phase rather than folding it into the generic email/SMS/in-app editor. Most seriously, end-customer SMS has zero consent/opt-out infrastructure today (no `clients`-scoped suppression column, no inbound Twilio webhook) — this is a HIGH-severity legal prerequisite gate that must exist before any end-customer SMS or agentic send ships, not a compliance item to retrofit. Agentic send additionally needs a confirmation-gate state machine (mirroring `confirm.ts`, not the immediate-write `manage-tools.ts` pattern) with recipient/amount cross-checked against DB records, because prompt injection into a free-text `to`/amount tool schema is a real, unmitigated surface today.

## Key Findings

### Recommended Stack

No new runtime npm dependency is required for any of the three target capabilities. Telegram send widens the existing raw-`fetch` client (`lib/telegram/client.ts`); a bot framework (grammY/Telegraf) would only earn its keep if a later milestone adds inbound admin commands, which this milestone explicitly does not need. Template rendering is satisfied by a hand-rolled `{{var}}` interpolator matching the codebase's existing `escapeHtml()`-in-`notification-emails.ts` pattern — Handlebars is explicitly rejected (helper/partial execution model + CVE history is the wrong trust model for DB-stored, admin-editable templates); Mustache is the documented escalation path only if loops/conditionals are ever needed. End-customer SMS compliance is almost entirely a Twilio Console/legal-copy task: Toll-Free Verification (not A2P 10DLC) is recommended for v1's low-volume transactional use case — faster in-house verification, no per-campaign carrier fee.

**Core technologies:**
- No new package for Telegram send — extend `lib/telegram/client.ts` and `getTelegramConfig()` (chat_id → chat_ids or a join table if per-admin routing is needed)
- No new package for template rendering — `lib/notifications/template-engine.ts` (new), one call site per channel, context-aware escaping (HTML-escape for email, control-char-strip for SMS/Telegram, ordered-array for WhatsApp HSM)
- Toll-Free Verification (Twilio Console) for the end-customer SMS `from_phone` — escalate to A2P 10DLC Brand+Campaign only if volume/use-case classification later requires it
- `zod@^4.3.6` (existing) for the per-event variable-catalog schema; `inngest@^4.4.0` (existing) to route Telegram sends through the durable/retry layer instead of inline `fetch` calls

### Expected Features

Feature research frames this as three audiences sharing infrastructure but not scope: `[PA]` platform-admin (Telegram), `[TN]` tenant (existing in-app/email/WhatsApp/SMS), `[EC]` end-customer (email/SMS only — WhatsApp explicitly excluded). See `.planning/research/FEATURES.md` for the full dependency graph and prioritization matrix.

**Must have (table stakes):**
- Per-event Telegram toggle matrix, bound to a NEW platform-event catalog (today's `EventType` is tenant-scoped only)
- Variable placeholder catalog per event, visible in the editor (users can't write `{{x}}` they can't see)
- Live preview with sample data before save
- Test-send (email/SMS/Telegram) — Telegram precedent already exists, extend the same UX shape
- Fallback-to-default resolver — never block a send because of a bad DB edit (safety property, not a nice-to-have)
- STOP/opt-out compliance for end-customer SMS (legally mandated, non-negotiable)
- Sender identity that reads as the tenant's business, not "Xtimator" (honest friendly-from, e.g. "via Xtimator")
- Delivery status at least logged (Resend/Twilio webhook events)

**Should have (competitive differentiators):**
- Agentic send ("send an SMS to my client about X") — Xtimator's core voice/chat-first differentiation applied to messaging; no competitor field-service SaaS offers this
- One unified template repository spanning tenant AND end-customer messages from a single super-admin screen — genuinely less common than single-audience competitors (Customer.io, Intercom)
- Non-toggleable "critical" Telegram events that always fire regardless of the toggle matrix

**Defer (v2+) — explicitly locked out for v1:**
- Tenant-level template overrides (single global template per event; tenant identity carried via variables instead)
- WhatsApp as an end-customer channel (reserved exclusively for owner↔Xtimator conversation)
- Full drag-and-drop visual email builder (plain `{{var}}` editor + live preview is sufficient)
- Per-tenant sender reputation isolation (Twilio subaccounts / dedicated IP pools)
- Two-way end-customer conversation threading (WhatsApp stays the only two-way channel by design)
- Per-tenant configurable quiet-hours (ship one platform-wide guard first)

### Architecture Approach

Three structurally separate pipelines, not one unified system: (1) the existing tenant-scoped `notify()` gains DB-template resolution injected per-channel inside the function (not at the 9 existing call sites), rolled out as strictly additive so an empty template table changes zero behavior; (2) the existing platform-scoped `notifyOps()` gains a per-event Telegram toggle read from a new preferences table, keeping Sentry as the unconditional technical record; (3) a genuinely new, synchronous, confirmation-gated agentic-send capability lets the WhatsApp MANAGE intent and MCP write tools message an end-customer through the same `sendSms`/new `sendEmail` primitives `notify()` uses. These pipelines deliberately never share a table or function — `notify()`'s `companyId`-required, RLS-keyed shape cannot absorb company-agnostic platform alerts without a structural regression.

**Major components:**
1. `lib/notifications/template-resolver.ts` (NEW) — DB-first, `copy.ts`-fallback resolver called from inside `notify()`, generalizing the proven `whatsapp-registry.ts` pattern to 3 more channels and 2 scopes (tenant/customer)
2. `notification_templates` table (NEW) — row-per-channel (not per-event), service-role-only RLS, structurally enforces "no tenant overrides" by having no `company_id` column at all
3. `platform_notification_preferences` table (NEW) — per-platform-event-`kind` Telegram toggle, default-ON for zero regression against today's always-on `notifyOps()`
4. `lib/agent-tools/send-customer-message.ts` (NEW) — neutral capability with `companyId` as a trusted closure param (never LLM-suppliable), called synchronously from both WhatsApp MANAGE tools and MCP write tools
5. `customer_messages` table (NEW) — audit log for every end-customer send, modeled on the proven `estimate_deliveries` shape, carrying `source`/`sent_by_user_id` for reviewability of LLM-authored sends

### Critical Pitfalls

1. **DB template lookup drops TypeScript's exhaustiveness guard** — today's `copy.ts` switch has no `default` case, so a forgotten event fails the build; moving to a DB lookup turns that into a silent runtime gap. Avoid by seeding every existing `EventType` in one migration (byte-identical to current copy) plus a CI test diffing the `EventType` union against seeded rows.
2. **No missing-template fallback blanks or blocks a live send** — mirror the already-shipped `whatsapp-registry.ts` DB→static-fallback pattern exactly; retain `copy.ts` permanently as the last-resort tier, never delete it.
3. **WhatsApp HSM's positional `{{n}}` params structurally conflict with a named-variable editor** — a reordered or resized variable list can garble or reject a Meta-approved template with no application-level error. Keep WhatsApp variable editing read-only/order-locked and scope its generalization as a separate, later sub-phase requiring dedicated Meta Cloud API research.
4. **No end-customer consent/opt-out infrastructure exists** — `notification_preferences.sms_opt_in_at` covers tenant/owner consent only; `clients` has no equivalent column, and no inbound Twilio webhook exists to capture STOP/START/HELP. Treat as a HIGH-severity legal prerequisite gate before any end-customer SMS or agentic send ships, not a retrofit.
5. **Agentic send has no confirmation-gate precedent to inherit** — the codebase's immediate-write pattern (`manage-tools.ts`) is the wrong one to copy for an external, cost-bearing, irreversible send; reuse the `confirm.ts` session-state-machine shape instead, with the confirmation echo showing the DB-resolved recipient and message body (closes the prompt-injection surface where a free-text `to`/amount field could be adversarially influenced).

## Implications for Roadmap

Based on combined research, the architecture's own dependency spine plus the pitfalls' prerequisite flags suggest the following phase structure. The three pipelines share no code, so phases within each track can proceed independently — but the consent/compliance gate (Pitfall 10) must land before end-customer send ships, regardless of parallel-track ordering.

### Phase 1: Template Engine Foundation
**Rationale:** Dependency root for everything template-related; must exist before any DB-driven copy can be authored, and is the phase where the exhaustiveness/fallback safety nets (Pitfalls 1 & 2) must be built in from day one, not retrofitted.
**Delivers:** `notification_templates` table (migration, service-role-only RLS), `lib/notifications/template-resolver.ts` (hand-rolled `{{var}}` interpolator with per-channel escaping), wired into `notify()` as strictly additive — DB starts empty, 100% fallback to `copy.ts`, zero call-site changes required.
**Addresses:** `notification_templates` schema + variable catalog (P1 table-stakes feature)
**Avoids:** Pitfall 1 (lost exhaustiveness guard — seed every `EventType`, add CI diff check), Pitfall 2 (no fallback), Pitfall 4 (HTML injection via unescaped variable substitution — build escaping-by-default from the start)

### Phase 2: Super-Admin Template Editor UI
**Rationale:** The core deliverable of the milestone; depends on Phase 1's table existing; the event-scoped (not global) variable catalog design decision must be locked here, before any event's template can leak cross-audience data.
**Delivers:** CRUD screen over `notification_templates` (list by event, edit body/subject, live preview with per-event sample data, test-send), reusing the `whatsapp-templates-panel.tsx` + `admin-whatsapp-templates.ts` server-action pattern.
**Addresses:** Live preview, test-send, template save validation (P1 table-stakes features)
**Avoids:** Pitfall 5 (cross-audience data leak / `CREDITUI-04`-class regression — variable catalog must be per-event-type whitelist, never a global "insert any variable" picker); re-point `copy-tenant-neutrality` test at the DB-era path

### Phase 3: Call-Site Sweep
**Rationale:** Mechanical, low-risk migration that actually lets an admin's DB edit take effect; depends on Phase 1, independent of Phase 2.
**Delivers:** The 9 existing `buildNotificationCopy()` call sites pass `copyContext` into `notify()` instead of pre-computing title/body inline.
**Uses:** `NotifyParams.copyContext` extension from Phase 1's resolver design

### Phase 4: Telegram Per-Event Toggle
**Rationale:** Independent of Phases 1-3; depends only on already-shipped Telegram infra (`lib/telegram/client.ts`, `getTelegramConfig`). This is the "~70% built" capability — scope explicitly as outbound-only to sidestep the entire webhook/polling/signature-verification problem set.
**Delivers:** `platform_notification_preferences` table, `lib/notifications/platform-events.ts` catalog (code, not DB — mirrors `EVENT_CATEGORIES`), the toggle gate inside `notifyOps()`, admin toggle UI extending `/admin/integrations`, and sibling `notifyOps()` calls added at the 3 net-new business call sites (signup, payment, quota) alongside 6 already-covered reliability events.
**Implements:** `notifyOps()` modification, Telegram widen (Stack recommendation)
**Avoids:** Pitfall 7 (two-way Telegram traps — stay on `parse_mode: 'HTML'`, no `bot.startPolling()`, no MarkdownV2, defer any inbound webhook to a separate deeper-research phase if ever pursued)

### Phase 5: End-Customer Consent & Opt-Out Infrastructure (hard prerequisite gate)
**Rationale:** Cheap to build correctly now, expensive (legal exposure) to retrofit later. Must land before Phase 6 ships to any real tenant — this is a locked sequencing constraint, not a suggestion.
**Delivers:** New `clients`-scoped consent/suppression columns (opt-in provenance, opt-out timestamp, consent text), a new inbound Twilio webhook processing STOP/START/HELP keyword replies, and an explicit operator/legal decision on Toll-Free vs A2P 10DLC registration for the end-customer sending number.
**Avoids:** Pitfall 10 (HIGH/legal — no consent/opt-out infra exists for the `clients` table today; carrier-level filtering alone does not discharge the sender's own TCPA obligation)

### Phase 6: End-Customer Email/SMS Templates + Send Path
**Rationale:** Depends on Phase 1 (template resolver) and Phase 5 (consent gate must exist first); no existing end-customer copy exists anywhere in the codebase, so the editor is a hard prerequisite, not a parallel track.
**Delivers:** `scope='customer'` template rows, `customer_messages` audit table (modeled on `estimate_deliveries`), a new generic `sendEmail()` primitive (`lib/email/send-raw.ts`) sibling to `sendSms()`, sender-identity resolution (honest "via Xtimator" friendly-from + business name leading SMS body).
**Addresses:** End-customer email/SMS templates, sender-identity resolution (P1 table-stakes features)
**Avoids:** Pitfall 6 (shared Twilio number reputation risk — flag explicitly for an operator decision on a dedicated `from_phone`/Messaging Service before agentic volume rides the same number as 5 other unrelated apps)

### Phase 7: Agentic Send Tool
**Rationale:** Depends on Phase 6 (the underlying send capability must be real, not stubbed) — the WhatsApp/MCP tool is a thin wrapper that cannot be built usefully first. This is the milestone's explicit locked target feature and its highest-risk new surface (first LLM-authored message to a real third party).
**Delivers:** `lib/agent-tools/send-customer-message.ts` (neutral capability, `companyId` closure param), a confirmation-gate state machine mirroring `confirm.ts` (NOT `manage-tools.ts`'s immediate-write shape), `sendCustomerMessageTool` added to WhatsApp MANAGE tools + `intent-router.ts` classifier update, `send_customer_message` MCP write tool.
**Addresses:** Agentic send (P1 differentiator, explicit locked target)
**Avoids:** Pitfall 8 (no confirmation gate — the immediate-write pattern is the wrong one to copy for external, irreversible sends), Pitfall 9 (prompt injection into recipient/amount — resolve `to` from `clients` records and dollar amounts from `estimates`/`compute-totals.ts`, never from LLM free text; mismatch triggers explicit confirmation)

### Phase 8 (deferred, separate later sub-phase): WhatsApp Template Editor Generalization
**Rationale:** Explicitly NOT bundled into Phase 2 — WhatsApp's positional `{{n}}` HSM contract is structurally incompatible with the named-variable editor built for email/SMS/in-app; folding it in unmodified is a documented way to ship a silent garbled-message bug.
**Delivers:** WhatsApp-specific variable editing UI sourced from `variables_schema` (read-only/order-locked), a runtime guard refusing sends where the resolved parameter count doesn't match the approved template.
**Avoids:** Pitfall 3 (WhatsApp positional `{{n}}` mismatch)

### Phase Ordering Rationale

- Phases 1-3 (template foundation, editor, call-site sweep) and Phase 4 (Telegram toggle) are independent tracks that can run in parallel — they share no code, per the architecture research's own "critical path is 1 → 6 → 7/8" framing.
- Phase 5 (consent infra) is inserted as a hard gate before Phase 6, per Pitfalls' explicit HIGH/legal severity flag — this is a sequencing correction on top of the architecture research's build order, which did not itself sequence the consent gate as a blocking step.
- Phase 8 (WhatsApp template generalization) is deliberately separated from Phase 2 rather than treated as "the same editor, one more channel" — this is the single most likely place an implementer would take a shortcut that silently breaks production messages.
- Within the agentic-send track (Phase 7), WhatsApp MANAGE and MCP write-tool integration can ship in either order or in parallel — both bind the same neutral `sendCustomerMessage()` function.

### Research Flags

Needs deeper research during planning:
- **Phase 5 (consent/opt-out infra):** TCPA prior-express-consent basis for transactional vs. broadened agentic content, quiet-hours enforcement, and the Toll-Free vs A2P 10DLC registration decision are legal/operator decisions research could not fully resolve — flag for explicit human sign-off, not silent resolution.
- **Phase 6 (end-customer send + shared Twilio number):** Confirm current Twilio Advanced Opt-Out behavior (whether it requires a Messaging Service specifically — WebSearch did not confirm this explicitly) and re-verify Toll-Free/A2P pricing-timeline claims against the live Twilio Console before committing to a path.
- **Phase 7 (agentic send confirmation gate):** MCP-side confirmation/elicitation round-trip mechanics (per current MCP spec) need verification beyond what this research covered structurally.
- **Phase 8 (WhatsApp template generalization):** Meta Cloud API template parameter validation/rejection behavior — explicitly flagged by Pitfalls research as needing a dedicated deeper-research pass before implementation.

Phases with standard, well-documented patterns (skip `/gsd:research-phase`):
- **Phase 1 (template engine foundation):** Direct generalization of the already-shipped, already-proven `whatsapp-registry.ts` fallback pattern.
- **Phase 2 (template editor UI):** Direct reuse of the shipped `whatsapp-templates-panel.tsx` + `admin-whatsapp-templates.ts` CRUD pattern.
- **Phase 3 (call-site sweep):** Mechanical, each site already has `ctx` in scope.
- **Phase 4 (Telegram toggle):** Extends code already in production since 2026-07-05; outbound-only scope sidesteps every open question.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (Telegram + template engine) / MEDIUM (A2P 10DLC compliance) | Telegram/template findings verified against code already shipped in this repo; SMS compliance verified via WebSearch of official Twilio docs but no Context7 coverage, and the June-2026 `PrivacyPolicyUrl`/`TermsAndConditionsUrl` requirement is date-sensitive — re-verify at actual registration time |
| Features | MEDIUM-HIGH | Grounded in direct codebase inspection (HIGH) for existing foundation; competitor/best-practice claims (Postmark, Customer.io, Twilio Advanced Opt-Out mechanics, Gmail friendly-from stance) are WebSearch/WebFetch-sourced (MEDIUM), with two explicitly flagged LOW-confidence single-source claims |
| Architecture | HIGH | Every claim grounded in a specific file/line read from the current `main` branch — this was an internal integration study, not external-doc-dependent |
| Pitfalls | HIGH (codebase-grounded) / MEDIUM (general platform/legal knowledge) | All 10 pitfalls cite specific repo files/lines; the MEDIUM-confidence layer is general domain knowledge (Meta HSM parameter behavior, Telegram rate limits/MarkdownV2 character set, TCPA transactional-vs-marketing distinctions) not re-verified against fresh official docs this session |

**Overall confidence:** HIGH for what to build and where it slots into the existing codebase; MEDIUM for the compliance specifics (SMS consent basis, A2P/Toll-Free registration details) that require an explicit legal/operator decision rather than more research.

### Gaps to Address

- **End-customer SMS consent legal basis** (transactional vs. marketing framing, required disclosure language, quiet-hours policy): not resolvable by further research alone — needs explicit legal/operator review before Phase 5/6 design is finalized.
- **Toll-Free vs A2P 10DLC decision for the end-customer sending number**, and whether it should be a number/Messaging Service dedicated to this new traffic class separate from the existing owner-notification SMS path: flagged as an explicit human decision in Pitfalls (Pitfall 6, HIGH severity) — do not resolve silently in code.
- **Twilio Advanced Opt-Out's exact dependency on a Messaging Service**: WebSearch summaries did not explicitly confirm this; verify against Twilio's own Advanced Opt-Out docs before deciding whether custom STOP logic is needed alongside carrier-level filtering.
- **Per-admin (vs. per-chat) Telegram routing**: current recommendation is to keep the single-chat-id model; if multiple platform admins with different event subscriptions is actually in scope, the schema (join table vs. flat array) needs to be decided before Phase 4, not migrated later.
- **WhatsApp HSM template editor generalization**: deliberately deferred (Phase 8) pending dedicated research into Meta Cloud API template parameter validation/rejection behavior.

## Sources

### Primary (HIGH confidence)
- Direct repository inspection — `lib/notifications/{dispatch,copy,event-types,whatsapp-registry,preferences}.ts`, `lib/telegram/client.ts`, `lib/observability/ops-alert.ts`, `lib/platform-config.ts`, `lib/sms/client.ts`, `lib/email/notification-emails.ts`, `lib/whatsapp/{confirm,manage-tools,agent-tools,intent-router}.ts`, `lib/agent-tools/{create-estimate,query-company-data}.ts`, `lib/mcp/tools/write.ts`, `app/api/estimates/[id]/send-sms/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/actions/admin-whatsapp-templates.ts`, `supabase/migrations/20260520000002_notifications_system.sql`, `20260621000002_notification_opt_in_consent.sql`, `20260621000003_whatsapp_notification_templates.sql`, `20260519000003_estimate_deliveries.sql`, `tests/unit/notifications/copy-tenant-neutrality.test.ts`
- `npm view` live registry query (grammy/telegraf/mustache/handlebars/twilio versions, 2026-07-21)

### Secondary (MEDIUM confidence)
- [Twilio — Programmable Messaging and A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) — registration requirements, June 30 2026 `PrivacyPolicyUrl`/`TermsAndConditionsUrl` fields
- [Twilio Support — Advanced Opt-Out for Messaging Services](https://support.twilio.com/hc/en-us/articles/360034798533-Getting-Started-with-Advanced-Opt-Out-for-Messaging-Services)
- [Twilio Toll-Free / A2P 10DLC docs](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding), [10DLC docs](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)
- [Resend webhook event types](https://resend.com/docs/dashboard/webhooks/event-types), [Twilio outbound message status tracking](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status)
- [Postmark transactional email best practices](https://postmarkapp.com/guides/transactional-email-best-practices), [Customer.io transactional email / code editor docs](https://docs.customer.io/journeys/send/transactional/email/)
- [Telegram Bot API rate limits](https://botnamefinder.com/blog/telegram-bot-rate-limits-explained), [grammY vs Telegraf comparison](https://grammy.dev/resources/comparison)
- [Multi-tenant email deliverability — MailerSend](https://www.mailersend.com/blog/multi-tenant-email-sending), [MailChannels](https://www.mailchannels.com/multi-tenant-email-deliverability/)

### Tertiary (LOW confidence, flagged for validation if load-bearing)
- Twilio Advanced Opt-Out's specific requirement of a Messaging Service to auto-handle STOP/START/HELP — not independently confirmed
- Gmail's stricter stance against deceptive friendly-from naming — sourced from a single WebSearch summary of a MailerSend blog post, not Google's own sender guidelines

---
*Research completed: 2026-07-21*
*Ready for roadmap: yes*
