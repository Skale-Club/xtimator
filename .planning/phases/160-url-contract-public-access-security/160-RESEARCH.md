# Phase 160 Research: URL Contract & Public Access Security

**Researched:** 2026-07-08
**Confidence:** HIGH — every claim below is grounded in direct reads of the current files (paths + line numbers cited), not the milestone-level research restated. Where ARCHITECTURE.md/PITFALLS.md already nailed something, this doc goes one level deeper (exact current file contents, exact signatures, exact SQL) rather than repeating their prose.

## Summary

The existing public-share pipeline is a single, tight, already-hardened unit:
`lib/queries/share.ts` (`getEstimateByShareToken` / `getShareLinkState`) → `app/estimate/[token]/page.tsx` → `app/estimate/[token]/actions.ts` (`logEstimateView` / `respondToEstimate`), all keyed by exact-match `.eq('share_token', token)` through `requireServiceClient()` (RLS bypassed on purpose, PII stripped in the query layer). This phase adds a **second, parallel, equally-hardened lookup path** keyed by a new `estimates.public_slug_token` column, reachable via a new 2-segment route `app/estimate/[companySlug]/[estimateSlug]/page.tsx`, while leaving every file in the existing token path byte-for-byte untouched.

Two verification findings materially change this phase's risk picture from what PITFALLS.md/ARCHITECTURE.md assumed:

1. **The `x-white-label` custom-domain header path is confirmed DEAD.** `proxy.ts` (159 lines, read in full) and `next.config.ts` (108 lines, read in full) contain **zero** custom-host detection, zero header-forwarding, zero rewrite logic. `app/estimate/[token]/page.tsx:62` still reads `headersList.get('x-white-label')`, but nothing in the current request pipeline ever sets it — `isWhiteLabel` is unconditionally `false` today. `tests/unit/custom-domain-routing.test.ts` reinforces this: it re-implements `isCustomHost()` as a **local, un-imported copy** of what Phase 39's plan said to add to `proxy.ts`, meaning even the test never exercises real proxy.ts behavior.
2. **The Stripe `?stripe=success`/`?stripe=canceled` banner UI PITFALLS.md flagged as a redirect contract to protect no longer exists in the app.** `components/share/estimate-view.tsx` (grepped in full) has zero `stripe`/`searchParams`/"Payment received"/"Payment canceled"/"Pay $" references. `lib/actions/invoice.ts:141-144` contains an explicit code comment: *"the Phase-70 standalone estimate checkout pay-route no longer exists (superseded by Phase-94 hosted invoices)."* The live payment flow today is Stripe-hosted invoices (`hosted_invoice_url`, an external Stripe domain), not a Checkout redirect back to `/estimate/{token}`. Only two now-stale e2e specs (`tests/e2e/estimate-share-payment.spec.ts`, `tests/e2e/visual/share.spec.ts`) still assert on this dead UI, gated behind `hasSeederCredentials()`. See "Custom-domain verification finding" below for the full write-up (this is a bonus finding adjacent to PUBURL-06, not a scope change to PUBURL-04 — see that section for what actually still needs migrating in `connect-webhook.ts`).

Neither finding blocks the phase — they narrow it. No white-label-aware behavior should be built into the new route (document as dead, per CONTEXT.md's own instruction), and the `connect-webhook.ts` share-URL migration should be understood as migrating **payment-confirmation email links**, not a Stripe Checkout redirect target.

---

## Files to change

| File | What changes |
|---|---|
| `lib/queries/share.ts` | ADD two sibling exports: `getEstimateByPublicToken(shortToken)`, `getShareLinkStateByPublicToken(shortToken)`. Zero changes to the existing `getEstimateByShareToken`/`getShareLinkState` (lines 1-287 untouched). |
| `app/api/estimates/[id]/send-sms/route.ts` | Line 100-103: replace the inline `` `${baseUrl}/estimate/${estimate.share_token}` `` with a call to the new shared builder. |
| `lib/whatsapp/send-estimate.ts` | Line 74-76: same inline-string replacement (this is the file that actually builds the WhatsApp share URL — `app/api/estimates/[id]/send-whatsapp/route.ts` itself has no inline URL construction; it only calls `deliverEstimateViaWhatsApp`, defined in this file). |
| `lib/whatsapp/confirm-actions.ts` | Line ~123: same inline-string replacement (separate call site — the WhatsApp *inbox conversational* confirm flow, distinct from the Send-tab flow above). |
| `lib/billing/connect-webhook.ts` | Line 179 (`handleCheckoutSessionCompleted`) and line 324 (`handleInvoicePaid`): both build `estimateShareUrl`/`ctx.estimateShareUrl` inline as `` `${origin}/estimate/${...share_token}` ``. These are **payment-confirmation email body links** (fed into `sendPaymentReceivedEmail`/`sendPaymentReceiptEmail`), not a Stripe `success_url`/`cancel_url` — see "Custom-domain verification finding" for why that distinction matters. |
| `app/api/estimates/[id]/send/route.ts` | Line 113: `const shareLink = ...` is a dead/unused local (self-documented by its own comment "Will be set in email body by user") — optional cleanup, not required for PUBURL-01..06, flag but don't block on it. |

No changes to: `app/estimate/[token]/page.tsx`, `app/estimate/[token]/actions.ts`, `app/estimate/[token]/layout.tsx`, `app/estimate/[token]/error.tsx`, `app/estimate/[token]/loading.tsx`, `proxy.ts`, `next.config.ts`, `lib/utils/share-link.ts` (kept as the legacy client-only fallback per CONTEXT.md's own decision).

## New files

| File | Purpose |
|---|---|
| `supabase/migrations/<next-timestamp>_phase160_public_url_contract.sql` | Idempotent DDL: `companies.slug` + `estimates.public_slug_token`, both nullable with their own partial unique indexes. Pure schema — see "Migration approach". |
| `scripts/backfill-public-urls.mjs` (or `.ts`, matching the existing `scripts/storage-smoke.ts` precedent) | One-time, idempotent backfill for existing rows — see "Migration approach" for why this is a script, not SQL. |
| `lib/estimate/public-url.ts` | The new isomorphic builder — `buildEstimatePublicPath(...)`. Sole place that decides friendly-vs-token path shape. |
| `app/estimate/[companySlug]/[estimateSlug]/page.tsx` | New public route. Structurally mirrors `app/estimate/[token]/page.tsx` (same `getShareLinkState`-equivalent 404/expired branching, same fire-and-forget view logging, same `EstimateView` render) but resolves via `public_slug_token` instead of `share_token`. |
| `app/estimate/[companySlug]/[estimateSlug]/layout.tsx` | Mirrors `app/estimate/[token]/layout.tsx` (4 lines: `data-theme="light"` wrapper + `PRIVATE_ROBOTS` metadata). **Claude's discretion:** either duplicate this tiny file (safest — keeps the "coexist, never touch the existing route" posture literal) or hoist it one level to `app/estimate/layout.tsx` and delete both copies (Next.js layouts apply to all nested dynamic segments automatically, so this is a legitimate DRY move that touches zero behavior) — either is fine, duplication is lower-risk for this phase's "don't touch what already works" ethos. |
| `app/estimate/[companySlug]/[estimateSlug]/error.tsx`, `loading.tsx` | Recommended for UX parity with the token route (not literally required by PUBURL-01..06's text, but the token route has them and a friendly-URL visitor deserves the same loading/error UX). |
| Test file(s) — see "Validation Architecture" | Unit tests for the two new `lib/queries/share.ts` exports + an integration RLS-negative test. |

## Migration approach

**Schema migration is pure DDL** (idempotent `ADD COLUMN IF NOT EXISTS` + partial unique index + `COMMENT ON COLUMN`), copying the exact idiom already used twice in this codebase for exactly this shape of column:

- `supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql` — dormant-first nullable JSONB/column additions, comment-documented, "nothing reads these until Phase N."
- `supabase/migrations/20260706000007_rls_hardening_indexes_grants.sql:56-57` — the exact partial-unique-index pattern to mirror for `public_slug_token`: `CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_share_token ON public.estimates(share_token) WHERE share_token IS NOT NULL;`

```sql
-- supabase/migrations/<next-timestamp>_phase160_public_url_contract.sql
-- Phase 160 (PUBURL-01/03): friendly-URL contract, dormant-first. Mirrors
-- 20260627000001_phase129_advanced_pricing_schema.sql's idiom and
-- 20260706000007_rls_hardening_indexes_grants.sql's partial-unique-index
-- pattern for estimates.share_token. Pure DDL — no anon grants, no policy
-- changes (Pitfall 3 / 20260606000002_drop_estimates_anon_select_policy.sql
-- is the vulnerability class this migration must never reintroduce).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug
  ON public.companies(slug) WHERE slug IS NOT NULL;

COMMENT ON COLUMN companies.slug IS
  'Cosmetic path segment for the friendly estimate URL (PUBURL-01). NULL until
   backfilled by scripts/backfill-public-urls. Never part of the authorization
   check — public_slug_token is the sole secret.';

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS public_slug_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_public_slug_token
  ON public.estimates(public_slug_token) WHERE public_slug_token IS NOT NULL;

COMMENT ON COLUMN estimates.public_slug_token IS
  'Second, independent bearer-credential-grade token (PUBURL-01/03) backing the
   friendly /estimate/{companySlug}/{estimateSlug}-{token} URL. Own partial
   unique index, separate from share_token — never truncated/reused from it.
   NULL until backfilled. Same exact-match, service-role-only lookup discipline
   as share_token — see 20260606000002_drop_estimates_anon_select_policy.sql.';
```

**Backfill is deliberately a companion script, NOT a SQL `UPDATE`**, for a reason specific to this codebase's precedents: this repo has two backfill styles depending on whether the computed value needs external randomness/string-processing —

- **Pure-relational backfills run as SQL** (e.g. `supabase/migrations/20260525000002_estimate_seq.sql`'s `ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id)` — deterministic, no external RNG, no app logic needed).
- **Backfills needing app-level logic run as standalone scripts** (e.g. `scripts/apply-migration-*.mjs`, `scripts/storage-smoke.ts` precedent for one-off maintenance scripts against the service-role client).

`public_slug_token` needs a true CSPRNG (`crypto.randomBytes(n).toString('base64url')`, Node's `crypto`, already the established idiom via `generateOpaqueToken()` in `lib/oauth/tokens.ts:17-19` — `randomBytes(32).toString('hex')`). Doing this in raw SQL would require enabling `pgcrypto` (not currently used anywhere in this repo — grepped, zero hits for `pgcrypto`/`gen_random_bytes` across all migrations) and would create a **second, divergent RNG implementation** for "how do we generate a public_slug_token" (one in SQL for backfill, one in TS for new rows) — exactly the kind of drift Pitfall 4 warns about. Recommendation: **one script, one code path**, used both for the one-time backfill and (via a shared exported helper) for new-estimate creation going forward.

`companies.slug` collision handling (numeric suffix on duplicate) *could* be done in pure SQL mirroring `estimate_seq`'s window-function technique, but since the script already has to run for `public_slug_token` anyway, doing both backfills in the same script keeps slugification in exactly one place — reusing the existing `slugify()` one-liner from `app/admin/blog/actions.ts:10-12` (`s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`), not a second regex reimplementation in SQL.

```js
// scripts/backfill-public-urls.mjs — idempotent, safe to re-run (WHERE ... IS NULL guards)
import { randomBytes } from 'node:crypto'
// ... requireServiceClient()-equivalent setup (mirror scripts/apply-migration-*.mjs's pattern)

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// 1. companies.slug — paginate all rows WHERE slug IS NULL, compute slugify(name),
//    append -2/-3/... on unique-index collision (retry-on-23505), same discipline
//    as any insert racing a partial unique index.
// 2. estimates.public_slug_token — paginate all rows WHERE public_slug_token IS NULL,
//    generate randomBytes(9).toString('base64url') (12 chars — see token-length note
//    in "Exact functions to add"), retry-on-23505 collision (astronomically rare
//    at ~71 bits but the retry loop costs nothing).
```

## Exact functions to add

Mirroring `getEstimateByShareToken`/`getShareLinkState` in `lib/queries/share.ts` field-for-field — same `requireServiceClient()`, same exact-match `.eq()`, same expiry check, same PII-stripping discipline. **Critical design point (Pitfall 6):** the friendly lookup must expose the estimate's REAL `share_token` back to the calling page (server-side only) so `logEstimateView`/`respondToEstimate`/expiry checks continue to key off `share_token` — never off `public_slug_token`. It is added as one extra field on the return type, alongside the already-stripped public payload:

```ts
// lib/queries/share.ts — new exports, added after the existing getShareLinkState

export interface PublicTokenEstimateData extends ShareEstimateData {
  /** The estimate's real share_token, resolved server-side only for reuse by
   *  logEstimateView/respondToEstimate/getShareLinkState-equivalent expiry
   *  checks. NEVER render this into any client-visible field beyond what
   *  EstimateView already does with `token` today (Pitfall 6) — the friendly
   *  page must key its accept/decline actions off THIS value, not shortToken. */
  realShareToken: string
}

export async function getEstimateByPublicToken(
  shortToken: string
): Promise<PublicTokenEstimateData | null>
// Body: identical to getEstimateByShareToken but .eq('public_slug_token', shortToken)
// instead of .eq('share_token', token); same share_expires_at / isShareLinkExpired
// gate; same strip-share_token-from-payload step; ADDS `realShareToken:
// estimateData.share_token` onto the returned object before stripping it out of
// the nested `estimate` field (mirrors the existing destructure-then-omit pattern
// at share.ts:242-244).

export async function getShareLinkStateByPublicToken(
  shortToken: string
): Promise<ShareLinkState>
// Body: identical to getShareLinkState but .eq('public_slug_token', shortToken)
// instead of .eq('share_token', token). Selects only `share_expires_at` (PII-free,
// same as today).
```

```ts
// lib/estimate/public-url.ts — NEW file, isomorphic (no `window`/`request` reference)
export interface PublicUrlEstimate {
  id: string
  public_slug_token: string | null
  share_token: string
  project_name?: string | null   // for the estimateSlug text
}
export interface PublicUrlCompany {
  slug: string | null
  name: string
}

/** Returns a PATH ONLY (no origin) — callers combine with window.location.origin
 *  (client) or getCanonicalBaseUrl()/resolveBaseUrl() (server), exactly as
 *  buildShareLink() and the 5 call sites below already do today. Falls back to
 *  the token-only legacy path when slug data is absent (pre-backfill edge case,
 *  or a row somehow missing public_slug_token). */
export function buildEstimatePublicPath(
  company: PublicUrlCompany,
  estimate: PublicUrlEstimate
): string {
  if (company.slug && estimate.public_slug_token) {
    const estimateSlug = slugify(estimate.project_name || 'estimate')
    return `/estimate/${company.slug}/${estimateSlug}-${estimate.public_slug_token}`
  }
  return `/estimate/${estimate.share_token}` // legacy fallback — buildShareLink()'s shape
}
```

**Token-length / parsing decision the PLAN must lock explicitly:** generate `public_slug_token` at a **fixed length** (recommend 12 chars from `randomBytes(9).toString('base64url')` ≈ 71 bits — comfortably above the ≥60-bit floor CONTEXT.md/PITFALLS.md set) and parse the friendly route by **fixed-length suffix** (`estimateSlug.slice(-12)`), not by splitting on the last `-`. This matters concretely because `base64url`'s alphabet includes `-` and `_` as its 62nd/63rd characters — a token that happens to end in `-` makes "split on last hyphen" genuinely ambiguous, whereas a fixed-length slice is unambiguous regardless of the token's own characters. ARCHITECTURE.md flagged this tradeoff abstractly ("or a fixed-length suffix if the token generator uses a fixed length, which is simpler and less fragile"); this research makes it concrete enough to lock in the PLAN.

**The `companySlug`/`estimateSlug` route params are read but never validated against the resolved row** — per CONTEXT.md's explicit decision ("slugs are cosmetic/readable, the token is the actual secret"), the route only ever extracts the trailing fixed-length token and calls `getEstimateByPublicToken(shortToken)`. A stale/wrong company or estimate slug in the URL (e.g. after a company rename) must still resolve successfully — no redirect-to-canonical-slug logic in v1 (explicitly deferred by ARCHITECTURE.md: "no redirect is required... a 301-to-canonical-friendly-URL can be added later as a pure enhancement").

## Call sites to migrate

All 5 literal `` `.../estimate/${...share_token}` `` constructions found by direct grep, to be routed through `buildEstimatePublicPath()` (server call sites combine it with `getCanonicalBaseUrl()`; the one client call site, `send-form.tsx`, is OUT OF SCOPE — see note):

1. `app/api/estimates/[id]/send-sms/route.ts:103` — `` const shareUrl = `${baseUrl}/estimate/${estimate.share_token}` ``, used to build the outbound SMS body.
2. `lib/whatsapp/send-estimate.ts:76` — `` const shareUrl = `${baseUrl}/estimate/${estimate.share_token}` ``, used for the Send-tab WhatsApp delivery's `share_link`/fallback message body. (Note: `app/api/estimates/[id]/send-whatsapp/route.ts` itself has no inline URL — it only calls `deliverEstimateViaWhatsApp` from this file.)
3. `lib/whatsapp/confirm-actions.ts:~123` — `` const shareUrl = `${getCanonicalBaseUrl()}/estimate/${estimate.share_token}` ``, a separate call site inside the WhatsApp inbox conversational confirm-flow (`buildShareLinkMessage`), distinct from #2.
4. `lib/billing/connect-webhook.ts:179` (`handleCheckoutSessionCompleted`) — `` estimateShareUrl: `${origin}/estimate/${updated.share_token}` ``, fed into `sendPaymentReceivedEmail`/`sendPaymentReceiptEmail`.
5. `lib/billing/connect-webhook.ts:324` (`handleInvoicePaid`) — `` estimateShareUrl: estimate?.share_token ? `${origin}/estimate/${estimate.share_token}` : origin ``, same email-context usage, for the Phase-94 hosted-invoice payment-confirmation path.

**Explicitly OUT OF SCOPE for this phase** (CONTEXT.md: "This phase... does NOT touch the Send UI — that's Phase 163"):
- `components/workspace/send/send-form.tsx:71` — client-side `buildShareLink(shareToken)` call that seeds the email body's default text. `buildShareLink()` itself stays the token-only legacy builder per CONTEXT.md's decision; wiring the Send UI to prefer the friendly path is Phase 163's job.
- `app/api/estimates/[id]/send/route.ts:113` — the dead/unused `shareLink` local. Optional cleanup only.

## Custom-domain verification finding

**Verdict: DEAD.** The `x-white-label` custom-domain header path referenced by `app/estimate/[token]/page.tsx:62` (`headersList.get('x-white-label') === '1'`) has no live producer anywhere in the current request pipeline.

Evidence:
- `proxy.ts` (159 lines, read in full) — no `x-white-label`, no `isCustomHost`, no `NEXT_PUBLIC_APP_HOST` reference, no custom-host detection block of any kind. The file's own comments describe a substantial rewrite for the Coolify/Hetzner migration and a "Pre-launch audit fix" that removed protected-route handling for `/estimate` — the Phase-39 custom-host detection block (documented as landing "before updateSession()" per `.planning/phases/39-subdomain-routing-white-label/39-01-SUMMARY.md`) is simply not present in the file today.
- `next.config.ts` (108 lines, read in full) — only security headers (CSP, HSTS, etc.) + Sentry config. No `rewrites()`/`redirects()`, no host-based routing.
- `tests/unit/custom-domain-routing.test.ts` re-implements `isCustomHost(host, appHost)` as a **local function defined inside the test file itself**, not imported from `proxy.ts`. This is strong corroborating evidence: even the test suite that's supposed to cover this behavior never touches the real `proxy.ts`.
- The `companies.custom_domain` column DOES exist (`supabase/migrations/20260510000001_phase38_custom_domain.sql`) and DOES have a working settings UI (`lib/actions/custom-domain.ts` → `saveCustomDomain()`, persists to `companies.custom_domain`) — so an owner CAN save a custom domain value today, but nothing in the runtime request path ever reads it to detect the incoming host or set the header. The column is fully inert at request time.

**Action for this phase:** per CONTEXT.md's own instruction, do NOT build any custom-domain-aware behavior into the new friendly route, and do NOT attempt to revive/extend the dead `x-white-label` mechanism. Document this finding plainly in the phase SUMMARY (already done here). The new route's `page.tsx` can simply omit the `x-white-label` read entirely (there is nothing to read), or, for exact structural parity with the token route, read it anyway (it will just always evaluate to `false`, identical to today's actual behavior) — either is fine since the header is a no-op either way. Reviving custom-domain support is out of scope (`REQUIREMENTS.md`'s "Out of Scope" table: "Already shipped via SEED-009 — this milestone only verifies... it does not build new domain infrastructure").

**Bonus finding, same verification pass — the Stripe `?stripe=success`/`?stripe=canceled` redirect contract PUBURL-04 mentions is *also* effectively dead**, which changes what "preserve the contract" actually means in practice:
- `components/share/estimate-view.tsx` (grepped in full for `stripe`/`searchParams`/payment-status strings) contains **zero** logic reading a `stripe` query param or rendering a payment-success/canceled banner. The only `stripe` mention is a comment (line 295) about linking out to "the Stripe-hosted invoice page."
- `lib/actions/invoice.ts:141-144` states outright: *"FEE-02: the Phase-70 standalone estimate checkout pay-route no longer exists (superseded by Phase-94 hosted invoices). The invoice path is the single customer-payment surface."*
- The only places `?stripe=success`/`?stripe=canceled` still appear are `tests/e2e/estimate-share-payment.spec.ts` and the one scenario in `tests/e2e/visual/share.spec.ts` — both asserting on UI text (`Payment received`, `Payment canceled`, `Pay $`) that does not exist anywhere in current `components/share/*`. Both suites are gated behind `hasSeederCredentials()`/seed-token env vars, so they likely already skip or fail silently in CI.
- **Practical implication:** the two `connect-webhook.ts` call sites this phase must migrate are payment-confirmation **email** links (`estimateShareUrl` fed to `sendPaymentReceivedEmail`/`sendPaymentReceiptEmail`), not a Stripe Checkout `success_url`/`cancel_url` target. Migrating them to `buildEstimatePublicPath()` carries no Stripe-redirect risk — there is no live Checkout redirect to break. The PLAN should still migrate these two call sites (PUBURL-04 requires it, and it's the right cleanup regardless), but the verification step should NOT spend effort re-running the stale Stripe e2e specs as if they exercise a live contract — they don't. Worth a one-line note in the phase SUMMARY so a future contributor doesn't waste time chasing this.

## Validation Architecture

How PUBURL-01..06 get tested, concretely:

**PUBURL-01 (friendly URL resolves, generated for every estimate):**
- Unit test (new, alongside `tests/unit/share-query.test.ts`'s existing pattern — same `vi.mock('@/lib/supabase/service', ...)` + `serviceClientMock.from` harness) covering `getEstimateByPublicToken`: resolves on exact `public_slug_token` match, returns `null` on unknown token, returns `null` when expired (mirror the 5 existing `getEstimateByShareToken` test cases at `tests/unit/share-query.test.ts:106-144` one-for-one, swapping the lookup column).
- Unit test for `buildEstimatePublicPath()`: returns the friendly path when both `company.slug` and `estimate.public_slug_token` are present; falls back to the token-only path when either is null (covers pre-backfill/edge-case rows).
- Integration/smoke: after the migration + backfill script run, a scripted check that every row in `estimates`/`companies` has non-null `public_slug_token`/`slug` (a simple `SELECT count(*) WHERE public_slug_token IS NULL` via the Supabase MCP `execute_sql` tool or a one-off script) — proves the backfill actually covered 100% of existing rows, not just new ones.

**PUBURL-02 (old token links keep working, zero regression):**
- No new test needed for the untouched files themselves (`app/estimate/[token]/*` is byte-for-byte unchanged), but add a regression guard: a test asserting `getEstimateByShareToken` and `getShareLinkState`'s exported signatures/behavior are unchanged (or simply rely on the existing `tests/unit/share-query.test.ts` suite passing unmodified — if the PLAN accidentally touches `lib/queries/share.ts`'s existing functions, that suite already catches it).
- Manual/e2e smoke: open a real pre-existing `/estimate/{share_token}` link post-deploy and confirm it still renders, still logs a view, still allows accept/decline — the existing Playwright suites already cover the token route's happy path (independent of the stale Stripe scenarios called out above).

**PUBURL-03 (no new anon RLS policy, service-role + exact-match only) — the highest-severity item:**
- **Negative security-regression test**, modeled directly on the existing precedent `tests/integration/price-book-rls.test.ts` (which already proves this exact pattern works: real anon client, `describe.skip` when env vars absent, asserts empty/denied read). New test: `tests/integration/estimates-public-token-rls.test.ts`:
  ```ts
  // anon client (NEXT_PUBLIC_SUPABASE_ANON_KEY / publishable key), no session
  const { data, error } = await anonClient
    .from('estimates')
    .select('*')
    .eq('public_slug_token', someKnownToken)
  // Must return zero rows (RLS denies, or the row itself is invisible) —
  // never PII. If there's an error, it must be a policy/permission error,
  // never "column does not exist" (which would mean the column silently
  // didn't get created).
  expect(data ?? []).toHaveLength(0)
  ```
- Static check as part of code review / CI: grep the new migration for `TO anon` or `FOR SELECT.*anon` — must find nothing. This is cheap enough to also assert as a unit test reading the migration file's raw SQL text (`expect(migrationSql).not.toMatch(/TO anon/)`), giving a permanent regression guard even if someone edits the migration file later.
- Confirm via `mcp__list_tables`/`get_advisors` (Supabase MCP) after the migration lands that `estimates` still has exactly the same RLS policy set as before (no new policy rows), and that `idx_estimates_public_slug_token`/`idx_companies_slug` exist as partial unique indexes (not full-table/non-unique).

**PUBURL-04 (shared builder, Stripe redirect contract preserved):**
- Unit test for `buildEstimatePublicPath()` (see PUBURL-01) is the primary regression guard.
- Grep-based CI-adjacent check (can be a one-line test or a documented manual step): `grep -rn "/estimate/\${" app/ lib/ components/` should return **zero** hits outside `lib/estimate/public-url.ts` and `lib/utils/share-link.ts` (the two sanctioned builders) after the phase ships — this is the concrete, automatable version of PITFALLS.md's "warning sign" for Pitfall 5.
- Given this research's finding that the literal Stripe `success_url`/`cancel_url` redirect no longer exists in the live payment flow, do NOT invest in re-running `tests/e2e/estimate-share-payment.spec.ts` as a meaningful regression gate — instead, verify the two `connect-webhook.ts` call sites' migrated output is a well-formed URL that still 200s when visited (a payment-confirmation email is the only consumer left).

**PUBURL-05 (view-logging/accept-decline identical regardless of URL form):**
- Unit test: `getEstimateByPublicToken` returns a `realShareToken` field equal to the row's actual `share_token` (not the `public_slug_token`/shortToken used to look it up) — this is the field the new page.tsx must thread into `logEstimateView`/`respondToEstimate`/`EstimateView`'s `token` prop.
- Integration/e2e: seed one estimate with both a `share_token` and a `public_slug_token`; open it via the friendly URL; assert `estimates.viewed_at` updates (same DB row, regardless of which URL resolved it) and `estimate_activity` gets an `estimate_viewed` row — mirrors the existing manual QA script PITFALLS.md's Pitfall 6 already specifies, now made concrete as an automatable test using the same seeding pattern as `tests/e2e/estimate-share-payment.spec.ts`'s `seedConnectEstimates()` fixture helper (`tests/e2e/fixtures/connect-estimates.ts`).
- Expired-link parity: `getShareLinkStateByPublicToken` returns `'expired'` (not `'missing'`) when `share_expires_at` is in the past, exactly mirroring `getShareLinkState`'s existing 3 test cases (`tests/unit/share-query.test.ts:147-164`) — proves the friendly route's 404 page shows the same "this link has expired" messaging instead of a generic Next.js 404.

**PUBURL-06 (custom-domain compatibility verified/documented):**
- No behavioral test needed — this requirement is satisfied by the direct-verification finding documented above (dead code, confirmed via full reads of `proxy.ts`/`next.config.ts`/the routing test file) plus writing that finding plainly into the phase SUMMARY, per CONTEXT.md's explicit instruction ("if it's confirmed dead, document that finding plainly... do not spend effort reviving or extending it").
- Optional belt-and-suspenders: a unit test asserting `app/estimate/[companySlug]/[estimateSlug]/page.tsx`'s handling of `x-white-label` (if read at all) never throws and always degrades to non-white-label rendering — cheap insurance against a future accidental revival assuming the header is meaningful.

**Cross-cutting:** every new test above should be run alongside the FULL existing `tests/unit/share-query.test.ts` and `tests/unit/estimates/share-link.test.ts` suites unmodified — passing them unchanged is itself proof this phase didn't regress the existing token path (PUBURL-02's real enforcement mechanism).

## RESEARCH COMPLETE

Researched the exact current shape of the public-share pipeline (`lib/queries/share.ts`, `app/estimate/[token]/*`, `lib/utils/share-link.ts`/`site-url.ts`), this project's migration conventions (DDL-only idempotent additive columns + partial unique indexes, per `20260627000001`/`20260706000007`; app-level backfill scripts for anything needing CSPRNG/slugify per the `scripts/*.mjs` precedent, not raw SQL), the exact 5 call sites that hand-roll share URLs today (`send-sms/route.ts:103`, `lib/whatsapp/send-estimate.ts:76`, `lib/whatsapp/confirm-actions.ts:~123`, and both `connect-webhook.ts:179,324`), and designed the two new `lib/queries/share.ts` sibling functions plus the new isomorphic `lib/estimate/public-url.ts` builder to mirror existing patterns exactly. Two verification findings materially de-risk the phase: the `x-white-label` custom-domain header path is confirmed dead (no producer anywhere in `proxy.ts`/`next.config.ts`), and — a bonus finding beyond what CONTEXT.md asked to verify — the Stripe `?stripe=success/canceled` banner UI that PUBURL-04's "preserve the redirect contract" language was protecting has itself already been superseded by Phase 94's hosted-invoice flow and no longer exists in `estimate-view.tsx`, meaning the two `connect-webhook.ts` call sites to migrate are payment-confirmation email links, not a live Stripe Checkout redirect target. Full validation architecture (unit + integration RLS-negative + e2e) is laid out per PUBURL-01..06 above, built on this codebase's own existing test patterns (`tests/unit/share-query.test.ts`, `tests/integration/price-book-rls.test.ts`).
