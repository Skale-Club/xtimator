# Pitfalls Research

**Domain:** Multi-audience notification center (Telegram platform-ops bot + DB-driven editable templates + end-customer email/SMS + agentic send) added to a live, multi-tenant SaaS notification pipeline
**Milestone:** v4.21 Notification Center
**Researched:** 2026-07-21
**Confidence:** HIGH — every pitfall below is grounded in direct inspection of the current Xtimator codebase (file/line citations included), not generic domain knowledge. Where a claim relies on general TCPA/A2P/Telegram-API domain knowledge rather than a codebase fact, it is flagged MEDIUM and called out in Sources.

## Critical Pitfalls

### Pitfall 1: The DB template lookup silently drops TypeScript's exhaustiveness safety net

**What goes wrong:**
`lib/notifications/copy.ts`'s `buildNotificationCopy` is a `switch` over the `EventType` union with **no `default` case** — if a new `EventType` is added to the union without a matching `case`, `tsc` fails the build. That is the only thing today preventing a "new event, forgotten copy" bug. The moment `copy.ts` becomes a DB lookup (`SELECT body FROM notification_templates WHERE event_type = ...`), that compile-time guarantee disappears — a missing row is now a **runtime** condition, not a build failure. `tests/unit/notifications/event-sources.test.ts` and `copy-tenant-neutrality.test.ts` currently assert against the hardcoded strings; both silently stop testing anything meaningful once `copy.ts` becomes a thin DB-fetch shim, unless they're rewritten to seed/assert against the DB-driven path.

**Why it happens:**
Moving from a compiled switch to a DB table trades a compile-time contract for a runtime one, and it's easy to ship the DB read path without also shipping (a) a seed migration populating a row for every existing `EventType`, and (b) a CI check that every `EventType` has a corresponding seeded template row.

**How to avoid:**
- Ship one migration that seeds a template row for **every** current `EventType` (source the copy from the current `copy.ts` switch verbatim — a byte-identical seed, not a rewrite) before the dispatch path is switched to read from the DB.
- Add a CI-run test (in the already-configured `vitest run tests/unit` scope per `tsconfig.ci.json`) that diffs `Object.keys(EVENT_CATEGORIES)` (still a compiled TS source) against the seeded DB template rows, so a new `EventType` with no template is a red CI, not a silent runtime gap.
- Keep the hardcoded `copy.ts` strings as the **fallback** (see Pitfall 2), not delete them.

**Warning signs:**
- Any new `EventType` added to `lib/notifications/event-types.ts` without a paired template-editor row.
- `notify()` sending a blank/undefined title or body in production logs.

**Phase to address:**
Schema/foundation phase (the phase that introduces `notification_templates` and migrates `copy.ts` off the hardcoded switch) — this is a day-one guard, not late polish.

---

### Pitfall 2: No missing-template fallback means a bad admin edit blocks or blanks a live send

**What goes wrong:**
`notify()` is explicitly designed to **never throw and never block the business operation that triggered it** (its own doc comment: "A failure to write a notification MUST NOT break the business operation"). If the new DB template lookup returns `null` (row deleted, unpublished, or a variable substitution throws on a malformed `{{ref}}`) and there's no fallback, two bad outcomes are equally likely depending on how the migration is written: (a) the whole `notify()` call throws inside a `try/catch` that was written assuming `buildNotificationCopy` is synchronous and total (it always returns something today — see the guideline in `copy.ts`'s own header: "even when `ctx` fields are missing the function still returns a coherent sentence... never throws"), or (b) it silently sends an empty-subject/empty-body email or SMS to a real end customer.

**Why it happens:**
`copy.ts`'s current contract — "defensive defaults, never throws, always coherent" — is easy to lose the moment the function becomes `async` and DB-backed, because the natural implementation (`const row = await getTemplate(eventType); return { title: row.title, body: interpolate(row.body, ctx) }`) has no defined behavior for `row === null`.

**How to avoid:**
Mirror the fallback pattern this codebase **already built and shipped** for exactly this problem: `lib/notifications/whatsapp-registry.ts`'s `getApprovedTemplateForEvent()` — DB row missing/unapproved → falls back to the static `REGISTRY` map → `null` is a safe, silent no-op branch upstream. Do the same for the new generalized template system: DB row missing/malformed → fall back to the **retained** hardcoded `copy.ts` switch (don't delete it, demote it to `DEFAULT_COPY`) → only if that somehow also fails, skip the channel rather than send blank content or throw.

**Warning signs:**
- Any end-customer or admin-facing message that arrives with an empty body/subject.
- `notify()`'s try/catch swallowing an error that used to be impossible (synchronous, total function) and is now possible (async DB read that can reject).

**Phase to address:**
Template-engine phase (same phase as Pitfall 1) — the fallback discipline has to exist before ANY channel is cut over to DB-sourced copy, tenant-facing or customer-facing.

---

### Pitfall 3: Editable `{{var}}` templates break the WhatsApp HSM's positional `{{n}}` contract

**What goes wrong:**
`lib/notifications/whatsapp-registry.ts` already shows the exact seam where this breaks: every WhatsApp send goes through a `variables: (payload) => string[]` **projector function** that turns named fields into an **ordered** array (`titleBodyVars` → `[title, body]`) matching Meta's positional `{{1}}`, `{{2}}` placeholders in the pre-approved HSM template. Meta's API has no concept of named variables — it is strictly positional, and a WhatsApp template edit/approval is a slow, external, human-reviewed process (Meta Business Manager), unlike the same-request DB writes for email/SMS/in-app. If the new template editor lets a super-admin edit an event's variable list (add/remove/reorder `{{client_name}}`, `{{estimate_number}}`, …) as if it applies uniformly across all four channels, one of two things breaks silently for WhatsApp specifically: (a) the ordered array sent to Meta no longer matches what the *already-approved* HSM template expects (right count, wrong order → the wrong values land in the wrong slots of a real customer/owner message, with **no error from Meta** — a reordering send doesn't fail, it just says something wrong), or (b) the count changes (a variable added/removed) and Meta **rejects** the send outright because the approved template's `{{n}}` count doesn't match.

**Why it happens:**
Email/SMS/in-app template bodies are freeform strings where `{{var}}` can appear anywhere, any number of times, in any order — trivially editable. WhatsApp HSM bodies are **not editable at all** post-approval; only the *values* plugged into the fixed `{{n}}` slots can change. Building one "generic template editor" UI without modeling this distinction lets someone edit a WhatsApp-backed event's variable list as freely as an email one.

**How to avoid:**
- Treat WhatsApp as structurally different in the schema: the template editor's variable list for a WhatsApp-mapped event should be **read-only / order-locked**, sourced from `variables_schema` (the column that already exists on `whatsapp_notification_templates` but is currently unused by `getApprovedTemplateForEvent`, which still hardcodes `titleBodyVars`) — not from the same free-text `{{var}}` body editor used for email/SMS.
- Any change to a WhatsApp event's variable *set* must be gated on "has a matching Meta-approved template been registered with this exact `{{n}}` count," not just saved to the DB.
- Add a runtime guard in the WhatsApp send path: if the resolved `variables()` array length doesn't match the DB template's `variables_schema.length`, refuse the send and log/alert rather than fire a garbled message.

**Warning signs:**
- A WhatsApp send succeeding (200 from Meta) but the delivered message showing values in the wrong field (e.g., estimate number where the client name should be).
- Meta returning a template-parameter-count error after an "unrelated" template-editor save.

**Phase to address:**
The phase that generalizes the template editor to cover WhatsApp (should be scoped as its own sub-phase, later than the email/SMS/in-app editor, precisely because of this structural mismatch) — flag for deeper research (Meta Cloud API template parameter validation behavior) before implementation.

---

### Pitfall 4: Template-body HTML injection through un-escaped variable substitution

**What goes wrong:**
The existing email renderer (`lib/email/notification-emails.ts`) hand-rolls `escapeHtml()` and calls it on every piece of dynamic content (`item.title`, `item.body`, `ctx.toName`, `ctx.branding.businessName`) **before** splicing it into the HTML string. That discipline is easy to lose once template *bodies themselves* become admin-authored strings containing `{{client_name}}`-style placeholders: a naive `template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))` executed on the final HTML string does NOT escape the substituted *values* — and those values include tenant/customer-supplied free text (`clientName`, `projectName`, `errorMessage`) that can legitimately contain `<`, `>`, `&`, or a stray `"` (e.g., a client literally named `<script>` in a CRM demo, or an AI-classified `jobType`/`errorMessage` string echoing raw content). Because the *template* is trusted (super-admin authored) but the *variable values* are not, the injection point is specifically the value-substitution step, not the template text.

**Why it happens:**
It's natural to treat "the template editor is admin-only, so it's trusted" as license to skip escaping — but the vulnerable step isn't the template, it's the values plugged in at send time, which can originate from tenant or end-customer input.

**How to avoid:**
- Build one shared `renderTemplate(body: string, vars: Record<string,string>): string` used by every HTML-emitting channel (email digest, future customer-facing email), where the substitution step HTML-escapes every value the same way `notification-emails.ts` already escapes computed fields today.
- Keep plain-text channels (SMS, Telegram body) on a *different*, non-HTML-escaping substitution path — escaping HTML entities into an SMS would show literal `&amp;` to a customer. Two renderers, not one, driven by channel type.
- For Telegram specifically, `lib/telegram/client.ts` and `lib/observability/ops-alert.ts` already use `parse_mode: 'HTML'` with hand-rolled `&`/`<`/`>` escaping (see `formatOpsMessage`) — the new template system's Telegram renderer must reuse that exact escaping, not a fresh implementation, and must NOT switch to MarkdownV2 without also escaping MarkdownV2's much larger reserved-character set (`` _*[]()~`>#+-=|{}.! ``) — a common Telegram-bot mistake (see Pitfall 7).

**Warning signs:**
- Any customer-supplied or tenant-supplied field (`clientName`, `projectName`) rendering literally instead of escaped in a saved-template preview.
- A support/admin report of a malformed or broken-looking email where a client name contained a special character.

**Phase to address:**
Template-rendering-engine phase, before any customer-facing (end-customer email) template goes live — this is the highest-severity item in that phase's own scope because end-customer emails are the least-monitored, least-reversible channel (once sent, it's sent).

---

### Pitfall 5: Cross-audience template editing leaks internal data or breaks a locked tenant-neutrality invariant

**What goes wrong:**
The milestone explicitly puts platform-admin (Telegram), tenant (in-app/email/WhatsApp/SMS), and end-customer (email/SMS) templates in **one shared, platform-wide, super-admin-only editor** with **no tenant overrides** (a locked decision). Two concrete existing invariants are easy to violate through this shared surface:
1. `tests/unit/notifications/copy-tenant-neutrality.test.ts` locks in that `admin.bonus_credits_granted`'s body **must never contain a digit**, regardless of `ctx.credits` — a real, already-shipped business rule (CREDITUI-04: tenants never see raw credit counts, only a % bar). A DB-editable template with a `{{credits}}` variable exposed in that event's variable catalog would let a future super-admin trivially reintroduce the exact regression that shipped-and-was-fixed in v4.15/v4.17.
2. A shared variable catalog across audiences risks a platform-admin event's internal fields (real $ cost, internal company UUID, AI error stack trace) being copy-pasted into an end-customer-facing template body, leaking data that should never leave the platform-admin/Telegram channel.

**Why it happens:**
One editor UI for three audiences is efficient to build but erases the audience boundary that used to be enforced by separate hardcoded functions/files. Nothing in a generic `{{var}}` textarea stops an admin from typing a variable name that happens to resolve to sensitive data for that event.

**How to avoid:**
- Scope the variable catalog **per event type**, not globally — the editor should only ever offer the whitelisted variable names valid for that specific event (mirroring how `CopyContext` today is one big optional-fields interface, but each `case` in `copy.ts` only reaches into 2-3 of them). Never expose a global "insert any variable" picker.
- For any event with a locked business-rule constraint (like `admin.bonus_credits_granted`), simply never add the sensitive field to that event's variable catalog at all — the safest enforcement is "the variable doesn't exist to insert," not a runtime content filter.
- Keep the existing test as a live regression gate — since the value now comes from a DB row instead of a compiled string, the test needs to be re-pointed at whatever the DB seed/default for that event is, so it keeps failing CI if that default (or the catalog) regresses.
- Since this is a single platform-wide edit with no tenant override and no staging, treat every save as an instant production change across every tenant and every future send — a preview + "send test to myself" step (per the milestone context's own PITFALLS-relevant framing) is materially more important here than in a per-tenant-scoped feature.

**Warning signs:**
- A pull request adding a new variable to an existing event's catalog without a corresponding audience-boundary review.
- The `copy-tenant-neutrality` test (or its DB-era successor) going red.

**Phase to address:**
Template-editor UI phase — the variable-catalog design (event-scoped, not global) is a schema/data-model decision that should be locked in the same phase the `notification_templates` table is designed, not retrofitted after the editor ships.

---

### Pitfall 6: The shared, platform-wide Twilio number's reputation is one blast radius for six unrelated apps

**What goes wrong:**
`getTwilioConfig()` reads exactly **one row** from `platform_integrations` (`provider = 'twilio'`) — one Account SID, one Auth Token, one `from_phone` — used for every tenant's every SMS send today (`app/api/estimates/[id]/send-sms/route.ts`). Per project memory, this same Twilio account is **already shared across 6 apps and 3 databases** (Xtimator, Xphere×2, Xkedule, skaleclub-websites×2). This milestone adds (a) end-customer SMS as a first-class, template-driven feature and (b) **agentic send** — an LLM-triggered, ad-hoc SMS send path with no fixed message catalog. Both multiply the volume and unpredictability of traffic through that single shared number. US carriers (via A2P 10DLC or toll-free verification) evaluate spam/complaint signals **per sending number/campaign**, not per tenant or per app — a spike in complaint rate or unregistered use-case drift from Xtimator's agentic-send traffic can get that shared number throttled or blocked by carriers, silently breaking SMS for Xtimator's other tenants AND for the five other unrelated apps sharing the same Twilio account.

**Why it happens:**
The current architecture (one platform-level Twilio config, no per-tenant or per-purpose number) was fine when SMS was a single templated "here's your estimate link" send. Agentic, freeform, higher-volume end-customer SMS is a materially different traffic profile riding the same infrastructure without anyone re-evaluating the shared-resource risk.

**How to avoid:**
- Flag explicitly for the owner/operator: agentic SMS send volume needs A2P 10DLC campaign registration (or a dedicated Messaging Service) that reflects the *actual* new use-case (conversational/agentic business messaging, not just "estimate delivery notifications") — the existing registration (if any) may not legally or technically cover this new pattern.
- Consider (as a design question to raise, not a decision to make silently) whether end-customer/agentic SMS should ride a **separate** `from_phone` / Messaging Service SID from the existing owner-notification SMS path, so a reputation hit on one doesn't take down the other — this only requires a second `metadata` field on the same `platform_integrations` row or a second provider key, consistent with the existing pattern.
- Do not treat this as purely a code problem — it needs an explicit owner decision + Twilio Console action before agentic SMS ships to any real tenant.

**Warning signs:**
- Twilio delivery status callbacks (if added) showing a rising `undelivered`/`failed` rate.
- Any of the other 5 apps sharing the account reporting SMS delivery problems that coincide with an Xtimator SMS volume change.

**Phase to address:**
Should be raised and decided in the phase that builds end-customer SMS + agentic send — this is a "needs deeper research + an explicit human decision" flag, not something to default silently. **Severity: HIGH.**

---

### Pitfall 7: Telegram bot built as two-way (webhook + commands) inherits serverless/polling and MarkdownV2 traps if copied naively

**What goes wrong:**
Xtimator already has a **one-way, fire-and-forget** Telegram integration (`lib/telegram/client.ts` + `lib/observability/ops-alert.ts`): single bot token, single hardcoded `chat_id`, outbound `sendMessage` only, `parse_mode: 'HTML'` with manual escaping. This milestone's "ALL platform events covered with per-event toggles in the admin panel" is an extension of that outbound-only model, and does NOT by itself require inbound webhook handling. But if implementation reaches for two-way interactivity (admins replying/acting from Telegram, or a `/start` binding flow to register a chat_id) without deliberate design, several concrete traps apply to THIS deployment (a persistent Docker container on Coolify — not Vercel edge, but also not a bot-framework-managed process):
- **Polling mode is architecturally wrong here.** There is no long-running "start a polling loop at boot" slot in a Next.js App Router server — the only durable background-execution mechanism in this codebase is Inngest (used for every async fan-out today: `notification-channel-send`, cron jobs). Reaching for a library's default `bot.startPolling()` either does nothing (no process ever calls it) or, if force-fit into a route handler, can register duplicate `getUpdates` pollers across container restarts/replicas and trigger Telegram's `409: terminated by other getUpdates request` conflict.
- **Webhook is the correct model** and there's a direct precedent to mirror: `app/api/webhooks/whatsapp/route.ts` verifies `x-hub-signature-256` against `META_WHATSAPP_APP_SECRET`. Telegram's equivalent is `setWebhook`'s `secret_token` parameter, checked against the `X-Telegram-Bot-Api-Secret-Token` header on every inbound POST — skipping this leaves `/api/webhooks/telegram` (once built) as an open POST endpoint anyone can spoof to inject fake bot updates.
- **The precedent itself is a trap for this project's own hard rule:** the existing WhatsApp webhook secret (`META_WHATSAPP_APP_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`) is stored as a plain **env var**, not in `platform_integrations` — inconsistent with the project's stated rule ("provider credentials live encrypted in the DB... NEVER env vars"). Copying that pattern verbatim for a new Telegram webhook secret repeats the inconsistency; the bot token already correctly lives in `platform_integrations` via `getTelegramConfig()` (with an explicit env fallback marked "dev only") — any new webhook `secret_token` should follow that same DB-encrypted pattern, not the WhatsApp webhook's env-var precedent.
- **MarkdownV2 escaping hell** only applies if/when the renderer switches from `parse_mode: 'HTML'` (current, simple 3-character escape set: `&<>`) to `MarkdownV2` (a much larger reserved set), which is often reached for because it looks nicer for bold/links — every dynamic value (client names, error messages, estimate numbers containing `.` or `-`) then needs full MarkdownV2 escaping or Telegram returns a 400 `can't parse entities`. **Recommendation: stay on HTML `parse_mode`** (already proven, already escaped correctly in `formatOpsMessage`) rather than introduce MarkdownV2 for the richer per-event template system.
- **Chat-id binding is fragile.** The current single hardcoded `chat_id` in `metadata` assumes one admin/one chat. If a group chat is used and later "upgraded" to a Telegram supergroup, Telegram issues a **new** negative chat_id (`-100xxxxxxxx`) — the old stored id starts failing silently (Telegram returns `chat not found`, and `sendTelegramMessage` throws — currently swallowed by `notifyOps`'s catch, meaning delivery could go dark with no visible failure signal for weeks). If the milestone moves to multiple admins/chat_ids, this needs an explicit re-verification step surfaced in the admin panel, not just "save and hope."
- **Rate limits.** Telegram's Bot API caps outbound messages to roughly 30/sec globally and ~1/sec per chat_id (lower for groups). Fanning out many platform events (tenant signups, job failures, quota alerts) through per-event toggles into ONE chat with no batching/queueing can hit `429 Too Many Requests` under a burst (e.g., a mass failure incident generating many alerts at once — precisely the moment reliable delivery matters most).

**Why it happens:**
The existing dormant Telegram integration was scoped narrowly (ops alerts only, one admin, outbound only) and its simplicity hides all of the above until the surface area grows (more events, more admins, interactivity).

**How to avoid:**
- Keep the bot outbound-only (matches the milestone's literal scope — "platform events delivered to Xtimator admins") unless two-way interactivity is explicitly required; this sidesteps the webhook/polling/signature questions entirely for v1.
- If/when interactivity is added: webhook route + `secret_token` stored in `platform_integrations` (not env) + dispatch through Inngest, exactly mirroring the WhatsApp webhook + `notification-channel-send` pattern already proven in this codebase.
- Stay on `parse_mode: 'HTML'`, reuse `formatOpsMessage`'s escaping.
- Add a lightweight send queue/backoff (even a simple per-chat token-bucket, since Inngest already provides retry/backoff primitives used elsewhere) before fanning many per-event toggles into a burst of individual `sendMessage` calls.
- Surface chat_id health in the admin panel (last successful send timestamp) so a silently-broken binding is visible, not just swallowed by `notifyOps`'s catch-all.

**Warning signs:**
- `notifyOps`/Telegram send logs showing repeated swallowed errors (currently invisible — nothing surfaces them today).
- A burst of platform events (e.g., a mass job failure) correlating with missing Telegram alerts.

**Phase to address:**
The Telegram-channel phase — scope it explicitly as outbound-only + per-event-toggle first; flag two-way interactivity as a separate, deeper-research phase if it's ever pursued.

---

### Pitfall 8: Agentic send has no confirmation-gate precedent to inherit, and the existing "write-immediately" pattern is the wrong one to copy

**What goes wrong:**
This codebase has TWO existing patterns for LLM-triggered writes, and they are **not interchangeable**:
1. `lib/whatsapp/manage-tools.ts` (`add_service`, `add_knowledge`) — writes immediately, no confirmation turn, because the action is internal, reversible, and same-tenant (adding a price-book entry).
2. `lib/whatsapp/confirm.ts` + `agent.ts` + `confirm-actions.ts`'s `actionSend` — sending an estimate to an **external party** (the client) goes through a dedicated `awaiting_confirm` session state machine: the estimate must reach a confirmed draft state before `actionSend` ever fires, and even then it only fires from within that gated flow.

"Send an SMS/email to my client about X" (the new agentic-send feature) is squarely in the second category — external recipient, real cost, real reputational/compliance exposure (TCPA), irreversible once sent — yet it's a brand-new capability being added at the same time as the general "LLM writes tools" pattern is being extended, making it easy for an implementer to reach for the *simpler*, already-familiar `manage-tools.ts`-style immediate-write pattern (less code, fewer states to manage) rather than the *correct*, heavier `confirm.ts`-style gated pattern. There is no existing single "send a message to an external party via natural-language request" tool to copy from directly — `actionSend` sends a *pre-existing estimate*, not an arbitrary agent-composed message, so the new tool also needs its own confirmation UX designed, not just wired.

**Why it happens:**
The two patterns coexist in the same file family with no enforced convention distinguishing "internal, reversible" from "external, cost-bearing, irreversible" — the distinction lives only in code comments and the specific choices made in `confirm-actions.ts`, not in a reusable abstraction.

**How to avoid:**
- Explicitly classify the new send-SMS/send-email agentic tool as an "external-party, confirm-required" action from the design phase, and reuse the `confirm.ts`/session-state-machine shape (or, for the MCP channel, an equivalent explicit `confirm: true` round-trip / `elicitation` step per the MCP spec) rather than the `manage-tools.ts` immediate-write shape.
- The confirmation echo must show the **actual resolved recipient (phone/email) and message body** before send, not just "yes I'll send it" — because the recipient identity itself can be attacker/hallucination-influenced (see Pitfall 9).
- For the MCP channel, mark the send tool with an explicit non-`readOnlyHint` and require a confirmation step distinct from the existing read-only query tools (`ask_knowledge`, `find_client`, etc., which are `readOnlyHint: true` and rightly need none).

**Warning signs:**
- A send-SMS/send-email tool implementation that fires on the first LLM tool-call with no intermediate "confirm?" turn.
- No audit trail entry distinguishing "owner explicitly confirmed this send" from "agent inferred and sent."

**Phase to address:**
The agentic-send phase itself — this is core to that phase's design, not a follow-up hardening pass.

---

### Pitfall 9: Prompt injection can put a wrong recipient or a wrong dollar amount into a real send

**What goes wrong:**
The codebase's established security discipline (`T-lrf-01`, enforced in `manage-tools.ts`'s header comment) protects the **tenant boundary** — `companyId` is a closure parameter, never an LLM-controllable field, so a malicious message can't make the agent write into another company's data. It does **not**, by itself, protect the **content** of an agentic send: the recipient phone/email and the dollar amount/message body are exactly the kind of free-text fields an LLM tool schema would naturally expose (`z.object({ to: z.string(), message: z.string() })`), and those ARE influenceable by adversarial input. Two concrete injection surfaces exist for this exact feature:
1. **Inbound WhatsApp text is untrusted content the agent reads.** If a scammer texts the owner's WhatsApp number (or the owner forwards/pastes suspicious text) containing something like "also text +1-555-0100 that the deposit account changed to X," an agent with a send-SMS tool and no re-validation could act on attacker-supplied instructions embedded in what looks like ordinary conversation — the same class of risk the v4.8 knowledge base work already named and defended against ("curated ≠ trusted as LLM context," `sanitizeField` + `<knowledge>` tag hardening) for a *different* input surface (RAG retrieval). Agentic send is a new surface with no equivalent hardening yet.
2. **Dollar amounts must never be freely typed by the model.** This project has a hard, repeatedly-enforced rule that the AI never computes/originates money math (GUARD-03, and the v4.11 "AI gained ZERO arithmetic" design principle for the pricing engine) — any agentic-send message that mentions an amount ("your balance due is $X") must pull that number from the server-authoritative `estimates.total`/`balance_due` field, never let the LLM state a number from its own context window.

**Why it happens:**
Extending "the agent can write things" naturally extends to "the agent can compose message text," and unlike DB writes (which go through typed columns with constraints), free-text message bodies have no structural check that a number or a phone/email actually corresponds to a real system record.

**How to avoid:**
- The send tool's recipient should be resolved from the **system's own client record** (`clients.phone`/email on the associated project), not a phone/email number typed fresh into the tool call by the LLM from conversation text — if the request names a different number, treat it as a mismatch requiring explicit owner confirmation ("this isn't the phone number on file for this client — send anyway?"), not silent pass-through.
- Any dollar figure interpolated into an agentic-send message must be sourced from the authoritative `estimates`/`compute-totals.ts` fields, never emitted as free text by the model.
- The confirmation echo (Pitfall 8) is the actual enforcement point — showing the resolved-from-DB recipient and amount before send makes a mismatch visible to the human in the loop.

**Warning signs:**
- A send tool whose zod schema accepts an arbitrary `to` string with no cross-check against `clients` records.
- Any agentic message template that string-interpolates a number the model produced rather than one read from a DB column.

**Phase to address:**
Agentic-send phase — same phase as Pitfall 8, this is the content-integrity half of the same confirmation-gate design.

---

### Pitfall 10: End-customer SMS has zero consent/opt-out infrastructure to build on — this is new legal surface, not an extension of existing TCPA work

**What goes wrong:**
The project already has real, working TCPA-consent scaffolding — but it is scoped **entirely to the tenant/owner**: `notification_preferences.sms_opt_in_at` / `whatsapp_opt_in_at` / `sms_opt_in_consent_text` (migration `20260621000002_notification_opt_in_consent.sql`, enforced in `resolveChannels()`) gate whether *Xtimator sends SMS/WhatsApp to a business owner*. There is **no equivalent column anywhere on `clients`** (the end-customer table) and **no inbound Twilio webhook** in the codebase at all — the only Twilio integration today is the outbound `sendSms()` primitive. That means:
- There is currently no mechanism to capture, store, or honor a `STOP` reply from an end customer. Twilio's carrier-level auto-block (via Advanced Opt-Out on a registered number/Messaging Service) is a separate, external layer from Xtimator's own application logic — even if Twilio blocks future carrier delivery, Xtimator's own retry/reminder/agentic-send logic has no application-level suppression list and could keep *attempting* sends (burning API calls, and legally the business — not just Twilio — is on the hook for TCPA compliance, which requires the *sender* to honor opt-out, not just rely on carrier filtering).
- "Prior express consent" for informational/transactional SMS tied to a service the customer already requested (an estimate) is a materially different legal footing than marketing SMS, but the agentic-send feature broadens *what* gets sent (open-ended "send an SMS about X") in a way that can drift from narrow transactional content toward something needing stronger consent — and there's no design decision recorded yet about which bucket end-customer messages fall into.
- Quiet-hours (many states restrict unsolicited texts to certain hours) and message-frequency norms have no enforcement point today — `sendSms()` is a pure passthrough with no time-of-day or frequency gate.

**Why it happens:**
End-customer messaging is genuinely new (today's only end-customer SMS is the manual "send my estimate link" action, a single one-off, low-risk send) — the existing consent infrastructure was correctly scoped to the *owner* channel (paid/proactive, TCPA-relevant) and was never meant to cover the *customer* channel, but it's easy to assume "we already solved TCPA" when only half the surface was solved.

**How to avoid:**
- Treat end-customer SMS/email consent as a **net-new data model decision**, not a reuse of `notification_preferences` — needs its own column(s) on `clients` (or a join table) for opt-in provenance, opt-out timestamp, and consent text shown.
- Build the inbound Twilio webhook (there is none today) specifically to capture `STOP`/`START`/`HELP` keyword replies and write them to that new suppression state — and gate every outbound end-customer SMS send (including agentic ones) on checking it first, independent of whatever Twilio/carrier-level filtering may or may not be active.
- Flag this explicitly for legal/compliance review before end-customer SMS ships broadly — this file can name the technical gaps but the actual consent-basis decision (transactional vs. marketing framing, required disclosure language, quiet-hours policy) is a business/legal decision, not a pure engineering one.
- Email has a materially lower bar (CAN-SPAM vs. TCPA) but still needs an unsubscribe path if end-customer email becomes template-driven and recurring rather than one-off transactional.

**Warning signs:**
- Any end-customer SMS send path that doesn't check a suppression flag before sending.
- No inbound SMS webhook existing at all (true today — confirm this gap is closed before end-customer SMS volume grows).

**Phase to address:**
Should be its own early phase (or a hard prerequisite gate before the end-customer-SMS and agentic-send phases) — this is exactly the kind of item that's cheap to get right in the schema/foundation phase and expensive (legal exposure, not just a bug) to retrofit later. **Severity: HIGH / legal.**

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Ship the DB template editor for email/SMS/in-app first, defer WhatsApp's structural `{{n}}` mismatch (Pitfall 3) to "later" | Faster v1 ship | WhatsApp stays on the static registry, or someone "generalizes" it without noticing the positional-vs-named mismatch and ships a silent garbled-message bug | Acceptable if explicitly scoped as a separate later phase, NOT if the same editor UI is reused unmodified for WhatsApp |
| Reuse `manage-tools.ts`'s immediate-write pattern for agentic send instead of building a confirm-gate (Pitfall 8) | Less code, faster ship | Real cost-bearing sends to real external parties with no undo, no confirmation, higher fraud/injection exposure | Never acceptable for the send-to-end-customer tool |
| Skip building end-customer STOP/opt-out infra for the first end-customer SMS rollout, relying on Twilio's registered-number-level filtering alone (Pitfall 10) | Ships faster | TCPA exposure is a per-sender legal obligation, not fully discharged by carrier-level filtering; also no app-level suppression means agentic-send could re-attempt indefinitely | Only acceptable for a very narrow, fixed-content, one-off transactional send (today's manual "send estimate link" SMS) — NOT acceptable once agentic/open-ended send ships |
| Keep the Telegram bot outbound-only for v1, defer webhook/interactivity | Sidesteps the whole webhook-secret/polling/signature-verification problem set (Pitfall 7) | None if genuinely deferred — this is the recommended path, not a debt | Always acceptable; this is the RECOMMENDED default for v1 |
| Let the super-admin template editor expose every `CopyContext` field as a variable for every event, rather than a per-event whitelist (Pitfall 5) | Simpler UI, less schema design | Reintroduces fixed business-rule regressions (CREDITUI-04-class bugs) and cross-audience data leaks | Never acceptable |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Meta WhatsApp HSM templates | Treating the new template editor's variable list as freely reorderable/editable, same as email | Lock WhatsApp variable order/count to the Meta-approved template's `variables_schema`; any change requires re-approval in Meta Business Manager first |
| Telegram Bot API | Reaching for `bot.startPolling()` inside a Next.js route/server with no persistent worker slot; or switching to MarkdownV2 for richer formatting without full escaping | Webhook + `secret_token` + Inngest dispatch (mirrors the existing WhatsApp webhook pattern); stay on `parse_mode: 'HTML'` with the existing `formatOpsMessage`-style escaping |
| Twilio SMS (shared platform-level account) | Assuming the current single global `from_phone`/Account SID can absorb new, higher-volume, unpredictable agentic-send traffic without any carrier-registration or reputation review | Flag explicitly for A2P 10DLC/Messaging-Service review before agentic SMS ships; consider a dedicated `from_phone`/Messaging Service for this new traffic class, separate from the existing owner-notification SMS |
| Resend email | Interpolating admin-authored template `{{var}}` placeholders into the final HTML string without escaping the *substituted values* | Reuse the existing `escapeHtml()` discipline from `notification-emails.ts` in the new generic template renderer, applied to values, not template text |
| `platform_integrations` (encrypted credential store) | Copying the WhatsApp webhook precedent (`META_WHATSAPP_APP_SECRET` in env) for a new Telegram webhook secret | Any new secret — including webhook `secret_token`s, not just API keys — goes in `platform_integrations`, following `getTelegramConfig()`'s existing pattern, not the WhatsApp webhook's env-var precedent |
| MCP send tool | Registering the agentic send tool with `readOnlyHint: true` (copy-pasted from the existing read-only query tools) or with no confirmation step at all | Explicitly non-read-only, with a confirmation/elicitation round-trip before the actual send fires |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Fanning many per-event Telegram toggles into individual `sendMessage` calls with no batching | `429 Too Many Requests` from Telegram during incident bursts (exactly when alerting matters most) | Queue/backoff via Inngest (already the durable-job layer in this codebase) rather than calling `sendTelegramMessage` inline per event | A burst of more than ~1/sec to the same chat_id, or more than ~30/sec globally |
| `sendPerMinute` rate limit (`lib/ratelimit.ts`, keyed on Supabase `claims.sub`) not applying to WhatsApp-agent-triggered or MCP-triggered sends (those channels have no `claims.sub`) | Agentic send from WhatsApp/MCP has no rate limit at all, unlike the web-app send-SMS route | Add a companyId-scoped (not user-session-scoped) rate limit specifically for the agentic-send tool, reusing `lib/ratelimit.ts`'s existing limit-config shape | As soon as the agentic-send tool ships without its own explicit rate-limit key |
| Template-render cost: re-fetching/re-parsing a DB template row on every single `notify()` call instead of caching | Added DB round-trip latency on every notification fan-out (today `copy.ts` is a pure in-memory function call) | Apply the same 30s TTL in-memory cache pattern already used for `platform-config.ts` (`brandingCache`, `integrationCache`) to template rows | Noticeable once notification volume is meaningful; low risk at current scale but cheap to prevent now by following the existing cache convention |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Un-escaped `{{var}}` substitution into email HTML (Pitfall 4) | HTML injection in owner/admin inboxes; potential stored-XSS if a template preview ever renders unescaped in the admin panel itself | Shared, escaping-by-default `renderTemplate()` for HTML channels; separate plain renderer for SMS/Telegram |
| Telegram webhook route (if built) with no `secret_token` verification | Anyone can POST fake "Telegram updates" to the endpoint, potentially triggering agent actions if it's ever wired to trigger anything beyond logging | `X-Telegram-Bot-Api-Secret-Token` header check against a DB-stored secret, mirroring the WhatsApp `x-hub-signature-256` pattern (but store the secret correctly this time — see Integration Gotchas) |
| Recipient/amount for agentic send taken from LLM free text instead of DB records (Pitfall 9) | Prompt-injection-driven message to a wrong number/email, or a hallucinated dollar amount reaching a real customer | Resolve recipient from `clients` records, resolve amounts from `estimates`/`compute-totals.ts`; mismatch triggers explicit confirmation, not silent pass-through |
| Template editor exposing internal/sensitive variables (real cost, internal IDs, stack traces) in a catalog shared across platform-admin and end-customer event types (Pitfall 5) | Data leak to a tenant or end customer via an incorrectly-scoped template edit | Per-event-type variable whitelist, never a global "any variable" picker |
| Telegram bot token or webhook secret placed in an env var "for convenience" during implementation | Violates the project's standing rule (never env for provider credentials) and creates a second, inconsistent credential-storage pattern to maintain | All Telegram secrets — bot token AND any webhook secret — via `platform_integrations`, following the already-correct `getTelegramConfig()` precedent |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| No preview/test-send before saving a template edit that's instantly live for every tenant (platform-wide, no staging — a locked decision) | A typo'd `{{var}}` reference or a broken layout goes out to real customers on the very next triggered event | Require a live preview (rendered with sample data) + a "send test to myself" action in the super-admin template editor before save takes effect |
| Agentic send confirming with a vague "OK, I'll send that" instead of echoing the resolved recipient + exact message body | Owner can't catch a wrong number/amount before an irreversible external send | Echo the fully-resolved recipient and message text in the confirmation turn (Pitfall 8/9) |
| Telegram delivery failures swallowed silently by `notifyOps`'s catch-all with no visible health signal | An admin believes they're covered by Telegram alerts for weeks while the chat_id binding is actually broken (e.g., after a group→supergroup migration) | Surface last-successful-send timestamp / failure count for the Telegram channel in the admin panel |
| Reusing the same variable name across audiences with different meaning (e.g. `{{amount}}` meaning "credits" for one event, "estimate total $" for another) confuses template authors | Wrong value substituted despite a "correct-looking" template | Event-scoped variable catalogs with clear, disambiguated names in the picker UI (ties to Pitfall 5) |

## "Looks Done But Isn't" Checklist

- [ ] **DB-driven templates:** Often missing a seeded row for every existing `EventType` — verify a CI check fails if any `EventType` lacks a template row (Pitfall 1).
- [ ] **Template fallback:** Often missing the "DB row null/malformed → fall back to hardcoded default" branch — verify by deleting a template row in a test environment and confirming `notify()` still degrades gracefully, never throws, never sends blank content (Pitfall 2).
- [ ] **WhatsApp template editing:** Often looks generalized (same UI as email) but silently breaks positional `{{n}}` order — verify by editing a WhatsApp-mapped event's variable order and confirming the send either gets blocked (count/order guard) or is proven still correct against the actual Meta-approved template (Pitfall 3).
- [ ] **End-customer SMS opt-out:** Often shipped as "we already handle TCPA" by reusing owner-scoped `notification_preferences` logic — verify there's an actual `clients`-scoped consent/suppression column AND an inbound Twilio webhook processing STOP/START before any end-customer SMS goes to a real number (Pitfall 10).
- [ ] **Agentic send confirmation:** Often looks safe because "the LLM tool schema requires a phone number" — verify the phone number/email is cross-checked against the client record on file, not just whatever string the model produced (Pitfall 9).
- [ ] **Telegram per-event toggles:** Often looks complete once the admin panel checkbox exists — verify a burst of several simultaneous events (e.g., a mass job-failure) doesn't 429 against Telegram's per-chat rate limit (Pitfall 7).
- [ ] **Template HTML escaping:** Often looks fine in manual testing (normal names, no special characters) — verify with a client/project name containing `<`, `>`, `&`, or `"` that the rendered email doesn't break or inject (Pitfall 4).
- [ ] **WhatsApp end-customer wall-off:** Often looks enforced because "we just don't build a WhatsApp option for customer templates" — verify the schema itself (a CHECK constraint or enum) makes it *impossible* to select WhatsApp as a channel for an end-customer-audience event type, not just an editor UI omission that a future change could bypass.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Missing template row causes blank sends in prod (Pitfall 1/2) | LOW | Re-seed the missing row from the retained hardcoded `copy.ts` fallback; add the CI guard retroactively |
| WhatsApp template variable mismatch sends garbled content (Pitfall 3) | MEDIUM | Immediately revert the WhatsApp event's variable mapping to the last-known-good `variables_schema`; audit recently sent messages for that event/template for wrong-content exposure; re-verify against Meta's actual approved template before re-enabling |
| HTML injection shipped in a template (Pitfall 4) | LOW–MEDIUM | Patch the shared renderer to escape values; audit recently sent emails for injected content; no data-store fix needed since this is a render-time issue, not a stored-data issue |
| Shared Twilio number gets carrier-throttled from agentic-send volume (Pitfall 6) | HIGH | Requires external Twilio/carrier remediation (support ticket, campaign re-registration), not just a code fix; may need to cut over to a new number/Messaging Service and coordinate with the other 5 apps sharing the account |
| Telegram chat_id silently broken after a group→supergroup migration (Pitfall 7) | LOW | Re-fetch the correct chat_id from a fresh bot interaction and update `platform_integrations.telegram.metadata.chat_id` |
| Agentic send fires to a wrong recipient (Pitfall 9) | HIGH (external, irreversible) | No code-only recovery — requires manual outreach/correction to the affected recipient and an audit-log review of what was sent; this is exactly why prevention (Pitfall 8/9) is non-negotiable rather than "acceptable risk" |
| End-customer SMS sent after a STOP reply, no suppression list existed (Pitfall 10) | HIGH (legal) | Build the missing suppression infra immediately, backfill from Twilio's own opt-out records where available, and treat as a compliance incident requiring legal review, not just a bug fix |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Lost exhaustiveness guard | Template schema/foundation phase | CI test diffing `EventType` union against seeded template rows |
| 2. No missing-template fallback | Template schema/foundation phase (same as #1) | Delete a template row in test/staging; confirm `notify()` degrades gracefully |
| 3. WhatsApp positional `{{n}}` mismatch | WhatsApp-specific template editor sub-phase (later than email/SMS/in-app) | Editing a WhatsApp event's variables triggers a count/order guard; cross-check against Meta's approved template |
| 4. HTML injection via variable substitution | Template rendering engine phase | Test render with `<`, `>`, `&`, `"` in a variable value |
| 5. Cross-audience data leak / locked-invariant regression | Template editor UI + schema design phase | `copy-tenant-neutrality`-style test re-pointed at DB source stays green in CI |
| 6. Shared Twilio number reputation risk | End-customer SMS + agentic-send phase | Explicit owner/operator sign-off on A2P 10DLC scope before shipping; flagged as a human decision, not auto-resolved |
| 7. Telegram webhook/polling/MarkdownV2 traps | Telegram-channel phase | Scope v1 as outbound-only explicitly; any future interactivity gets its own deeper-research phase |
| 8. No confirmation gate for agentic send | Agentic-send phase | Manual test: agent proposes a send, confirms with full recipient+body echo, requires explicit yes before firing |
| 9. Prompt-injection into recipient/amount | Agentic-send phase (same as #8) | Test: conversation contains a phone number NOT on the client record; system requires confirmation rather than silent send |
| 10. No end-customer consent/opt-out infra | Early phase / hard prerequisite gate before end-customer SMS + agentic-send phases | Inbound Twilio webhook exists and processes STOP/START; `clients`-scoped suppression checked before every send |

## Sources

- Direct repository inspection (HIGH confidence, primary source for all project-specific findings): `lib/notifications/copy.ts`, `dispatch.ts`, `event-types.ts`, `preferences.ts`, `whatsapp-registry.ts`; `lib/telegram/client.ts`; `lib/observability/ops-alert.ts`; `lib/platform-config.ts`; `lib/sms/client.ts`; `lib/inngest/functions/notification-channel-send.ts`; `lib/email/notification-emails.ts`; `lib/whatsapp/confirm.ts`, `manage-tools.ts`, `confirm-actions.ts`; `app/api/mcp/route.ts`; `app/api/webhooks/whatsapp/route.ts`; `app/api/estimates/[id]/send-sms/route.ts`; `lib/ratelimit.ts`; `supabase/migrations/20260621000002_notification_opt_in_consent.sql`, `20260621000003_whatsapp_notification_templates.sql`; `tests/unit/notifications/copy-tenant-neutrality.test.ts`; `.planning/PROJECT.md` (milestone context + prior-milestone locked decisions, e.g. CREDITUI-04, D-15 WhatsApp-owner-only, GUARD-03 never-trust-LLM-math).
- General domain knowledge (MEDIUM confidence — training-data-derived, not verified against fresh official docs this session; recommend a dedicated deeper-research pass before implementation): Meta WhatsApp Cloud API HSM template positional-parameter behavior; Telegram Bot API rate limits, MarkdownV2 reserved-character set, `secret_token` webhook verification; TCPA prior-express-consent distinctions for transactional vs. marketing SMS; A2P 10DLC campaign/use-case registration scope.
- Project memory (user-provided, HIGH confidence): Twilio account shared across 6 apps/3 databases; migrations applied manually to prod, never by deploy; red CI blocks all deploys; provider credentials must never live in env vars, only encrypted `platform_integrations`.

---
*Pitfalls research for: Xtimator v4.21 Notification Center*
*Researched: 2026-07-21*
