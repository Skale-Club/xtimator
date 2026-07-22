# Architecture Research — v4.21 Notification Center

**Domain:** Brownfield integration study — three-audience Notification Center (platform admins / tenants / end customers) on top of an existing tenant-scoped `notify()` fan-out
**Researched:** 2026-07-21
**Confidence:** HIGH (every claim below is grounded in a specific file read from the current `main` branch, cited inline)

## Headline Finding

This is not a greenfield feature. It is **three separate integration seams onto two already-shipped pipelines**, plus one genuinely new pipeline:

1. **Tenant pipeline** (`notify()` → `lib/notifications/dispatch.ts`) — EXISTS, company-scoped, gains DB-template resolution.
2. **Platform-ops pipeline** (`notifyOps()` → `lib/observability/ops-alert.ts` + `lib/telegram/client.ts`) — EXISTS AND ALREADY SENDS TELEGRAM. The milestone's "Telegram channel" bullet is ~70% pre-built (quick-task `260705-c1y`, shipped 2026-07-05). The remaining work is a per-event toggle gate + widening the event catalog, not building a Telegram integration from scratch.
3. **End-customer agentic-send pipeline** — GENUINELY NEW. No table, no neutral capability, no tool exists today. `estimate_deliveries` (Phase-19-era) is the closest prior art (email/sms delivery logging) but is scoped to estimate-send receipts, not arbitrary agentic messages.

Getting the roadmap right depends on NOT conflating these three — they have different scope keys (`company_id` vs none vs `company_id` again but a different table), different RLS postures, and different trust boundaries (system-authored copy vs LLM-authored copy sent to a real third party).

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  TENANT-SCOPED (company_id required)              PLATFORM-SCOPED (no company)│
│                                                                                 │
│  event source (9 call sites)                      event source (6 call sites) │
│  e.g. connect-webhook.ts, quota.ts        ┌──────► with-fallback.ts,          │
│         │                                 │        cron routes,               │
│         │ buildNotificationCopy(ctx)      │        pipeline-watchdog,         │
│         ▼                                 │        transcribe/analyze/        │
│  notify({companyId, eventType, ...}) ─────┘        generate-estimate failures │
│         │  lib/notifications/dispatch.ts                    │                 │
│         │                                          notifyOps({kind,title,msg})│
│         ├─► resolveChannels() (preferences.ts)     lib/observability/         │
│         ├─► NEW: resolveNotificationCopy()          ops-alert.ts             │
│         │     DB notification_templates                     │                 │
│         │     ↳ fallback copy.ts                    ┌────────┴────────┐       │
│         ├─► notifications row (in_app)              │                 │       │
│         ├─► Inngest notification/email.queued   Redis dedupe    Sentry       │
│         ├─► Inngest notification/whatsapp.send       │                        │
│         │     (unchanged — HSM registry)             ▼                        │
│         └─► Inngest notification/sms.send      lib/telegram/client.ts        │
│                                                  (sendTelegramMessage)         │
│                                                       │                        │
│                                                  NEW: gate on                  │
│                                                  platform_notification_        │
│                                                  preferences[kind]             │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  END-CUSTOMER AGENTIC SEND (NEW — company_id-scoped, LLM-authored content)     │
│                                                                                 │
│  Owner: "send an SMS to Sarah about the delay"                                │
│    │                                                                           │
│    ▼ WhatsApp inbound                          ▼ Claude.ai / MCP client       │
│  lib/whatsapp/intent-router.ts  ─── MANAGE ──►  lib/mcp/tools/write.ts        │
│  lib/whatsapp/manage-tools.ts   (NEW tool)      (NEW send_customer_message)   │
│    │                                                  │                        │
│    └───────────────────┬────────────────────────────┘                        │
│                         ▼                                                      │
│         NEW: lib/agent-tools/send-customer-message.ts                         │
│         (trusted companyId closure param, mirrors create-estimate.ts)         │
│                         │                                                      │
│         ├─► clients row ownership check (company_id === trusted companyId)    │
│         ├─► optional template resolve (scope='customer', notification_templates)│
│         ├─► sendSms() [lib/sms/client.ts, UNCHANGED]                          │
│         │      or sendEmail() [NEW lib/email/send-raw.ts, same shape as sendSms]│
│         └─► NEW customer_messages row (audit log, mirrors estimate_deliveries)│
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Status | Responsibility |
|---|---|---|
| `lib/notifications/dispatch.ts` (`notify()`) | MODIFIED | Tenant-scoped fan-out choke point; gains DB-template resolution ahead of in_app write + email/sms dispatch |
| `lib/notifications/copy.ts` (`buildNotificationCopy`) | MODIFIED (kept, not deleted) | Becomes the permanent last-resort fallback when no active DB template row exists |
| `lib/notifications/whatsapp-registry.ts` | UNCHANGED | Owner-WhatsApp HSM template registry — stays the only source for the `whatsapp` channel (Meta requires pre-approved templates; free-text DB templates cannot apply here) |
| `lib/observability/ops-alert.ts` (`notifyOps()`) | MODIFIED | Platform-scoped (no `company_id`) fan-out choke point for Telegram; gains a per-`kind` toggle gate read from `platform_notification_preferences` |
| `lib/telegram/client.ts` | UNCHANGED | `sendTelegramMessage()` — already reads bot token + chat_id from `platform_integrations` (provider `'telegram'`) via `getTelegramConfig()`. No new Telegram integration work needed. |
| `lib/platform-config.ts` (`getTelegramConfig`) | UNCHANGED | Already dormant-until-configured, already the standing "no keys in env" pattern the project requires |
| `lib/agent-tools/*` | ADDS ONE FILE | Channel-neutral capability layer (`createEstimate`, `createProject`, `createPriceBookService`, `addCompanyKnowledge`, ...) gains `sendCustomerMessage` |
| `lib/whatsapp/manage-tools.ts` (MANAGE intent) | MODIFIED | Already the general-purpose, non-session-scoped write-tool bucket reached from any conversation state via `intent-router.ts`'s classifier — the natural home for "message my client" |
| `lib/whatsapp/agent-tools.ts` (confirmation agent) | NOT the right home | Scoped to one active `session.draft_estimate_id`; do not bolt customer-send here |
| `lib/mcp/tools/write.ts` | MODIFIED | Gains `send_customer_message` write tool, same annotation tier as `create_estimate`/`add_service` |
| `lib/sms/client.ts` (`sendSms`) | UNCHANGED | Reused as-is by both the tenant `notify()` sms branch and the new agentic-send path |
| `lib/email/sender.ts` | MODIFIED (additive) | Currently only exports `emailFrom()`; needs a sibling generic `sendEmail()` primitive (see below) |
| **NEW** `lib/notifications/template-resolver.ts` | NEW | `resolveNotificationCopy(scope, eventType, channel, vars)` — DB-first, `copy.ts`-fallback, mirrors the proven `getApprovedTemplateForEvent` pattern |
| **NEW** `notification_templates` table | NEW | DB-editable per-(scope, event_type, channel) copy with `{{variables}}` |
| **NEW** `platform_notification_preferences` table | NEW | Per-platform-event-`kind` Telegram toggle |
| **NEW** `customer_messages` table | NEW | Audit log for every end-customer email/SMS send (agentic or manual) |
| **NEW** `lib/notifications/platform-events.ts` | NEW | Code catalog of platform alert `kind`s (mirrors `event-types.ts`'s `EventType`/`EVENT_CATEGORIES` split of code-catalog vs DB-toggle-state) |
| **NEW** `lib/agent-tools/send-customer-message.ts` | NEW | Neutral capability, trusted-`companyId` closure param (T-lrf-01 pattern), calls `sendSms`/`sendEmail` directly (synchronous — see Data Flow) |

## The Tenant-Scope vs Platform-Scope Split (addressed head-on)

The orchestrator's framing is correct and load-bearing: **`notify()` cannot be the Telegram channel's entry point**, for structural reasons visible in the code, not just convention:

- `NotifyParams.companyId` is a **required** field (`lib/notifications/dispatch.ts:26`).
- The dedupe check queries `.eq('company_id', params.companyId)` (`dispatch.ts:92`).
- The `notifications` table has `company_id UUID NOT NULL REFERENCES public.companies(id)` and RLS keyed on `(auth.jwt() ->> 'company_id')::uuid` (`supabase/migrations/20260520000002_notifications_system.sql:7,42`).
- `resolveChannels()` reads `notification_preferences` keyed by `user_id` (a company member), not a platform concept (`lib/notifications/preferences.ts`).

Platform events — a new tenant signing up, a payment landing, a cron job dying, an AI provider falling back — are either **zero-company** (cron failure, ai fallback) or **about a company from the platform's outside perspective** (a specific tenant's signup/payment is itself the subject of the alert, not a message addressed to that tenant's own users). Forcing these through `notify()` would require making `companyId` optional everywhere downstream (dedupe, RLS, the notifications feed itself) — a structural regression to a table that 15+ call sites and the entire in-app notification UI depend on being company-scoped.

The codebase already independently arrived at this same conclusion: `lib/observability/ops-alert.ts`'s own doc comment states *"Company-agnostic: alerts carry only the kind/title/message — never a companyId."* This is not a gap to fix — it is the correct existing seam. **The architecture recommendation is: keep two parallel, independently-triggered pipelines that share only a call site, never a table or a function.**

Concretely, for events that have BOTH a tenant-facing and a platform-facing angle (e.g. payment received), the SAME business call site fires **two independent calls**:

```typescript
// lib/billing/connect-webhook.ts (illustrative — both calls already-pattern-consistent)
await notify({ companyId, userId, eventType: 'payment.received', title, body, ... })   // tenant sees it
void notifyOps({ kind: 'tenant_payment_received', title: `Payment: ${company.name}`, message, severity: 'warning' }) // platform admin sees it
```

This is not a new pattern — `with-fallback.ts` and the cron routes already call `notifyOps()` standalone, with zero relationship to `notify()`. The only new work is adding sibling `notifyOps()` calls at the ~3 business call sites the milestone names (signup, payment, quota) that don't yet emit a platform alert, alongside the 6 that already do (reliability alerts).

## (a) Where Template Resolution Slots In

**Per event, resolved per channel, inside `notify()` — not at the 9 call sites.**

Today, call sites (`lib/quota.ts`, `lib/inngest/functions/{transcribe-audio,analyze-photos,generate-estimate}.ts`, `lib/whatsapp/handler.ts`, `lib/billing/{connect-webhook,credit-ledger}.ts`, `app/admin/billing/actions.ts`, `app/estimate/[token]/actions.ts`) call `buildNotificationCopy(eventType, ctx)` themselves, THEN pass the resulting `{title, body}` into `notify()`. `notify()` itself never touches `copy.ts` — this is the key discovery that shapes the integration.

**Recommendation:** extend `NotifyParams` with an optional `copyContext?: CopyContext` (the same shape callers already build for `buildNotificationCopy`). Inside `notify()`, before building the in_app row / queuing email / building the sms body, resolve copy per channel:

```typescript
// lib/notifications/template-resolver.ts (NEW)
export async function resolveNotificationCopy(
  scope: 'tenant' | 'customer',
  eventType: string,
  channel: 'in_app' | 'email' | 'sms',
  vars: CopyContext,
): Promise<NotificationCopy | null> {
  // DB lookup: notification_templates WHERE scope, event_type, channel, is_active
  // → interpolate {{var}} tokens from `vars`
  // → return null on any miss/error (never throws)
}
```

`notify()`'s resolution order per channel becomes: **DB template (if `copyContext` was passed by the caller) → caller-supplied `title`/`body` (unchanged fallback) → nothing changes for un-migrated callers.** This is the exact precedent already proven in this codebase for WhatsApp: `getApprovedTemplateForEvent()` (`lib/notifications/whatsapp-registry.ts:83-113`) resolves an approved DB row from `whatsapp_notification_templates`, falling back to the static `REGISTRY` map, called from inside `notify()`'s whatsapp branch (`dispatch.ts:187`). The new work generalizes this ONE-channel pattern to THREE more channels (in_app/email/sms) and TWO scopes (tenant/customer) — it is not a new architectural idea, it is the same idea applied more broadly.

**Zero-regression rollout is two steps, and they can be two different phases:**
1. Ship the resolver + wire it into `notify()` as strictly additive (`copyContext` optional, defaults to `undefined` → 100% fallback to current behavior, since `notification_templates` starts empty). Zero call-site changes required.
2. Sweep the 9 call sites to pass `copyContext: ctx` instead of pre-computing `buildNotificationCopy(eventType, ctx)` inline — mechanical, low-risk, each site already has `ctx` in scope. This is what actually lets an admin's DB edit take effect for that event.

**Per-channel divergence detail (why "per channel" is the right axis, not "per event"):**
- **in_app**: title + body (existing shape, unchanged).
- **email**: subject + body. Today the email digest worker (`lib/inngest/functions/notification-email-digest.ts`) re-reads `notifications.title`/`.body` straight from the row — it does NOT re-derive copy, because it runs later/batched. To let email wording diverge from in_app wording, `notify()` should stash a resolved email-specific copy into `notifications.metadata.email_copy = {subject, body}` (metadata is already JSONB, already used for `dedupe_key`/`email_sent_at` — no schema migration beyond the new table). The digest worker prefers `metadata.email_copy` when present, else falls back to `title`/`body` exactly as today.
- **sms**: today `dispatch.ts:224` inlines `body: `${params.title}: ${params.body}`` directly in the Inngest payload. New: resolve an sms-channel template if present, else keep that exact fallback string.
- **whatsapp**: intentionally untouched — Meta HSM templates can't be free-text edited, so `whatsapp_notification_templates` stays the sole source for that one channel.

## (b) New Tables

### `notification_templates` (NEW — the DB-editable copy engine)

```sql
CREATE TABLE public.notification_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('tenant','customer')),
  event_type   text NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('in_app','email','sms')),
  subject      text,               -- email only
  title        text,               -- in_app only
  body         text NOT NULL,
  variables    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- catalog for the admin preview UI
  is_active    boolean NOT NULL DEFAULT true,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, event_type, channel)
);
-- RLS: service-role-only, mirrors whatsapp_notification_templates (20260621000003) —
-- ENABLE RLS, zero anon/authenticated policies. Structurally enforces the locked
-- "no tenant overrides" decision: there is no company_id column at all.
```

One row per channel (not one row per event with per-channel JSONB columns) because email genuinely needs `subject`+`body` while in_app needs `title`+`body` while sms needs `body`-only — forcing these into one row produces an awkward, mostly-null shape. Row-per-channel also gives the admin editor UI a natural "list, filter by scope/channel, edit one" surface, matching the existing `whatsapp-templates-panel.tsx` UX precedent.

`scope='customer'` rows serve the agentic-send flow's *templated* case (e.g. "appointment reminder") — free-form agentic sends (owner dictates exact wording) skip this table entirely; the LLM composes the body directly.

### `platform_notification_preferences` (NEW — Telegram per-event toggle)

```sql
CREATE TABLE public.platform_notification_preferences (
  event_kind   text PRIMARY KEY,          -- matches OpsAlert.kind
  telegram_enabled boolean NOT NULL DEFAULT true,  -- default ON = zero regression vs today's always-on notifyOps
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- RLS: service-role-only. No company_id — genuinely platform-scoped.
```

The **event catalog itself stays code**, not DB — a new `lib/notifications/platform-events.ts` exporting a `PlatformEventKind` union + human labels, mirroring the existing code/DB split already used for tenant events (`EVENT_CATEGORIES`/`DEFAULT_PREFERENCES` are code in `event-types.ts`; only the per-user override lives in `notification_preferences`). The DB table only stores the admin-editable toggle *state*, keyed by the code-defined string. This lets the roadmap add new alert kinds without a migration.

**No new table for the bot token / chat_id** — `platform_integrations` (provider `'telegram'`, `metadata.chat_id`) already exists and is already wired end-to-end via `getTelegramConfig()`. Recommend keeping the existing single-chat-id model (one ops Telegram group) rather than adding per-admin-recipient fan-out — that would be a materially bigger schema change (a recipient list + per-recipient delivery tracking) not clearly asked for by the milestone bullet ("Telegram bot token stored encrypted... delivered to Xtimator admins"), and every current call site already assumes one destination.

### `customer_messages` (NEW — end-customer send audit log)

```sql
CREATE TABLE public.customer_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id           uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  channel             text NOT NULL CHECK (channel IN ('email','sms')),
  recipient_email     text,
  recipient_phone     text,
  subject             text,                 -- email only
  body                text NOT NULL,
  template_event_type text,                 -- NULL for free-form agentic sends
  source              text NOT NULL CHECK (source IN ('manual','agentic_whatsapp','agentic_mcp')),
  provider             text NOT NULL CHECK (provider IN ('resend','twilio')),
  provider_message_id  text,
  status               text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','delivered','failed','bounced')),
  error_message         text,
  sent_by_user_id       uuid,               -- the owner/staff whose conversation triggered it
  created_at            timestamptz NOT NULL DEFAULT now(),
  sent_at                timestamptz
);
-- RLS: tenant-scoped SELECT via company_members (mirrors estimate_deliveries' pattern),
-- INSERT/UPDATE service-role only.
```

This is modeled directly on **`estimate_deliveries`** (`supabase/migrations/20260519000003_estimate_deliveries.sql`), which already logs exactly this shape (channel CHECK email/sms, provider CHECK resend/twilio, status lifecycle, RLS via `company_id IN (SELECT id FROM companies WHERE ...)`) for estimate-send receipts. Recommend a **new, separate table** rather than widening `estimate_deliveries` — the latter has a `NOT NULL` FK to `estimates` and is a proven, currently-shipping table; do not touch it. `customer_messages` reuses its conventions but is not tied to any estimate, and carries the extra `source`/`sent_by_user_id`/`template_event_type` columns that matter for auditing an LLM-authored send to a real third party — the first time this codebase lets that happen.

## (c) Telegram Channel Integration

**Extend the existing `notifyOps()`/`ops-alert.ts` pipeline. Do not add a Telegram branch to `notify()`.** (Full rationale in the Tenant-vs-Platform section above.)

Concrete changes to `lib/observability/ops-alert.ts`:

```typescript
export async function notifyOps(alert: OpsAlert): Promise<void> {
  try {
    if (alert.dedupeKey) { /* unchanged Redis SETNX */ }
    try { Sentry.captureMessage(...) } catch {}   // unchanged — always fires regardless of toggle

    // NEW: per-kind toggle gate — Sentry stays the unconditional technical record;
    // Telegram becomes admin-toggleable. Defaults to enabled (fail-open) so an
    // unconfigured/errored preferences read never silently kills alerting.
    const telegramEnabled = await isTelegramAlertEnabled(alert.kind) // reads platform_notification_preferences, defaults true
    if (telegramEnabled) {
      try { await sendTelegramMessage(formatOpsMessage(alert)) } catch {}
    }
  } catch {}
}
```

Widen the event catalog by adding `notifyOps()` calls at the 3 net-new business call sites the milestone names, as SIBLING calls next to existing tenant `notify()` calls (not replacing them):

| Platform event | New `kind` | Call site to add sibling `notifyOps()` |
|---|---|---|
| Tenant signup | `tenant_signup` | wherever onboarding/`createOrUpdateCompany` completes (new call site — no existing `notify()`/`notifyOps()` fires today on signup) |
| Payment received | `tenant_payment_received` | `lib/billing/connect-webhook.ts` (already calls tenant `notify('payment.received', ...)`) |
| Quota exhausted | `tenant_quota_exhausted` | `lib/quota.ts` (already calls tenant `notify('quota.exhausted', ...)`) |
| Job failures | *(already covered)* | `estimate_generation_failed`/`transcription_failed`/`vision_failed`/`ai_fallback` already fire via existing `notifyOps()` calls in `generate-estimate.ts`, `transcribe-audio.ts`, `analyze-photos.ts`, `with-fallback.ts` |
| Critical errors | *(already covered)* | `pipeline_stuck` (`pipeline-watchdog.ts`), `cron_failed` (both cron routes) |

Admin UI: extend the existing `/admin/integrations` Telegram card (`app/admin/integrations/telegram-chat-id-form.tsx`) — or a new `/admin/notifications` platform tab — with a per-`kind` toggle list bound to `platform_notification_preferences`, following the exact `requireAdmin` + `requireServiceClient` server-action pattern already used in `lib/actions/admin-whatsapp-templates.ts`.

**What is explicitly NOT new work:** the Telegram HTTP client, the bot-token/chat-id admin field, the encrypted-credential storage, the dedupe layer, the Sentry co-fan-out, and 6 of the ~9 needed event sources. All shipped 2026-07-05 (quick-task `260705-c1y`) and are proven in production use by `with-fallback.ts` and 5 other call sites.

## (d) Agentic End-Customer Send Flow

**New neutral capability, called synchronously (not via Inngest) from two channel adapters (WhatsApp MANAGE tool + MCP write tool), hitting the same `sendSms`/`sendEmail` primitives `notify()` uses — with tenant-scoped ownership guardrails mirroring the MCP `create_estimate` project-ownership preflight.**

### Why synchronous, not Inngest-queued
`notify()`'s email/whatsapp/sms branches go through Inngest because they are proactive, nobody-is-waiting system notifications. The agentic send is the opposite: the owner is mid-conversation and the agent's reply THIS TURN needs to say "sent" or "couldn't send, no phone on file." The established precedent for a user-initiated, response-this-turn external send is `app/api/estimates/[id]/send-sms/route.ts`, which calls `sendSms()` directly, synchronously, with no Inngest hop. The new tool follows that precedent, not the `notify()` precedent.

### Neutral capability

```typescript
// lib/agent-tools/send-customer-message.ts (NEW)
// Mirrors lib/agent-tools/create-estimate.ts: companyId is a CLOSURE/trusted
// param resolved upstream — NEVER an LLM tool-input field (T-lrf-01).
export async function sendCustomerMessage(args: {
  companyId: string
  clientId: string
  channel: 'email' | 'sms'
  body: string            // LLM-authored (free-form) or template-rendered
  subject?: string        // email only
  eventType?: string      // optional — for template-resolved sends + audit
}): Promise<{ ok: boolean; error?: string }> {
  // 1. Ownership check: clients row WHERE id = clientId AND company_id = companyId
  //    (mirrors handleCreateEstimate's project.company_id === auth.company_id check
  //    in lib/mcp/tools/write.ts)
  // 2. Resolve `to` from clients.email / clients.phone
  // 3. sendSms(to, body)  or  sendEmail({to, subject, body})  [NEW lib/email/send-raw.ts]
  // 4. Insert customer_messages row (audit trail) regardless of outcome
}
```

### WhatsApp side — extend the MANAGE intent, not the confirmation agent

`lib/whatsapp/manage-tools.ts` is already the general-purpose, non-session-scoped write-tool bucket — reached from ANY conversation state via `lib/whatsapp/intent-router.ts`'s classifier (`MANAGE` intent, alongside `add_service`/`add_knowledge`). This is architecturally the right home: "send an SMS to my client about X" is a standalone command, not part of reviewing one pending estimate draft (which is what `lib/whatsapp/agent-tools.ts`'s confirmation agent is scoped to via `session.draft_estimate_id`).

Required changes:
- Add a `sendCustomerMessageTool` to `makeManageTools()` (`lib/whatsapp/manage-tools.ts`), resolving the client via the existing `findClientByName` (`lib/agent-tools/query-company-data.ts`, already bound as a QUERY tool) before calling the new neutral function.
- Update the intent classifier's `MANAGE:` system-prompt bullet in `intent-router.ts` (currently scoped to "SAVE something to their account") to also cover "message/text/email a client" — otherwise the classifier will misroute these requests to `CREATE` or `QUERY`.

### MCP side — new write tool, same neutral core

Add `send_customer_message` to `lib/mcp/tools/write.ts`, following the exact `handleCreateEstimate`/`handleAddService` shape: `WRITE_ANNOTATIONS`, `ensureScope(auth, 'mcp:write')`, a service-client ownership preflight, then delegate to `sendCustomerMessage()`. This closes the loop on the project's own standing principle, stated explicitly in `PROJECT.md`'s v4.9/v4.10 milestone history: *"WhatsApp = CHAT = MCP, three siblings over the SAME neutral core."* The agentic-send capability should be the newest instance of that pattern, not a one-off.

### Guardrails (this is the first LLM-authored message sent to a real third party)

- **Tenant ownership**: `clientId` must resolve to a row where `company_id === companyId` (trusted closure param) — identical shape to the MCP `create_estimate` project check.
- **Audit log**: every send (success or failure) writes a `customer_messages` row — this is the reviewability/revocability surface for an autonomous send, and the compliance record.
- **Consent**: the codebase already has a TCPA-driven consent gate for tenant-facing SMS (`notification_preferences.sms_opt_in_at`, enforced in `resolveChannels()`, `lib/notifications/preferences.ts:90`). End-customer SMS has no equivalent today — `clients` has no opt-in timestamp column. **Flag as an open product/legal question for the roadmap phase, not resolved by this research**: sending unsolicited SMS to a tenant's customers carries real TCPA exposure that the existing owner-facing consent pattern does not cover.
- **Abuse/rate limiting**: unlike AI generation, SMS/email cost is trivial, so the existing credit ledger (`checkCredits`) is the wrong gate. Recommend a lightweight per-company rate limit (reuse `lib/redis.ts`'s `getRedis()`, already used for `notifyOps` dedupe) to prevent a runaway agent loop from spamming a client.
- **Never-throw at the primitive, but NOT at the tool layer**: `sendSms`/`sendEmail` stay never-throw (`{ok, error?}`), matching the existing contract — but the LangChain/MCP tool WRAPPING them should surface failure into the agent's reply text this turn ("Couldn't send — no phone on file for Sarah"), unlike `notify()`'s fire-and-forget swallow-everything posture, because here a human is actively waiting on this turn's answer.

## Data Flow

### Tenant notification with template resolution (modified)
```
event source (9 call sites)
  → notify({ companyId, eventType, copyContext, ... })
      → resolveNotificationCopy('tenant', eventType, 'in_app', copyContext)
          → DB hit? render {{vars}} : buildNotificationCopy(eventType, copyContext)
      → INSERT notifications row (title/body from above)
      → Inngest notification/email.queued (carries copyContext or resolved title/body;
         digest worker later resolves 'email' channel copy, falls back to row title/body)
      → Inngest notification/whatsapp.send (UNCHANGED — HSM registry only)
      → Inngest notification/sms.send (body resolved via 'sms' channel template, else
         `${title}: ${body}` fallback — UNCHANGED shape)
```

### Platform Telegram alert with toggle (modified)
```
reliability call site OR new signup/payment/quota sibling call
  → notifyOps({ kind, title, message, severity, dedupeKey })
      → Redis SETNX dedupe (fail-open, UNCHANGED)
      → Sentry.captureMessage (UNCHANGED, unconditional)
      → NEW: platform_notification_preferences[kind].telegram_enabled ?? true
          → true: sendTelegramMessage(formatOpsMessage(alert))  [UNCHANGED client]
          → false: skip Telegram, Sentry record still exists
```

### Agentic end-customer send (new)
```
Owner (WhatsApp or Claude.ai/MCP): "send Sarah an SMS about the delay"
  → WhatsApp: intent-router classifies MANAGE → makeManageTools() ReAct agent
     MCP: send_customer_message tool call
  → sendCustomerMessage({ companyId [trusted], clientId, channel, body })
      → clients ownership check (company_id match)
      → resolve `to` (clients.email / clients.phone)
      → sendSms() / sendEmail()  [existing / new primitive, synchronous]
      → INSERT customer_messages row (audit, regardless of outcome)
  → tool returns success/failure text THIS TURN → agent composes reply
```

## Suggested Build Order (dependency spine)

The three pipelines are independently shippable in parallel (they share no code), but within each there is a real dependency order. Recommended phase spine, in dependency order:

1. **Template engine foundation** — `notification_templates` table (migration) + `lib/notifications/template-resolver.ts` + wiring into `notify()` as strictly additive (Step 1 of the (a) rollout above). Ships with zero call-site changes and zero visible behavior change (DB starts empty → 100% `copy.ts` fallback). This is the dependency root for everything template-related, including the customer-scope rows the agentic-send flow will optionally use.
2. **Super-admin template editor UI** — CRUD screen over `notification_templates` (list/edit/preview with the `variables` catalog), reusing the `whatsapp-templates-panel.tsx` + `admin-whatsapp-templates.ts` server-action pattern. Depends on (1)'s table existing.
3. **Call-site sweep** — migrate the 9 `buildNotificationCopy()` call sites to pass `copyContext` instead of pre-built title/body (Step 2 of the (a) rollout). Depends on (1); can ship any time after, low risk, mechanical.
4. **Telegram per-event toggle** — `platform_notification_preferences` table + `lib/notifications/platform-events.ts` catalog + the gate inside `notifyOps()` + admin toggle UI. Independent of (1)-(3); depends only on the already-shipped Telegram infra (`lib/telegram/client.ts`, `getTelegramConfig`).
5. **Widen platform event catalog** — add `notifyOps()` sibling calls at signup/payment/quota call sites. Depends on (4) existing (so new kinds are toggleable from day one) but is otherwise independent of (1)-(3).
6. **`customer_messages` table + `sendCustomerMessage` neutral capability + `lib/email/send-raw.ts`** — the foundation the agentic-send tools bind to. Can start in parallel with (1)-(5); depends on nothing upstream in this milestone, only on existing `sendSms`/`clients` schema.
7. **WhatsApp MANAGE tool integration** — `sendCustomerMessageTool` in `manage-tools.ts` + classifier prompt update in `intent-router.ts`. Depends on (6).
8. **MCP `send_customer_message` write tool**. Depends on (6); independent of (7) (both bind the same neutral function, ship in either order or in parallel).
9. **(Optional, template-dependent) customer-scope templates** — `scope='customer'` rows in `notification_templates` for semi-fixed customer messages (e.g. appointment-reminder). Depends on both (1) and (6); can be deferred past MVP since the free-form (LLM-authored body) path in (6)-(8) doesn't require it.

Critical path for an MVP slice: **1 → 6 → 7/8**. Steps 2-3 (editor polish, call-site sweep) and 4-5 (Telegram breadth) can trail without blocking the headline "agentic send" capability, and vice versa — a roadmap that ships (1)+(6)+(7) before (4)+(5) is equally valid, since the two pipelines never share code.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Routing Telegram through `notify()`
**What people might do:** add a `telegram?: boolean` to `NotifyParams.channels` and a Telegram branch inside `dispatch.ts`, since it looks like "just another channel" next to whatsapp/sms.
**Why it's wrong:** every layer of `notify()` — the required `companyId`, the dedupe query, the `notifications` table FK/RLS — assumes a tenant. Platform alerts (cron failures, ai fallback) have no tenant at all. Bending `notify()` to accept `companyId: null` would ripple into the in-app feed, RLS, and every existing consumer of `notifications`.
**Instead:** extend `notifyOps()` (already company-agnostic, already sends Telegram) as shown in (c).

### Anti-Pattern 2: Deleting `copy.ts` once DB templates ship
**What people might do:** treat the DB template table as the sole source of truth and remove `buildNotificationCopy` once the admin panel is live.
**Why it's wrong:** every event needs a working default from day one (before an admin has authored anything), and a DB read can fail/be empty. `copy.ts` is the safety net, mirroring how `whatsapp-registry.ts`'s static `REGISTRY` map was never deleted after the DB-backed resolver shipped in Phase 104.3.
**Instead:** keep `copy.ts` permanently as the fallback tier.

### Anti-Pattern 3: Queuing the agentic send through Inngest "for consistency with `notify()`"
**What people might do:** dispatch an `EVENT_CUSTOMER_MESSAGE_SEND` Inngest event from the WhatsApp/MCP tool, mirroring `notification/sms.send`.
**Why it's wrong:** the agent's reply for THIS conversational turn needs to know whether the send succeeded; queuing makes that a fire-and-forget the tool can't report on, producing a confidently-wrong "Sent!" reply before the async worker has even run.
**Instead:** synchronous call, matching the `app/api/estimates/[id]/send-sms/route.ts` precedent.

### Anti-Pattern 4: Adding the customer-send tool to the estimate-confirmation agent
**What people might do:** add `sendCustomerMessage` to `lib/whatsapp/agent-tools.ts` since it already has a resolved client in scope.
**Why it's wrong:** that agent only runs while `session.draft_estimate_id` is set (an active pending-confirm session) — "send an SMS to my client" as a standalone command outside that flow would be unreachable.
**Instead:** the MANAGE intent (`manage-tools.ts`), which is reachable from any session state.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| `notify()` ↔ `notification_templates` | Direct Supabase read (service client) | New — mirrors `getApprovedTemplateForEvent`'s DB-then-fallback shape |
| `notifyOps()` ↔ `platform_notification_preferences` | Direct Supabase read (service client) | New — same TTL-cache-optional posture as `platform-config.ts` reads |
| `notification-email-digest.ts` ↔ `notifications.metadata.email_copy` | JSONB field, no schema change | New — lets email wording diverge from in_app without touching the digest worker's query shape |
| `lib/whatsapp/manage-tools.ts` ↔ `lib/agent-tools/send-customer-message.ts` | Direct function call, `companyId` closure param | New — T-lrf-01 pattern (never an LLM-suppliable field) |
| `lib/mcp/tools/write.ts` ↔ `lib/agent-tools/send-customer-message.ts` | Direct function call, `auth.company_id` preflight-checked | New — same neutral function as the WhatsApp side |
| `sendCustomerMessage` ↔ `sendSms` / `sendEmail` | Direct function call | `sendSms` unchanged; `sendEmail` is a new sibling primitive in `lib/email/` |

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| Telegram Bot API | `lib/telegram/client.ts`, credentials via `platform_integrations` (`getTelegramConfig`) | Already shipped — no new integration work |
| Twilio (SMS) | `lib/sms/client.ts`, credentials via `platform_integrations` (`getTwilioConfig`) | Reused as-is for both tenant `notify()` sms and agentic customer sms |
| Resend (email) | Currently one-off per email type (`payment-emails.ts`, `notification-emails.ts`, ...) via `getIntegrationKey('resend')` | New: extract a generic `sendEmail()` primitive so the agentic-send path and future channel-templated email don't each hand-roll a Resend call |

## Sources

All findings grounded in direct reads of the current `main` branch (no external documentation needed — this is an internal integration study):

- `lib/notifications/dispatch.ts`, `event-types.ts`, `copy.ts`, `preferences.ts`, `whatsapp-registry.ts`
- `lib/observability/ops-alert.ts`, `lib/telegram/client.ts`, `lib/platform-config.ts` (`getTelegramConfig`, `getTwilioConfig`)
- `lib/inngest/functions/notification-channel-send.ts`, `notification-email-digest.ts`
- `lib/email/notification-emails.ts`, `sender.ts`
- `lib/sms/client.ts`
- `lib/whatsapp/agent.ts`, `agent-tools.ts`, `manage-tools.ts`, `query-tools.ts`, `intent-router.ts`
- `lib/agent-tools/index.ts`, `create-estimate.ts`, `query-company-data.ts`
- `lib/mcp/tools/registry.ts`, `write.ts`
- `lib/actions/admin-whatsapp-templates.ts`
- `supabase/migrations/20260520000002_notifications_system.sql`, `20260621000003_whatsapp_notification_templates.sql`, `20260519000003_estimate_deliveries.sql`
- `types/database.types.ts` (`clients` row shape — confirms `email`/`phone` columns)
- `.planning/PROJECT.md` (v4.21 milestone definition; v4.8-v4.10 "WhatsApp = CHAT = MCP" neutral-core principle)
- `.planning/quick/260705-c1y-telegram-ops-alerting-system-for-the-pla/` (prior-art quick task that shipped the existing Telegram infra, 2026-07-05)

---
*Architecture research for: Xtimator v4.21 Notification Center*
*Researched: 2026-07-21*
