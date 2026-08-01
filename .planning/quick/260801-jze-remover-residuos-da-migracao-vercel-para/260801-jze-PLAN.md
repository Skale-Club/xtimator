---
phase: 260801-jze
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/settings/custom-domain-form.tsx
  - lib/oauth/issuer.ts
  - tests/unit/oauth-issuer.test.ts
  - vercel.json
  - next.config.ts
autonomous: true
requirements: [QUICK-260801-JZE]

must_haves:
  truths:
    - "Tenant sees Coolify-correct DNS instructions (A record 188.245.112.3 for apex, CNAME xtimator.com for subdomain) with no Vercel IP/hostname/link on the custom-domain settings page"
    - "resolveIssuer() never lets a spoofed request Host header become the OAuth issuer in production — it falls back to CANONICAL_PRODUCTION_URL, not the request origin, when explicit env vars are unset"
    - "No tracked file references Vercel as the deploy/DNS/SSL provider (vercel.json removed, next.config.ts comments corrected)"
    - "npx tsc --noEmit and npx vitest run tests/unit both pass after the changes"
  artifacts:
    - path: "components/settings/custom-domain-form.tsx"
      provides: "Coolify-correct DNS setup instructions card, no vercel.com link"
    - path: "lib/oauth/issuer.ts"
      provides: "resolveIssuer() with Vercel branches removed and NODE_ENV-based production safety net"
    - path: "tests/unit/oauth-issuer.test.ts"
      provides: "Updated assertions covering the new production fallback, VERCEL_* tests removed"
  key_links:
    - from: "lib/oauth/issuer.ts"
      to: "CANONICAL_PRODUCTION_URL"
      via: "NODE_ENV === 'production' fallback branch"
      pattern: "NODE_ENV.*production"
---

<objective>
Remove three code residuals left over from the Vercel→Coolify migration (already confirmed complete and live in production). The highest-priority item is a customer-facing bug: the custom-domain settings page still tells tenants to point DNS at Vercel infrastructure, which no longer exists for this app. The other two are dead config (`vercel.json`) and dead/risky fallback branches in the OAuth issuer resolver, plus two stale comments.

Purpose: Stop giving tenants DNS instructions that will never work, and close a latent security gap where the OAuth issuer resolver's request-origin fallback could be reached by a spoofed Host header now that the Vercel-production safety net is gone.
Output: Corrected DNS instructions UI, deleted `vercel.json`, hardened `resolveIssuer()` with matching test coverage, corrected comments in `next.config.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

All facts below were verified against the codebase during planning — treat as given, do not re-investigate:
- Production is confirmed live on Coolify (audit 2026-08-01): `/api/health` returns current `main` SHA, no `x-vercel-*` headers, served by Traefik.
- `xtimator.com` resolves to `188.245.112.3` (confirmed by DNS lookup), which matches the Coolify shared host recorded in the migration doc. This is the value to use for the apex `A` record and the CNAME target.
- `.vercel/` is separately gitignored and untracked — do not touch it.
- `lib/utils/site-url.ts` (`getCanonicalBaseUrl()`, `resolveBaseUrl()`) already fully migrated off Vercel in a prior phase (2026-05-31) and is the pattern to mirror: env tier → proxy headers (with internal-host guard) → hardcoded `https://xtimator.com` last resort. `lib/oauth/issuer.ts` is the one file that still has Vercel-specific branches; it is async (`next/headers`) and has no Request object in scope, unlike `resolveBaseUrl()`.
- `NODE_ENV === 'production'` is an established convention in this codebase for distinguishing prod from dev/test (see `app/api/stripe/connect/initiate/route.ts`, `instrumentation.ts`). The Dockerfile sets `ENV NODE_ENV=production` for the production container; vitest sets `NODE_ENV=test` by default, so existing "falls back to request origin" test behavior in dev/test is preserved.
- No project skills directory exists (`.claude/skills/` and `.agents/skills/` both absent) — no skill rules to load.
- No dedicated `typecheck` npm script exists; use `npx tsc --noEmit` directly. `npm test` runs `vitest run` (all suites); use `npx vitest run tests/unit` to scope to the unit suite per the task requirement.
</context>

<interfaces>
Current `lib/oauth/issuer.ts` (full file, to be edited in Task 2):

```typescript
// Phase 86: canonical issuer URL resolver.
// Phase 86 hotfix 2026-05-26: production must resolve to https://xtimator.com,
// not the per-deployment Vercel preview URL (xtimator-XXXX-skaleclub.vercel.app).
//
// Resolution order:
//   1. Explicit env tier — APP_ORIGIN (runtime, non-inlined) → NEXT_PUBLIC_APP_URL
//      (legacy alias) → NEXT_PUBLIC_SITE_URL. The first non-empty value wins everywhere.
//   2. VERCEL_ENV === 'production' → CANONICAL_PRODUCTION_URL (https://xtimator.com)
//      This handles the case where the explicit env was forgotten in Vercel env vars;
//      production deployments always emit the canonical domain so OAuth issuer / .well-known
//      metadata is stable across deploys.
//   3. VERCEL_URL (preview deployments — each deploy gets its own URL, OAuth flow works
//      against that preview only, useful for testing)
//   4. fallback to the incoming request's origin (localhost dev)
//
// NOTE: we deliberately read the explicit env vars directly (rather than calling
// getCanonicalBaseUrl(), which never returns null) so the VERCEL_ENV / VERCEL_URL
// preview branches and the next/headers fallback below stay reachable.

import { headers } from 'next/headers'

/** Canonical production URL — matches the convention in lib/billing/connect-webhook.ts
 *  and lib/whatsapp/confirm.ts. */
const CANONICAL_PRODUCTION_URL = 'https://xtimator.com'

export async function resolveIssuer(): Promise<string> {
  const explicitEnv =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL
  const explicit = normalize(explicitEnv)
  if (explicit) return explicit

  if (process.env.VERCEL_ENV === 'production') return CANONICAL_PRODUCTION_URL

  const vercel = normalize(process.env.VERCEL_URL)
  if (vercel) return `https://${vercel}`

  // Fall back to the incoming request's origin (works on localhost too).
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:9633'
  return `${proto}://${host}`
}

/** Defensive normalization: ... */
function normalize(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Fix customer-facing DNS setup instructions (Vercel to Coolify)</name>
  <files>components/settings/custom-domain-form.tsx</files>
  <action>
    In the "DNS Setup Instructions" card (the `savedDomain &&` block, roughly lines 117-155), replace the Vercel-specific values and copy with Coolify/Traefik-correct ones. Keep the existing markup, styling, and the `isApex` conditional structure unchanged — this is a copy+values change only.

    1. Apex branch (`isApex` true, the `A` record block): change `Value: 76.76.21.21` to `Value: 188.245.112.3`. Keep `Type: A`, `Name: @`, `TTL: Auto / 3600` as-is.
    2. Subdomain branch (the `CNAME` block): change `Value: cname.vercel-dns-0.com` to `Value: xtimator.com`. Keep `Type: CNAME`, `Name: {subdomainPart}`, `TTL: Auto / 3600` as-is.
    3. Replace the paragraph below the two record blocks. Remove the Vercel SSL sentence and the `vercel.com/dashboard` link entirely (do NOT replace it with a `coolify.skale.club` link — that is internal infrastructure and must never be exposed to tenants). New copy should communicate:
       - DNS changes can take up to 24-48 hours to propagate (keep this sentence).
       - SSL is provisioned automatically via Let's Encrypt once the DNS record resolves — no manual certificate step needed.
       - Do NOT invite the tenant to "confirm values in your [provider] dashboard" since there is no tenant-facing dashboard to point to; instead keep the guidance self-contained (the values shown are authoritative).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>The DNS Setup Instructions card shows `188.245.112.3` for apex domains and `xtimator.com` for subdomain CNAMEs, the SSL copy references automatic Let's Encrypt provisioning (not Vercel), and there is no `vercel.com` link or any `coolify.skale.club` reference anywhere in the file.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Remove dead Vercel branches from resolveIssuer(), harden production fallback</name>
  <files>lib/oauth/issuer.ts, tests/unit/oauth-issuer.test.ts</files>
  <behavior>
    resolveIssuer() resolution order after this change:
    1. Explicit env tier (unchanged): `APP_ORIGIN` -> `NEXT_PUBLIC_APP_URL` -> `NEXT_PUBLIC_SITE_URL`, first non-empty wins.
    2. If `process.env.NODE_ENV === 'production'` and no explicit env was set -> return `CANONICAL_PRODUCTION_URL` (`https://xtimator.com`). This is the safety net: it must NOT be possible for a request's `x-forwarded-host` header to become the OAuth issuer in a production runtime.
    3. Otherwise (dev/test) -> fall back to the incoming request's origin via `next/headers` (`x-forwarded-proto` / `x-forwarded-host` / `host`), same as before.

    Test cases to update in tests/unit/oauth-issuer.test.ts:
    - Remove the `VERCEL_ENV` / `VERCEL_URL` entries from the `envBackup` setup/teardown (beforeEach/afterEach) since those env vars no longer affect resolution.
    - Test "1c. whitespace-only NEXT_PUBLIC_APP_URL falls through to next branch": keep the assertion (`https://xtimator.com`) but drive it via `NODE_ENV = 'production'` instead of `VERCEL_ENV = 'production'`.
    - Test "1d. APP_ORIGIN wins over ... ": remove `VERCEL_ENV`/`VERCEL_URL` setup lines (no longer relevant), keep the core assertion.
    - Test "2. VERCEL_ENV=production resolves to canonical...": replace with a test that sets `NODE_ENV = 'production'` (no explicit env vars) and asserts `resolveIssuer()` returns `https://xtimator.com`. Rename to describe the NODE_ENV-based safety net.
    - Test "3. VERCEL_URL is used for non-production deployments (preview)": DELETE — this behavior no longer exists (no VERCEL_URL branch).
    - Test "4. localhost dev falls back to request origin": keep as-is (NODE_ENV is 'test' under vitest, which is not 'production', so the request-origin branch is still reached).
    - Test "regression: production deploy never returns *.vercel.app URL...": replace with a new regression test — set `NODE_ENV = 'production'` and a spoofed request host (e.g. mock `headers()` to return `evil.example.com`), assert `resolveIssuer()` still returns `https://xtimator.com` and NOT the spoofed host. This locks in the security fix with a test.
    - Add `NODE_ENV` to the `envBackup`/restore object in `beforeEach`/`afterEach` since the tests now mutate it directly (vitest's default `NODE_ENV=test` must be restored after each test).
  </behavior>
  <action>
    In `lib/oauth/issuer.ts`:
    1. Rewrite the top-of-file comment block to document the new 3-tier resolution order (explicit env -> NODE_ENV production fallback -> request origin), removing all references to `VERCEL_ENV`/`VERCEL_URL`/preview deployments. Keep the "why explicit env vars are read directly" note if still accurate, or simplify it since there are no longer separate VERCEL_ENV/VERCEL_URL branches to keep reachable.
    2. Delete lines 34-37 (`if (process.env.VERCEL_ENV === 'production') return CANONICAL_PRODUCTION_URL` and the `VERCEL_URL` block).
    3. In their place, add: `if (process.env.NODE_ENV === 'production') return CANONICAL_PRODUCTION_URL`.
    4. Leave the explicit-env tier, the `headers()`-based final fallback, and the `normalize()` helper unchanged.

    Then update `tests/unit/oauth-issuer.test.ts` per the `<behavior>` block above.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/oauth-issuer.test.ts</automated>
  </verify>
  <done>lib/oauth/issuer.ts contains no reference to VERCEL_ENV or VERCEL_URL; resolveIssuer() falls back to CANONICAL_PRODUCTION_URL when NODE_ENV is 'production' and no explicit env is set, even if a spoofed request Host header is present; tests/unit/oauth-issuer.test.ts passes and includes a test proving the spoofed-host case is blocked in production.</done>
</task>

<task type="auto">
  <name>Task 3: Delete vercel.json, fix stale next.config.ts comments, run full verification</name>
  <files>vercel.json, next.config.ts</files>
  <action>
    1. Delete `vercel.json` from the repo root (tracked file, contains only Bun `framework`/`buildCommand`/`devCommand`/`installCommand` — dead since production builds via `Dockerfile` + npm and deploys through GitHub Actions -> GHCR -> Coolify). Do NOT touch `.vercel/` (separately gitignored, untracked, out of scope).
    2. In `next.config.ts`, fix two stale comments (code/behavior unchanged):
       - Line ~11 (CSP report-only comment listing third parties "before being switched to enforcing"): change "Cloudflare Turnstile, Vercel" to "Cloudflare Turnstile" (Vercel is no longer part of the stack being validated against).
       - Line ~42 (`Strict-Transport-Security` comment): change "Prod is HTTPS-only on Vercel." to "Prod is HTTPS-only (Coolify/Traefik terminates TLS)."
    3. Run the full verification suite required for this quick fix: `npx tsc --noEmit` (typecheck across the whole repo, catching any fallout from Tasks 1-2) and `npx vitest run tests/unit` (full unit suite, not just the oauth-issuer file, to confirm no other test relied on removed Vercel behavior).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run tests/unit</automated>
  </verify>
  <done>vercel.json no longer exists in the repo (git status shows it deleted); next.config.ts has no remaining Vercel references in comments; npx tsc --noEmit exits 0; npx vitest run tests/unit passes with no failures.</done>
</task>

</tasks>

<verification>
- `git status` / `git grep -i vercel -- '*.ts' '*.tsx' vercel.json` (excluding `.vercel/`, `node_modules/`, `CLAUDE.md`'s deployment note which correctly documents Vercel is NOT used, and `package-lock.json`/`bun.lock` incidental matches) should show no remaining functional Vercel references in the three target files.
- `npx tsc --noEmit` passes.
- `npx vitest run tests/unit` passes, including the updated `tests/unit/oauth-issuer.test.ts`.
</verification>

<success_criteria>
- Tenant-facing DNS instructions on the custom-domain settings page point to Coolify infrastructure (188.245.112.3 / xtimator.com), not Vercel, and contain no dead vercel.com link or internal coolify.skale.club reference.
- `vercel.json` is removed from the tracked repo.
- `resolveIssuer()` has no reachable Vercel-specific branches; its production fallback (`NODE_ENV === 'production'`) returns the canonical domain rather than trusting request headers, with test coverage proving it.
- `next.config.ts` comments no longer misattribute Coolify's TLS/CSP behavior to Vercel.
- Typecheck and unit tests pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260801-jze-remover-residuos-da-migracao-vercel-para/260801-jze-SUMMARY.md`
</output>
