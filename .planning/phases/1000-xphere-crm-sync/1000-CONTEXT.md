# Phase 1000: Xphere CRM Sync - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Mirror every Xtimator company into the Xphere CRM (the existing **"Xtimator" org**, `org_id = aa2af131-ded1-454c-a404-cfc39fb34cba`) as an **Account** (business) + **Contact** (owner) + **Opportunity** (subscription lifecycle), kept current as the company's identity, plan, and product activity change. Xtimator is the source; Xphere is the mirror. One-directional (Xtimator → Xphere).

Transport is the already-built Xphere receiver **`POST {XPHERE_BASE_URL}/api/xtimator/webhook`** (branch `feat/xtimator-crm-mirror` in the xphere repo). All calls go through **Inngest** (existing queue) for retry + non-blocking UX. This phase builds ONLY the Xtimator side.

In scope: companies migration, credential storage + admin config, the Xphere client/mapping/types, the Inngest event + job, lifecycle hooks, one-time backfill, observability. Out of scope: anything in the xphere repo (done); the Xphere pipeline seed + API-key issuance (manual deploy steps).
</domain>

<decisions>
## Implementation Decisions

### Xphere webhook contract (FIXED — already built on the Xphere side)
- Request: `POST {XPHERE_BASE_URL}/api/xtimator/webhook`, header `Authorization: Bearer <XPHERE_API_KEY>`, JSON body:
  ```jsonc
  {
    "event": "company.created|company.updated|estimate.created|estimate.sent|subscription.updated|trial.expired",
    "occurred_at": "<ISO8601>",            // drives last-write-wins ordering in Xphere
    "delivery_id": "<optional>",
    "company": {
      "id": "<companies.id UUID>",          // REQUIRED — idempotency key (external_id)
      "name": "<business name>",            // REQUIRED
      "owner_name": "...", "email": "...", "phone": "...",
      "industry": "...", "website": "...", "address": "...",
      "tags": ["xtimator:pro", ...],        // applied to the Contact
      "custom_fields": { ... }              // merged onto the Contact
    },
    "opportunity": { "stage": "<stage name>", "status": "open|won|lost", "value": <number>, "title": "..." }, // optional
    "note": { "title": "...", "content": "..." }   // optional — appended to the contact timeline
  }
  ```
- Response is always HTTP 200 `{ ok: true, account_id, contact_id, opportunity_id, opportunity_skipped? }`. A `4xx/5xx` or network failure (e.g. base URL down) MUST throw so Inngest retries. `opportunity_skipped: 'no_pipeline'|'no_stage'` means setup is incomplete — surface it, don't treat as fatal.
- Xphere dedupes by `(org, 'xtimator', company.id)` — re-sends update, never duplicate. Xtimator sends NO org_id; the API key pins the org.

### Opportunity stage mapping (stage names must match the Xphere "Xtimator Lifecycle" pipeline EXACTLY, incl. the em dash "—")
- `trial` (trialing) → stage `Trial`, status `open`
- `pro` → stage `Active — Pro`, status `won`
- `business` → stage `Active — Business`, status `won`
- `free` (lapsed/never-paid) OR trial expired OR subscription cancelled → stage `Churned`, status `lost`
- `value`: pass the plan's monetary value if readily available (else 0); `title`: `"{company.name} — Subscription"`.

### custom_fields snapshot (so the CRM always shows current state)
`xtimator_tier`, `xtimator_trial_ends_at`, `xtimator_stripe_customer_id`, `xtimator_signed_up_at`, `xtimator_last_event`. Send the current snapshot on every sync.

### Per-event note (timeline) — only for meaningful events
e.g. `estimate.sent` → "Sent estimate …"; `subscription.updated` → "Upgraded to Pro"; `trial.expired` → "Trial expired". `company.updated` needs no note. Notes are non-idempotent in Xphere (one per event) — only include `note` when the event is worth a timeline entry.

### Reliability / safety
- All syncs via Inngest event `xphere/sync.requested` `{ companyId, event, occurredAt }`. Lifecycle sites only `inngest.send(...)` fire-and-forget (`.catch`) — user flows NEVER await Xphere (same pattern as `sendWelcomeEmail`).
- The job loads the company fresh, builds the payload, calls the client. On success persist `xphere_account_id/contact_id/opportunity_id` + `xphere_synced_at` and clear `xphere_sync_error`; on failure store `xphere_sync_error` and rethrow so Inngest retries.
- Idempotency is guaranteed by Xphere's upsert-by-external_id, so retries/backfill re-runs are safe.
- Secrets: `XPHERE_API_KEY` (an `xph_…` token) lives ONLY in `platform_integrations` (encrypted) or env — never in git/docs (gitleaks hook). `source='xtimator'` provenance is set Xphere-side.

### Disabled-by-default
If no `XPHERE_API_KEY`/`XPHERE_BASE_URL` configured, `getIntegrationKey('xphere')` returns null → the job no-ops gracefully (logs + returns), lifecycle sends still fire but the job short-circuits. The integration is opt-in via the admin config.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets / Patterns (Xtimator repo)
- **Credentials:** `lib/platform-config.ts` `getIntegrationKey(name)` (lines ~196-255) — encrypted fetch from `platform_integrations` with 30s cache + env fallback; decrypt via `lib/crypto/aes.ts`. Add a `xphere` provider + base URL.
- **Per-request client init pattern:** `lib/billing/stripe-client.ts` `getStripeClient()` (key fetched at request time, never module-load).
- **Inngest:** client `lib/inngest/client.ts`; event constants + typed payloads `lib/inngest/events.ts`; functions in `lib/inngest/functions/`; serve handler registers all functions in `app/api/inngest/route.ts`. Dispatch via `inngest.send({ name, data })`.
- **Fire-and-forget side effects:** `lib/actions/company.ts` `createOrUpdateCompany` already does this for welcome email / price-book seed (`.catch(() => undefined)`).
- **Webhook idempotency precedent:** `app/api/webhooks/stripe/route.ts` (`processed_stripe_events`, `handlePlatformEvent`).
- **Admin integrations UI:** existing config surface for Stripe/Resend keys (mirror it for Xphere).

### Lifecycle hook sites (where to `inngest.send`)
- `lib/actions/company.ts` → `createOrUpdateCompany` (both INSERT and UPDATE paths) → events `company.created` / `company.updated`.
- `lib/actions/estimate.ts` → `createBlankEstimate` (~408) `estimate.created`; `markEstimateSent` (~638) `estimate.sent`.
- `app/api/webhooks/stripe/route.ts` → `handlePlatformEvent` (checkout.session.completed / customer.subscription.updated / .deleted) → `subscription.updated`.
- `app/api/cron/expire-trials/route.ts` → `trial.expired`.

### Schema
- `companies` table: `id, user_id, name, owner_name, phone, email, website, address/city/state/zip, industry, tier (free|trial|pro|business), tier_trial_ends_at, stripe_customer_id, stripe_subscription_id, tier_renews_at, tier_cancelled_at, created_at`. `companies.id` is the Xphere `external_id`.
- New migration adds: `xphere_account_id`, `xphere_contact_id`, `xphere_opportunity_id` (text null), `xphere_synced_at` (timestamptz), `xphere_sync_error` (text). Follow existing `supabase/migrations/phaseNN_*.sql` naming.

### Integration Points (new files)
- `lib/integrations/xphere/{client.ts,mapping.ts,types.ts}`
- `lib/inngest/functions/xphere-sync.ts` (+ event in `lib/inngest/events.ts`, register in `app/api/inngest/route.ts`)
- migration under `supabase/migrations/`
- admin backfill route under `app/api/admin/...` (admin-guarded, batched, enqueues `xphere/sync.requested` per company)
</code_context>

<specifics>
## Specific Ideas

- `mapping.ts` must be a pure function `buildSyncPayload(company, event): XphereSyncPayload` (unit-testable) — all tier→stage, tags, custom_fields, and note-text logic lives here so the job stays thin.
- Keep the stage-name + pipeline-name literals in ONE place (a const in `mapping.ts`/`types.ts`) and document they must match the Xphere `Xtimator Lifecycle` pipeline.
- Backfill is admin-only, idempotent, rate-aware (chunk the `inngest.send` calls).
</specifics>

<deferred>
## Deferred Ideas

- Xphere-side deploy/setup (apply migration 1213, run the pipeline seed, issue the API key in the Xtimator org) — manual, outside this phase.
- Two-way sync / reading data back from Xphere — out of scope (one-directional).
- A dedicated `xphere_sync_log` table — start with `xphere_synced_at`/`xphere_sync_error` on `companies` + Inngest run history; add a log table only if needed.
</deferred>
