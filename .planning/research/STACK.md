# Technology Stack — v4.0 Multi-Tenancy

**Project:** Xtimator
**Milestone:** v4.0 (Multiple Companies per User)
**Researched:** 2026-05-20
**Overall confidence:** HIGH

---

## TL;DR (the short version)

The existing stack (`@supabase/ssr` v0.10, `@supabase/supabase-js` v2.103, Next.js 16.2 App Router, server actions, RLS-everywhere) is **sufficient on its own**. Multi-tenancy is **a pattern change, not a stack change**.

- **Zero new runtime npm packages required.** Active-tenant is a plain `httpOnly` cookie set via a Server Action; RLS gates everything via a new `company_members` join table and a `SECURITY DEFINER` helper.
- **Two dev-time tools added (optional but recommended):** `pgTAP` (already supported by Supabase Postgres) + `supabase_test_helpers` (single SQL install, no npm) for RLS coverage tests.
- **DO NOT add:** SaaS frameworks (Makerkit/Basejump as a dep), `next-multi-tenant` libraries, JWT-claim-based active tenant (Supabase auth hook), or a separate "tenant context" React provider library. Each is justified in "What NOT to Add" below.

---

## Stack Additions (versions current as of 2026-05-20)

### Dev-time only — RLS coverage testing

| Package | Version | Type | Purpose | Why |
|---------|---------|------|---------|-----|
| `pgTAP` | 1.3.3+ (PG extension) | DB extension | Postgres unit-test harness | The community standard for testing RLS. Already documented in Supabase official docs. Enabled per-database via `CREATE EXTENSION pgtap;` — no npm install. |
| `supabase_test_helpers` (basejump) | 0.0.4 | SQL package | `tests.create_supabase_user()`, `tests.authenticate_as()`, `tests.clear_authentication()`, `tests.rls_enabled()` | RLS policies don't *throw* — they silently filter. Without these helpers, every test is 30 lines of boilerplate that fakes a JWT into `request.jwt.claims`. With them, an RLS test is ~5 lines. Single-file SQL install via `database.dev` (`SELECT dbdev.install('basejump-supabase_test_helpers')`). No npm dep, no Node code. |

Both are **dev/CI-only** — never touch production schema or runtime code. The existing `supabase/audits/run-prod-readiness.mjs` script already proves "RLS is enabled and every tenant table has at least one policy" but **cannot prove the policy is correct**. pgTAP + helpers close that gap, which is the only gap that matters during the RLS rewrite.

**Confidence:** HIGH — both documented in current Supabase docs ([Advanced pgTAP Testing](https://supabase.com/docs/guides/local-development/testing/pgtap-extended), [usebasejump/supabase-test-helpers](https://github.com/usebasejump/supabase-test-helpers)).

### Runtime — none

**Confidence:** HIGH — verified by reading existing `lib/supabase/server.ts`, `package.json`, and Next.js 16 cookies API docs. The cookie + server action pattern needs zero new dependencies.

---

## Stack Modifications

### 1. Schema additions (no new libraries — pure SQL migration)

```sql
-- New table
CREATE TABLE company_members (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),  -- room for 'admin','member' later
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX idx_company_members_user_id ON company_members(user_id);
CREATE INDEX idx_company_members_company_id ON company_members(company_id);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper — the keystone of the RLS rewrite
CREATE OR REPLACE FUNCTION public.is_company_member(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = (SELECT auth.uid())
      AND company_id = target_company_id
  );
$$;

-- Idempotent backfill (the locked migration decision)
INSERT INTO company_members (user_id, company_id, role)
SELECT user_id, id, 'owner' FROM companies
ON CONFLICT (user_id, company_id) DO NOTHING;
```

**Why a `SECURITY DEFINER` function and not inline `EXISTS (...)` in every policy?**

1. **Performance.** Postgres can inline-cache the function result per-row for the duration of a query, but only when wrapped properly. Without it, the join-subquery runs once per row scanned (catastrophic on `estimate_items`).
2. **DRY.** ~20 policies share the same gate; defining it once means fixing it once.
3. **`SET search_path = ''` is mandatory** — without it, an attacker who controls a schema can shadow `company_members`. This is the Supabase security advisor's required pattern.

**Confidence:** HIGH — pattern matches the Supabase official guide on [RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions) and the [Makerkit production RLS guide](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices).

### 2. Policy rewrite — every tenant table

Replace every existing `WHERE company_id IN (SELECT id FROM companies WHERE user_id = auth.uid())` with:

```sql
DROP POLICY IF EXISTS "tenant_select_own" ON projects;
CREATE POLICY "tenant_select_own" ON projects
  FOR SELECT
  USING (public.is_company_member(company_id));

-- repeat FOR INSERT, UPDATE, DELETE with WITH CHECK (public.is_company_member(company_id))
```

**Key correctness rule:** wrap `auth.uid()` in `(SELECT auth.uid())` everywhere it appears outside the helper, so Postgres treats it as an `initPlan` (one execution per query) instead of a function call per row. This is the [official Supabase RLS performance tip](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).

**Confidence:** HIGH.

### 3. Active-company tracking — cookie via server action (no new libraries)

**Recommended pattern (Next.js 16 native API only):**

```ts
// lib/active-company.ts
import 'server-only'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'xt-active-company'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function getActiveCompanyId(): Promise<string | null> {
  const store = await cookies()
  return store.get(COOKIE_NAME)?.value ?? null
}

export async function setActiveCompanyCookie(companyId: string) {
  const store = await cookies()
  store.set(COOKIE_NAME, companyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })
}

export async function clearActiveCompanyCookie() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}
```

```ts
// lib/actions/set-active-company.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { setActiveCompanyCookie } from '@/lib/active-company'

export async function setActiveCompany(companyId: string) {
  const supabase = await createClient()
  // Membership verification at the server boundary — defense in depth
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('company_id', companyId)
    .maybeSingle()
  if (!membership) throw new Error('forbidden')
  await setActiveCompanyCookie(companyId)
  revalidatePath('/', 'layout')
}
```

**A "current company" resolver used by every server action / RSC:**

```ts
// lib/get-current-company.ts
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/active-company'

export const getCurrentCompany = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cookieId = await getActiveCompanyId()
  if (cookieId) {
    const { data } = await supabase
      .from('company_members')
      .select('company_id, companies(*)')
      .eq('company_id', cookieId)
      .maybeSingle()
    if (data?.companies) return data.companies
  }

  // Fallback: first membership (e.g. brand-new login, cookie cleared)
  const { data: first } = await supabase
    .from('company_members')
    .select('company_id, companies(*)')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return first?.companies ?? null
})
```

**Why this pattern (and not alternatives):**

| Alternative | Verdict | Reason |
|-------------|---------|--------|
| Cookie + server action (this) | **PICK** | Zero new deps. Survives full reloads. Works with Next.js `cache()`. Edge-renderable. SSR-safe. Pairs naturally with `revalidatePath('/', 'layout')`. |
| Custom JWT claim via Supabase Auth Hook (`active_company_id`) | **REJECT for v4.0** | (1) Claims update only on token refresh (~1h delay) — switching companies would require forcing a re-auth. (2) Adds infra surface (Supabase Edge Function or DB hook). (3) Doesn't simplify RLS — the helper still needs `company_members`. Maybe revisit when adding multi-user-per-company (v5+). |
| URL path (`/c/[companyId]/...`) | **REJECT** | Massive routing refactor for marginal benefit. Cookie + cache invalidation is functionally equivalent. |
| Subdomain (`acme.xtimator.com`) | **REJECT** | Requires DNS + custom_domains rework. Out of scope. |
| Middleware-set cookie | **REJECT** | Xtimator has NO `middleware.ts` today. Adding one purely for tenant ops would force re-architecting all the existing layout-level auth checks. Server-action cookie writes are functionally identical and don't change the architecture. |
| Server-only React Context | **PARTIAL** | Useful for *passing* the resolved company down the RSC tree (after `getCurrentCompany()`), but doesn't replace the cookie — Context vanishes between requests. |

**Confidence:** HIGH — pattern matches [Next.js cookies docs](https://nextjs.org/docs/app/api-reference/functions/cookies), [Next.js multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant), and verified against existing `lib/supabase/server.ts`.

### 4. Stripe — per-company subscription stays as-is

The schema already has `companies.stripe_customer_id`, `stripe_subscription_id`, `tier`, `tier_trial_ends_at`, and **Stripe Connect** columns (`stripe_account_id`, `stripe_connect_status`) per company. Trial clock per-company is the locked decision. No Stripe SDK change needed; only the server-action call sites that derive `companyId` from `auth.uid()` need to read from `getCurrentCompany()`.

**One required adjustment:** the existing `processed_stripe_events` and webhook handler should keep using the **service role** client (already true — bypasses RLS). The lookup-by-`stripe_account_id` / `stripe_customer_id` path doesn't need RLS to change. **No new package, no version bump.**

### 5. Inngest — already aligned

Inngest job functions (`generateEstimateJob`, `transcribeAudioJob`, `analyzePhotosJob`, WhatsApp inbound) already pass `companyId` explicitly in the event payload (cf. INNGEST requirements). They use the **service role** Supabase client, which bypasses RLS by design. **No code change needed in Inngest functions** — but the API routes that *trigger* Inngest events (`/api/generate-estimate`, etc.) must derive `companyId` from `getCurrentCompany()` instead of `auth.uid()`-via-companies-lookup.

**Confidence:** HIGH (verified against existing `lib/inngest/` patterns referenced in REQUIREMENTS.md).

### 6. Resend — no change

Notifications already select `email` from `companies` (per-company sender configuration). The dispatcher (`lib/notifications/dispatch.ts`) already takes `company_id`. Only the *trigger* sites change (read from active company, not auth user).

---

## What NOT to Add (and why)

Each of these came up in research and is explicitly **out of scope** because they add weight without solving a problem Xtimator has.

| Library / Pattern | Why NOT |
|-------------------|---------|
| **Makerkit / Basejump as runtime dependencies** | Both are *patterns* (Makerkit is a paid starter kit; Basejump is a SQL extension for account/billing). Xtimator already has its own account model, billing, RLS audit, and storage abstraction. Adopting their SQL or app conventions wholesale would mean rewriting 70+ phases of validated code. **Borrow the patterns (membership table, SECURITY DEFINER helper, pgTAP helpers), do not install the frameworks.** |
| **`next-multi-tenant` / `multi-tenancy-nextjs` npm packages** | None are widely-used, well-maintained, or compatible with App Router + Server Actions + Supabase RLS. They mostly target subdomain routing, which Xtimator doesn't need. The native `cookies()` + `revalidatePath()` combo is ~30 lines and zero risk. |
| **Supabase Custom Access Token Hook for `active_company_id` JWT claim** | (1) Claim is *stale* until next token refresh — switching companies requires forced re-auth. (2) Adds an Edge Function or DB hook to the infra surface that has to be deployed/monitored. (3) RLS still needs the `company_members` lookup, so it doesn't actually eliminate the join. Cookie wins on every axis for v4.0. Revisit when v5+ introduces team invites + role-claim-based authorization where speed of policy check matters. |
| **Drizzle/Prisma as an RLS-aware ORM** | Xtimator queries via `@supabase/supabase-js` everywhere. Introducing an ORM mid-flight would be a far bigger change than the multi-tenancy work itself. |
| **`next-safe-action`** | Tempting (typed server actions + middleware), but introducing it during the same milestone that rewrites ~20 server actions doubles the cognitive load and risk. The existing zod-validate-then-execute pattern in `lib/actions/*.ts` is fine. Track as a future polish item if desired. |
| **Separate Supabase project per tenant** | Costs scale per project. Xtimator's tenants are small US service businesses — the shared-schema-with-RLS pattern is the correct trade-off until reaching enterprise (>1K paid tenants). |
| **A `middleware.ts` for tenant gating** | Would require migrating the existing layout-level auth/admin guards. Server-action cookie + RSC-level `getCurrentCompany()` reaches the same enforcement point. |
| **Sentry / observability additions** | Already deferred to v3.2 per REQUIREMENTS.md. Not multi-tenancy's problem. |
| **A "switcher" UI library** (e.g. cmdk-based command palette) | `cmdk` is already a dependency (`"cmdk": "^1.1.1"`). The switcher is a `<DropdownMenu>` (`@radix-ui/react-dropdown-menu` already installed) — no new package needed. |

---

## Integration Notes

### `lib/supabase/server.ts` — no change required

The existing `createClient()` already reads cookies via `@supabase/ssr` v0.10.2. Adding the `xt-active-company` cookie does not interfere with Supabase's session cookies (`sb-*`). They coexist in the same `cookies()` store.

### `lib/supabase/service.ts` — no change required

Service-role client (used by Inngest jobs, Stripe webhooks, WhatsApp webhook, cron jobs) **bypasses RLS by design**. These code paths must derive `companyId` from the **event payload or DB lookup**, never from the cookie (no request context). This is already the case in the codebase — verify the rewrite doesn't accidentally introduce a `getCurrentCompany()` call into a service-role path.

### `supabase/audits/` — extended, not replaced

The existing `run-prod-readiness.mjs` script catches "table has zero policies = FAIL". After v4.0 it should also assert:

1. Every previously-listed tenant table has a policy that calls `public.is_company_member(...)` (not the old `auth.uid()` pattern). A new SQL audit in `supabase/audits/rls-tenant-policies.sql` can scan `pg_policies.qual` and `pg_policies.with_check` text for the helper-function call.
2. The new `company_members` table exists, RLS is enabled, has the expected 4 policies, and has the two required indexes.

This is **a script edit, not a library addition**.

### pgTAP test layout (new directory)

```
supabase/
  tests/
    01_company_members_rls.sql        -- cross-tenant SELECT/INSERT denied
    02_projects_rls.sql               -- 19 tables × {SELECT, INSERT, UPDATE, DELETE} = 76 cases
    03_estimates_share_token.sql      -- public share_token select policy still works
    04_membership_helper.sql          -- is_company_member() returns expected truth table
    helpers/
      supabase_test_helpers.sql       -- vendored from basejump (one file, ~250 lines)
```

Run via Supabase CLI: `supabase test db` (already supported, requires `db_test_url` in `supabase/config.toml`).

### Migration sequencing (locked decision, restated)

1. **Phase A:** Create `company_members`, `is_company_member()`, backfill from `companies.user_id`. Old RLS still active (uses `auth.uid()`). App keeps working.
2. **Phase B:** Add cookie + `getCurrentCompany()` + switcher UI. Server actions still derive companyId from `auth.uid()` — cookie is dormant. Verify UI flow.
3. **Phase C:** Rewrite RLS policies to use `is_company_member()`. Verify pgTAP suite passes.
4. **Phase D:** Rewrite ~20 server actions in `lib/actions/*.ts` to use `getCurrentCompany()`. Each action rewrite is independent and testable.
5. **Phase E:** Move `tier` / Stripe / `usage_events` from "1 per user" to "1 per company" semantics — schema is already aligned (per-company columns exist), only logic needs the active-company resolver.

The downstream planner can chunk these into phases as it sees fit.

---

## Installation (only commands needed)

```bash
# pgTAP (run once per database)
# In Supabase Dashboard → Database → Extensions → enable "pgtap"
# Or via migration:
echo "CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;" >> supabase/migrations/<next>_enable_pgtap.sql

# supabase_test_helpers (database.dev one-liner)
# In SQL editor (DEV ONLY — never on prod):
SELECT dbdev.install('basejump-supabase_test_helpers');
CREATE EXTENSION "basejump-supabase_test_helpers";
```

No `npm install` step. No `package.json` change. No new env vars.

---

## Sources

- [Next.js Multi-tenant Guide (official)](https://nextjs.org/docs/app/guides/multi-tenant) — HIGH (official docs)
- [Next.js cookies() API reference](https://nextjs.org/docs/app/api-reference/functions/cookies) — HIGH (official docs)
- [Next.js revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) — HIGH (official docs)
- [Supabase RLS feature page](https://supabase.com/features/row-level-security) — HIGH (official)
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — HIGH (read to evaluate, then rejected)
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — HIGH (official)
- [Supabase Advanced pgTAP Testing](https://supabase.com/docs/guides/local-development/testing/pgtap-extended) — HIGH (official)
- [Supabase pgTAP extension docs](https://supabase.com/docs/guides/database/extensions/pgtap) — HIGH (official)
- [Supabase SSR — Creating a client](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — HIGH (official)
- [usebasejump/supabase-test-helpers (GitHub)](https://github.com/usebasejump/supabase-test-helpers) — HIGH (canonical repo)
- [Makerkit — Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — MEDIUM (community, but battle-tested patterns; cross-referenced with Supabase docs)
- [Basejump — Testing on Supabase with pgTAP](https://usebasejump.com/blog/testing-on-supabase-with-pgtap) — MEDIUM (community)
- Internal: `supabase/audits/EXPECTED-POSTURE.md`, `supabase/audits/rls-audit.sql`, `lib/supabase/server.ts`, `types/database.types.ts`, `package.json` — HIGH (current code on disk, read 2026-05-20)

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Active-tenant pattern (cookie + server action) | HIGH | Verified against Next.js 16 official docs + existing `lib/supabase/server.ts` cookie wiring. Zero new deps required. |
| RLS rewrite via `is_company_member()` helper | HIGH | Pattern matches official Supabase RLS performance docs + production-validated by Makerkit/Basejump community. `SET search_path = ''` requirement confirmed in Supabase security advisor. |
| Membership backfill (idempotent) | HIGH | Pure SQL `INSERT ... ON CONFLICT DO NOTHING` — already a locked decision. |
| pgTAP + supabase_test_helpers | HIGH | Both documented in official Supabase docs as the canonical RLS testing toolchain. |
| Rejecting JWT custom claim approach | HIGH | The "stale-until-refresh" limitation is acknowledged in Supabase's own auth-hook docs; cookie is the correct trade-off when active context changes mid-session. |
| "No new npm packages" claim | HIGH | Audited `package.json` (already has `cmdk`, `@radix-ui/react-dropdown-menu`, `@supabase/ssr` v0.10.2, `@supabase/supabase-js` v2.103). Nothing for v4.0 is missing. |
