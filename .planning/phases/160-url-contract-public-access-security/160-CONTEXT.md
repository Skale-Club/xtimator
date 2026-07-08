# Phase 160: URL Contract & Public Access Security - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning
**Mode:** Autonomous (smart discuss run non-interactively per standing no-checkpoint-interruptions preference — grey areas resolved from `.planning/research/*.md` + `.planning/REQUIREMENTS.md` locked decisions, all HIGH confidence and codebase-grounded, not guesses)

<domain>
## Phase Boundary

A shared estimate can be opened via a short, friendly, branded URL (`/estimate/{companySlug}/{estimateSlug}-{shortToken}`) that coexists PERMANENTLY with the existing `/estimate/{share_token}` link — zero regression to security posture, view-logging, accept/decline behavior, or the Stripe Connect redirect contract for any link already sent to a real client. This phase is the URL/data-model/security foundation only — it does NOT touch the Send UI (that's Phase 163).

</domain>

<decisions>
## Implementation Decisions

### URL shape & token generation
- Friendly path: `/estimate/{companySlug}/{estimateSlug}-{shortToken}` under a NEW route `app/estimate/[companySlug]/[estimateSlug]/page.tsx`, coexisting with the unmodified `app/estimate/[token]/page.tsx` — never replacing it.
- `companySlug`: new `companies.slug` column, generated via the existing dependency-free `slugify()` one-liner already proven in production for `blog_posts.slug`. Backfill for existing companies at migration time (dormant-first, deterministic from `companies.name` + numeric suffix on collision).
- `estimateSlug`: derived from the estimate/project title the same way, non-unique by itself (uniqueness comes from the token suffix).
- `shortToken`: NEW `estimates.public_slug_token` column, ≥10 base62 characters generated via `crypto.randomBytes(n).toString('base64url')` (Node built-in — already this project's idiom via `crypto.randomUUID()` in 4+ places). Its own partial unique index, separate from the existing `share_token` unique index. Never truncate or reuse the `share_token` UUID for this purpose.
- Backfill: every existing estimate gets a `public_slug_token` generated at migration time so the friendly URL works for pre-existing estimates too, not just new ones.

### Security posture (non-negotiable, per PITFALLS.md)
- The new friendly-route lookup (`getEstimateByPublicToken()`, a sibling to `getEstimateByShareToken()` in `lib/queries/share.ts`) uses the EXACT SAME service-role client + exact-match filtering posture. No new `anon`-accessible RLS policy on `estimates` is added under any condition — this table already shipped and reverted a real anon-RLS PII leak (`20260606000002_drop_estimates_anon_select_policy.sql`); do not recreate that bug class.
- `companySlug`/`estimateSlug` alone are never sufficient to resolve an estimate — the lookup always requires the exact `public_slug_token` match too (the slugs are cosmetic/readable, the token is the actual secret).
- No rate limiting on the new route in v1 (deferred — PUBURLX-01 in REQUIREMENTS.md v2 list); token entropy (~60 bits) is the primary defense for this milestone.

### URL construction consolidation
- New `lib/estimate/public-url.ts` (isomorphic — usable both server and client side) is the SOLE builder of estimate public paths, exporting something like `buildEstimatePublicPath(estimate)` (friendly, when slug data exists) and keeping `lib/utils/share-link.ts`'s existing `buildShareLink(shareToken)` as the token-only fallback/legacy builder.
- All existing inline URL-construction call sites are migrated to the new builder: `send-sms/route.ts`, `send-whatsapp/route.ts`, `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts`, and BOTH call sites inside `lib/billing/connect-webhook.ts` (easy to miss — flagged explicitly by PITFALLS.md as a real risk). The `?stripe=success`/`?stripe=canceled` query-param contract must be preserved exactly.

### View-logging & actions
- `logEstimateView`, `respondToEstimate`, `getShareLinkState` all key off the estimate's real `share_token` internally regardless of which route (token or friendly) the client used to reach the page — the friendly route resolves to the same estimate row and then reuses the existing token-keyed logging functions rather than forking a parallel logging path.
- `share_expires_at` expiration applies identically to both URL forms.

### Custom-domain compatibility (SEED-009)
- Before building any custom-domain-aware behavior into the new route, do a direct verification pass on whether the `x-white-label` custom-domain header logic referenced by the existing `app/estimate/[token]/page.tsx` still exists anywhere in `proxy.ts` / `next.config.js` (ARCHITECTURE.md flagged this as possibly dead code). If it's confirmed dead, document that finding plainly in the phase SUMMARY rather than silently assuming it works — do not spend effort reviving or extending it unless it's confirmed alive and load-bearing.
- `proxy.ts` needs no changes for the new friendly path itself — `/estimate/*` is already unprotected at any path depth (confirmed by ARCHITECTURE.md research).

### Claude's Discretion
- Exact `public_slug_token` character length (≥10 is the floor; going slightly longer, e.g. 12-14, for extra margin is fine) and exact collision-handling strategy for slug backfill (numeric suffix vs re-roll) are implementation details, not product decisions.
- Whether the migration backfills `public_slug_token` in the same migration as the column add or a follow-up data migration — whichever is simpler/safer given this project's existing migration conventions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/queries/share.ts` — `getEstimateByShareToken()`, `getShareLinkState()`, service-role + exact-match pattern to mirror exactly.
- `app/estimate/[token]/page.tsx` + `app/estimate/[token]/actions.ts` — existing public route + accept/decline actions, to stay unmodified and untouched.
- `lib/utils/share-link.ts` — existing `buildShareLink(shareToken)`, client-only (`window.location.origin`) — extend, do not replace.
- `app/admin/blog/actions.ts` — existing dependency-free `slugify()` one-liner, proven in production for `blog_posts.slug`.
- `supabase/migrations/20260606000002_drop_estimates_anon_select_policy.sql` — read this migration directly before writing any new RLS-touching migration; it documents the exact vulnerability class to avoid.
- `supabase/migrations/20260409000001_initial_schema.sql` — original `share_token` column + its unique index, the precedent for the new `public_slug_token` unique index.

### Established Patterns
- New nullable/dormant-first columns + backfill migration, mirroring how `companies.tax_config`, `estimates.deposit_type`/`deposit_value` (Phase 129) and other recent additive columns were introduced — always additive, retrocompat by construction.
- `requireServiceClient()`-style service-role access for any public/anon-reachable data path (never a new RLS grant to `anon`).

### Integration Points
- `lib/billing/connect-webhook.ts` — 2 inline share-URL constructions here, easy to overlook; must be updated to the shared builder without breaking the Stripe redirect query params.
- `app/api/estimates/[id]/send-sms/route.ts`, `send-whatsapp/route.ts`, `lib/whatsapp/send-estimate.ts`, `lib/whatsapp/confirm-actions.ts` — all currently hand-roll the share URL; migrate to the shared builder.
- `proxy.ts` — verify (don't assume) the white-label custom-domain header logic before building on it.

</code_context>

<specifics>
## Specific Ideas

None beyond what's captured in Decisions above — this phase's scope and shape were already tightly specified by `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`, and the locked decisions in `.planning/REQUIREMENTS.md`.

</specifics>

<deferred>
## Deferred Ideas

- Rate limiting on the public estimate route (PUBURLX-01 in REQUIREMENTS.md v2 list) — token entropy is the v1 defense.
- Any Send-UI surfacing of the friendly URL (e.g., showing it in a "Online Estimate" tab) — that's Phase 163's job, not this phase's.

</deferred>
