# Phase 77: Notifications System - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Auto-generated (skip_discuss=true; spec authored in ROADMAP entry)

<domain>
## Phase Boundary

Build a robust unified notifications layer: in-app feed + email + browser-push scaffold. Captures every consequential event in the platform (estimates, payments, trials, quotas, WhatsApp, AI jobs, admin actions, etc.), persists per-user, fans out via channels respecting user preferences, exposes a bell icon + dedicated `/notifications` page + per-category settings.

**In scope:**
- `notifications` + `notification_preferences` tables (RLS, indexes)
- `lib/notifications/dispatch.ts` — single `notify()` helper that fans out
- 17 event types instrumented at their source call sites
- Topbar bell icon + 400px panel + unread badge
- `/notifications` full-page list with filter/search/pagination
- Email digest mode via Inngest cron (grouped >3 events/hr)
- `/settings/notifications` per-category toggles (in_app + email)
- Browser push scaffold (permission + service worker registration; delivery deferred)
- Auto-cleanup cron (60-day TTL unless pinned)
- Real-time bell badge via Supabase Realtime
- Unit + Playwright E2E coverage

**Out of scope:**
- SMS via Twilio (future seed)
- Per-user custom rules ("notify when estimates over $5000")
- Notification analytics dashboard
- Actual push delivery (Phase 1 ships scaffold only; deliver in Phase 2 if signaled)
</domain>

<decisions>
## Implementation Decisions (locked)

### Data model
- **`notifications` table:**
  - `id UUID PK`, `company_id UUID FK NOT NULL`, `user_id UUID NULL` (null = company-wide visible to all users)
  - `event_type TEXT NOT NULL` (constrained by application enum, no CHECK — catalog evolves fast)
  - `title TEXT NOT NULL`, `body TEXT NOT NULL`
  - `link_url TEXT NULL` (relative app path users get sent to on click)
  - `resource_type TEXT NULL`, `resource_id TEXT NULL` (denorm for filtering / deduplication)
  - `metadata JSONB NOT NULL DEFAULT '{}'` (event-specific extras; never raw secrets)
  - `read_at TIMESTAMPTZ NULL`
  - `pinned BOOLEAN NOT NULL DEFAULT false` (excluded from auto-cleanup)
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `expires_at TIMESTAMPTZ NULL` (manual expiry override)
- **`notification_preferences` table:**
  - `user_id UUID PK FK auth.users`
  - `categories JSONB NOT NULL DEFAULT '{}'::jsonb` — schema: `{ estimate: {in_app, email}, payment: {...}, trial: {...}, admin: {...}, whatsapp: {...}, system: {...} }`
  - `push_subscription JSONB NULL` (Web Push API endpoint + keys)
  - `email_digest_enabled BOOLEAN NOT NULL DEFAULT true`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### RLS
- `notifications` SELECT: `company_id = jwt.company_id AND (user_id IS NULL OR user_id = jwt.sub)`
- `notifications` INSERT/UPDATE/DELETE: service-role only (server-side dispatch)
- `notification_preferences` SELECT/UPDATE: `user_id = jwt.sub`

### Event catalog (17 types — grouped by category for preferences)
- **estimate** (4): viewed, accepted, declined, expired
- **payment** (2): received, refunded
- **trial** (3): expiring_3d, expired, converted
- **quota** (2): 80pct, exhausted
- **whatsapp** (1): inbound
- **ai_job** (2): failed, completed (only opt-in — usually noisy)
- **admin** (2): tier_changed, bonus_credits_granted
- **system** (1): maintenance

### Dispatch API (`lib/notifications/dispatch.ts`)
```ts
notify({
  companyId: string
  userId?: string | null      // null = company-wide (all members see it)
  eventType: EventType
  title: string
  body: string
  linkUrl?: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  pinned?: boolean
  channels?: { inApp?: boolean; email?: boolean }  // override prefs (e.g., trial.expired ALWAYS emails)
}): Promise<{ ok: boolean; notificationId?: string }>
```
- Reads user's `notification_preferences` to decide channels (unless overridden)
- Inserts row in `notifications` (in_app channel)
- If email enabled: queues Inngest function that handles digest grouping
- Best-effort: failures logged but don't throw (don't block business logic)
- Idempotency via `metadata.dedupe_key` if provided (prevents double-fire from webhook retries)

### Bell icon + panel
- Topbar component `NotificationBell` (client) — Radix Popover with 400px panel
- Unread count badge (red dot with number; "9+" if >9)
- Panel sections: "Unread" (top) + "Recent" (below); both grouped by day
- Click on item → navigate to `link_url` + PATCH `read_at = now()`
- "Mark all as read" CTA at top + "See all →" linking to `/notifications`

### Real-time updates
- Supabase Realtime subscribe to `notifications` table filtered by company_id + user_id
- Increment local unread counter on INSERT event
- No polling

### Email digest
- Inngest scheduled function `notification.email-digest` runs every 15 min
- Groups unsent notifications by user + category, sends one email per category if >3 events in last 15 min, else sends immediate one-off email
- Email rendered via existing branded Resend template pattern

### Browser push (scaffold only)
- `/settings/notifications` button: "Enable browser notifications"
- Triggers `Notification.requestPermission()` + `serviceWorker.register('/sw.js')`
- Stores `pushSubscription` in `notification_preferences.push_subscription`
- `/sw.js` minimal handler — receives push event + shows notification
- ACTUAL push send-side deferred to Phase 2 (need VAPID keys + push library; out of scope)

### Auto-cleanup
- Inngest scheduled function `notification.cleanup` runs daily 03:00 UTC
- Deletes rows where `created_at < now() - interval '60 days' AND NOT pinned AND expires_at IS NULL OR expires_at < now()`

### UI tokens
- Use existing glass + gradient-brand for unread state
- Read items: muted
- Per-category icon (Lucide): MessageSquare (whatsapp), DollarSign (payment), FileText (estimate), Clock (trial), Activity (quota), ShieldCheck (admin), Cpu (ai_job), Wrench (system)

### Claude's discretion
- Whether to use Supabase Realtime client wrapper (`@supabase/supabase-js` createClient) directly or build a small abstraction
- Exact debounce on real-time update batching (likely 300ms)
- Whether 17 event types is the final list — researcher can suggest adds/cuts based on what event sources actually exist in the codebase
- Whether `/notifications` page is virtualized for >1000 entries (likely not in v1)

</decisions>

<code_context>
## Existing Code Insights (to be confirmed by researcher)

### Reusable Assets
- `lib/email/` — Resend pattern for branded emails
- `lib/email/branding.ts` — `getBranding()` for tenant brand colors/logo in emails
- `lib/inngest/client.ts` — Inngest client for scheduled functions
- `lib/admin/audit-log.ts` (Phase 71) — exemplar of best-effort logging helper pattern
- `components/ui/popover.tsx` — Radix Popover for bell panel
- `components/ui/badge.tsx` — for unread count
- `components/app-shell/topbar.tsx` — where bell icon mounts
- Supabase Realtime via `supabase.channel(...)` pattern

### Event sources to instrument (17 events)
- `app/api/share/[token]/view/route.ts` — estimate.viewed (or wherever view tracking lives)
- Send accept/decline server actions — estimate.accepted / declined
- `app/api/webhooks/stripe/route.ts` Connect branch — payment.received
- `app/api/cron/expire-trials/route.ts` — trial.expired
- `app/api/cron/trial-warning-emails/route.ts` — trial.expiring_3d
- Quota enforcement code (lib/billing/quota?) — quota.80pct + exhausted
- `lib/whatsapp/handler.ts` — whatsapp.inbound
- Inngest worker functions — ai_job.failed / completed
- `app/admin/companies/actions.ts` — admin.tier_changed / bonus_credits_granted

### Integration Points
- Migration: `supabase/migrations/{ts}_notifications_system.sql`
- Type regen post-migration
- Topbar: add `NotificationBell` between LanguageToggle and ThemeToggle (researcher verifies)
- Settings: add `notifications` tab inside `app/(app)/settings/(tabs)/`
- Inngest registration: new functions in `lib/inngest/functions/`
- Service worker: `public/sw.js`

</code_context>

<specifics>
## Specific Ideas

**The 12 NOTIF-* success criteria are authoritative.** Plans should map each to specific tasks.

**Plan structure (estimated 7 plans):**
- 77-01: DB foundation — migration (2 tables + RLS + indexes), TypeScript types regen, Wave 0 RED tests for dispatch logic
- 77-02: Dispatch helper + preferences fan-out logic + event catalog enum (turns RED → GREEN)
- 77-03: Instrument 17 event sources at their call sites
- 77-04: Topbar bell + panel + unread state + Supabase Realtime subscription
- 77-05: `/notifications` full-page view + filtering + pagination + search
- 77-06: Email digest Inngest function + auto-cleanup cron + Resend branded template
- 77-07: `/settings/(tabs)/notifications` + per-category toggles + Web Push permission scaffold
- E2E + i18n + closeout folded into 77-07 to keep plan count tight

</specifics>

<deferred>
## Deferred Ideas

- SMS via Twilio — future seed if marketing wants
- Per-user custom rules — out of scope (complex, low usage signal)
- Notification analytics — admin dashboard already covers; analytics is separate concern
- Actual browser push delivery — needs VAPID keys + web-push lib; defer to Phase 2 if signaled
- Mark-as-unread feature — not requested, complicates state
- Snooze button — same, out of scope v1

</deferred>
