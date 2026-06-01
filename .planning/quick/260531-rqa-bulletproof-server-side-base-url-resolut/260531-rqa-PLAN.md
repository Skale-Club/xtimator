---
phase: quick-260531-rqa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/utils/site-url.ts
  - tests/unit/site-url.test.ts
  - app/demo/route.ts
  - app/api/stripe/connect/initiate/route.ts
  - app/api/estimate/[token]/pay/route.ts
  - app/api/stripe/connect/callback/route.ts
  - lib/oauth/issuer.ts
  - lib/whatsapp/send-estimate.ts
  - lib/whatsapp/confirm.ts
  - app/api/estimates/[id]/send-sms/route.ts
  - app/api/cron/trial-warning-emails/route.ts
  - lib/billing/connect-webhook.ts
  - lib/actions/auth.ts
autonomous: true
requirements: [RQA-URL-01, RQA-URL-02, RQA-URL-03]

must_haves:
  truths:
    - "resolveBaseUrl(request) prefers APP_ORIGIN (runtime, non-inlined) over NEXT_PUBLIC_SITE_URL"
    - "getCanonicalBaseUrl() resolves a request-less canonical URL (APP_ORIGIN → NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → https://xtimator.com)"
    - "Server-side redirects no longer point users to https://0.0.0.0:3000 behind the Coolify proxy"
    - "Existing site-url and oauth-issuer unit tests still pass alongside the new tiers"
  artifacts:
    - path: "lib/utils/site-url.ts"
      provides: "Hardened resolveBaseUrl() + new getCanonicalBaseUrl()"
      contains: "getCanonicalBaseUrl"
    - path: "tests/unit/site-url.test.ts"
      provides: "APP_ORIGIN tier + getCanonicalBaseUrl precedence coverage"
      contains: "APP_ORIGIN"
    - path: "app/demo/route.ts"
      provides: "Redirects built from resolveBaseUrl(request)"
    - path: "app/api/stripe/connect/callback/route.ts"
      provides: "Final redirects built from resolveBaseUrl(request)"
  key_links:
    - from: "app/api/stripe/connect/initiate/route.ts"
      to: "lib/utils/site-url.ts"
      via: "resolveBaseUrl(req) for redirect_uri construction"
      pattern: "resolveBaseUrl"
    - from: "lib/oauth/issuer.ts"
      to: "lib/utils/site-url.ts"
      via: "getCanonicalBaseUrl() for the explicit-env tier"
      pattern: "getCanonicalBaseUrl"
    - from: "lib/whatsapp/send-estimate.ts"
      to: "lib/utils/site-url.ts"
      via: "branding.canonicalBaseUrl ?? getCanonicalBaseUrl()"
      pattern: "getCanonicalBaseUrl"
---

<objective>
Bulletproof server-side public-URL resolution so that, behind the Coolify reverse
proxy (Next.js standalone binds HOSTNAME=0.0.0.0 PORT=3000), no route ever
redirects a user to `https://0.0.0.0:3000`. Add a runtime, non-inlined
`APP_ORIGIN` tier (settable in Coolify without a rebuild), add a request-less
`getCanonicalBaseUrl()` helper, and consolidate every env-based base-URL read
through these two helpers while preserving the DB-first
`platform_branding.canonical_base_url` source where it already exists.

Purpose: NEXT_PUBLIC_SITE_URL is build-inlined — changing it requires a rebuild
on the VPS, which is exactly what we are moving away from. APP_ORIGIN is read at
runtime so the public URL can be fixed by an env change + container restart.
Output: Hardened `lib/utils/site-url.ts`, fixed Part-2 redirect routes, unified
Part-3 env reads, extended unit tests.

THIS IS CODE ONLY (Parts 1–3). **NO git push.** Pushing is a human gate — the VPS
must be confirmed recovered and Coolify's Docker-Image/source-build path disabled
first (on-VPS `next build` OOM-froze prod 2026-05-31).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

@lib/utils/site-url.ts
@tests/unit/site-url.test.ts
@lib/oauth/issuer.ts
@tests/unit/oauth-issuer.test.ts
@lib/platform-config.ts

<interfaces>
<!-- Contracts the executor will produce in Task 1 and consume in Tasks 2-3. -->
<!-- After Task 1, lib/utils/site-url.ts exports exactly these two functions: -->

```typescript
// Request-aware resolver for building redirects from inside a route handler.
// Precedence: APP_ORIGIN → NEXT_PUBLIC_SITE_URL → x-forwarded-proto + (x-forwarded-host || host) → new URL(request.url).origin
export function resolveBaseUrl(request: Request): string

// Request-less canonical resolver for modules with no Request in scope.
// Precedence: APP_ORIGIN → NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → 'https://xtimator.com'
export function getCanonicalBaseUrl(): string
```

<!-- Existing DB-first branding contract (lib/platform-config.ts) — DO NOT change: -->
```typescript
type Branding = { canonicalBaseUrl: string | null; /* ...other fields */ }
export async function getBranding(): Promise<Branding>
```

<!-- normalize() is private to site-url.ts; reuse it for all new tiers. It trims
     whitespace (handles Coolify trailing-\n), strips surrounding quotes, strips a
     trailing slash, returns null for empty/whitespace-only. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Harden lib/utils/site-url.ts (APP_ORIGIN tier + getCanonicalBaseUrl) — Part 1</name>
  <files>lib/utils/site-url.ts, tests/unit/site-url.test.ts</files>
  <behavior>
    Extend tests/unit/site-url.test.ts FIRST (RED), then implement until GREEN.
    Keep all 7 existing tests passing unchanged.

    New resolveBaseUrl() tests:
    - APP_ORIGIN set → wins over NEXT_PUBLIC_SITE_URL (set both to different
      values; expect APP_ORIGIN's value).
    - APP_ORIGIN with trailing newline 'https://xtimator.com\n' → normalized to
      'https://xtimator.com'.
    - APP_ORIGIN unset, NEXT_PUBLIC_SITE_URL set → NEXT_PUBLIC_SITE_URL returned
      (proves tier-2 fallback still works).

    New getCanonicalBaseUrl() describe block (request-less):
    - APP_ORIGIN set → wins over NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_APP_URL.
    - APP_ORIGIN unset, NEXT_PUBLIC_SITE_URL set → NEXT_PUBLIC_SITE_URL.
    - only NEXT_PUBLIC_APP_URL set → NEXT_PUBLIC_APP_URL (legacy alias).
    - all three unset → 'https://xtimator.com'.
    - trailing newline / trailing slash on the winning tier is normalized.
    Back up + restore APP_ORIGIN and NEXT_PUBLIC_APP_URL in beforeEach/afterEach
    (mirror the existing NEXT_PUBLIC_SITE_URL backup pattern so tests are isolated).
  </behavior>
  <action>
    PART 1. Edit lib/utils/site-url.ts. KEEP the existing private normalize()
    function exactly as-is and reuse it for every tier.

    1. resolveBaseUrl(request: Request): new precedence (insert APP_ORIGIN as
       tier 1, push existing tiers down):
         (1) normalize(process.env.APP_ORIGIN)        // RUNTIME, non-inlined — wins
         (2) normalize(process.env.NEXT_PUBLIC_SITE_URL) // build-inlined
         (3) `${x-forwarded-proto ?? 'http'}://${x-forwarded-host ?? host}` (only if host present)
         (4) new URL(request.url).origin              // last resort (localhost / no proxy)
       Update the file's top-of-file precedence comment to list APP_ORIGIN first
       and note it is a runtime (non-inlined) value vs build-inlined NEXT_PUBLIC_SITE_URL.

    2. Add and export getCanonicalBaseUrl(): string — request-less, reuses
       normalize():
         return normalize(process.env.APP_ORIGIN)
             ?? normalize(process.env.NEXT_PUBLIC_SITE_URL)
             ?? normalize(process.env.NEXT_PUBLIC_APP_URL)
             ?? 'https://xtimator.com'
       Add a short doc comment: used by modules that have no Request in scope
       (issuer, whatsapp, cron, webhook, server actions); the literal final
       fallback is the canonical production domain.

    Write the tests described in <behavior> first and watch them fail, then make
    the edits above to turn them green. Use placeholders only — no real secrets.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/site-url.test.ts tests/unit/oauth-issuer.test.ts</automated>
  </verify>
  <done>site-url.ts exports resolveBaseUrl (APP_ORIGIN-first 4-tier) and getCanonicalBaseUrl (4-tier, https://xtimator.com final fallback); all new + existing site-url tests pass; oauth-issuer tests still pass (issuer not yet changed).</done>
</task>

<task type="auto">
  <name>Task 2: Replace new URL(req.url).origin in redirect construction — Part 2</name>
  <files>app/demo/route.ts, app/api/stripe/connect/initiate/route.ts, app/api/estimate/[token]/pay/route.ts, app/api/stripe/connect/callback/route.ts</files>
  <action>
    For each file: import resolveBaseUrl from '@/lib/utils/site-url' and use it to
    build the base used for REDIRECT URLs. KEEP `new URL(req.url)` ONLY where it
    parses query params / pathname — do NOT use it as a redirect base.

    1. app/demo/route.ts — replace `const { origin } = new URL(request.url)` with
       `const origin = resolveBaseUrl(request)`. All 4 redirects (?demo=unavailable,
       ?demo=error, /dashboard, and any other) then build off this `origin` — no
       other change needed since they already use `new URL(path, origin)`.

    2. app/api/stripe/connect/initiate/route.ts — the redirect_uri must be public.
       Replace `const origin = new URL(req.url).origin` (line ~54) with
       `const origin = resolveBaseUrl(req)`; redirectUri stays
       `${origin}/api/stripe/connect/callback`. (The earlier `new URL('/...', req.url)`
       error redirects: convert their base to resolveBaseUrl(req) too — e.g.
       `new URL('/settings/payments?error=...', resolveBaseUrl(req))` and
       `new URL('/onboarding', resolveBaseUrl(req))` and `new URL('/?auth=login', resolveBaseUrl(req))`
       — so the auth/onboarding bounces also land on the public host.)

    3. app/api/estimate/[token]/pay/route.ts — replace
       `const origin = new URL(req.url).origin` (line ~75) with
       `const origin = resolveBaseUrl(req)`. success_url/cancel_url then build off
       it; KEEP the literal `{CHECKOUT_SESSION_ID}` template untouched (Stripe
       substitutes it server-side).

    4. app/api/stripe/connect/callback/route.ts — KEEP `const url = new URL(req.url)`
       for searchParams parsing (code/state/error). Change the redirect base:
       replace `const settingsUrl = new URL('/settings/payments', req.url)` with
       `const base = resolveBaseUrl(req)` then `const settingsUrl = new URL('/settings/payments', base)`.
       Also route the two early bounces through base:
       `new URL('/?auth=login', base)` and `new URL('/onboarding', base)`.

    No behavioral change beyond the redirect host. Do not touch query-string
    parsing logic.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>tsc reports no new errors in the 4 touched files; a grep for `new URL(` followed by `.url).origin` used as a redirect base returns nothing in these 4 files (new URL(req.url) survives only for searchParams/path parsing); redirects build from resolveBaseUrl.</done>
</task>

<task type="auto">
  <name>Task 3: Unify env reads through getCanonicalBaseUrl (DB-first preserved) — Part 3</name>
  <files>lib/oauth/issuer.ts, lib/whatsapp/send-estimate.ts, app/api/estimates/[id]/send-sms/route.ts, lib/whatsapp/confirm.ts, app/api/cron/trial-warning-emails/route.ts, lib/billing/connect-webhook.ts, lib/actions/auth.ts</files>
  <action>
    Standardize NEXT_PUBLIC_SITE_URL as canonical and treat NEXT_PUBLIC_APP_URL as
    a legacy alias read only via getCanonicalBaseUrl(). PRESERVE DB-first
    (branding.canonicalBaseUrl) wherever it already exists. Import
    getCanonicalBaseUrl from '@/lib/utils/site-url' in each file.

    DO NOT touch client-side window.location.origin usages anywhere.

    1. lib/oauth/issuer.ts — replace the tier-1 explicit env read
       `const explicit = normalize(process.env.NEXT_PUBLIC_APP_URL)` with
       `const explicit = normalizeCanonical(getCanonicalBaseUrl())` (getCanonicalBaseUrl
       already returns a normalized string, so simply
       `const explicit = getCanonicalBaseUrl()` and return it — note it now never
       null-falls-through, so it short-circuits before VERCEL_ENV). To keep the
       VERCEL_URL preview branch + header fallback reachable, instead only use
       getCanonicalBaseUrl for the EXPLICIT env tier WITHOUT collapsing the chain:
       read `const explicitEnv = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL`,
       `const explicit = normalize(explicitEnv)`; if explicit return it. Keep the
       existing `VERCEL_ENV === 'production' → CANONICAL_PRODUCTION_URL`, VERCEL_URL
       preview branch, and async next/headers fallback EXACTLY as they are. Keep
       the local private normalize(). Update oauth-issuer.test.ts only if a test
       name/assert references the precise env var — the existing tests set
       NEXT_PUBLIC_APP_URL and must still pass; APP_ORIGIN/NEXT_PUBLIC_SITE_URL are
       additive. If adding the multi-env read changes nothing observable for the
       existing test inputs, leave the test file unchanged.

    2. lib/whatsapp/send-estimate.ts (line ~70) — replace
       `const baseUrl = branding.canonicalBaseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? ''`
       with `const baseUrl = branding.canonicalBaseUrl ?? getCanonicalBaseUrl()`.

    3. app/api/estimates/[id]/send-sms/route.ts (line ~107) — replace
       `const baseUrl = branding.canonicalBaseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? ''`
       with `const baseUrl = branding.canonicalBaseUrl ?? getCanonicalBaseUrl()`.

    4. lib/whatsapp/confirm.ts (buildShareUrl, line ~480) — replace
       `const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com'`
       with `const base = getCanonicalBaseUrl()`.

    5. app/api/cron/trial-warning-emails/route.ts (line ~91) — replace
       `const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com'`
       with `const appUrl = getCanonicalBaseUrl()`.

    6. lib/billing/connect-webhook.ts (line ~154) — replace the 3-way
       `const origin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xtimator.com'`
       with `const origin = getCanonicalBaseUrl()`.

    7. lib/actions/auth.ts (line ~97, resetPassword) — replace
       `const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:9633'`
       with `const origin = getCanonicalBaseUrl()`. (redirectTo stays
       `${origin}/callback?type=recovery`.) Note: this means the Supabase Auth
       redirect allowlist must include the canonical host — captured as a human
       follow-up in <output>.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/site-url.test.ts tests/unit/oauth-issuer.test.ts</automated>
  </verify>
  <done>All seven Part-3 files read their base URL via branding.canonicalBaseUrl (where DB-first) and/or getCanonicalBaseUrl(); no remaining `process.env.NEXT_PUBLIC_APP_URL` base-URL fallback in these files; oauth-issuer tests pass; `npx tsc --noEmit` shows no new errors in touched files; client-side window.location.origin usages untouched.</done>
</task>

</tasks>

<verification>
- `npx vitest run tests/unit/site-url.test.ts tests/unit/oauth-issuer.test.ts` — all pass (existing 7 site-url + new APP_ORIGIN/getCanonicalBaseUrl tests + all oauth-issuer tests).
- `npx tsc --noEmit` — no NEW type errors in any touched file.
- Manual grep: the 4 Part-2 files contain no `new URL(...).origin` used as a redirect base (only for searchParams/path parsing).
- Manual grep: the 7 Part-3 files contain no `process.env.NEXT_PUBLIC_APP_URL` used as a base-URL fallback.
- No client-side `window.location.origin` usage was modified.
</verification>

<success_criteria>
- resolveBaseUrl() prefers runtime APP_ORIGIN over build-inlined NEXT_PUBLIC_SITE_URL, then proxy headers, then request origin.
- getCanonicalBaseUrl() exists and resolves APP_ORIGIN → NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → https://xtimator.com.
- Every server-side redirect in the 4 Part-2 routes builds from resolveBaseUrl(request); none can emit https://0.0.0.0:3000 when APP_ORIGIN (or NEXT_PUBLIC_SITE_URL, or proxy headers) is present.
- DB-first branding.canonicalBaseUrl is preserved everywhere it already existed; env fallbacks now flow through getCanonicalBaseUrl().
- No git push performed.
</success_criteria>

<output>
After completion, create `.planning/quick/260531-rqa-bulletproof-server-side-base-url-resolut/260531-rqa-SUMMARY.md`.

The SUMMARY MUST prominently list these HUMAN FOLLOW-UPS (NOT done by this plan):

1. **NO git push was performed by this plan.** Push is a human gate. Before pushing:
   confirm the VPS is recovered AND Coolify's Docker-Image / on-VPS source-build path
   is disabled (images must build in GitHub Actions → GHCR → Coolify pulls; an on-VPS
   `next build` OOM-froze prod 2026-05-31).
2. **Coolify runtime env:** set `APP_ORIGIN=https://xtimator.com` (runtime, non-inlined)
   on the Xtimator service, then restart the container. This is the primary lever — it
   needs no rebuild.
3. **GitHub Actions build Variable:** set `NEXT_PUBLIC_SITE_URL=https://xtimator.com`
   (build-inlined) so build-time inlined reads resolve to the canonical domain.
4. **Supabase Auth:** set the Site URL and add `https://xtimator.com/callback` to the
   redirect allowlist (required now that resetPassword uses getCanonicalBaseUrl()).

Use placeholder/canonical values only in the SUMMARY — no real secrets.
</output>
