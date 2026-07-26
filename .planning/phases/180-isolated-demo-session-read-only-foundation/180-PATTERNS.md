# Phase 180: Isolated Demo Session & Read-Only Foundation - Pattern Map

**Mapped:** 2026-07-26  
**Files analyzed:** 31 implementation/test targets (several are deliberate sweep groups)  
**Analogs found:** 31 / 31

## File Classification

| New/Modified File | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `lib/demo/config.ts` | config | transform | `lib/utils/site-url.ts` | role-match |
| `proxy.ts` | middleware | request-response | existing `proxy.ts` | exact |
| `app/demo/entry/route.ts` (exact name at implementation discretion) | route | request-response | `app/api/transcribe/route.ts`, `proxy.ts` | role/data-flow |
| `lib/supabase/server.ts` | utility | request-response | existing `proxy.ts` adapter | data-flow-match |
| `lib/queries/active-company.ts` | utility | request-response | existing file | exact |
| `lib/demo/guard.ts` | middleware/utility | request-response | existing file | exact |
| `lib/demo/actions.ts` | action | request-response | existing file | exact |
| `lib/actions/{active-company,auth,settings,project,estimate,team,theme,chat,company,invite-accept,price-book,invoice}.ts` | server actions | CRUD/event-driven | `lib/actions/client.ts` + existing guarded action modules | role-match |
| `app/api/{chat,translate,notifications/**,stripe/connect/disconnect}/route.ts` and existing guarded mutation routes | route | request-response | `app/api/transcribe/route.ts` | exact |
| `app/estimate/[token]/actions.ts`, OAuth authorization/token paths | action/route | request-response | existing server action + route conventions | role-match |
| `lib/{mcp/tools/write,agent-tools/**,chat/tools,queries/chat,notifications/{customer-send,dispatch},integrations/xphere/dispatch}.ts` and company jobs | service | event-driven | `lib/agent-tools/create-estimate.ts`, `lib/notifications/dispatch.ts` | exact |
| `supabase/migrations/<timestamp>_demo_readonly_company_storage.sql` | migration | batch | `20260530000001_demo_readonly.sql`, `20260706000004_storage_rls_company_members.sql` | exact |
| `tests/unit/demo/{config,host-routing,session-route,guard,mutation-boundary-sweep,side-effect-boundaries,rls-migration-contract}.test.ts` | test | request-response/static | `tests/unit/phase83-server-action-sweep.test.ts` | role-match |
| `tests/integration/demo-readonly-rls.test.ts` | integration test | CRUD/file-I/O | `tests/integration/platform-brand-rls.test.ts` | exact |
| `tests/e2e/demo-session-isolation.spec.ts` | E2E test | request-response | `tests/e2e/auth-modal.spec.ts`, `playwright.config.ts` | role-match |
| `playwright.config.ts` / E2E support setup | config | request-response | existing `playwright.config.ts` | exact |

## Pattern Assignments

### Host config and apex routing

**Targets:** `lib/demo/config.ts`, `proxy.ts`, and the new demo-entry route.  
**Analogs:** `lib/demo/config.ts:1-50`, `lib/utils/site-url.ts:39-74`, `proxy.ts:101-167`.

Use the canonical `server-only` demo config file; its public helper convention returns `null` for absent credentials rather than throwing:

```ts
import 'server-only'

export function getDemoUserEmail(): string | null {
  return process.env.DEMO_USER_EMAIL ?? null
}

export function isDemoCompany(companyId: string | null | undefined): boolean {
  return !!companyId && companyId === DEMO_COMPANY_ID
}
```

`lib/utils/site-url.ts:43-56` is the local pattern for normalizing an environment URL (trim, unquote, remove trailing slash). Phase 180 must parse/validate the fixed demo origin and use only fixed route paths; unlike `resolveBaseUrl()` at `:59-74`, it must not build the demo destination from forwarded/Host headers.

Extend `proxy.ts` in its established order: keep claim-free machine paths before Supabase creation (`:101-110`); classify `/demo`/the exact demo host before protected-route redirects; preserve the current protected redirect’s copied `Set-Cookie` headers (`:151-163`). The apex handoff itself has no Supabase client or cookie mutation.

### Response-bound Supabase session entry

**Target:** new `app/demo/entry/route.ts` (path name is discretionary).  
**Analog:** `proxy.ts:112-130` (not the server-component-only `lib/supabase/server.ts:4-26`).

The route must create the redirect response first and bind SSR `setAll` writes to that exact response. The proxy is the current concrete response-bound cookie adapter:

```ts
let supabaseResponse = NextResponse.next({ request })
const supabase = createServerClient(url, key, {
  cookies: {
    getAll() { return request.cookies.getAll() },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
      supabaseResponse = NextResponse.next({ request })
      cookiesToSet.forEach(({ name, value, options }) =>
        supabaseResponse.cookies.set(name, value, options)
      )
    },
  },
})
```

Adapt this shape to a `NextResponse.redirect` held by the route; do not call `createClient()` and then construct a different redirect, because `lib/supabase/server.ts:15-22` writes only through Next’s ambient cookie store and intentionally swallows Server Component failures. For repair, validate claims with the project-standard `auth.getClaims()` (see `proxy.ts:133-141`), use `signOut({ scope: 'local' })`, expire observed host cookies and `active_company_id`, then perform password sign-in and membership verification. Any missing credential, claim mismatch, or membership failure is a terminal 503, not another redirect.

### Active-company host-only cookie

**Targets:** `lib/queries/active-company.ts` and the demo-entry route.  
**Analog:** `lib/queries/active-company.ts:28-36, 51-105`; `lib/actions/active-company.ts:30-51`.

Use the existing cookie name/options as the base and extend options per route only with protocol-derived `secure`; do not introduce a second tenant cookie or `domain` option:

```ts
export const ACTIVE_COMPANY_COOKIE = 'active_company_id'
export const ACTIVE_COMPANY_COOKIE_OPTIONS = {
  httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30,
}

cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, ACTIVE_COMPANY_COOKIE_OPTIONS)
```

The trusted resolution pattern validates cookie membership before return (`active-company.ts:63-75`) and falls back only from authenticated `company_members` (`:81-104`). Demo classification must consume this resolved/validated company, never raw cookie text.

### Shared read-only guard and server-action use

**Targets:** `lib/demo/guard.ts`, all tenant action groups above, `lib/demo/actions.ts`.  
**Analogs:** `lib/demo/guard.ts:17-69`, `app/api/transcribe/route.ts:26-40`.

Strengthen the existing module rather than creating a parallel policy API. Preserve the standardized action and HTTP result shapes:

```ts
export async function assertWritable(): Promise<DemoDenied | null> {
  return (await isDemoSession()) ? { error: DEMO_READONLY_MESSAGE } : null
}

export async function demoGuardResponse(): Promise<NextResponse | null> {
  if (await isDemoSession()) {
    return NextResponse.json({ error: 'demo_readonly', message: DEMO_READONLY_MESSAGE }, { status: 403 })
  }
  return null
}
```

Add the locked OR classification and an explicit `{ userId?, email?, companyId? }` form under this same module, then place `const denied = await assertWritable(); if (denied) return denied` before every action mutation/Auth operation/cookie switch. `lib/demo/actions.ts:11-14` is the explicit recovery exception: it should remain a local-only sign-out and use a validated absolute apex signup destination.

### API denial ordering

**Targets:** API route sweep, including chat/translate/notifications/connect and already-guarded generate/send/upload/billing routes.  
**Analog:** `app/api/transcribe/route.ts:26-40, 85-132`.

The guard belongs after the route’s authentication check, but before rate limits, quota/credit decrement, storage/provider work, service-role client use, or `inngest.send`:

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const blocked = await demoGuardResponse()
if (blocked) return blocked

// rateLimit/checkQuota/... only below this line
```

`app/api/chat/route.ts:82-135` demonstrates the service-role seam that currently occurs after `getActiveCompanyId()`: Phase 180 must deny there before `requireServiceClient()`, model resolution, message persistence, or tool construction. Keep machine-authenticated webhook/Inngest/cron endpoints claim-free in proxy (`proxy.ts:91-109`); deny only after their trusted payload resolves a company, not from browser cookies.

### Explicit company-context service and job guard

**Targets:** MCP write tools, agent tools, chat/notification/Xphere funnels, and Inngest functions.  
**Analogs:** `lib/mcp/tools/write.ts:379-410, 433-470`, `lib/agent-tools/create-estimate.ts:43-76`, `lib/notifications/dispatch.ts:62-125, 217-231`.

These channels use a trusted company id but service-role clients that bypass RLS. Place the explicit guard before their first service client, credit check, notification insert, or dispatch. The recurring current flow is:

```ts
const supabase = requireServiceClient()
const result = await createProject(supabase, auth.company_id, input)

const { allowed } = await checkCredits(requireServiceClient(), args.companyId, 1)
if (!allowed) throw new Error(INSUFFICIENT_CREDITS_MESSAGE)
const { ids } = await inngest.send({ name: EVENT_ESTIMATE_GENERATE, data: payload })
```

Phase 180 inserts the shared explicit-company deny before these lines; do not rely on the route cookie guard or on a role exemption. `lib/notifications/dispatch.ts:125-219` additionally establishes that one notification can insert with service role and then enqueue multiple external channels, so the entry funnel must be guarded before both steps and workers repeat the company guard.

### Restrictive RLS, company-row protection, storage, and assertions

**Target:** one new timestamped migration.  
**Analogs:** `supabase/migrations/20260530000001_demo_readonly.sql:17-83`, `20260706000006_demo_readonly_rerun.sql:14-45`, `20260706000004_storage_rls_company_members.sql:20-150`.

Copy the project’s idempotent migration posture: transaction when related policy rewrites/assertions must be atomic; dynamic catalog loop; `DROP POLICY IF EXISTS`; then `CREATE POLICY ... AS RESTRICTIVE`. Existing user policy form:

```sql
CREATE POLICY demo_block_update ON public.%I AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (NOT public.is_demo_user())
WITH CHECK (NOT public.is_demo_user());
```

Extend it with restrictive company-row policies for tables proven to have a compatible `company_id`, then storage-object policies that preserve the existing `bucket_id`/first-folder membership structure (`20260706000004...:24-31`). Finish with in-migration `pg_policies` assertions that raise on missing current public/storage coverage; `20260706000004...:137-150` is the local assertion format. Never replace normal permissive membership policies—restrictive policies only remove access.

### Static, integration, and browser tests

**Targets:** all Phase 180 test files and `playwright.config.ts`.  
**Analogs:** `tests/unit/phase83-server-action-sweep.test.ts:1-54`, `tests/integration/platform-brand-rls.test.ts:12-61`, `tests/e2e/auth-modal.spec.ts:15-55`, `playwright.config.ts:3-38`.

Static sweep tests read repository files with Node `fs`, enumerate candidates, and require a concrete guard import/call or explicitly reasoned exception:

```ts
const files = readdirSync(ACTIONS_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ name: f, content: readFileSync(resolve(ACTIONS_DIR, f), 'utf8') }))
```

Live tests are environment-gated, construct service/anon/authenticated clients with non-persistent sessions, and clean up service-role fixtures in `afterAll` (`platform-brand-rls.test.ts:15-39`). Assert denial messages rather than relying on one Supabase error string (`:46-60`).

For Playwright, retain the configured Chromium/mobile projects and serial worker (`playwright.config.ts:3-37`). The new isolation spec must create one browser context, snapshot apex cookies, navigate apex `/demo` across the configured origin, inspect host-only cookies, return to apex and compare the original identity/company cookies. Unlike normal relative-page specs, use absolute configured origins for both hosts; tests requiring seeded normal/demo accounts should call `test.skip` with the existing explicit missing-env style (`support-mode.spec.ts:17-22`).

## Shared Patterns

### Authentication and cookie response ownership

**Sources:** `proxy.ts:112-141`; `lib/supabase/server.ts:4-26`.  
**Apply to:** proxy and demo entry only.

Use `getClaims()` for verified identity; use one response-bound SSR cookie adapter for an auth-mutating route. Ambient `cookies()` is suitable for existing server actions/components but not for a route that must redirect with Auth cookies intact.

### Tenant trust boundary

**Source:** `lib/queries/active-company.ts:51-105`.  
**Apply to:** session repair, guards, routes, actions.

`active_company_id` becomes trusted only after its membership query; service-role reads are allowed only downstream of this validated ID or an authenticated bearer/company context.

### Deny before side effects

**Sources:** `app/api/transcribe/route.ts:26-40`; `lib/agent-tools/create-estimate.ts:50-76`; `lib/notifications/dispatch.ts:125-231`.  
**Apply to:** every mutation, provider call, storage operation, billing call, and dispatch.

The guard must precede rate limiting, quotas, DB writes, provider construction, and Inngest send. RLS is a final authenticated-client boundary, not protection for service-role/external effects.

### Read-only database policy

**Sources:** `20260530000001_demo_readonly.sql:47-83`; `20260706000004_storage_rls_company_members.sql:137-150`.  
**Apply to:** public RLS tables, company rows, and `storage.objects`.

Use restrictive policy composition, idempotent dynamic migration operations, and a catalog assertion so schema growth cannot silently evade the deny boundary.

## No Analog Found

None. The exact cross-host Supabase entry state machine is new, but its constituent response-cookie, host-validation, guard, and test patterns all have direct Xtimator analogs above. Do not copy Xkedule’s canonical-admin exemption.

## Metadata

**Analog search scope:** `proxy.ts`, `app/`, `lib/demo`, auth/tenant/action/API/service funnels, migrations, and Vitest/Playwright suites.  
**Files scanned:** 18 primary analogs plus target inventory from `180-RESEARCH.md`.  
**Pattern extraction date:** 2026-07-26
