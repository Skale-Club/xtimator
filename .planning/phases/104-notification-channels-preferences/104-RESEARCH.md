# Phase 104: Notification Channels & Preferences Revamp - Research

**Researched:** 2026-06-21
**Domain:** Notification dispatch + preferences (Phase 77), WhatsApp Cloud API templates (Meta Graph v21), Twilio SMS, super-admin panel
**Confidence:** HIGH (current code read directly; Meta/Twilio paths already exist in-repo)

## Summary

Phase 104 is a **brownfield revamp of a fully-working notification system** (Phase 77), not a greenfield build. The dispatch entry point (`notify()` in `lib/notifications/dispatch.ts`), the preferences resolver (`lib/notifications/preferences.ts`), the schema (`notification_preferences.categories` JSONB), and the in-app + email senders all exist and are unit-tested. The work is: (1) **shrink** the `EventCategory` union from 8 → 3 and remap every event; (2) **widen** the per-category channel object from `{in_app, email}` → `{in_app, email, whatsapp, sms}` in schema, resolver, API, and UI; (3) **add two channel senders** to `notify()` — both of which already have working low-level primitives in the repo (`sendWhatsAppTemplate()` in `lib/whatsapp/client.ts`; Twilio REST send in `app/api/estimates/[id]/send-sms/route.ts`); (4) **build a super-admin WhatsApp-template panel**; (5) **migrate existing preference rows** (remap categories, drop dropped ones).

Two infrastructure pieces already exist and must be **reused, not rebuilt**: `sendWhatsAppTemplate(to, {name, languageCode, bodyVariables, headerVariables})` is already implemented and the Meta WABA ID is already loaded by `getWhatsAppPlatformConfig()`. The Twilio send path (`getTwilioConfig()` → accountSid/authToken/fromPhone, POST to `Messages.json`) is already proven in the estimate-SMS route — copy its shape into a `lib/sms/client.ts` primitive. There is **no Twilio SDK dependency** and we should not add one; the REST-over-`fetch` pattern is the established convention.

**Primary recommendation:** Split into **three decimal sub-phases** — 104.1 (schema + category reduction/remap + 4-channel UI), 104.2 (WhatsApp + SMS senders + owner-phone reuse + opt-in/consent), 104.3 (super-admin WhatsApp-template panel). Reconcile with Phase 98 by **building the senders + template-send registry HERE in 104.2** (since Phase 98's MVP overlaps and 104 needs them now), and **superseding Phase 98** for owner-facing WhatsApp. The 104.3 admin template panel is the in-app builder Phase 98 explicitly deferred — build it once, here.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Categories (NOTIF-01):** Exactly 3 — **Estimates, Billing, System**. Billing = MERGE of today's Payments + Trial + Quota + Admin. Remove the standalone **WhatsApp** category and the **AI Jobs** category. `EventCategory` reduces to `estimate | billing | system`. Event→category mapping updated (payment/trial/quota/admin → `billing`).

**Channels (NOTIF-02):** Exactly 4 — **In-App, Email, WhatsApp, SMS** — each independently toggleable per category (category × channel matrix). The existing "Email digest enabled" master switch still gates email. Per-channel storage extends from `{in_app, email}` to `{in_app, email, whatsapp, sms}` (schema migration).

**Phone (NOTIF-05):** **Reuse the existing per-user `owner_phone`** (collected + OTP-verified via WhatsApp work — `lib/whatsapp/sync-owner-phone.ts`, migration `20260620000001_company_whatsapp_multi_user.sql`, Phase 50 OTP). SAME verified number serves BOTH WhatsApp and SMS. No separate SMS number, no new profile field. Enabling WhatsApp/SMS requires the verified number to exist + an explicit **per-channel opt-in/consent** before any send. No verified number → toggles disabled with a "verify your phone" affordance.

**WhatsApp sender (NOTIF-03):** Send via the existing WhatsApp client. Proactive (out-of-24h-session) messages require an **approved Meta template**. Templates created/managed in a **NEW super-admin panel** (create, list, submit/track approval status, map template → notification category). Check for existing template infra (Phase 98 / `lib/whatsapp/`) before building from scratch.

**SMS sender (NOTIF-04):** **Full implementation now** via **Twilio** (origin number + per-message send), using the verified `owner_phone`. Gated by explicit **opt-in/consent** + cost acceptance. Opt-in copy must state it is a paid channel.

**Removed-category events (NOTIF-06):** **Drop both for tenants.** AI-job failure/completion notices and inbound-WhatsApp-message notices removed entirely from the tenant notification experience (no category, no toggle, no delivery). Migration: existing per-user pref rows for `payment/trial/quota/admin` collapse into `billing`; rows for `whatsapp/ai_job` dropped. Pending/feed events in dropped categories handled gracefully (no orphan UI).

**Dispatch (NOTIF-07):** Route each emitted event to its NEW category, then deliver via ONLY the channels the owner enabled for that category. Each channel send is **best-effort / never-throw** (Phase 92 observability rule).

**Structuring:** Large for one phase. Planner SHOULD organize into multiple plans/waves, and MAY recommend splitting into decimal sub-phases (104.1 schema+category+UI, 104.2 senders+phone/opt-in, 104.3 admin template panel). Surface the recommendation.

### Claude's Discretion

- The migration approach (in-place JSONB transform vs. column add) for `notification_preferences.categories`.
- The exact opt-in/consent storage shape.
- Whether to build a `sendSms()` primitive module vs. inline.
- The shape of the WhatsApp-template metadata table and admin panel CRUD.
- The plans/waves breakdown within each sub-phase.
- Phase-98 reconciliation strategy (build here / defer / share a module) — recommendation requested.

### Deferred Ideas (OUT OF SCOPE)

- Quiet hours / per-channel send windows (NOTIF-08).
- Localized SMS/WhatsApp templates beyond owner's app language (NOTIF-09).
- Push (web/mobile) channel — Phase-77 push scaffold stays dormant.
- Customer-facing WhatsApp template notifications — that is v4.4 Phase 98, out of scope here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | 3 categories (Estimates, Billing, System); remove WhatsApp + AI Jobs | `EventCategory` union + `EVENT_CATEGORIES` map + `DEFAULT_PREFERENCES` in `lib/notifications/event-types.ts`; UI `CATEGORIES` in `notifications-form.tsx`; `CATEGORY_LABELS`/`CATEGORY_ICONS`/`ORDER` in `NotificationFilters.tsx`; `MAP` in `category-icon.tsx` — full remap table below. |
| NOTIF-02 | 4 channels per-category matrix | `notification_preferences.categories` JSONB; `ChannelSchema`/`PatchSchema` in `app/api/notifications/preferences/route.ts`; `ChannelState`/matrix UI in `notifications-form.tsx`; `ResolvedChannels`/`resolveChannels()` in `preferences.ts`. |
| NOTIF-03 | WhatsApp owner-notification sender | `sendWhatsAppTemplate()` ALREADY EXISTS in `lib/whatsapp/client.ts`; needs an event→template registry + a `whatsapp` branch in `notify()`. |
| NOTIF-04 | SMS sender via Twilio | Working Twilio REST path in `app/api/estimates/[id]/send-sms/route.ts` + `getTwilioConfig()` in `lib/platform-config.ts`; extract to `lib/sms/client.ts`. |
| NOTIF-05 | Phone + opt-in/consent | `company_whatsapp.owner_phone` (per-user since `20260620000001`); `syncOwnerPhone()`; verification gap documented below (Runtime State Inventory). |
| NOTIF-06 | Migrate prefs + event→category mapping | JSONB remap migration (concrete plan below) + `EVENT_CATEGORIES` edit. |
| NOTIF-07 | Dispatch routing + best-effort per channel | `notify()` already best-effort/never-throw; add 2 channel branches mirroring the email-via-Inngest branch. |
</phase_requirements>

## Current Notification System (exact state)

### Schema (`supabase/migrations/20260520000002_notifications_system.sql`)

**`notifications`** — event feed. RLS: SELECT for own company + own/null user_id; INSERT/UPDATE/DELETE service-role only (no policies). Has `event_type`, `metadata` JSONB (`dedupe_key` for idempotency), `read_at`, `pinned`, `expires_at`.

**`notification_preferences`** — `user_id` PK, **`categories` JSONB** (shape today: `{ [EventCategory]: { in_app: bool, email: bool } }`), `push_subscription` JSONB, `email_digest_enabled` BOOL, `updated_at`. RLS: select/insert/update own (`user_id = auth.uid()`). **This is the table the channel widening migrates.**

### Event catalog (`lib/notifications/event-types.ts`)

8 categories today: `estimate | payment | trial | quota | whatsapp | ai_job | admin | system`. The `EVENT_CATEGORIES` map, `DEFAULT_PREFERENCES`, and `getCategoryForEvent()` all key off this union.

### Dispatch map — EVERY event type → NEW category (NOTIF-06/07)

| EventType | Call site | OLD category | **NEW category** |
|-----------|-----------|--------------|------------------|
| `estimate.viewed` | `app/estimate/[token]/actions.ts` | estimate | **estimate** |
| `estimate.accepted` | `app/estimate/[token]/actions.ts` (respondToEstimate) | estimate | **estimate** |
| `estimate.declined` | `app/estimate/[token]/actions.ts` | estimate | **estimate** |
| `estimate.expired` | (feed/cron) | estimate | **estimate** |
| `payment.received` | `lib/billing/connect-webhook.ts:138` | payment | **billing** |
| `payment.refunded` | `lib/billing/connect-webhook.ts:235` | payment | **billing** |
| `trial.expiring_3d` | `app/api/cron/trial-warning-emails/route.ts:70` | trial | **billing** |
| `trial.expired` | `app/api/cron/expire-trials/route.ts:54` (force email) | trial | **billing** |
| `trial.converted` | (billing) | trial | **billing** |
| `quota.80pct` | `lib/quota.ts:213` | quota | **billing** |
| `quota.exhausted` | `lib/quota.ts:227` | quota | **billing** |
| `admin.tier_changed` | admin `forceTier` (force channels) | admin | **billing** |
| `admin.bonus_credits_granted` | admin `grantBonusCredits` | admin | **billing** |
| `system.maintenance` | (platform) | system | **system** |
| `whatsapp.inbound` | `lib/whatsapp/handler.ts:435` | whatsapp | **DROPPED** |
| `ai_job.failed` | `transcribe-audio.ts:82`, `generate-estimate.ts:72`, `analyze-photos.ts:85` | ai_job | **DROPPED** |
| `ai_job.completed` | `transcribe-audio.ts:161`, `generate-estimate.ts:222`, `analyze-photos.ts:191` | ai_job | **DROPPED** |

**Decision needed for DROPPED events (do NOT delete the call sites blindly):** the cleanest approach is to keep `EventType` union members + their `notify()` call sites (so AI-job/inbound code doesn't break), but **map `whatsapp.inbound`, `ai_job.*` to NO deliverable category** — i.e. `notify()` short-circuits to `skipped: 'channel_disabled'` because there is no category/toggle for them. Two concrete options for the planner:
- **Option A (recommended):** Add an internal sentinel category `'_dropped'` not shown in any UI; `DEFAULT_PREFERENCES['_dropped'] = { in_app:false, email:false, whatsapp:false, sms:false }`. Call sites stay; nothing delivers; no orphan UI. Minimal churn.
- **Option B:** Remove the `notify()` calls from AI-job/inbound sources entirely. Larger blast radius (3 Inngest functions + handler), touches unrelated code. Not recommended for a notification-scoped phase.

### Preferences resolver (`lib/notifications/preferences.ts`)

`resolveChannels(eventType, userId, override)` returns `{ inApp, email }`. Resolution order: `DEFAULT_PREFERENCES[category]` → user JSONB override → `email_digest_enabled=false` forces email off → caller `override` wins. **Must extend `ResolvedChannels` to `{ inApp, email, whatsapp, sms }`** and add the gating (verified phone + opt-in) for the two new channels.

### Senders + UI surfaces to edit

| Surface | File | Change |
|---------|------|--------|
| Dispatch | `lib/notifications/dispatch.ts` | `NotifyParams.channels` + 2 new send branches (WhatsApp template via Inngest, SMS via Inngest) |
| Resolver | `lib/notifications/preferences.ts` | `ResolvedChannels` 4 channels + phone/opt-in gate |
| Prefs API | `app/api/notifications/preferences/route.ts` | `ChannelSchema` add `whatsapp`, `sms` booleans |
| Prefs UI | `components/settings/notifications-form.tsx` | `CATEGORIES` 8→3; matrix columns 2→4; disabled-toggle + "verify phone" affordance |
| Feed icons | `components/notifications/category-icon.tsx` | `MAP` 8→3 keys |
| Feed filters | `components/notifications/NotificationFilters.tsx` | `CATEGORY_ICONS`, `CATEGORY_LABELS`, `ORDER` 8→3 |
| Email worker | `lib/inngest/functions/notification-email-digest.ts` | `categoryFor()` fallback already → `'system'`; verify remap doesn't break grouping |

> **NOTE:** `updateNotifications()` in `lib/actions/settings.ts` (the `notify_on_view/accept/decline` company-table toggles) is a SEPARATE legacy per-estimate-event switch — **NOT** the category matrix. The matrix saves via `PATCH /api/notifications/preferences`. Do not confuse the two; the matrix work does not touch `settings.ts`.

## Preferences Storage Change (4 channels) — concrete migration

The `categories` value is **JSONB** — widening from 2 to 4 channels is purely additive at the column level (no DDL needed for the shape). Two things to do:

1. **Data migration (single SQL migration file):**
   - Remap keys: merge `payment`, `trial`, `quota`, `admin` sub-objects into `billing` (OR-merge each boolean so an owner who had ANY of the four on gets `billing` on). Drop `whatsapp`, `ai_job` keys.
   - Defaults for new channels on existing rows: leave `whatsapp`/`sms` **absent** so `resolveChannels()` falls back to `DEFAULT_PREFERENCES` (both default **false** — opt-in). Do NOT default-enable paid channels.
   - Use a `jsonb_build_object` rewrite of `categories` per row in an `UPDATE ... SET categories = (...)`. Idempotent (guard on presence of old keys).
2. **Code defaults:** `DEFAULT_PREFERENCES` becomes 3 categories × `{ in_app, email, whatsapp:false, sms:false }`. `estimate`/`billing`/`system` keep in_app+email on; whatsapp+sms default off everywhere (opt-in + paid).

**Recommended migration shape (illustrative, planner to finalize):**
```sql
UPDATE notification_preferences SET categories = (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'estimate', categories->'estimate',
    'billing', jsonb_build_object(
      'in_app', COALESCE((categories#>>'{payment,in_app}')::bool, (categories#>>'{trial,in_app}')::bool,
                         (categories#>>'{quota,in_app}')::bool, (categories#>>'{admin,in_app}')::bool, false),
      'email',  COALESCE((categories#>>'{payment,email}')::bool, (categories#>>'{trial,email}')::bool,
                         (categories#>>'{quota,email}')::bool, (categories#>>'{admin,email}')::bool, false)
    ),
    'system', categories->'system'
  ))
) WHERE categories ?| array['payment','trial','quota','admin','whatsapp','ai_job'];
```
(Strip nulls so an absent `estimate`/`system` key doesn't write `null`; resolver re-defaults those.)

## WhatsApp Sender + Template Approach + Super-Admin Panel

### The sender — ALREADY EXISTS, reuse it

`lib/whatsapp/client.ts` already exports **`sendWhatsAppTemplate(to, { name, languageCode, bodyVariables?, headerVariables? })`** — builds the `type:'template'` Graph payload with `components` and reuses `sendWhatsAppMessage()` (token/phoneNumberId from `getWhatsAppPlatformConfig()`). This is exactly the proactive-out-of-24h primitive NOTIF-03 needs. **Do not write a new sender.**

What 104.2 adds on top:
- An **event→template registry** mapping `EventType → { templateName, languageCode, variables(payload) }` (small explicit map, NOT every event — only the owner-notification events you want on WhatsApp).
- A `whatsapp` branch in `notify()` that resolves the owner E.164 (`company_whatsapp.owner_phone` for that `user_id`), looks up the registry, and dispatches async via Inngest (mirror the existing `notification/email.queued` branch — see `lib/inngest/functions/notification-email-digest.ts` for the pattern). Best-effort: a missing phone / missing template / disabled toggle is a silent no-op.

### Template management — Meta DOES support programmatic create + status

Per Meta Cloud API docs, templates can be created either manually in **WhatsApp Manager** or programmatically via **`POST https://graph.facebook.com/v21.0/{WABA_ID}/message_templates`** (name, category, language, components). Approval status is asynchronous; Meta delivers it via the **`message_template_status_update`** webhook field (PENDING → APPROVED/REJECTED, with rejection reason). `GET /{WABA_ID}/message_templates` lists existing templates + their status. **The `wabaId` is already loaded by `getWhatsAppPlatformConfig()` and is currently unused** (Phase 98 noted it as "finally consumed" by the builder) — 104.3 is where it gets consumed.

Required token scopes for create/list: `whatsapp_business_management` (+ `whatsapp_business_messaging` to send). The platform token in `platform_integrations` (`meta_whatsapp`) must carry these.

### Super-admin template panel (104.3) shape

- **Route:** `app/admin/whatsapp-templates/` (sibling of existing `app/admin/whatsapp/`). Add a nav entry to `components/admin/admin-nav.tsx` `NAV_ITEMS` (e.g. `{ href:'/admin/whatsapp-templates', label:'WA Templates', Icon: MessageCircle }`). Admin route/layout pattern already established.
- **New table** `whatsapp_notification_templates` (service-role-only RLS, like `notifications` — admin-managed platform data, NOT tenant data):
  - `id`, `event_category` (`estimate|billing|system`) or `event_type`, `template_name`, `language_code`, `meta_template_id` (nullable until created in Meta), `status` (`draft|pending|approved|rejected`), `rejection_reason`, `variables_schema` JSONB (which `{{n}}` vars + how they map from the notify payload), `created_at/updated_at`, `created_by`.
- **CRUD + actions** (server actions in `lib/actions/admin-whatsapp-templates.ts`):
  - List (with live status), Create (insert draft), Submit-to-Meta (`POST /{WABA_ID}/message_templates`, store returned id + `pending`), and a webhook handler addition in `app/api/webhooks/whatsapp/route.ts` for `message_template_status_update` → patch `status`/`rejection_reason`.
  - Map template → notification category/event (drives the registry the sender reads).
- **MVP fallback (lower risk):** if programmatic submit is deferred, the panel can be **register-an-already-approved-template** (admin types the approved `name`+`language` authored manually in WhatsApp Manager, panel just stores the mapping). CONTEXT wants "create/submit/track" so prefer full; but plan the register-only path as the de-risked first slice.

## Twilio SMS Send Path + Creds + Opt-in

### The send path — ALREADY PROVEN in-repo, no SDK

`app/api/estimates/[id]/send-sms/route.ts` already does a complete Twilio send via **REST + `fetch`** (no `twilio` npm dep, confirmed absent from package.json):
```
POST https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Messages.json
Authorization: Basic base64(accountSid:authToken)
body: From={fromPhone}&To={E164}&Body={text}
```
Creds come from **`getTwilioConfig()`** (`lib/platform-config.ts:295`) → `{ accountSid, authToken, fromPhone }`, decrypted from `platform_integrations` provider `'twilio'` (key stored as `"AccountSid:AuthToken"`) + `metadata.from_phone`. Returns `null` if unconfigured → caller no-ops.

**104.2 extracts a `lib/sms/client.ts` `sendSms(to, body)` primitive** from this route (server-only, never-throw, returns `{ ok, sid?, error? }`), then calls it from a `sms` branch in `notify()` (async via Inngest, mirroring email). The existing estimate-SMS route can be refactored to use the same primitive (nice-to-have, not required).

### Opt-in / consent storage

SMS is paid + legally consent-gated (TCPA in the US — this is a US-market product). Store consent explicitly, do not infer it from the toggle alone:
- Add columns to a per-user table (discretion — simplest is `notification_preferences`): `sms_opt_in_at TIMESTAMPTZ`, `sms_opt_in_consent_text TEXT` (the exact paid-channel copy shown at opt-in), optionally `whatsapp_opt_in_at`. The dispatch SMS branch sends ONLY if `sms_opt_in_at IS NOT NULL` AND the per-category `sms` toggle is on AND a verified phone exists.
- Opt-in UI copy MUST state it is a paid channel (CONTEXT requirement) and is recorded for audit.

## Owner-Phone Reuse Path + Verify-Gating

`company_whatsapp.owner_phone` is **per-user since `20260620000001_company_whatsapp_multi_user.sql`** (composite unique `(company_id, user_id)`; partial unique on `owner_phone`). Read it service-role for a given `user_id`:
```
SELECT owner_phone, status FROM company_whatsapp WHERE company_id=? AND user_id=? AND owner_phone IS NOT NULL
```
The SAME E.164 number drives BOTH WhatsApp and SMS (CONTEXT decision).

**⚠️ Verification gap (HIGH importance — see Runtime State Inventory):** CONTEXT says the number is "OTP-verified via Phase 50". This is **only partly true today.** The Phase-50 OTP columns (`verification_code`, `verification_attempts`, `verification_expires_at`, and the `verified_at`/`status` semantics) were **DROPPED** by `20260602000001_simplify_company_whatsapp.sql`. The current `company_whatsapp` has `owner_phone` + `status` (default `'active'`) but **no per-user verified flag and no live OTP flow** (legacy `connectWhatsApp` was deprecated; `syncOwnerPhone` writes `status:'active'` unconditionally). So "verified phone gate" cannot rely on an existing verified flag.

**Planner must decide the gate definition.** Two viable options:
- **Option A (recommended, low-cost):** Treat presence of a non-null `owner_phone` (E.164-valid) as "phone on file"; gate WhatsApp/SMS on `owner_phone IS NOT NULL` + explicit per-channel opt-in. Defer true OTP re-verification (it's out of NOTIF scope and the OTP infra was intentionally simplified away).
- **Option B (stricter):** Re-introduce a lightweight verified flag (`phone_verified_at` on `company_whatsapp`) and a re-verify affordance. Larger scope; only if the user insists "verified" must be literal.

Flag this in the plan as an open decision; do NOT silently assume a verified column exists.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp template send | New Graph client | `sendWhatsAppTemplate()` in `lib/whatsapp/client.ts` | Already implemented + handles components/token/errors |
| Twilio send | `twilio` npm SDK | REST `fetch` to `Messages.json` (copy `send-sms/route.ts`) | Established pattern; no new dep; matches repo conventions |
| Twilio creds | New env vars | `getTwilioConfig()` from `platform_integrations` | Encrypted, admin-managed, already wired |
| WhatsApp config / WABA id | New config | `getWhatsAppPlatformConfig()` (`wabaId` already loaded, unused) | Single cached source |
| Async best-effort send | Inline awaited send | Inngest event (mirror `notification/email.queued`) | Decouples send from request; matches email branch |
| Owner phone | New profile field | `company_whatsapp.owner_phone` per-user | CONTEXT locks reuse; already synced |
| Dedupe / never-throw | Custom guards | `notify()`'s existing `dedupe_key` + try/catch | Already battle-tested |

## Common Pitfalls

### Pitfall 1: Treating `updateNotifications` (settings.ts) as the matrix
**What goes wrong:** Editing the wrong server action. **Avoid:** The category matrix persists via `PATCH /api/notifications/preferences` → `upsertUserPreferences`. `updateNotifications` is unrelated legacy `notify_on_*` company toggles.

### Pitfall 2: Assuming a verified-phone column exists
**What goes wrong:** Gate references a dropped column. **Avoid:** Phase-50 OTP columns were dropped (`20260602000001`); use `owner_phone IS NOT NULL` or re-add a flag (see Owner-Phone section).

### Pitfall 3: Migration nukes preferences
**What goes wrong:** Overwriting `categories` loses an owner's estimate/system prefs, or writes `null`. **Avoid:** OR-merge the four billing-source categories; `jsonb_strip_nulls`; idempotent guard (`categories ?| array[...]`); test on a copy of real-shaped rows.

### Pitfall 4: A failing channel sinks the event (NOTIF-07)
**What goes wrong:** Twilio 4xx or missing template throws and the in-app notification never writes. **Avoid:** Each new branch wrapped in its own try/catch, dispatched async via Inngest, returns/logs on failure — never rethrows (mirror existing email branch). Unit-test "SMS send throws → in-app still inserted".

### Pitfall 5: Default-enabling paid channels
**What goes wrong:** Migration or defaults turn SMS on for existing owners → surprise Twilio bills + TCPA exposure. **Avoid:** `whatsapp`/`sms` default **false** everywhere; require explicit opt-in + recorded consent before any send.

### Pitfall 6: RLS on new tables
**What goes wrong:** `whatsapp_notification_templates` readable/writable by tenants, or consent columns exposed. **Avoid:** Templates table = service-role-only (no anon/authenticated policies), like `notifications`. Consent columns on `notification_preferences` inherit its `user_id = auth.uid()` policies. Enable RLS on every new table (CLAUDE.md mandate).

### Pitfall 7: Secrets in templates/docs
**What goes wrong:** A real Twilio SID/auth token or Meta token in a migration comment, plan, or template-panel seed. **Avoid:** Placeholders only (`sk_live_<key>`, `AC<sid>`); gitleaks pre-commit blocks `sk_*`/`whsec_*`/`sk-ant-*` etc. Creds stay in `platform_integrations` (encrypted) / env.

### Pitfall 8: Double-building Phase-98 template infra
**What goes wrong:** Phase 98 also plans `sendWhatsAppTemplate` + dispatch `whatsapp` channel + opt-in toggle. **Avoid:** Build the owner-facing senders + registry + admin panel HERE in 104; mark Phase 98's overlapping MVP slices as superseded (see reconciliation).

## Phase-98 Overlap Reconciliation

Phase 98 ("WhatsApp Template Notifications", v4.4, **not started**) and Phase 104 overlap heavily on the **owner-facing** WhatsApp path:

| Phase 98 item | Status vs. 104 |
|---------------|----------------|
| WANOTIF-01 `sendWhatsAppTemplate()` primitive | **Already shipped** (in `client.ts`) — both phases just consume it. |
| WANOTIF-02 `whatsapp` channel in `notify()` + event→template registry | **Overlaps 104.2 directly.** Build in 104. |
| WANOTIF-03 owner-phone resolution + async best-effort | **Overlaps 104.2.** Build in 104 (104 also adds SMS on the same phone). |
| WANOTIF-04 opt-in toggle + honest settings label | **Overlaps 104.2.** Build in 104 (104's 4-channel matrix subsumes it). |
| WANOTIF-04b fix `profile-section.tsx` help text | Tiny — fold into 104.2. |
| (Deferred) in-app template builder + `message_template_status_update` webhook | **This is exactly 104.3.** Build the builder HERE. |

**Recommendation: 104 SUPERSEDES Phase 98 for owner-facing WhatsApp notifications.** Phase 98's "customer-facing estimate updates to the END CLIENT" framing (per REQUIREMENTS out-of-scope note) is the only part that could remain distinct, but its written CONTEXT/requirements are entirely owner-facing and now subsumed. **Action for the planner:** note in the plan that Phase 98 should be marked superseded/closed (or rescoped to purely customer-facing, if that work is ever revived) once 104 lands the senders + registry + admin builder. Do not run both. The xphere read-only reference files (`C:\Dev\xphere\src\lib\whatsapp\cloud\*`) Phase 98 cites remain useful porting references for 104.3.

## Recommended Plan Structure

**Split into 3 decimal sub-phases** (CONTEXT explicitly invites this; the surface is too large for one phase — schema + UI + 2 senders + admin CRUD + Meta webhook + migration).

### 104.1 — Categories + 4-Channel Matrix + Migration (foundation; no external deps)
- **Wave A (schema/types):** shrink `EventCategory` to 3; remap `EVENT_CATEGORIES`; add `_dropped` sentinel (Option A); extend `DEFAULT_PREFERENCES` to 4 channels; widen `ResolvedChannels`/`resolveChannels` return to 4 (whatsapp/sms gating stubbed to false for now). Migration file: remap `categories` JSONB.
- **Wave B (API + UI):** `ChannelSchema` +whatsapp/sms; `notifications-form.tsx` CATEGORIES 8→3 + 4-column matrix (whatsapp/sms toggles disabled pending 104.2); `category-icon.tsx` + `NotificationFilters.tsx` 8→3.
- Ships a coherent, testable slice with ZERO external-service risk. Senders not yet active (toggles disabled).

### 104.2 — WhatsApp + SMS Senders + Phone/Opt-in (delivery)
- **Wave A (primitives + registry):** `lib/sms/client.ts` `sendSms()` (extract from estimate route); event→template registry; owner-phone resolver; opt-in/consent columns + storage.
- **Wave B (dispatch wiring):** `whatsapp` + `sms` branches in `notify()` (async via Inngest, best-effort); resolver gating (phone present + opt-in); enable the matrix toggles + "verify phone"/opt-in affordances + paid-channel copy.
- Folds in Phase-98 WANOTIF-02/03/04 + the `profile-section.tsx` copy fix.

### 104.3 — Super-Admin WhatsApp-Template Panel
- **Wave A:** `whatsapp_notification_templates` table (RLS service-role) + admin route + nav entry + list/register-approved-template CRUD (de-risked MVP).
- **Wave B:** programmatic submit (`POST /{WABA_ID}/message_templates`) + `message_template_status_update` webhook handling + template→category mapping that feeds 104.2's registry.

**Why 3 sub-phases:** each is independently shippable and testable; 104.1 carries zero external-service risk; 104.2 isolates the paid/Meta-dependent delivery risk; 104.3 isolates the Meta approval-lifecycle complexity (which depends on real WABA scopes + webhook + Meta's async approval and is the most likely to need manual UAT). Sequencing 104.1 → 104.2 → 104.3 means owners get the clean 3×4 UI first even if Meta approval drags.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `notification_preferences.categories` JSONB holds 8-category × 2-channel objects keyed by old category names (`payment/trial/quota/admin/whatsapp/ai_job`) for every existing owner row. | **Data migration** (remap → billing, drop dropped, leave new channels absent). |
| Stored data | `notifications` feed rows have `event_type` for `whatsapp.inbound`/`ai_job.*` — these become orphan-category in the UI feed. | Code: feed filter/icon map must not crash on dropped categories (Pitfall 4 / `_dropped`); existing rows render under a safe fallback. |
| Live service config | Meta WABA: templates authored in WhatsApp Manager are NOT in git; their approved `name`+`language` live only in Meta. | 104.3 stores the mapping; `meta_template_id`/`status` synced via webhook, not git. |
| Live service config | Twilio account/from-phone in `platform_integrations` (encrypted, admin UI) — NOT in git. | None (read via `getTwilioConfig()`); ensure account has SMS-capable from-number. |
| OS-registered state | None — no OS-level registrations involved. | None — verified by scope (web app, no cron/task renames). |
| Secrets/env vars | Meta token (`meta_whatsapp` in `platform_integrations` or `META_WHATSAPP_*` env) must carry `whatsapp_business_management` scope for 104.3 template CRUD; Twilio key (`twilio`) already present. No secret RENAME — code reads only. | Verify Meta token scope before 104.3 submit path; document placeholder-only. |
| Build artifacts | None — no package/egg/binary rename; **no new npm dep** (no Twilio SDK). | None. |
| **Verification flag (critical)** | Phase-50 OTP columns (`verification_code/attempts/expires_at`, `verified_at`) were **DROPPED** by `20260602000001_simplify_company_whatsapp.sql`. No live per-user verified flag exists today. | **Planner decision:** define "verified" gate as `owner_phone IS NOT NULL` (Option A) or re-add a flag (Option B). Do NOT assume a verified column. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) |
| Config file | `vitest.config.ts` (+ `inngest-mocks.ts`, `load-env.ts`, `seed-admin.ts` setup) |
| Quick run command | `npx vitest run tests/unit/notifications` |
| Full suite command | `npx vitest run` |

Existing notification tests to mirror/extend: `tests/unit/notifications/dispatch.test.ts`, `preferences.test.ts`, `event-sources.test.ts`, `preferences-form.test.tsx`, `email-digest.test.ts`.

### Phase Requirements → Test Map
| Req | Behavior | Type | Command | File Exists? |
|-----|----------|------|---------|-------------|
| NOTIF-01 | `EVENT_CATEGORIES` maps all events to estimate/billing/system; no whatsapp/ai_job category | unit | `npx vitest run tests/unit/notifications/event-types.test.ts` | ❌ Wave 0 |
| NOTIF-06 | Migration remaps payment/trial/quota/admin→billing (OR-merge), drops whatsapp/ai_job, leaves new channels absent | unit (pure fn on JSONB) | `npx vitest run tests/unit/notifications/category-migration.test.ts` | ❌ Wave 0 |
| NOTIF-02/07 | `resolveChannels` returns 4 channels; whatsapp/sms gated by opt-in + phone | unit | `npx vitest run tests/unit/notifications/preferences.test.ts` | ✅ (extend) |
| NOTIF-07 | `notify()` routes to enabled channels; a throwing SMS/WhatsApp send does NOT block in-app insert | unit | `npx vitest run tests/unit/notifications/dispatch.test.ts` | ✅ (extend) |
| NOTIF-03 | WhatsApp branch: opt-in off / no phone / no template → no-op; enabled → calls `sendWhatsAppTemplate` with registry vars | unit | `npx vitest run tests/unit/notifications/whatsapp-channel.test.ts` | ❌ Wave 0 |
| NOTIF-04 | SMS branch: `sendSms` payload shape (From/To/Body, Basic auth); opt-in off → no-op; never-throw | unit | `npx vitest run tests/unit/sms/client.test.ts` | ❌ Wave 0 |
| NOTIF-05 | Owner-phone resolver reads per-user `owner_phone`; gate when null | unit | `npx vitest run tests/unit/notifications/owner-phone.test.ts` | ❌ Wave 0 |
| 104.3 | Template panel CRUD: create draft, submit→pending, webhook status update; RLS service-role only | unit | `npx vitest run tests/unit/admin/whatsapp-templates.test.ts` | ❌ Wave 0 |
| NOTIF-01 | Prefs form renders 3 categories × 4 channels; whatsapp/sms disabled w/o phone | unit (RTL) | `npx vitest run tests/unit/notifications/preferences-form.test.tsx` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/notifications` (+ relevant new dir)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/notifications/event-types.test.ts` — NOTIF-01 category set + event map
- [ ] `tests/unit/notifications/category-migration.test.ts` — NOTIF-06 JSONB remap (extract migration logic into a pure TS fn the SQL mirrors, so it's unit-testable)
- [ ] `tests/unit/notifications/whatsapp-channel.test.ts` — NOTIF-03 dispatch branch
- [ ] `tests/unit/sms/client.test.ts` — NOTIF-04 `sendSms` payload + never-throw
- [ ] `tests/unit/notifications/owner-phone.test.ts` — NOTIF-05 resolver + gate
- [ ] `tests/unit/admin/whatsapp-templates.test.ts` — 104.3 CRUD + webhook status
- [ ] Extend `dispatch.test.ts`, `preferences.test.ts`, `preferences-form.test.tsx` for 4 channels + best-effort

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Meta WhatsApp Cloud API | NOTIF-03 + 104.3 | ✓ (platform-configured) | Graph v21.0 | Register-approved-template-only MVP if `whatsapp_business_management` scope absent |
| Twilio account + SMS from-number | NOTIF-04 | ✓ (`platform_integrations` 'twilio') | REST 2010-04-01 | `getTwilioConfig()` null → SMS branch no-ops gracefully |
| Vitest | all tests | ✓ | from package.json | — |
| Inngest | async send dispatch | ✓ (`lib/inngest/*`, mocked in tests) | in-repo | — |
| Twilio npm SDK | — | ✗ (intentionally absent) | — | REST via `fetch` (established) — do NOT add SDK |

**Missing dependencies with no fallback:** None blocking. **With fallback:** Meta `whatsapp_business_management` scope (verify before 104.3 programmatic submit; else register-approved-template MVP).

## Project Constraints (from CLAUDE.md)

- **Supabase RLS on ALL tables** — `whatsapp_notification_templates` service-role-only (mirror `notifications`); new consent columns inherit `notification_preferences` own-row policies. Enable RLS on every new table.
- **No secrets in git** (incl. migrations, plans, seeds, template panel) — placeholders only; gitleaks blocks `sk_*`/`whsec_*`/`sk-ant-*`/etc. Twilio/Meta creds stay in `platform_integrations` (encrypted) or env.
- **Service role key never in browser; all sends server-side** — senders are `server-only`; dispatch already uses `requireServiceClient()`.
- **Tech stack:** Next.js App Router, TS strict, shadcn/ui, react-hook-form + zod (prefs API already zod-validated).
- **GSD workflow:** all edits via a GSD command.

## Sources

### Primary (HIGH)
- Repo source (read directly): `lib/notifications/{dispatch,preferences,event-types}.ts`, `lib/whatsapp/{client,sync-owner-phone,verify}.ts`, `lib/platform-config.ts`, `lib/admin/integrations-providers.ts`, `app/api/estimates/[id]/send-sms/route.ts`, `app/api/notifications/preferences/route.ts`, `components/settings/notifications-form.tsx`, `components/notifications/{category-icon,NotificationFilters}.tsx`, `components/admin/admin-nav.tsx`
- Migrations: `20260520000002_notifications_system.sql`, `20260620000001_company_whatsapp_multi_user.sql`, `20260602000001_simplify_company_whatsapp.sql`, `20260602000002_company_whatsapp_owner_phone.sql`, `20260511000001_phase50_whatsapp_otp.sql`
- `.planning/phases/98-whatsapp-template-notifications/98-CONTEXT.md`, `.planning/phases/50-whatsapp-otp-verification/50-SUMMARY.md`

### Secondary (MEDIUM)
- Meta WhatsApp Cloud API — message templates create/manage: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/ and https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/ (confirms `POST /{WABA_ID}/message_templates`, `message_template_status_update` webhook, required scopes)

## Metadata

**Confidence breakdown:**
- Current schema/dispatch map: HIGH — read every source + migration directly.
- Sender reuse (WhatsApp template + Twilio REST): HIGH — both primitives exist in-repo.
- Verification gate: MEDIUM — confirmed the OTP columns were dropped; "verified" gate is a real open decision.
- Meta programmatic template CRUD: MEDIUM — official docs confirm capability; exact 104.3 scope depends on token scopes (verify before build).
- Plan structure: HIGH — driven by CONTEXT's explicit invitation + surface size.

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (repo-internal facts stable; re-verify Meta Graph version/scope if 104.3 slips)
