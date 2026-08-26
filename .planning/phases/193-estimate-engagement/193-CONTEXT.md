# Phase 193 — Estimate Engagement Observability + Share Password

**Milestone:** v4.25 (first phase)
**Branch:** `feat/estimate-engagement`
**Created:** 2026-08-25

## Why

A customer asked for observability on sent estimates: after the business owner sends the
share link, they need to know whether the client actually engaged — how many times the
estimate was opened, what was clicked, a heatmap of attention on the public page — so they
can judge interest and follow up at the right moment. They also want the option to lock a
shared estimate behind a password.

## What exists today (verified 2026-08-25)

- Public share surface: `app/estimate/[token]/page.tsx` (canonical) and
  `app/estimate/[token]/[estimateSlug]/page.tsx` (friendly URL). Both are server
  components resolving via `lib/queries/share.ts` with the **service-role client**
  (both anon RLS SELECT policies were deliberately dropped — never reintroduce them).
- View tracking is thin: `estimates.viewed_at` set once + one
  `estimate_activity('estimate_viewed')` row via `logEstimateView` in
  `app/estimate/[token]/actions.ts`. No view count, no per-view rows, no clicks,
  no scroll/section data, no heatmap, and `logEstimateView` is **unthrottled** and
  sends a Resend notification email inline on the request path.
- `estimate_activity` cannot hold anonymous visitor events (`project_id NOT NULL`,
  authenticated-only RLS). Precedent for a session-level event table: `tour_events`
  (`supabase/migrations/20260521000001_tour_events.sql`) + its retention entry in
  `lib/inngest/functions/retention-cleanup.ts`.
- No password/PIN gate anywhere. Reusable primitive: `lib/auth/support-mode.ts`
  (HMAC-SHA256 signed cookie keyed by `APP_ENCRYPTION_KEY`, `timingSafeEqual`, TTL).
- Rate limiting: `lib/ratelimit.ts` (Redis, fail-open). Public unauthenticated write
  precedent: `signPerMinute` keyed by `resolveClientIp()` in
  `app/api/estimates/[id]/sign/route.ts`.
- Unauthenticated browser-POST collector precedent: `app/api/csp-report/route.ts`
  (204, force-dynamic, never throws, exempted in `proxy.ts isPublicRoute()`).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Event storage | New table `estimate_engagement_events`, service-role writes only, no anon RLS | `estimate_activity` structurally unfit; keeps the hardened share-page security posture |
| Ingestion | One public batch endpoint `POST /api/track/estimate` (sendBeacon-friendly) | Single boundary to exempt/limit/register; batching keeps write volume sane |
| "Opens" definition | 1 open = 1 page-load `view` event; unique visitors via anonymous localStorage id | Matches what the customer means by "quantas vezes abriu" |
| Heatmap capture | Click x/y normalized to document width % + absolute y px + doc height, plus section id | Renders correctly over a re-render of the same document at any scale; no external lib |
| Heatmap render | Density overlay (canvas radial gradients) positioned over the read-only `EstimateDocument` in the workspace | Reuses the real renderer; zero screenshot infra |
| Password storage | `scrypt` hash (node:crypto, salt embedded, timing-safe verify) in `estimates.share_password_hash` | No new dependency; per-estimate toggle |
| Unlock session | HMAC-signed scoped cookie (support-mode pattern), payload = sha256(share_token) + exp, TTL 24h | Client enters password once per device/day; nothing secret stored client-side |
| Visitor privacy | Do **not** persist IP or raw UA in event rows; IP used only for rate-limit keys; coarse `device` (mobile/desktop) only | GDPR-light, matches 90-day retention purge |
| Email open pixel | Deferred (stretch) | Pixel blocking makes it unreliable; page-open tracking already answers the question |

## Hard constraints (from repo memory — violating any of these breaks prod or CI)

1. Any new public route position under `/estimate` must reuse the `[token]` param name
   (sibling dynamic slug conflict crashed prod once; it is permanent).
2. New API routes must be added to `proxy.ts isPublicRoute()` (if public), to
   `MUTATION_BOUNDARY_MANIFEST` in `tests/unit/demo/mutation-boundary-sweep.test.ts`,
   and get a `LimitName` in `lib/ratelimit.ts` — all three, or things break silently.
3. Migrations are applied **manually to prod first** (Supabase MCP `f2b95485` =
   prod `prmqgcrnpuvpzruyzvuv`), then code that needs them is pushed. Never rely on deploy.
4. Demo tenants must not write engagement rows: guard with `assertWritable` /
   `assertCompanyWritable` like `logEstimateView` already does.
5. CI gate is `tsc -p tsconfig.ci.json` + `vitest run tests/unit tests/eval`; a red Test
   run silently blocks every deploy. Check the suite's real exit code (no piping to tail).

## Plan breakdown

- **193-01** — Schema + ingestion pipeline (migration, `/api/track/estimate`, client
  tracker hook, `logEstimateView` hardening: view_count, last_viewed_at, rate limit,
  notification off the hot path).
- **193-02** — Password protection (set/remove password UI, unlock page + server action,
  signed cookie gate on both public routes, attempt rate limit, unlock events).
- **193-03** — Engagement dashboard + heatmap (queries/aggregations, engagement panel in
  the estimate tab, click-heatmap overlay, activity-timeline labels).

Execution order is 01 → 02 → 03; 02 and 03 are independent of each other after 01 lands.
