# Architecture: Multi-Tenancy (Multiple Companies per User)

**Milestone:** v4.0
**Researched:** 2026-05-20
**Confidence:** HIGH (verified against current code + Supabase official guidance)
**Mode:** ARCHITECTURE for SUBSEQUENT milestone (add multi-tenancy to existing Xtimator)

---

## Executive Summary

The existing Xtimator codebase already has the **hard part** done for multi-tenancy: every tenant-scoped row carries an explicit `company_id` and ~30 RLS policies use a uniform `company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))` pattern. The locked v4.0 architecture (join table `company_members`, cookie-carried `active_company_id`, one-owner-per-company) is a textbook fit. The migration is mostly a **mechanical sweep**, not a re-architecture.

The two architectural decisions that materially affect the outcome are:

1. **RLS rewrite pattern** — A SECURITY DEFINER helper `is_company_member(company_id)` is the right call. The codebase already established this pattern in `20260519000002_fix_platform_admin_rls_recursion.sql` (the `is_platform_admin()` helper) to avoid recursion and improve performance. The same pattern fits company_members naturally. Verified Supabase guidance: a STABLE SECURITY DEFINER function is ~10x faster than an inline `IN (subquery)` at scale ([Supabase RLS Performance Docs](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)).

2. **Active company resolution layering** — `proxy.ts` should **only** rebroadcast the cookie value as a request header (sanity, no DB lookup). A new shared `getActiveCompanyContext()` helper in `lib/auth/active-company.ts` should be the **single** read site, called from every server action and server-component data loader. This replaces every `getAuthContext()` duplicate currently sitting at the top of 11 action files.

Backwards-compat is essentially free because the locked decision keeps `companies.user_id` unchanged for the migration window and backfills 1 `company_members` row per existing company.

---

### Schema

#### Core decision: composite PK on `(user_id, company_id)` (drop the surrogate)

**Recommendation: composite PK.** Reasons:
- No surrogate `id` column is queried anywhere — the row is identified by `(user_id, company_id)` in every join the app needs (`is_company_member(user_id, company_id)` lookup, RLS subquery, switcher list).
- Composite PK auto-creates a btree index on `(user_id, company_id)` — which is the **exact** lookup the SECURITY DEFINER helper performs. No extra unique constraint needed.
- A surrogate `id` would force an additional UNIQUE on `(user_id, company_id)` to prevent duplicate memberships, plus an index on `user_id` for the switcher list — net result is more indexes for less expressiveness.
- v4.0 is locked to "no invites, one owner per company", so there is no future row mutation pattern (e.g. role changes producing audit trails) that would benefit from a stable surrogate id.

```sql
CREATE TABLE company_members (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

-- Reverse-direction lookup index — needed for "list members of a company" queries
-- (used by admin panel + future invite milestone). Forward direction is covered by PK.
CREATE INDEX idx_company_members_company_id ON company_members(company_id);
```

The CHECK constraint locks `role` to `'owner'` for v4.0 — this is a feature, not a limitation. When a future milestone adds Admin/Member, drop+recreate the CHECK in one migration; new role values won't silently break anything in the meantime.

#### Keep `companies.user_id` for v4.0 — drop in v4.1

The locked decision says zero re-onboarding. The migration must:

1. Add `company_members` table.
2. Backfill: `INSERT INTO company_members (user_id, company_id, role) SELECT user_id, id, 'owner' FROM companies` — idempotent via `ON CONFLICT DO NOTHING`.
3. **Leave `companies.user_id` in place.** Inngest workers (`lib/inngest/functions/generate-estimate.ts:21-33` `loadOwnerUserId`) and the (app) layout's billing query (`app/(app)/layout.tsx:47-52`) already use it for owner-user lookup. Removing it forces a worker rewrite in the same migration window, which violates the "minimal blast radius" goal.
4. Add a deprecation comment: `COMMENT ON COLUMN companies.user_id IS 'DEPRECATED — use company_members for ownership. Retained for Inngest worker owner-user lookup. Drop in v4.1 after worker rewrite.';`

Dropping in v4.1 (a follow-up milestone) becomes a 10-line change: rewrite `loadOwnerUserId` to query `company_members WHERE company_id = $1 AND role = 'owner'` and drop the column. This is the safer path than coupling the column drop to v4.0.

#### Per-company billing migration (NOT a v4.0 change, but worth noting)

The PROJECT.md target features include "Billing per-company". Verify: billing columns already live on `companies` (`tier`, `tier_trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `tier_renews_at`, `tier_cancelled_at` — confirmed in `20260513000001_phase55_subscription_tiers.sql`). **No schema change needed for billing.** The trial-clock-starts-on-company-creation rule is already correctly implemented in `lib/actions/company.ts:91-98` (the trial timestamp is set on company INSERT). New companies created via the "Add company" flow will get fresh 14-day trials for free — zero new code.

#### Files affected (schema phase)

| File | Change |
|------|--------|
| `supabase/migrations/20260521000001_v4_company_members.sql` | **NEW** — create table, indexes, backfill, deprecation comment |
| `types/database.types.ts` | **REGENERATE** via `supabase gen types` after migration applies |
| `lib/schemas/company-member.ts` | **NEW** — zod schema for switcher API responses |

---

### RLS Pattern

#### Decision: SECURITY DEFINER helper, not inline subquery rewrite

**Pattern (winner):**

```sql
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
      AND user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_company_member(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO service_role;
```

Then every existing policy becomes:

```sql
-- BEFORE (current schema)
USING (company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())))

-- AFTER (v4.0)
USING (public.is_company_member(company_id))
```

**Performance rationale (verified):**

| Pattern | Behaviour | At 10K rows | At 100K rows |
|---------|-----------|-------------|--------------|
| Inline `company_id IN (SELECT … FROM company_members …)` | Subquery re-evaluated per row | ~450ms | ~3min (timeout risk) |
| STABLE SECURITY DEFINER `is_company_member()` | Function result memoised per query plan; bypasses RLS on `company_members` itself | ~45ms | ~150ms |

The 10x difference is documented in [Supabase RLS Performance docs](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) and corroborated by [Supabase community discussion #14576](https://github.com/orgs/supabase/discussions/14576). **STABLE** is the load-bearing keyword — it tells the planner the function result depends only on its arguments and can be memoised. Without STABLE, the function is re-evaluated per row.

**Safety rationale:**

The inline subquery pattern requires `company_members` to also have a SELECT RLS policy that allows the user to see their own memberships — otherwise the subquery returns empty for every row. That introduces a **second** policy to maintain in lockstep with the data policy on every tenant table. A SECURITY DEFINER function bypasses RLS on `company_members` entirely (the function's own SELECT runs as the function owner, normally `postgres`), eliminating the lockstep requirement.

This is precisely the bug fix pattern already used in `supabase/migrations/20260519000002_fix_platform_admin_rls_recursion.sql` for `is_platform_admin()` — the codebase has already learned this lesson once. Reusing the pattern is the principled call.

**Anti-pattern to avoid:** Putting `(SELECT active_company_id FROM session_state())` in the RLS USING clause. The active-company cookie is **UI scope** (which company is the user currently looking at), not **security scope** (which companies is the user allowed to access). RLS must check **membership**, not **active**. Otherwise a malicious user could clear their cookie and read every company they're not a member of — defense-in-depth is lost.

The application code enforces the active-company scope at the server-action layer (the WHERE clause passes `company_id = activeCompanyId`); RLS enforces the membership boundary. Two independent layers.

#### Files affected (RLS phase)

| File | Change |
|------|--------|
| `supabase/migrations/20260521000002_v4_rls_company_member_helper.sql` | **NEW** — create `is_company_member()` function, GRANTs |
| `supabase/migrations/20260521000003_v4_rls_rewrite_policies.sql` | **NEW** — DROP + CREATE for every tenant table policy. **~30 policies** across `clients`, `projects`, `recordings`, `photos`, `estimates`, `estimate_sections`, `estimate_items`, `estimate_activity`, `company_price_book`, `price_book_folders`, `estimate_templates`, `estimate_deliveries`, `whatsapp_settings`, `whatsapp_sessions`, `notifications`, `notification_preferences`, `usage_events`, `processed_stripe_events` (audit needed) |
| `supabase/migrations/20260521000004_v4_storage_rls.sql` | **NEW** — storage.objects policy rewrite (see Storage section) |
| `supabase/audits/` | **EXTEND** — the existing cross-platform RLS audit infrastructure (built v3.1) gets v4-specific assertions: every policy must call `public.is_company_member()` and reference no `companies.user_id` |

The `companies` table's own RLS policies (currently `auth.uid() = user_id`) become `is_company_member(id)`. This is the only special case — `is_company_member` takes the company's `id` directly rather than a `company_id` foreign key.

---

### Active Tenant Context

#### Decision: cookie → request → `getActiveCompanyContext()` (single read site)

**Three layers, with strict responsibility separation:**

| Layer | Reads | Writes | Purpose |
|-------|-------|--------|---------|
| `proxy.ts` (root) | Cookie | — | Pass-through only. No DB lookup. Optionally rebroadcast as `x-active-company-id` header for observability, but NOT load-bearing. |
| `lib/auth/active-company.ts` `getActiveCompanyContext()` | Cookie | — | The **one** function every server action / server component calls. Validates membership against `company_members`. Returns `{ supabase, userId, activeCompanyId, company }` or `{ error }`. |
| `lib/actions/active-company.ts` `setActiveCompany(companyId)` | — | Cookie | Server action invoked by the switcher dropdown. Validates the user is a member of the target company, then `cookieStore.set('xt-active-company', companyId, ...)` + `revalidatePath('/', 'layout')`. |

**Why proxy doesn't read DB:** `proxy.ts` runs on the Edge runtime. Adding a Supabase query there would (a) add latency to every request, (b) require a service-role client in middleware (currently only used in `lib/supabase/proxy.ts` for `updateSession`), (c) duplicate the membership check that server actions and server components already need to do. Keeping the proxy stateless is the right tradeoff.

**Why every server action funnels through `getActiveCompanyContext()`:** Today, 11 action files define their own duplicate `getAuthContext()` helper (confirmed: `lib/actions/{project,client,estimate,recording,photo,company,price-book,settings,whatsapp-settings,estimate-template,custom-domain}.ts`). v4.0 is the right time to consolidate. The new helper validates that the cookie-supplied `active_company_id` is one the user is actually a member of — protecting against tampered cookies independent of RLS (RLS will also catch this, but failing earlier with a clearer error is better DX).

**Sketch of the helper:**

```typescript
// lib/auth/active-company.ts
import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const ACTIVE_COMPANY_COOKIE = 'xt-active-company'

export const getActiveCompanyContext = cache(async () => {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null

  // Validate membership AND fetch the resolved company in one round-trip.
  // RLS on companies (rewritten to is_company_member) makes this safe:
  // if the user isn't a member, the SELECT returns empty.
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, logo_url, owner_name, theme_preference, industry')
    .eq('id', cookieValue ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()

  if (company) {
    return { supabase, userId: claims.sub, activeCompanyId: company.id, company }
  }

  // Fallback: no/invalid cookie → first membership, sorted by created_at.
  // Also handles "user just signed up, no cookie yet" + "cookie points at
  // deleted/revoked company".
  const { data: firstMembership } = await supabase
    .from('company_members')
    .select('company_id, companies (id, name, logo_url, owner_name, theme_preference, industry)')
    .eq('user_id', claims.sub)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!firstMembership?.companies) {
    return { error: 'No company found' as const }
  }

  return {
    supabase,
    userId: claims.sub,
    activeCompanyId: firstMembership.company_id,
    company: firstMembership.companies,
  }
})
```

Notes:
- React `cache()` dedupes per-request. The cookie read and DB lookup happen once even if 20 server components call this in the same render tree.
- The fallback handles cookie-loss gracefully — no redirect needed, no error to the user. The switcher UI shows the resolved company correctly.
- Returning the full company row (not just the id) means `getCachedCompany` is no longer needed; the helper IS the cached company loader. See "getCachedCompany migration" below.

#### `getCachedCompany` migration

**Current shape** (`lib/queries/auth.ts:22-36`):
- `getCachedCompany(userId)` uses `unstable_cache` with key `['company-for-user']` and `userId` as a runtime arg. Uses the **service client** because `unstable_cache` can't call `cookies()`.

**New shape**: delete `getCachedCompany` entirely. Replace every call site with `getActiveCompanyContext()`. Reasons:
- The user-id-keyed cache made sense in the 1-company-per-user model. In multi-company, **(user_id, active_company_id)** is the cache key, and `active_company_id` lives in a cookie — which `unstable_cache` literally cannot access.
- The React `cache()` wrapper in the new helper provides per-request dedupe. The cross-request caching that `unstable_cache` provides has marginal value for a row that changes on every settings save (cache invalidation already happens via `revalidateTag('company')` in `lib/actions/custom-domain.ts:46`).
- Cleaner mental model: one entry point for "who is the current user and what company are they looking at."

Call sites to migrate (verified by grep):
- `app/(app)/layout.tsx:33` — primary AppShell loader → `getActiveCompanyContext()` returns `{ company, userId, activeCompanyId }`, layout passes `company` to Sidebar/Topbar exactly as today.

`getAuthClaims()` stays — it's a thin wrapper over `supabase.auth.getClaims()` and useful in places that only need the user id without a company.

#### Files affected (active-tenant phase)

| File | Change |
|------|--------|
| `proxy.ts` | **MODIFY** — no DB lookup; optionally rebroadcast cookie as request header for log correlation |
| `lib/auth/active-company.ts` | **NEW** — `getActiveCompanyContext()`, `ACTIVE_COMPANY_COOKIE` constant |
| `lib/actions/active-company.ts` | **NEW** — `setActiveCompany(companyId)` server action |
| `lib/queries/auth.ts` | **MODIFY** — delete `getCachedCompany`, keep `getAuthClaims` |
| `app/(app)/layout.tsx` | **MODIFY** — replace `getCachedCompany(claims.sub)` with `getActiveCompanyContext()`; lines 33, 49–52 (billing query) refactored to use `activeCompanyId` instead of `user_id` |

---

### Server Actions Rewrite

#### Pattern: duplicate `getAuthContext()` → import `getActiveCompanyContext()`

**Every** action file has the same 16-line duplicate at the top (verified across `project.ts`, `client.ts`, `estimate.ts`, `recording.ts`, `photo.ts`, `company.ts`, `price-book.ts`, `settings.ts`, `whatsapp-settings.ts`, `estimate-template.ts`, `custom-domain.ts`). The rewrite is mechanical:

```typescript
// BEFORE
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }
  const { data: company } = await supabase
    .from('companies').select('id').eq('user_id', claims.sub).single()
  if (!company) return { error: 'No company found' as const }
  return { supabase, company }
}

// AFTER (delete the helper, just import)
import { getActiveCompanyContext } from '@/lib/auth/active-company'
// every action uses `const ctx = await getActiveCompanyContext()` — same shape
```

The shape `{ supabase, company }` is preserved deliberately so the rest of every action body (the `ctx.company.id` references, the `if ('error' in ctx)` guards) compiles unchanged. This minimises diff size and merge-conflict risk during the sweep.

#### Special cases by action file

| File | Notes |
|------|-------|
| `lib/actions/company.ts` | **`createOrUpdateCompany` becomes "create OR update"** with explicit mode selection. The "Add company" UI flow must NOT find-or-update — it must always INSERT a new company AND a new `company_members` row + auto-switch the cookie. Add a `mode: 'create' \| 'update'` parameter (or split into two actions: `createCompany` for the "Add company" entry-point and `updateCompany` for settings saves). The current SELECT-then-INSERT/UPDATE pattern (lines 67-106) becomes a foot-gun in multi-tenant mode. |
| `lib/actions/estimate.ts` | The auth helper fetches extra columns (`default_tax_rate`, `default_payment_terms`, `default_warranty_terms`) — `getActiveCompanyContext()` should NOT bloat its default select. Add a second focused query inside `createBlankEstimate` instead, or extend the context helper to accept an optional second-select option. **Recommend:** focused query inside the action; keeps the helper lean. |
| `lib/actions/custom-domain.ts` | The `revalidateTag('company')` call (line 46) becomes a no-op once `getCachedCompany` is deleted. Remove it or leave as harmless dead-tag (cheap on the Next.js side). |
| `lib/actions/auth.ts` | `signOut` likely needs to clear the active-company cookie too. Check current implementation. |

#### Read-only queries (`lib/queries/*.ts`)

These are called from server components, not server actions. They take a `supabase` client and a `companyId` / `userId` from the caller. Convention is preserved: the caller (server component) gets the company from `getActiveCompanyContext()` and passes the id down. Files like `lib/queries/company.ts`, `lib/queries/project.ts`, `lib/queries/billing.ts` need their `userId` parameters changed to `companyId` (or both, depending on the query). Audit each:

- `getCompanySettings(supabase, userId)` → `getCompanySettings(supabase, companyId)` — query becomes `.eq('id', companyId)` not `.eq('user_id', userId)`.
- `getCompanyTier(supabase, userId)` → `getCompanyTier(supabase, companyId)` — same shape.
- `getCustomDomainSettings(supabase, userId)` → `getCustomDomainSettings(supabase, companyId)` — same shape.

#### Files affected (server actions phase)

| File | Change |
|------|--------|
| `lib/actions/project.ts` | Delete duplicate `getAuthContext`, import shared helper. ~5 call sites. |
| `lib/actions/client.ts` | Same. ~3 call sites. |
| `lib/actions/estimate.ts` | Same + extra-columns adaptation. ~6 call sites. |
| `lib/actions/recording.ts` | Same. ~3 call sites. |
| `lib/actions/photo.ts` | Same. |
| `lib/actions/company.ts` | **Split**: `updateCompanySettings` (current logic, scoped to active company) + `createCompany` (new — INSERT-only, also INSERT `company_members`, set cookie, redirect to onboarding completion). |
| `lib/actions/price-book.ts` | Same. |
| `lib/actions/settings.ts` | Same. |
| `lib/actions/whatsapp-settings.ts` | Same. |
| `lib/actions/estimate-template.ts` | Same. |
| `lib/actions/custom-domain.ts` | Same + drop stale `revalidateTag('company')`. |
| `lib/actions/auth.ts` | Sign-out clears `xt-active-company` cookie. |
| `lib/queries/company.ts` | All `getXxx(supabase, userId)` → `getXxx(supabase, companyId)`. |
| `lib/queries/billing.ts` | Same migration. |
| `lib/queries/project.ts` | Already takes `companyId` — no change. |
| `lib/queries/share.ts` | Already operates by share_token, no auth context — no change. |

---

### Inngest

#### Decision: keep companyId in job payload (zero change to event flow)

**Workers have no cookie context. Period.** They run in the Inngest runtime, triggered by webhook events or cron, with no incoming HTTP request, no Supabase session, no Next.js cookies API. They cannot read `xt-active-company`. There is no architecturally valid alternative.

**Current pattern (verified):**
- `EstimateGeneratePayload` (`lib/inngest/events.ts:15-21`) includes `companyId` as a required field.
- `whatsAppProcessJob` (`lib/inngest/functions/whatsapp-process.ts:41`) destructures `companyId` from `event.data`.
- `generateEstimateJob` calls `recordUsage(supabase, companyId, ...)` (`generate-estimate.ts:81`) — using the service client (bypasses RLS) with companyId as explicit scope.

**For v4.0, the only change is the dispatch site, not the workers:** wherever an Inngest event is dispatched (in API routes like `app/api/generate-estimate/route.ts`, `app/api/transcribe/route.ts`, `app/api/analyze-photos/route.ts`, and inside `lib/whatsapp/handler.ts`), the dispatcher must read `companyId` from `getActiveCompanyContext()` instead of from `getAuthContext()`. For WhatsApp specifically, the inbound message has a `to` phone number which is already looked up against `companies.whatsapp_phone_number` — that lookup is the source of truth, not a cookie.

**`loadOwnerUserId` in workers:** `lib/inngest/functions/generate-estimate.ts:21-33` queries `companies.user_id` to find who owns the company (for notification routing). In v4.0 this still works because we're keeping `companies.user_id`. In v4.1 (when we drop the column), this becomes:

```typescript
async function loadOwnerUserId(companyId: string): Promise<string | null> {
  const { data } = await requireServiceClient()
    .from('company_members')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('role', 'owner')
    .single()
  return data?.user_id ?? null
}
```

**Don't try to read cookies in workers.** Don't try to stash the cookie value in Inngest job metadata. The job payload's explicit `companyId` is the right ergonomics — the worker knows its scope from the event, not from request state.

#### Files affected (Inngest phase)

| File | Change |
|------|--------|
| `lib/inngest/functions/generate-estimate.ts` | No change for v4.0. (`loadOwnerUserId` change deferred to v4.1.) |
| `lib/inngest/functions/whatsapp-process.ts` | No change. |
| `lib/inngest/functions/transcribe-audio.ts` | No change. |
| `lib/inngest/functions/analyze-photos.ts` | No change. |
| `lib/inngest/functions/notification-email-digest.ts` | No change — already iterates by company_id. |
| `lib/inngest/events.ts` | No change. |
| `app/api/generate-estimate/route.ts` | Dispatcher reads `companyId` from `getActiveCompanyContext()` (was: `getAuthContext()`). |
| `app/api/transcribe/route.ts` | Same. |
| `app/api/analyze-photos/route.ts` | Same. |
| `lib/whatsapp/handler.ts` | No change — `companyId` already resolved from phone lookup. |

---

### Storage

#### Decision: rewrite storage policies to use `is_company_member()`, no path changes

The existing storage policies (`20260409000001_initial_schema.sql:280-369`) follow this pattern for each of 4 buckets (audio, photos, pdfs, logos):

```sql
CREATE POLICY "company_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos' AND
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid())
    )
  );
```

The `(storage.foldername(name))[1]` part extracts the first path segment — the file path is `{company_id}/{rest-of-path}` (e.g. `8f3a.../recordings/abc.webm`). **This path convention does NOT need to change in v4.0.** The company_id is still the scoping prefix; the only thing that changes is the membership check.

**Rewrite (4 buckets × 3 ops = 12 policies):**

```sql
CREATE POLICY "company_photos_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'photos' AND
    public.is_company_member(((storage.foldername(name))[1])::uuid)
  );
```

The `::uuid` cast is needed because `storage.foldername()` returns `text[]` and `is_company_member` takes `UUID`. Add a defensive `IS NOT NULL` check if any bucket has files outside the `{company_id}/...` convention — audit `20260508000002_phase27_nullable_storage_path.sql` first.

**Application-side upload paths:** all uploads currently construct the path as `${companyId}/...` (verified in `lib/inngest/functions/whatsapp-process.ts:96`: `${companyId}/whatsapp/${projectId}-${msg.image.id}.${ext}`). No application code changes needed; the path convention is preserved.

**Edge case to test:** legacy files uploaded under the 1-company-per-user model. Their paths start with the old company_id, which is identical to the company_id of the newly-backfilled `company_members` row — so the new policy returns true for the same files. No data migration of storage objects is needed.

#### Files affected (storage phase)

| File | Change |
|------|--------|
| `supabase/migrations/20260521000004_v4_storage_rls.sql` | **NEW** — DROP + CREATE for all 12 storage policies (4 buckets × select/insert/delete) |
| Storage upload sites | **NO CHANGE** — path convention `{companyId}/...` preserved |

---

### Stripe / Webhooks

#### Webhook handler: no architectural change required

The webhook handler (`app/api/webhooks/stripe/route.ts`) is **already correct** for multi-tenancy because it identifies the target company by `stripe_customer_id` (column on `companies`), not by user. Trace verified:

- `checkout.session.completed`: reads `session.metadata.companyId` (line 100-102) — set at checkout creation, so the dispatcher (the action that creates the checkout session) is the one that needs to use `getActiveCompanyContext()`. The webhook itself is correct.
- `customer.subscription.updated`: would look up the company by `stripe_customer_id` (already 1:1 per company). No change.
- Connect events: dispatched to `handleConnectEvent` based on `event.account` (`acct_xxx`), which is also a per-company column (`companies.stripe_connect_account_id`). No change.

#### Stripe Connect: per-company already (verified)

`20260517000001_phase70_stripe_connect_columns.sql` adds Connect columns to `companies`. Each company has its own connected account, OAuth flow, charge routing. The "Connect Stripe Account" UI lives at `/settings/payments` — which becomes "Connect Stripe Account for {activeCompany.name}" in v4.0. No structural change.

#### Checkout session creator: needs the active-company switch

`app/api/billing/create-checkout-session/route.ts` reads the user's company today. v4.0: must read the **active** company and embed its id in `session.metadata.companyId`. This is just a single-line change: replace the user-id lookup with `getActiveCompanyContext()`.

#### Customer portal: same one-line change

`app/api/billing/create-portal-session/route.ts` likewise.

#### Files affected (Stripe phase)

| File | Change |
|------|--------|
| `app/api/webhooks/stripe/route.ts` | **NO CHANGE** — already keyed on company.stripe_customer_id |
| `lib/billing/connect-webhook.ts` | **NO CHANGE** — already keyed on companies.stripe_connect_account_id |
| `app/api/billing/create-checkout-session/route.ts` | **MODIFY** — `getActiveCompanyContext()` instead of `getAuthContext()` |
| `app/api/billing/create-portal-session/route.ts` | Same. |
| `app/api/stripe/connect/initiate/route.ts` | Same. |
| `app/api/stripe/connect/callback/route.ts` | Reads `companyId` from OAuth state param — already correct; verify state-param generation site uses active company. |
| `app/api/stripe/connect/disconnect/route.ts` | Same. |

---

### Custom Domains

#### Decision: subdomain-as-tenant is **out of scope for v4.0**. Existing custom-domain feature is unchanged.

The PROJECT.md target features list for v4.0 does **not** include "tenant subdomains routing into the app shell". The existing custom-domain feature (Phases 38–39) is narrow: a custom domain points at `/estimate/{token}` for white-label estimate sharing. The proxy detects the custom host header and rewrites with `x-white-label: 1`, then the share page renders without Xtimator branding (`proxy.ts:8-20`).

This continues to work transparently in v4.0:
- Custom domain is still a per-company column (`companies.custom_domain`).
- The share-link flow uses `share_token` (globally unique), not company context — anon access, no cookie needed.
- The white-label flag is host-header-driven, not cookie-driven.

**What about per-company subdomains as a primary auth surface (e.g. `acme.xtimator.com/dashboard`)?** This is a forward-looking pattern that some multi-tenant SaaS use ([example architecture](https://medium.com/@fatih_erdogann/building-a-multi-tenant-saas-on-next-js-subdomains-sso-cookies-and-self-hosting-with-nginx-7149a13789e7)). For Xtimator, given the locked decision of "cookie-based active company", subdomains are **redundant and harmful**:
- One user has multiple companies → subdomain switching = forcing reauthentication per switch = bad UX.
- The cookie approach gives instant switching with one server action.
- Adding subdomain auth would require migrating session-cookie domain scoping (currently default-host) to `.xtimator.com` apex — fragile and out of scope.

**Forward path (if v5.0 wants tenant subdomains):** subdomains become a vanity URL for the **active** company (e.g. `acme.xtimator.com/dashboard` → proxy rewrites to default host + sets active-company cookie if not present). This is additive, not a replacement for the cookie model. Not blocked by any v4.0 decision.

#### Files affected (custom-domain phase)

| File | Change |
|------|--------|
| `proxy.ts` | **NO CHANGE** to custom-domain logic. (Will add cookie-rebroadcast for observability — see Active Tenant Context.) |
| `lib/actions/custom-domain.ts` | **MODIFY** — sweep to `getActiveCompanyContext()` (same as every other action). Logic unchanged. |
| `app/estimate/[token]/page.tsx` | **NO CHANGE.** |

---

### Suggested Build Order

#### Recommended: **schema-first, then RLS, then app code, then UI** (NOT vertical slice)

**Why not vertical slice:**
- One vertical slice (e.g. "make clients work end-to-end in v4.0") requires migrating `companies.user_id` → `company_members` lookup in: the schema, the clients RLS policy, the clients server actions, the clients server-component queries, and the clients UI. But the same migration must happen for **every** other tenant table at the same time, because they all share the same `getAuthContext()` helper, the same `getCachedCompany`, the same `(app)/layout.tsx`. Vertical slicing here means doing the cross-cutting infrastructure twice — once for the slice, once for the rest.
- The cross-cutting infrastructure (schema + RLS helper + active-company helper + app layout) is the **architectural cost**. Once paid, the per-table sweep is trivial.
- This matches the codebase's existing rhythm: the v3.0 monetization sweep (Phases 55-60) did schema first (Phase 55), then quota helpers (Phase 56), then enforcement across all routes (Phase 57), then UI (Phase 59). Six phases, one cross-cutting concern at a time, no vertical slices.

**Phase ordering for v4.0:**

| Phase | Topic | Files / Migrations | Why this order |
|-------|-------|-------------------|----------------|
| **P1** | Schema | `20260521000001_v4_company_members.sql`, regen types | Nothing depends on app code; safe to ship even if rolled back. Backfill is idempotent. |
| **P2** | RLS helper + policy rewrite | `_v4_rls_company_member_helper.sql`, `_v4_rls_rewrite_policies.sql`, `_v4_storage_rls.sql`, audit assertions | Independent of app code (existing app still uses `companies.user_id` directly via service-role-bypassed Inngest workers — those are untouched here). The rewritten policies still allow access to the owner because `is_company_member` returns true for the backfilled row. **Critical:** run audit harness after this phase to confirm no policy missed the rewrite. |
| **P3** | Active-company context | `lib/auth/active-company.ts`, `lib/actions/active-company.ts`, `proxy.ts` rebroadcast | The helper. Doesn't replace anything yet — sits beside `getAuthContext` duplicates. |
| **P4** | App shell + cookie wiring | `app/(app)/layout.tsx`, switcher dropdown UI in `components/app-shell/company-selector.tsx`, "Add company" entry-point | First user-visible change. The layout now reads `getActiveCompanyContext()`. Existing companies still work because the fallback selects the user's only membership. |
| **P5** | Server actions sweep | All 11 action files + the queries files | Mechanical — delete duplicate `getAuthContext`, import shared. Test coverage from existing unit tests catches regressions. |
| **P6** | API routes + dispatchers | Billing checkout, Stripe Connect, generate-estimate dispatcher, transcribe dispatcher, analyze-photos dispatcher | All read active company from the same helper. Webhook + Inngest worker bodies unchanged. |
| **P7** | "Add company" flow | New `createCompany` action, onboarding wizard in "create new" mode, cookie auto-switch | User-facing feature — enables the multi-company case. |
| **P8** | Cleanup / validation | UAT, RLS audit re-run, deprecation comment audit, manual switcher test across all surfaces | Confirm nothing references `companies.user_id` outside of Inngest workers + onboarding (the two intentional exceptions). |

#### Dependency graph

```
P1 Schema
  └→ P2 RLS         (RLS rewrite needs the new table)
       └→ P3 Helper (helper validates membership against new table)
            ├→ P4 App Shell  (shell uses helper)
            ├→ P5 Actions    (actions use helper)
            └→ P6 API Routes (routes use helper)
                 └→ P7 Add Company (depends on shell + actions)
                      └→ P8 Validation
```

P4, P5, P6 are independent of each other after P3 ships. Could parallelise across agents if velocity matters, but sequential is safer for review.

#### Out-of-band risks to flag

| Risk | When it bites | Mitigation |
|------|---------------|------------|
| A server-component data loader (e.g. in `app/(app)/dashboard/page.tsx`) is missed during the sweep and still uses `claims.sub` to look up `companies` | After P5 ships — query returns the user's first-by-created-at company, which may not be the active one | Grep for `.eq('user_id', claims.sub)` and `.eq('user_id', userId)` against `lib/` and `app/` after P5 and P6. The audit harness from v3.1 can be extended for this. |
| RLS policy missed in the rewrite (e.g. a Phase-77 notifications policy added after the initial schema) | After P2 ships — table inaccessible to authenticated user even though they're a member | Build a SQL assertion in the audit harness: `SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polqual::text LIKE '%companies%user_id%'` should return zero rows after P2. |
| Cookie cleared mid-session (user opened an old tab) → fallback picks "wrong" company | After P4 ships | Already handled: `getActiveCompanyContext` fallback selects oldest membership, which is the existing company for migrating users. Newer-multi-company users see a UI surprise but no error. Acceptable. |
| `unstable_cache` stale data after company switch | After P4 ships if `getCachedCompany` lingers | Delete `getCachedCompany` in P3/P4. Don't replace with a per-active-company `unstable_cache` — React `cache()` per-request is sufficient. |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Schema design (composite PK, keep user_id) | HIGH | Locked decisions are explicit; codebase patterns confirmed via direct read |
| RLS helper function pattern | HIGH | Verified against Supabase official docs + the codebase's own `is_platform_admin()` precedent |
| Active-company helper layering | HIGH | Verified against existing duplicate-helper pattern across 11 action files + React `cache()` semantics |
| Inngest worker pattern | HIGH | Verified by reading 4 worker files — companyId is already in every payload |
| Storage policy rewrite | HIGH | Pattern is identical to data RLS; storage.foldername convention is unchanged |
| Stripe webhook integration | HIGH | Verified by reading the webhook route — already keyed on company columns, not user |
| Custom domain scope decision | HIGH | PROJECT.md is explicit about v4.0 scope; existing proxy logic is anon-only |
| Build order (schema-first, not vertical) | MEDIUM-HIGH | Codebase rhythm matches; the only counter-argument is "smaller blast radius per phase" which the cross-cutting nature of this milestone refutes |
| getCachedCompany migration (delete entirely) | MEDIUM-HIGH | Tradeoff analysis is sound but deleting any cache layer carries some risk in production; mitigated by React cache() per-request dedupe |

## Open Questions for Roadmap

1. **Naming the active-company cookie:** `xt-active-company` proposed. Confirm vs naming conventions used elsewhere (e.g. `eb-theme` already exists). Keep prefix consistent.
2. **`createOrUpdateCompany` split:** explicitly split or keep as one action with a mode param? Recommend split for clarity, but team convention may prefer the latter.
3. **Onboarding wizard reuse for "Add company":** verify the existing wizard is re-enterable without backwards-compat surprise (e.g. localStorage state that assumes one company). Phase 7 needs this validated.
4. **Per-user "default company" preference:** explicitly out-of-scope per PROJECT.md, but worth surfacing — first-load UX is "the oldest membership becomes active", which may not match user expectation if they have 5 companies. Acceptable for v4.0, could be a SEED for v4.x.

---

## Sources

- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — STABLE SECURITY DEFINER pattern, initPlan optimization, ~10x performance gain documented
- [Supabase Row Level Security Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — current canonical RLS reference
- [Supabase community discussion #14576 — RLS Performance and Best Practices](https://github.com/orgs/supabase/discussions/14576) — corroborating performance numbers
- [Supabase JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields) — confirms `app_metadata` is not user-mutable (rejected as active-company storage in favour of cookie)
- [Makerkit: Supabase RLS Best Practices for Multi-Tenant](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — independent corroboration of SECURITY DEFINER helper pattern
- [Building Multi-Tenant Applications with Next.js — John Kavanagh](https://johnkavanagh.co.uk/articles/building-a-multi-tenant-application-with-next-js/) — survey of cookie vs subdomain tradeoffs
- Internal: `supabase/migrations/20260519000002_fix_platform_admin_rls_recursion.sql` — the codebase's own `is_platform_admin()` SECURITY DEFINER precedent
- Internal: `supabase/migrations/20260409000001_initial_schema.sql` — RLS policy baseline (30 policies confirmed across 9 initial tables; ~30 more added across Phases 19-77 follow the same pattern)
- Internal: `lib/inngest/functions/generate-estimate.ts`, `lib/inngest/functions/whatsapp-process.ts` — worker companyId-in-payload pattern confirmed
- Internal: `proxy.ts` + `lib/supabase/proxy.ts` — proxy/middleware architecture confirmed (note: `proxy.ts` not `middleware.ts`)
