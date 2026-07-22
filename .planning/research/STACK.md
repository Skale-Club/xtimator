# Stack Research

**Domain:** Notification Center additions — Telegram admin channel, DB-driven template rendering, A2P 10DLC SMS compliance for end-customer messaging
**Researched:** 2026-07-21
**Confidence:** HIGH (Telegram + template engine — verified against code already shipped in this repo) / MEDIUM (A2P 10DLC — verified via multiple current sources, no Context7 coverage for compliance topics)

## Bottom Line

**No new runtime npm dependency is required for any of the 3 target capabilities.** Two of them — Telegram and SMS — already have proven raw-`fetch` clients shipped in this exact repo; the milestone's job is to *widen* those, not build new ones. The template-rendering need is fully satisfied by a small hand-rolled interpolator matching a pattern the codebase already uses for email HTML. The A2P 10DLC item is almost entirely a Twilio Console/compliance-copy task, not a library decision.

## Codebase Reality Check (read before recommending anything)

Two of the three "new" capabilities in the milestone brief are **not actually new** — they already exist, shipped via a 2026-07-05 quick-task (`260705-c1y-telegram-ops-alerting-system-for-the-pla`):

| Exists today | File | Shape |
|---|---|---|
| Telegram send client | `lib/telegram/client.ts` | `sendTelegramMessage(text)` — raw `fetch` to `api.telegram.org/bot<token>/sendMessage`, `parse_mode: 'HTML'`, single `chat_id` |
| Telegram config | `lib/platform-config.ts` → `getTelegramConfig()` | Reads `platform_integrations` (`provider: 'telegram'`), encrypted bot token + `metadata.chat_id`; dormant (`null`) unless both are set |
| Telegram consumer | `lib/observability/ops-alert.ts` → `notifyOps()` | System-health alerts only (Sentry co-fired); NOT wired to `notify()`/event-types; already HTML-escapes title/message (`&`/`<`/`>`) before sending |
| Admin UI for the token | `app/admin/integrations/telegram-chat-id-form.tsx` | Exists, single chat_id field |
| SMS send primitive | `lib/sms/client.ts` | `sendSms(to, body)` — raw `fetch` REST call to Twilio (Basic Auth, urlencoded body), **no Twilio SDK**, comment explicitly states this is "the established repo convention" |
| End-customer SMS precedent | `app/api/estimates/[id]/send-sms/route.ts` | Already sends estimate share links to end customers via `sendSms()`, gated by `company.sms_delivery_enabled`, logs to `estimate_deliveries` |
| Email HTML rendering | `lib/email/notification-emails.ts` | Hand-rolled template-literal HTML + a local `escapeHtml()` (`&`/`<`/`>`/`"`/`'`) — **no templating library anywhere in the codebase** |
| TCPA/consent gate | `lib/notifications/preferences.ts` | `sms_opt_in_at` / `whatsapp_opt_in_at` timestamps already gate the paid channels in `resolveChannels()` — a toggle alone never triggers a send |
| WhatsApp HSM param send | `lib/whatsapp/client.ts` → `sendWhatsAppTemplate()` | Passes `bodyVariables: string[]` straight through as ordered `{type:'text', text}` params — **no sanitization today** (no newline/whitespace stripping); the new template engine should close this gap |

**This changes the shape of the work**: (a) is "widen an existing raw-fetch client from 1 chat_id + system alerts to N chat_id(s) + all platform events with per-event toggles," not "add a Telegram library." (b) is "write one small interpolation+escaping utility," not "add a template engine" — the codebase has zero templating dependencies today and a proven hand-rolled pattern to extend. (c) is close to zero new code — mostly a Twilio Console/Trust Hub registration + `from_phone` provisioning decision.

## Recommended Stack

### Core Technologies — what to ADD

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| *(none — no new runtime dependency)* | — | Telegram send | Raw `fetch` to `api.telegram.org` already works, is already proven in this repo (`lib/telegram/client.ts`), and this milestone is send-only (no inline keyboards, no inbound commands, no conversation state). A bot framework buys you update routing, middleware, session storage, and inline-keyboard builders — none of which this feature needs. |
| *(none — no new runtime dependency)* | — | Template rendering | A ~40-line hand-rolled `{{var}}` interpolator matches the existing `escapeHtml`-in-`notification-emails.ts` pattern exactly, and is the only option that lets you apply *different* escaping per channel (HTML-escape for email, control-char-strip for SMS/Telegram, ordered-params array for WhatsApp HSM) from one small, fully-audited function. |

### Supporting Utilities to Build (code you write this milestone, not libraries)

| Utility | Purpose | When to Use |
|---------|---------|-------------|
| `lib/notifications/template-engine.ts` (new) | `renderTemplate(template: string, vars: Record<string,string>, ctx: 'html' \| 'text' \| 'whatsapp_ordered')` — literal `{{var}}` substitution (regex `/\{\{(\w+)\}\}/g`), one defined missing-var behavior applied everywhere, context-aware escaping | Single call site every channel adapter routes through — email HTML, SMS/Telegram plain text, WhatsApp HSM `{{n}}` ordered params |
| Widen `lib/telegram/client.ts` | `sendTelegramMessage(text, chatId?)` accepting an explicit chat id (or looping over an array) instead of always reading the single configured one | Per-event fan-out to possibly-multiple admin chats |
| Widen `getTelegramConfig()` in `lib/platform-config.ts` | `metadata.chat_ids: string[]` (or a join table if per-event-per-admin chat routing is needed) instead of today's single `metadata.chat_id` string | Needed to support "ALL platform events... with per-event toggles" — a single chat_id can't express per-admin or per-event routing |
| A `platform_event_preferences`-style table (mirrors `notification_preferences`) | Per-platform-event Telegram toggle, admin-panel editable | The tenant side already has this exact shape (`notification_preferences.categories`); reuse the pattern for platform events rather than inventing a new one |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Telegram `@BotFather` | Bot token issuance + bot settings | One-time setup; token goes into `platform_integrations` via the existing admin form, never `.env` (project rule) |
| Twilio Console → Trust Hub | A2P 10DLC Brand + Campaign registration, OR Toll-Free Verification | Operational, not code — see compliance section below |

## Installation

```bash
# No new packages required for (a) Telegram send or (b) template rendering.
# The milestone should NOT run any install for these two areas.

# (c) is a Twilio Console/API registration task, not an npm install.
# If a Messaging Service is later provisioned for custom opt-out copy, it's
# reachable via the SAME raw-fetch/Basic-Auth convention lib/sms/client.ts
# already uses — no `twilio` SDK needed.
```

## Alternatives Considered

### (a) Telegram: raw fetch vs grammY vs Telegraf

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Raw `fetch` (current, extend it) | [grammY](https://grammy.dev) `^1.45.1` (~1.26M weekly downloads, TypeScript-first, modern plugin ecosystem, actively maintained) | If a LATER milestone adds inbound admin commands (`/mute`, `/status`, two-way replies), inline keyboards, or conversation state — grammY's update router + session middleware earns its keep there. Not needed for send-only. |
| Raw `fetch` (current, extend it) | [Telegraf](https://telegraf.js.org) `^4.16.3` (~856K weekly downloads, longer-established, weaker TS types than grammY per grammY's own comparison, supports both webhook and long-polling) | Same trigger as grammY — only relevant once inbound handling exists. If a framework is ever adopted, grammY is the better pick of the two per current community comparisons. |

**Rationale for staying raw-fetch:** this milestone is explicitly send-only ("bot token... delivered to Xtimator admins," "ALL platform events covered with per-event toggles" — no mention of admins replying to the bot). Polling vs webhook is a non-question for send-only bots: neither `getUpdates` nor a webhook endpoint is needed at all if the bot never receives anything the app needs to react to. Adding grammY/Telegraf now would mean carrying an update-routing/middleware framework whose central feature (handling *incoming* updates) is unused — pure dependency weight for zero benefit, and inconsistent with the codebase's established "REST-over-fetch" convention used identically for `lib/whatsapp/client.ts`, `lib/sms/client.ts`, and `lib/telegram/client.ts`.

**Rate limits to design around (regardless of client choice):** Telegram allows roughly 1 message/sec per chat and ~30 messages/sec globally on the free tier; excess requests get HTTP 429 with a `retry_after` field. With N platform admins × per-event fan-out, this is very unlikely to be hit, but route sends through Inngest (see Version Compatibility below) so a burst of platform events naturally serializes/retries instead of firing a wall of concurrent `fetch` calls from request handlers.

### (b) Template rendering: hand-rolled vs Mustache vs Handlebars

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Hand-rolled `{{var}}` interpolator (~40 lines, no dependency) | [mustache](https://www.npmjs.com/package/mustache) `^4.2.0` — logic-less templates, sections (`{{#items}}`), no code execution | If the template catalog later needs loops/conditionals (e.g., "list each line item") beyond flat variable substitution. Mustache is genuinely logic-less (no arbitrary JS eval), so it's the safer *library* escalation path if flat substitution stops being enough — prefer it over Handlebars if that day comes. |
| Hand-rolled `{{var}}` interpolator | [handlebars](https://www.npmjs.com/package/handlebars) `^4.7.9` — Mustache superset with helpers, partials, custom logic | **Avoid for this feature.** Handlebars helpers can execute arbitrary registered JS, and its template compiler has a documented history of prototype-pollution/RCE-class CVEs when template *sources* are attacker- or lower-trust-influenced. Relevant here: the new template table is super-admin-editable via a web form — a stored-template-injection surface. Handlebars is the wrong trust model for "templates live in a DB, editable via an admin UI, not compiled from reviewed source." |

**Rationale:** the milestone's own spec is flat named placeholders — `{{client_name}}`, `{{estimate_number}}` — with **no loops, no conditionals, no partials** described anywhere in the feature list. A regex-based substitution function satisfies 100% of the stated requirement, is trivially auditable (the entire security surface fits in one code review), and — critically — lets you implement the **per-channel output-context escaping** the milestone actually needs (HTML-escape for email vs plain-text for SMS/Telegram vs an ordered array for WhatsApp HSM) as first-class function behavior rather than fighting a general-purpose engine's own escaping model. Neither Mustache nor Handlebars is channel-aware; you'd still hand-write the per-channel escaping wrapper around them, so adopting one adds a dependency without removing any of the actual work.

**Per-channel output rules the engine must encode** (this is the actual design work, not a library choice):
- **Email HTML** — HTML-entity-escape every interpolated value (`&`, `<`, `>`, `"`, `'`) before insertion, exactly like the existing `escapeHtml()` in `lib/email/notification-emails.ts`. The template *shell* is admin-authored trusted HTML; only the *values* (client names, amounts, etc.) are escaped.
- **SMS / Telegram plain text** — no HTML escaping (would show literal `&amp;` to the recipient); instead strip/replace control characters and collapse newlines-in-values so a malicious/odd variable value can't inject extra lines or break Telegram's `parse_mode: 'HTML'` entity parsing (Telegram HTML mode still needs `&`/`<`/`>` escaped even in plain "text" messages, per the existing `formatOpsMessage()` precedent — reuse that exact escaping for the Telegram context specifically, since it uses `parse_mode: 'HTML'`; use no escaping at all for SMS, which is truly plain text).
- **WhatsApp HSM `{{n}}` params** — Meta rejects/mishandles template parameters containing newlines, tabs, or 4+ consecutive spaces, and leading/trailing whitespace. The renderer's `whatsapp_ordered` context should strip newlines/tabs and collapse whitespace in each value before returning the ordered array — this is a real gap today (`sendWhatsAppTemplate` passes values through unsanitized).

### (c) SMS to end customers: 10DLC vs Toll-Free

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| **Toll-Free Verification** for the outbound `from_phone` | A2P 10DLC (Brand + Campaign registration via Twilio Trust Hub) | Use 10DLC instead if Xtimator later sends genuinely high-volume or marketing-adjacent SMS (10DLC scales to far higher per-second throughput once a Campaign is registered and trust-scored). For this milestone's use case — transactional estimate links + "send an SMS to my client about X" agentic sends, one tenant's small client list — Toll-Free is materially faster to provision (Twilio verifies toll-free numbers **in-house**; 10DLC requires **external carrier vetting**, commonly 1–2+ weeks) and carries no per-campaign carrier fee. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| grammY / Telegraf / node-telegram-bot-api (for THIS milestone) | Send-only outbound to admin chat(s) needs zero update-routing, middleware, or session machinery — all three libraries' core value proposition. Adding one now is unjustified dependency weight and breaks the established raw-fetch convention shared by `lib/whatsapp/client.ts`, `lib/sms/client.ts`, and `lib/telegram/client.ts`. | Extend `lib/telegram/client.ts` |
| Handlebars (or any engine that executes registered helper code against template sources) | Templates become DB-stored + admin-UI-editable this milestone — a lower-trust-than-source-code surface. Handlebars' helper/partial execution model + its CVE history around template-source trust make it the wrong fit even though it's the most "batteries included" option. | Hand-rolled interpolator; escalate to Mustache (logic-less) only if loops/conditionals become a real requirement |
| `sanitize-html` / `isomorphic-dompurify` / `juice` for the email HTML | Nothing here renders *user-supplied HTML* — it renders admin-authored template shells with interpolated plain-text variables (names, numbers, amounts). The injection vector is the variable VALUES, not arbitrary markup from an untrusted author, and those are single strings — entity-escaping them (already the codebase's proven pattern) fully closes the vector without a DOM-sanitization library. | The existing `escapeHtml()` pattern from `lib/email/notification-emails.ts`, reused in the new interpolator |
| `twilio` npm SDK | The codebase has deliberately never adopted it (`lib/sms/client.ts`'s own comment: "NO Twilio SDK — the REST-over-`fetch` shape is the established repo convention"). Any Messaging Service / opt-out-config management this milestone might need is a handful of REST calls, not SDK-scale surface. | Raw `fetch` + Basic Auth, same shape as `lib/sms/client.ts` |
| Rolling a custom STOP/HELP/START keyword parser + new inbound Twilio webhook | Twilio **already auto-handles** STOP/HELP/START on every Twilio-owned number (toll-free or 10DLC) with **zero application code** — a carrier-compliance feature Twilio provides for free, not something to reimplement. Building a custom inbound-SMS webhook to catch these keywords duplicates a solved problem and adds a new webhook surface + a new opt-out-state table to maintain (note: no Twilio inbound webhook exists in this repo today — only Stripe and WhatsApp inbound webhooks do). | Rely on Twilio's default automatic keyword handling; only add a Messaging Service + Advanced Opt-Out (still config, not code) if per-brand custom STOP copy is later required |

## Stack Patterns by Variant

**If per-admin (not just per-chat) Telegram routing is needed later:**
- Use a join table (`platform_event_telegram_recipients` or similar) instead of a flat `chat_ids: string[]` array on `platform_integrations.telegram.metadata`
- Because a flat array can't express "admin A gets billing alerts, admin B gets everything" — if that's in scope this milestone, design the schema for it now rather than migrating later

**If the template catalog stays flat variable substitution (as currently specced):**
- Use the hand-rolled interpolator
- Because it's the smallest, most auditable surface that satisfies the stated requirement and gives you full control over per-channel escaping

**If loops/conditionals get added to the template catalog in a future milestone:**
- Migrate to `mustache` (not `handlebars`) at that point
- Because Mustache's logic-less guarantee (no helper functions execute against template source) preserves the same trust model the hand-rolled version has today — admin-authored templates can add sections but never arbitrary logic

**For the Twilio outbound number used for end-customer SMS:**
- Use Toll-Free Verification for v1 (fast, no carrier fee, sufficient throughput for one tenant's client list)
- Escalate to full A2P 10DLC Brand+Campaign registration only if/when per-tenant sending volume or use-case classification (e.g., marketing content mixed into transactional sends) requires it

## SMS Compliance for End-Customer Messaging (A2P 10DLC / TCPA)

This is almost entirely a **Twilio Console + legal-copy** task, not a stack decision — flagging it here because the milestone explicitly calls it out and getting it wrong blocks sends or risks carrier filtering/fines.

1. **Registration path.** Two independent Twilio compliance tracks exist for US SMS from an application number:
   - **A2P 10DLC** (Brand + Campaign registration via Twilio Trust Hub) — required for 10-digit long-code numbers, externally carrier-vetted, commonly 1–2+ weeks to approve, ongoing per-campaign carrier fees. **As of the currently-in-effect requirement (June 30, 2026), campaign registration requires two additional fields — `PrivacyPolicyUrl` and `TermsAndConditionsUrl` — submissions without them hard-fail with a 400.** Xtimator's marketing site already has EN/PT-BR/ES pages per `PROJECT.md`; confirm a stable, public Privacy Policy + Terms URL exists before registering.
   - **Toll-Free Verification** — Twilio verifies in-house (faster), no per-campaign carrier fee, adequate throughput (~3 msg/sec/number) for transactional use. **Recommended for this milestone's scope** (owner-triggered "send an SMS to my client" + estimate-link delivery — low volume, single-recipient, transactional).
2. **Opt-out handling is automatic and requires no new code.** Twilio auto-processes STOP/HELP/START (and locale variants) on every Twilio-owned number by default — inbound keyword messages are intercepted and answered by Twilio before they reach any application webhook. No inbound SMS webhook needs to be built for baseline compliance. Advanced Opt-Out (custom bilingual copy, per-brand messaging) requires provisioning a **Messaging Service** and is an optional, config-only upgrade — not required for v1.
3. **Consent, not just delivery.** TCPA requires affirmative opt-in before texting an end customer, with opt-out disclosed at consent time. The codebase's existing `sms_opt_in_at` timestamp pattern (`lib/notifications/preferences.ts`) is currently scoped to **tenant/owner** consent for the owner's own SMS notifications — it does **not** cover **end-customer** consent for messages the tenant's business sends to *its own* clients. That consent relationship is between the tenant (the "business" in TCPA terms) and their own client, with Xtimator acting as the tenant's SMS platform/processor. Practically: the tenant already has a business relationship + phone number on file for their client, which supports an "established business relationship" transactional basis for estimate-related texts, but the agentic "send an SMS to my client about X" free-form use case should stay scoped to *estimate/project-related* content only — not marketing — to remain inside transactional messaging norms and avoid needing per-client A2P consent capture in v1.
4. **Message content review.** Both toll-free and 10DLC carrier review reject campaigns whose sample messages/privacy policy don't match actual use. Keep registration sample messages limited to what Xtimator actually sends (estimate links, project updates) — do not register a "marketing" or "mixed" use case if the actual traffic is transactional; that mismatch is a common rejection cause.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `resend@^6.10.0` (current) | Existing hand-rolled HTML template pattern | No change needed — the new template engine slots in as the string producer feeding `resend.emails.send({ html, text })`, same call shape as today |
| `zod@^4.3.6` (current) | New template-variable-catalog schema | Use zod to define the per-event variable catalog (`{{client_name}}: string`, etc.) for the super-admin editor's validation — consistent with the rest of the codebase's zod-first schema discipline |
| `inngest@^4.4.0` (current) | Telegram fan-out | Route platform-event → Telegram sends through Inngest (`notification/telegram.send`, mirroring the existing `notification/whatsapp.send` / `notification/sms.send` family in `lib/inngest/functions/notification-channel-send.ts`) rather than calling `sendTelegramMessage` inline from request handlers — keeps the async/durable/retry pattern consistent with every other outbound channel in `dispatch.ts`, and gives free backoff/retry against Telegram's 429 rate-limit responses |

## Sources

- `lib/telegram/client.ts`, `lib/observability/ops-alert.ts`, `lib/platform-config.ts`, `lib/sms/client.ts`, `lib/email/notification-emails.ts`, `lib/notifications/{dispatch,preferences,whatsapp-registry}.ts`, `lib/whatsapp/client.ts`, `app/api/estimates/[id]/send-sms/route.ts` — direct repo inspection, HIGH confidence (this is what's actually shipped)
- [Telegram Bot API rate limits](https://botnamefinder.com/blog/telegram-bot-rate-limits-explained) — ~1 msg/sec per chat, ~30 msg/sec global (free tier), 429 + `retry_after` on excess — MEDIUM confidence (WebSearch, consistent with well-established Telegram platform behavior)
- [grammY vs other frameworks comparison](https://grammy.dev/resources/comparison) / [npmtrends](https://npmtrends.com/grammy-vs-node-telegram-bot-api-vs-telegraf-vs-telegram-bot-api) — grammY ~1.26M weekly downloads vs Telegraf ~856K, TS-first design — MEDIUM confidence (WebSearch/npmtrends)
- `npm view grammy/telegraf/mustache/handlebars/twilio version` — grammY 1.45.1, telegraf 4.16.3, mustache 4.2.0, handlebars 4.7.9, twilio SDK 6.0.2 — HIGH confidence (live npm registry query, 2026-07-21)
- [Twilio — Programmable Messaging and A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc) — registration requirement, new required `PrivacyPolicyUrl`/`TermsAndConditionsUrl` fields as of June 30 2026 — MEDIUM confidence (WebSearch of official Twilio docs + secondary sources; date-sensitive, re-verify against Twilio Console at actual registration time)
- [Twilio Support — Getting Started with Advanced Opt-Out for Messaging Services](https://support.twilio.com/hc/en-us/articles/360034798533-Getting-Started-with-Advanced-Opt-Out-for-Messaging-Services) — default automatic STOP/HELP/START handling on all Twilio numbers, Messaging Service required only for customization — MEDIUM-HIGH confidence (official Twilio support docs)
- Toll-Free Verification vs A2P 10DLC speed/cost — [Twilio toll-free docs](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding), [10DLC docs](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc) — MEDIUM confidence (WebSearch synthesis of multiple sources including Twilio's own docs; no single canonical Twilio page states the comparison side-by-side, so treat the "toll-free is faster/cheaper for low volume" conclusion as directionally correct but re-verify current Twilio pricing/timelines before committing to the path)

---
*Stack research for: Xtimator v4.21 Notification Center (Telegram channel, template engine, end-customer SMS compliance)*
*Researched: 2026-07-21*
