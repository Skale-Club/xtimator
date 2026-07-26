# Phase 180: Isolated Demo Session & Read-Only Foundation - Research

**Researched:** 2026-07-26  
**Domain:** Host-isolated Supabase SSR authentication, tenant-scoped read-only enforcement, and defense-in-depth side-effect denial  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Host and session isolation
- [D-01] Production demo traffic uses `demo.xtimator.com`; the apex `/demo` entry performs a cross-host handoff rather than authenticating the demo user on `xtimator.com`.
- [D-02] Supabase auth cookies and `active_company_id` created on the demo host are host-only. No `.xtimator.com` domain cookie is introduced.
- [D-03] The demo entry is idempotent: a valid existing demo session reuses the demo identity; stale, wrong-user, wrong-company, or partial demo cookies are cleared/repaired without redirect loops.
- [D-04] Local development uses a configured demo host (for example `demo.localhost`) and the actual configured port; production secure-cookie behavior is not weakened to make local development work.

### Demo identity and tenant
- [D-05] Reuse `lib/demo/config.ts` as the canonical source for `DEMO_COMPANY_ID`, `DEMO_USER_EMAIL`, and `DEMO_USER_PASSWORD`.
- [D-06] The demo host authenticates only the dedicated demo user and sets the deterministic demo company as active before redirecting to the real `/dashboard`.
- [D-07] Never grant or reuse a canonical platform-admin/provider identity for public visitors. Xkedule's admin-exemption write hole is explicitly rejected.

### Read-only enforcement
- [D-08] A request is treated as demo/read-only if either the authenticated session matches the dedicated demo user or the resolved active company matches `DEMO_COMPANY_ID`. Guards must fail closed on either signal.
- [D-09] UI suppression is convenience only. Server actions, API routes, upload/generation/send/billing/background-job entry points, and database/RLS policies independently deny demo mutations and external effects.
- [D-10] Existing `lib/demo/guard.ts`, `assertWritable`, and `demoGuardResponse` remain the shared server contract and are strengthened rather than replaced by a parallel guard system.
- [D-11] RLS/database protection is the final boundary. The dedicated demo user/company cannot write through direct Supabase client access even if an application guard is missed.

### Cutover safety
- [D-12] The current standalone `/demo/*` pages remain intact throughout Phase 180. Public CTA cutover and duplicate-page removal happen only in Phase 181 after automated and browser verification.

### the agent's Discretion
- Exact route names for the cross-host entry/callback.
- Whether the demo-host URL is supplied by one absolute environment variable or a small host configuration object, provided local and production behavior is deterministic and validated.
- The smallest maintainable RLS migration strategy that denies writes without weakening normal tenant policies.

### Deferred Ideas (OUT OF SCOPE)
- Landing CTA switch, removal of `app/demo/*`, and full responsive browser parity are Phase 181.
- Periodic demo-data reset and multi-industry demo scenarios are future milestones.
- DNS, Supabase redirect allow-list, and Coolify custom-domain mutations are operator actions; repository configuration/documentation lands in Phase 181.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENTRY-01 | A visitor opening the public demo entry on the apex domain is transferred to the configured demo host without changing an existing apex-domain Supabase session. | Use a fixed, validated `DEMO_APP_ORIGIN`; the apex response only redirects and never creates/clears auth state. Cookie isolation follows from omitting `Domain` on both hosts. [VERIFIED: Xtimator `proxy.ts`, `lib/supabase/server.ts`; Xkedule `server/routes/demo.ts`, `server/index.ts`] |
| ENTRY-02 | The demo host creates a host-only authenticated session for the dedicated demo user, selects the deterministic demo company in a host-only `active_company_id` cookie, and redirects to the real `/dashboard`. | Add an exact-host-only session route which binds Supabase SSR cookie writes to its redirect response, signs in with server-only config, verifies demo-company membership, and writes the existing active-company cookie with no `Domain`. [VERIFIED: Xtimator `lib/demo/config.ts`, `lib/queries/active-company.ts`, installed `@supabase/ssr` source] |
| ENTRY-03 | Re-entering the demo is idempotent and recovers from stale or partial demo cookies without redirect loops. | Use the explicit entry state machine in this document: reuse only a fully valid demo session; otherwise locally sign out, clear observed demo-host Supabase chunks plus `active_company_id`, sign in afresh, verify, and return 503 on failure rather than redirecting again. [VERIFIED: installed Supabase Auth `signOut({ scope: 'local' })` type and current cookie adapter patterns] |
| ENTRY-04 | Local development supports the same isolated-host flow on the configured localhost port without weakening production cookie rules. | Configure `DEMO_APP_ORIGIN=http://demo.localhost:9633` locally and `https://demo.xtimator.com` in production; derive `secure` from the validated configured protocol and never from a permissive fallback. [VERIFIED: `package.json` port 9633; `lib/utils/site-url.ts`; CONTEXT D-04] |
| SAFE-01 | Every server action and API route reachable from the demo denies mutations when either the authenticated session is the dedicated demo user or the active company is the deterministic demo company. | Strengthen the shared guard to OR the two signals, add an explicit-context variant for non-cookie channels, apply it to the complete mutation inventory below, and add a static sweep contract. [VERIFIED: Xtimator mutation inventory by codebase grep] |
| SAFE-02 | External side effects—including AI generation, uploads, email/SMS/WhatsApp sends, billing, background jobs, and webhooks initiated from the UI—cannot be triggered by the public demo. | Guard before rate limiting, provider construction, storage, dispatch, or service-role writes; repeat a company guard inside shared agent tools and Inngest handlers. [VERIFIED: Xtimator API, agent-tool, notification, billing, storage, and Inngest call-site inventory] |
| SAFE-03 | Database/RLS policy provides a final deny-write boundary for the demo user/company even if a UI or server guard is missed. | Re-run restrictive user policies across every current public RLS table, add company-row restrictive policies, cover `storage.objects`, and assert coverage in SQL plus tests. [VERIFIED: existing `20260530000001_demo_readonly.sql`, `20260706000006_demo_readonly_rerun.sql`, later migrations, and storage policies] |
| SAFE-04 | Automated tests prove allowed read navigation, denied mutation paths, host-only cookie isolation, stale-cookie recovery, and absence of redirect loops. | The Validation Architecture defines unit, static-contract, live-Supabase integration, and Playwright isolation tests with exact commands. [VERIFIED: `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/test.yml`] |
</phase_requirements>

## Summary

Xtimator already has most primitives Phase 180 needs: deterministic demo config, a shared demo guard, an active-company resolver, an authenticated real-product shell that detects the demo company, existing user-level restrictive RLS, and route-level guards on the most expensive generation/send/billing endpoints. The safe plan is therefore an extension and coverage sweep, not a parallel demo architecture. [VERIFIED: `lib/demo/config.ts`, `lib/demo/guard.ts`, `lib/queries/active-company.ts`, `app/(app)/layout.tsx`, guarded API routes]

The session boundary should be a fixed three-hop flow: apex `GET /demo` redirects to a configured absolute demo origin; an exact-host demo entry route creates or repairs the dedicated session and active-company cookie; then the real `/dashboard` renders. The apex route must not call Supabase Auth. All cookies set by the demo entry omit `Domain`, and production cookies are `Secure`; local cookies remain non-secure only because the configured local origin is HTTP. [VERIFIED: CONTEXT D-01..D-06; Xkedule `server/routes/demo.ts`; installed `@supabase/ssr` cookie implementation]

The principal safety risk is incomplete mutation coverage. The current guard checks only the configured email, several tenant action modules have no guard, some guarded modules contain bypassing functions, chat still spends AI and persists messages for demo sessions, MCP/agent tools and background jobs use service-role clients, and the existing database sweep omits storage, deterministic-company protection, and tables created after its last rerun. Phase 180 must close all of these as one deny-by-default boundary, with static inventory tests preventing drift. [VERIFIED: Xtimator codebase grep and migrations]

**Primary recommendation:** Implement one validated host config, one idempotent demo-entry state machine, and one shared OR-based demo principal guard with an explicit `{ userId?, email?, companyId? }` context form; enforce it at request, domain-service, background-job, storage, and restrictive-RLS boundaries. [VERIFIED: codebase-derived architecture analysis]

## Project Constraints (from AGENTS.md)

- Production is GitHub Actions → Docker/GHCR → Coolify, not Vercel; `.vercel/project.json` is stale and must not drive host or deploy planning. [VERIFIED: `AGENTS.md`, `.github/workflows/build-deploy.yml`]
- The implementation stays on Next.js App Router, strict TypeScript, Tailwind/shadcn, Supabase PostgreSQL, and RLS on all tables. [VERIFIED: `AGENTS.md`]
- The Supabase service-role key and demo password must never reach browser code; AI and transcription calls remain server-side. [VERIFIED: `AGENTS.md`, `lib/demo/config.ts`]
- Production deployment is gated by the `Test` workflow, then builds/pushes a Docker image and triggers Coolify; deploy verification uses GitHub Actions and `/api/health`, not Vercel. [VERIFIED: `AGENTS.md`, `.github/workflows/build-deploy.yml`]
- Planned implementation must run through the GSD execute workflow; this research artifact does not authorize direct application edits. [VERIFIED: `AGENTS.md`]
- Existing uncommitted `app/globals.css` work is unrelated and must be preserved. [VERIFIED: `git status --short` on 2026-07-26]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Apex-to-demo handoff | Frontend Server / Proxy | CDN / reverse proxy | Next proxy/route constructs a fixed redirect; Coolify/DNS only make the host routable. [VERIFIED: `proxy.ts`, production topology] |
| Demo session creation and repair | Frontend Server | Supabase Auth | Only the exact demo host may submit server-held credentials and emit host-only auth cookies. [VERIFIED: `lib/supabase/server.ts`, `lib/demo/config.ts`] |
| Active demo tenant selection | Frontend Server | Database / RLS | The server writes `active_company_id`; the resolver validates membership against `company_members`. [VERIFIED: `lib/queries/active-company.ts`] |
| Read-only request classification | API / Backend | Frontend Server | The backend owns the OR rule; proxy/layout consume it for routing and UI context. [VERIFIED: CONTEXT D-08..D-10] |
| Mutation and side-effect denial | API / Backend | Database / Storage | Server guards stop service clients/providers/jobs; RLS/storage policies stop direct authenticated writes. [VERIFIED: current call-site and migration inventory] |
| Demo indicator / control suppression | Browser / Client | Frontend Server | The app shell already injects `isDemo`; it is UX only and not an authorization decision. [VERIFIED: `app/(app)/layout.tsx`, `DemoBanner`] |
| Direct Supabase write denial | Database / Storage | API / Backend | Restrictive RLS and storage policies are the final authenticated-client boundary. [VERIFIED: existing demo and storage migrations] |

## Standard Stack

No new external package is needed for Phase 180; use the installed project stack and avoid a package-install task. [VERIFIED: `package.json` and required design]

### Core

| Library / Facility | Version | Purpose | Why Standard Here |
|--------------------|---------|---------|-------------------|
| Next.js App Router / Proxy | `16.2.6` | Host-aware redirect, route handler, protected-route repair | It is the live request boundary in this repository. [VERIFIED: `package.json`, `proxy.ts`] |
| `@supabase/ssr` | `0.10.2` | Request-scoped auth client and response cookie propagation | Existing server/proxy clients already use `createServerClient` with `getAll`/`setAll`. [VERIFIED: `package.json`, `lib/supabase/server.ts`, `proxy.ts`] |
| `@supabase/supabase-js` | `2.103.0` | Password sign-in, claims, membership checks | Already used across Auth and data paths; no second session system is justified. [VERIFIED: `package.json`, local installed types] |
| PostgreSQL RLS | Supabase-managed | Restrictive final write deny | Existing demo policy architecture is restrictive and composes by AND with permissive tenant policies. [VERIFIED: demo migrations] |
| Vitest | `4.1.4` | Unit/static/migration contract tests | It is the CI-collected unit framework. [VERIFIED: `package.json`, `vitest.config.ts`] |
| Playwright | `1.59.1` | Cross-host cookie/session isolation browser proof | It is the existing E2E framework with desktop/mobile projects. [VERIFIED: `package.json`, `playwright.config.ts`] |

### Supporting

| Facility | Purpose | When to Use |
|----------|---------|-------------|
| Existing `lib/demo/config.ts` | Canonical IDs, email, password, and new validated demo origin | Every entry/guard path; keep it `server-only`. [VERIFIED: current file and D-05] |
| Existing `lib/demo/guard.ts` | Canonical application deny contract | Server actions, route handlers, explicit company-context services/jobs. [VERIFIED: D-10] |
| Existing active-company constants | Cookie name and standard options | Set and clear the deterministic demo tenant without inventing a second tenant cookie. [VERIFIED: `lib/queries/active-company.ts`] |
| `NextResponse` cookie adapter | Attach Supabase cookie chunks to the same redirect response | Demo entry route; avoids losing `Set-Cookie` when constructing a redirect. [VERIFIED: existing `proxy.ts` pattern] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fixed `DEMO_APP_ORIGIN` | Derive a subdomain from incoming `Host` | Rejected: incoming host/proxy headers are not a redirect authority and create host-header/open-redirect risk; an explicit origin is deterministic behind Coolify. [VERIFIED: `lib/utils/site-url.ts` documents internal/public origin divergence; security analysis] |
| Password sign-in on demo host | Create session on apex and share a parent-domain cookie | Rejected by D-01/D-02; parent-domain cookies would let demo state collide with a visitor's real apex session. [VERIFIED: CONTEXT] |
| Shared application guard only | RLS only | Rejected: RLS cannot stop Stripe, AI, messaging, Inngest dispatch, Auth mutations, or service-role writes. [VERIFIED: Xtimator side-effect inventory] |
| Block every mutating HTTP method in proxy | Route/action/domain guards | A method-wide proxy block misses Next Server Actions semantics and non-cookie MCP/background contexts, while also risking signed webhook/cron breakage. Use shared guards at actual mutation boundaries. [VERIFIED: `proxy.ts`, action/API/worker topology] |

**Installation:** None. [VERIFIED: no new dependency required]

## Reference Architecture from Xkedule

| Concern | Exact Xkedule path | Useful pattern for Xtimator |
|---------|--------------------|-----------------------------|
| Apex demo redirect | `C:/Users/Vanildo/Dev/xkedule/server/routes/demo.ts` | The apex handler only resolves a fixed demo destination and redirects; it does not set the apex session. [VERIFIED: Xkedule code] |
| Route ordering | `C:/Users/Vanildo/Dev/xkedule/server/routes.ts` | Demo entry mounts before tenant resolution, while read-only middleware mounts before business routers. Xtimator should mirror the ordering concept in `proxy.ts` and route/domain guards. [VERIFIED: Xkedule code] |
| Host-only cookie behavior | `C:/Users/Vanildo/Dev/xkedule/server/index.ts` | Express session cookie sets `secure`, `httpOnly`, `sameSite`, and `maxAge` but omits `domain`, making it host-only. Xtimator must likewise omit `Domain`. [VERIFIED: Xkedule code] |
| Demo tenant injection | `C:/Users/Vanildo/Dev/xkedule/server/middleware/tenant.ts` | Hostname resolution marks `res.locals.isDemoTenant` and injects a demo session only for demo-tenant HTML requests. Xtimator's equivalent is exact demo-host routing plus OR-based guard context. [VERIFIED: Xkedule code] |
| Server-rendered demo mode | `C:/Users/Vanildo/Dev/xkedule/server/lib/seo-injector.ts`, `client/index.html` | The server injects `window.__DEMO_MODE__`; client components consume a server-derived mode rather than guessing from the URL. Xtimator already has the stronger active-company-derived `isDemo` in the app layout. [VERIFIED: both codebases] |
| UI banner | `C:/Users/Vanildo/Dev/xkedule/client/src/components/DemoBanner.tsx` | The banner is a display affordance, not enforcement. Xtimator already has `components/demo/demo-banner.tsx`. [VERIFIED: both codebases] |
| Mutation middleware | `C:/Users/Vanildo/Dev/xkedule/server/middleware/demo-read-only.ts` | Central method denial before business routers is a useful coverage model; Xtimator must adapt it to Server Actions, route handlers, MCP, jobs, and RLS rather than copy Express middleware literally. [VERIFIED: Xkedule code and Xtimator architecture] |

### Critical Non-Pattern: Do Not Copy Xkedule's Maintainer Exemption

Xkedule allows a mutating request on the demo tenant when the session resolves to a same-tenant canonical principal with either `adminAccess` or `providesServices`. Its demo tenant middleware also tries to create the public visitor session using the real configured demo admin user. Those two facts can combine so the shared public identity satisfies the exemption and reaches mutations. [VERIFIED: Xkedule `server/middleware/demo-read-only.ts`, `server/middleware/tenant.ts`]

Xtimator must have **no role, owner, platform-admin, provider, support-mode, or canonical-principal write exemption** once either demo signal is true. The dedicated Xtimator demo user is seeded as the demo company's `owner`, so any role-based exemption would immediately defeat read-only mode for every visitor. [VERIFIED: Xtimator `scripts/seed-demo-workspace.mjs` lines that seed role `owner`; CONTEXT D-07/D-08]

Authentication proves who the shared visitor is; it does not prove maintainer intent. Demo maintenance/reset remains a service-role operator workflow outside public request handling. [VERIFIED: seed script uses service role; security analysis]

## Architecture Patterns

### System Architecture Diagram

```text
Browser on xtimator.com
  GET /demo
     |
     v
proxy/entry routing
  - validate fixed DEMO_APP_ORIGIN
  - DO NOT read/write apex auth
     |
     | 302/303 fixed absolute URL (no user-controlled next)
     v
Browser on demo.xtimator.com (or demo.localhost:<configured-port>)
  GET /demo/session
     |
     v
Exact-host session state machine
  ├─ valid demo claims + valid demo membership
  │    └─ reuse session, repair active_company_id
  └─ missing/stale/wrong/partial state
       ├─ local sign-out + clear demo-host cookies
       ├─ server-only signInWithPassword
       ├─ verify returned demo identity + membership
       └─ set host-only active_company_id
     |
     ├─ failure ──> terminal 503 (no redirect loop, no credential detail)
     v
303 /dashboard on demo host
     |
     v
Real app shell + active-company resolver
  - demo user OR demo company => read-only context
     |
     +----------------------+-----------------------+
     |                      |                       |
     v                      v                       v
Server Actions/API     MCP/Agent/Jobs          Direct Supabase
shared demo guard      explicit company guard  restrictive RLS/storage
before effects         before service role      final deny
     |                      |                       |
     +----------------------+-----------------------+
                            |
                            v
             no DB mutation, upload, AI, send,
             billing, dispatch, or external sync
```

### Recommended Project Structure

```text
lib/demo/
├── config.ts                 # canonical IDs/credentials + validated DEMO_APP_ORIGIN
├── guard.ts                  # request guard + explicit-context guard + response helpers
└── session.ts                # cookie clearing/verification state machine helpers
app/demo/session/route.ts      # exact demo-host entry; no UI
proxy.ts                       # apex handoff + demo-host repair routing
supabase/migrations/
└── 20260726...demo_readonly_foundation.sql
tests/unit/demo/
├── config.test.ts
├── guard.test.ts
├── session-route.test.ts
├── mutation-boundary-sweep.test.ts
└── rls-migration-contract.test.ts
tests/integration/
└── demo-readonly-rls.test.ts
tests/e2e/
└── demo-session-isolation.spec.ts
```

This structure extends the current canonical demo modules and keeps host/session mechanics separate from policy classification. [VERIFIED: current repository structure plus D-10]

### Pattern 1: Fixed-Origin Host Configuration

**What:** Add one server-only `DEMO_APP_ORIGIN` absolute origin, parsed once and rejected if it contains credentials, query, hash, or a non-root path. Production requires HTTPS; local development may use HTTP only for the explicitly configured local hostname/port. [VERIFIED: security analysis and existing origin-normalization patterns]

**Prescriptive values:**

```dotenv
# local .env.local
DEMO_APP_ORIGIN=http://demo.localhost:9633

# production Coolify runtime env
DEMO_APP_ORIGIN=https://demo.xtimator.com
```

The redirect target is always `new URL('/demo/session', demoOrigin)` and the post-login target is always the relative `/dashboard`; do not accept a `next`, `returnTo`, host, protocol, or port from query parameters. [VERIFIED: open-redirect threat analysis]

### Pattern 2: Idempotent Session State Machine

**What:** Entry is a state machine, not unconditional sign-in. It validates both identity and company before reuse. [VERIFIED: D-03/D-06]

```typescript
// Source pattern: Xtimator proxy cookie adapter + local Supabase Auth types.
assertExactDemoHost(request)
assertDemoConfigComplete()

const claims = await safeGetClaims()
if (claimsEmailMatchesDemo && await hasDemoMembership()) {
  setHostOnlyActiveCompanyCookie()
  return redirect('/dashboard')
}

await signOut({ scope: 'local' }).catch(() => undefined)
clearObservedSupabaseCookieChunksOnThisHost()
clearActiveCompanyCookieOnThisHost()

const result = await signInWithPassword(serverOnlyCredentials)
if (!identityMatches(result.user) || !await hasDemoMembership()) {
  clearAgain()
  return terminal503()
}

setHostOnlyActiveCompanyCookie()
return redirect('/dashboard')
```

The route must construct the redirect response first (or otherwise bind all Supabase `setAll` calls to the final response) so auth cookie chunks are not dropped when redirecting. [VERIFIED: `proxy.ts` response-cookie pattern and installed `@supabase/ssr` guidance]

### Pattern 3: OR-Based Guard with Explicit Context

**What:** Keep `assertWritable()` and `demoGuardResponse()` as the public contract, but have both call one shared classifier. Add an explicit-context form for channels that do not carry Next cookies. [VERIFIED: D-08/D-10 and MCP/Inngest architecture]

```typescript
type DemoWriteContext = {
  email?: string | null
  userId?: string | null
  companyId?: string | null
}

// Request form resolves claims + validated active company.
assertWritable()

// Non-cookie form for MCP, agent tools, jobs, sends, and service-role paths.
assertWritableContext({ userId: auth.user_id, companyId: auth.company_id })
```

The classifier denies when `email` matches the configured demo email **OR** `companyId === DEMO_COMPANY_ID`; an explicit demo company is sufficient even if no cookie or claims exist. [VERIFIED: D-08]

### Pattern 4: Guard Before the First Irreversible or Billable Step

Guard ordering must be:

1. Authenticate/resolve minimal trusted identity.
2. Resolve trusted company (never body-supplied without ownership validation).
3. Apply demo deny.
4. Only then rate-limit, parse large payloads, upload, call AI/Stripe/messaging, dispatch Inngest, write through service role, or mint OAuth credentials. [VERIFIED: current routes show costly work and service-role writes after identity resolution; security analysis]

This ordering is especially important in `app/api/chat/route.ts`, where the current code rate-limits, reads billing config, resolves the model, calls AI, and persists messages even though it only passes `isDemo` to the write tools. Phase 180 must return 403 before those operations. [VERIFIED: `app/api/chat/route.ts`]

### Pattern 5: Restrictive RLS That Can Only Remove Access

Keep ordinary tenant policies unchanged. Add `AS RESTRICTIVE` insert/update/delete policies so demo denial is ANDed with existing permissive membership policies and cannot grant access to a normal tenant. [VERIFIED: existing demo migration design]

Use both:

- A principal-wide restriction on every authenticated write: `NOT public.is_demo_user()`. [VERIFIED: existing design]
- A row-company restriction on every RLS table with a `company_id` UUID: `NOT public.is_demo_company(company_id)`, plus the equivalent `id` rule on `companies`. [VERIFIED: schema inventory and D-11]

Also add equivalent restrictive policies on `storage.objects`; the existing public-schema sweep never touches the `storage` schema. Company-scoped object paths already use the first folder segment as company UUID, providing the row-company signal. [VERIFIED: `20260706000004_storage_rls_company_members.sql`]

### Anti-Patterns to Avoid

- **Parent-domain cookies:** Never set `Domain=.xtimator.com`; this destroys session isolation. [VERIFIED: D-02]
- **Host-derived redirect destinations:** Do not concatenate `Host`/`X-Forwarded-Host` into the demo URL. [VERIFIED: host-header threat analysis]
- **Automatic entry redirects on failure:** A failed login/config/membership check must return a terminal error, not bounce `/dashboard` ↔ entry. [VERIFIED: D-03]
- **Email-only enforcement:** Current `isDemoSession()` misses a non-demo identity operating the demo company. [VERIFIED: `lib/demo/guard.ts` vs D-08]
- **Role exemptions:** The demo user is an owner; canonical admin/provider exemptions reopen writes. [VERIFIED: seed script and Xkedule middleware]
- **UI-only hiding:** `NewProjectDialog` and `EstimateCreationPopup` are rendered by the app layout independently of the banner, and direct endpoints remain callable. [VERIFIED: `app/(app)/layout.tsx`]
- **RLS-only confidence:** Service-role clients, Auth APIs, Stripe, AI, messages, and Inngest bypass or sit outside table RLS. [VERIFIED: call-site inventory]
- **One-time migration sweep without a test:** The existing May sweep needed a July rerun and drifted again afterward. [VERIFIED: migration history]
- **Global demo-company membership ban:** Do not globally block all writes for any user who merely has a demo-company membership; that would prevent a legitimate multi-company maintainer from writing to a normal tenant. Deny the demo user globally and demo-company rows specifically. [VERIFIED: D-08 active-company semantics; least-impact analysis]
- **Blocking signed machine endpoints by browser cookie:** Stripe/Twilio/WhatsApp webhooks, Inngest, health, cron, and MCP have their own authentication models. Preserve their routing; enforce demo-company denial after their trusted tenant is resolved. [VERIFIED: `proxy.ts` comments and route implementations]

## Complete Mutation and Side-Effect Boundary Inventory

### A. Host, Auth, and Tenant Session Boundaries

| Boundary | Current State | Phase 180 Plan Requirement |
|----------|---------------|----------------------------|
| `proxy.ts` | Auth refresh/protection exists; no demo-host contract exists. [VERIFIED: code] | Add exact apex handoff and demo-host repair routing without altering claim-free machine route behavior. |
| `lib/supabase/server.ts` | Uses request cookies and `@supabase/ssr`; cookie domain is not explicitly set. [VERIFIED: code] | Reuse or factor a response-bound route client; keep `Domain` absent and production `Secure`. |
| `lib/queries/active-company.ts` | Validates `active_company_id` against membership and repairs stale values by fallback. Cookie is `httpOnly`, Lax, path `/`, 30 days; no `secure` flag. [VERIFIED: code] | Demo entry writes exact demo company with demo-origin-derived `secure`; guard resolves the validated company, not raw cookie text. |
| `lib/actions/active-company.ts` | Switches active company and mutates cookie/cache with no demo guard. [VERIFIED: code] | Dedicated demo user must not switch away; guard before mutation. |
| `lib/actions/auth.ts` and settings Auth calls | Sign-in/out/reset/update operations exist; `changePassword`, `changeEmail`, `updateProfile`, `deleteAccount`, and `updatePassword` can mutate Auth or use admin delete. [VERIFIED: code] | Allow local sign-out/exit; block demo credential/profile/email/password/account mutations before Auth calls. |
| `lib/demo/actions.ts` | `exitDemoToSignup()` calls global `signOut()` then redirects relatively, which on the demo host stays on that host. [VERIFIED: code] | Use local sign-out and an absolute validated apex signup URL; never revoke every demo visitor session globally. |

`signOut()` defaults to global scope in the installed Supabase Auth client. Calling the current exit action from one visitor can revoke other refresh tokens for the shared demo user; Phase 180 must use `{ scope: 'local' }`. [VERIFIED: installed `@supabase/auth-js` type documentation and `lib/demo/actions.ts`]

### B. Server Actions Reachable from Tenant/Product Surfaces

| Coverage Group | Exact Files / Functions | Required Treatment |
|----------------|-------------------------|--------------------|
| Shared-helper guarded today | `lib/actions/client.ts`, `company-knowledge.ts`, `custom-domain.ts`, `estimate-photo.ts`, `estimate-template.ts`, `photo.ts`, `recording.ts`, most of `settings.ts`, `tour.ts`, `auto-topup.ts` [VERIFIED: guard imports/calls] | Strengthening the shared guard supplies the OR rule, but tests must verify every exported mutator actually passes through the helper. |
| Completely unguarded tenant action modules | `lib/actions/project.ts`, `estimate.ts`, `team.ts`, `theme.ts`, `chat.ts`, `company.ts`, `invite-accept.ts`, `active-company.ts` [VERIFIED: export/guard grep] | Add the shared guard at the common auth context or top of each exported mutator; preserve read-only exports. |
| Settings bypasses | `changePassword`, `changeEmail`, `updateProfile`, `deleteAccount` bypass `getAuthContext()` in `lib/actions/settings.ts`. [VERIFIED: code] | Guard before Auth, storage, email, or service-role admin calls. |
| Price-book bypasses | `createFolder`, `updateFolder`, `deleteFolder`, `resolveOrCreateFolders`, `setItemOptions`, `deletePriceBookItem`, `importPriceBookItems`, `bulkAdjustPriceBookFolder`, `commitImportChunk`, `undoLastImport` lack direct `assertWritable`; other exports are guarded individually. [VERIFIED: `lib/actions/price-book.ts`] | Route every mutator through one guarded context; add sweep coverage so future exports cannot omit it. |
| Invoice / external billing | `generateInvoice` checks only `isDemoCompany(companyId)` before Stripe invoice work. [VERIFIED: `lib/actions/invoice.ts`, `lib/billing/invoice-service.ts`] | Use the shared explicit context so either user or company denies before Stripe. |
| Public estimate actions | `app/estimate/[token]/actions.ts` writes viewed/response/activity state and sends email. [VERIFIED: code] | Block when a demo session is present or the target estimate belongs to demo company, before logging or sending. Normal anonymous customers remain unaffected. |
| Demo exit | `lib/demo/actions.ts` mutates only local auth state. [VERIFIED: code] | Explicit allowlisted recovery action; local scope only and absolute apex redirect. |

Admin action modules are protected by platform-admin checks and are not normal demo UI surfaces, but the demo principal must never be provisioned in `platform_admins`; retain admin authorization and add a regression assertion for that seed/runtime invariant rather than inserting a role exemption. [VERIFIED: app layout admin lookup, seed script, D-07]

### C. API and Route Handler Boundaries

| Status | Exact Routes | Required Treatment |
|--------|--------------|--------------------|
| Guard exists, strengthen/order-test | `/api/transcribe`, `/api/analyze-photos`, `/api/generate-estimate`, `/api/estimates/[id]/refine`, `/send`, `/send-sms`, `/send-whatsapp`, billing checkout/top-up/portal/auto-topup setup, Stripe Connect initiate [VERIFIED: route grep] | Shared OR classifier; assert guard runs before storage, quotas/debits, provider calls, and `inngest.send`. |
| Guard is insufficient | `/api/chat` (still calls AI/persists), `/api/estimates/[id]/sign` (company-only) [VERIFIED: code] | Return standard 403 before rate-limit/provider/persistence/signature work using both signals. |
| Unguarded authenticated mutations | `/api/notifications/preferences`, `/api/notifications/[id]/read`, `/api/notifications/mark-all-read`, `/api/notifications/push/subscribe`, `/api/stripe/connect/disconnect` [VERIFIED: code] | Add route guard before service-role/preferences/Stripe calls. |
| Unguarded AI/cache side effect | `/api/translate` [VERIFIED: code] | Deny demo before rate limit, OpenRouter, and translation-cache upsert. Read navigation must fall back to source text rather than spend AI. |
| Separate bearer channel | `/api/mcp` and `lib/mcp/tools/write.ts` [VERIFIED: code] | Do not use cookie guard. Pass OAuth `(user_id, company_id)` to explicit guard before every write tool/service-role/dispatch action. Read tools remain available. |
| OAuth credential issuance | `app/oauth/authorize/actions.ts`, `app/oauth/token/route.ts`, `app/oauth/register/route.ts`, `lib/oauth/codes.ts`, `lib/oauth/tokens.ts`, `lib/oauth/clients.ts` [VERIFIED: code] | Prevent the demo session/company from authorizing or minting a demo-company bearer token; explicit MCP company guard remains required for already-issued/stale tokens. |
| Machine-authenticated routes | Stripe/Twilio/WhatsApp webhooks, `/api/inngest`, cron routes [VERIFIED: `proxy.ts`] | Preserve signature/secret routing. Once a trusted payload resolves `companyId`, shared company-context services/jobs must refuse demo-company product effects. Do not trust browser cookies on these endpoints. |
| Operational exceptions | `/api/health`, `/api/csp-report`, logout [VERIFIED: routes/proxy] | Health and CSP security telemetry are not tenant product mutations; preserve availability. Logout/session repair remains allowed. |

### D. Direct Browser Supabase Boundary

`components/clients/client-sheet.tsx` directly updates `clients.logo_url` with the browser Supabase client when removing a logo. It bypasses Server Actions and therefore receives only RLS protection. Move it to the existing guarded client action surface or add a dedicated guarded action; retain RLS as the final backstop. [VERIFIED: component code grep]

The browser Supabase client can also call PostgREST/Storage directly using the demo session, even if no current component does so. SAFE-03 therefore requires real authenticated integration tests, not only mocked application tests. [VERIFIED: `lib/supabase/client.ts` and threat analysis]

### E. Service-Role and Channel-Neutral Boundaries

| Boundary | Exact Files | Why Request-Only Guard Is Insufficient |
|----------|-------------|----------------------------------------|
| Agent write tools | `lib/agent-tools/create-estimate.ts`, `create-project.ts`, `create-service.ts`, `add-knowledge.ts`, `send-customer-message.ts` [VERIFIED: code] | MCP/chat pass explicit company IDs and use service-role clients or dispatch Inngest. |
| MCP write handlers | `lib/mcp/tools/write.ts` [VERIFIED: code] | OAuth bearer auth has no Supabase session cookie; service role bypasses RLS. |
| Chat persistence/tools | `lib/queries/chat.ts`, `lib/chat/tools.ts`, `app/api/chat/route.ts` [VERIFIED: code] | Current demo flag only disables write tools; model cost and conversation persistence still happen. |
| Customer sends | `lib/notifications/customer-send.ts`, email/SMS clients, WhatsApp clients [VERIFIED: code] | Provider sends and audit writes can occur after a service-role lookup. |
| Notification dispatch | `lib/notifications/dispatch.ts`, notification email/SMS/WhatsApp Inngest functions [VERIFIED: code] | Dispatch itself is an external effect even before the worker sends. |
| Xphere sync | `lib/integrations/xphere/dispatch.ts`, `lib/inngest/functions/xphere-sync.ts` [VERIFIED: code] | External CRM sync is not protected by tenant table RLS. |
| Storage adapters | `lib/storage/*` and upload actions [VERIFIED: code] | S3/provider uploads and service clients sit outside public-table RLS. |
| Billing/credits | checkout routes, `lib/billing/*`, invoice service [VERIFIED: code] | Stripe and service-role RPCs need pre-call denial. |

The explicit context guard should be placed at the highest common funnel that still has trusted `companyId`, then retained at public entry routes for friendly 403s. This is deliberate duplication across trust boundaries, not parallel policy logic. [VERIFIED: architecture analysis]

### F. Background Jobs

Company-context denial is required at the start of:

- `lib/inngest/functions/generate-estimate.ts`
- `lib/inngest/functions/analyze-photos.ts`
- `lib/inngest/functions/transcribe-audio.ts` after resolving recording → company
- `lib/inngest/functions/whatsapp-process.ts`
- `lib/inngest/functions/notification-channel-send.ts` (event payload or notification lookup must carry/resolve company)
- `lib/inngest/functions/notification-email-digest.ts` before provider send
- `lib/inngest/functions/xphere-sync.ts`

[VERIFIED: Inngest function/event inventory]

Cleanup, retention, watchdog, and monthly grant jobs are operator/platform jobs rather than public-demo-initiated UI work. They should preserve their machine authentication and may maintain/reset demo data intentionally; do not make demo maintenance impossible by applying browser-session logic to them. If they process tenant rows, document whether demo rows are intentionally included or skipped. [VERIFIED: function inventory; operational analysis]

### G. Database and Storage

The existing `20260530000001_demo_readonly.sql` creates `demo_config`, `is_demo_user()`, and restrictive policies only for RLS-enabled base tables in the `public` schema at migration execution time. `20260706000006_demo_readonly_rerun.sql` repeats that one-time sweep. [VERIFIED: migration contents]

At least these RLS tables were created after the July rerun and therefore do not receive its policies from migration order: `chat_message_votes`, `notification_templates`, `platform_notification_preferences`, `client_message_events`, `customer_messages`, and `agentic_send_confirmations`. [VERIFIED: migration timestamps and CREATE TABLE statements]

`storage.objects` is outside `public` and was never included in either demo sweep. Its current policies authorize company members by the first object-key folder, but contain no demo-user or demo-company restriction. [VERIFIED: `20260706000004_storage_rls_company_members.sql` and demo sweep predicate]

## Recommended RLS Migration Strategy

1. Harden `demo_config.company_id` to `NOT NULL` and reference `companies(id)` if current production data satisfies it; assert exactly the intended dedicated user/company mapping before constraint change. [VERIFIED: current column is nullable and seed writes both fields]
2. Keep `is_demo_user()` as a `STABLE SECURITY DEFINER` helper with pinned `search_path`, minimal execute grant, and no direct client access to `demo_config`. [VERIFIED: current safe pattern]
3. Add `is_demo_company(candidate uuid)` as a `STABLE SECURITY DEFINER` existence check against `demo_config.company_id`. [VERIFIED: schema supports this; recommended extension]
4. Recreate restrictive user insert/update/delete policies on **every current RLS-enabled public base table except `demo_config`**. [VERIFIED: current sweep pattern]
5. On every such table containing a UUID `company_id`, create additional restrictive insert/update/delete policies denying rows where `is_demo_company(company_id)` is true; add the analogous `id` policies to `companies`. [VERIFIED: schema inventory]
6. Add restrictive user and company-path policies to `storage.objects` for INSERT/UPDATE/DELETE. Existing bucket policies use `(storage.foldername(name))[1]` as company ID; preserve their permissive membership logic unchanged. [VERIFIED: storage migration]
7. Keep `save_estimate_atomic` as SECURITY INVOKER; its writes will be subject to table RLS. Service-role-only credit RPCs remain unreachable to authenticated users by grants, but application billing guards still run before calling them. [VERIFIED: phase-165 and RLS-hardening migration comments/grants]
8. Finish the migration with assertions against `pg_policies`: no current public RLS table lacks all three user blocks; no company-ID table lacks all three company blocks; `companies` and `storage.objects` have their special policies. [VERIFIED: existing project migrations use post-migration assertions]

This strategy does not edit ordinary tenant policies and therefore cannot weaken normal tenant isolation. Restrictive policies only subtract permission. Row-specific company denial avoids globally disabling a legitimate maintainer's unrelated normal-company writes merely because they also hold demo-company membership. [VERIFIED: PostgreSQL policy composition reflected in existing migration design; architecture analysis]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth token/session format | Custom JWT or opaque demo cookie | Supabase password sign-in through `@supabase/ssr` | The real app, proxy refresh, and RLS already consume Supabase claims. [VERIFIED: codebase] |
| Tenant selection | New `demo_company` browser state | Existing `active_company_id` plus membership resolver | It preserves the real product's trusted tenant path. [VERIFIED: `lib/queries/active-company.ts`] |
| Redirect sanitization | Regex-built URL from request host/query | Parsed fixed `DEMO_APP_ORIGIN` + fixed paths | Eliminates user-controlled redirect authority. [VERIFIED: threat analysis] |
| Cookie chunk management | Reimplement Supabase token serialization | Supabase SSR `setAll`; only defensively expire observed stale chunks | Serialization/chunking is library-owned. [VERIFIED: installed `@supabase/ssr` source] |
| Read-only policy system | Separate demo middleware/guard API | Strengthen `assertWritable` and `demoGuardResponse`, add explicit context under same classifier | D-10 locks the shared contract and avoids drift. [VERIFIED: CONTEXT] |
| RLS tenant grants | Replace all normal policies | Add restrictive deny policies | Existing membership policies remain authoritative for normal tenants. [VERIFIED: migrations] |
| Side-effect mocks in production | Fake successful sends/charges | Return consistent 403 demo-readonly response | Synthetic success can hide accidental provider calls and corrupt user expectations. [VERIFIED: SAFE-02 security analysis] |

**Key insight:** Read-only mode is a property of a trusted principal/company context propagated through every channel, not a property of the page URL or a disabled button. [VERIFIED: codebase-derived security model]

## Common Pitfalls

### Pitfall 1: Redirecting with a Response That Lost Supabase Cookies

**What goes wrong:** Login succeeds in memory, but `/dashboard` arrives anonymous and redirects away. [VERIFIED: installed SSR docs warn incorrect `setAll` causes random logout/session failures]  
**Why it happens:** Auth cookies were written to one response/cookie store and a new redirect response was returned. [VERIFIED: existing proxy response replacement pattern]  
**How to avoid:** Bind the route client's `setAll` to the final redirect response and test every `Set-Cookie`.  
**Warning signs:** Entry succeeds in logs but browser has no `sb-*` cookie on the demo host.

### Pitfall 2: Shared Demo Logout Revokes Everyone

**What goes wrong:** One visitor exiting invalidates other visitors' refresh tokens. [VERIFIED: current exit calls default signOut; installed Auth docs say default scope is global]  
**How to avoid:** Use `signOut({ scope: 'local' })`, clear only this host's cookies, and redirect absolutely to the apex signup.

### Pitfall 3: Demo Host Accepts a Normal User Session

**What goes wrong:** A stale/wrong session renders another tenant on `demo.xtimator.com`. [VERIFIED: current proxy only checks whether claims exist]  
**How to avoid:** On the exact demo host, protected routes require demo identity **and** exact active company; otherwise route once to the repair entry.

### Pitfall 4: Missing Cookie Chunks Survive Repair

**What goes wrong:** A malformed/chunked stale token keeps failing before sign-out can clean it. [VERIFIED: `@supabase/ssr` uses cookie chunks/storage]  
**How to avoid:** After best-effort local sign-out, expire all observed Supabase auth/PKCE cookies on the demo host plus `active_company_id`; do not hardcode one unchunked name.

### Pitfall 5: Entry Failure Loops

**What goes wrong:** `/dashboard` redirects to entry, entry redirects to `/dashboard` despite failed credentials/membership, repeating indefinitely. [VERIFIED: D-03 threat]  
**How to avoid:** Redirect only after post-sign-in verification. Config/auth/membership failures return a terminal 503 with no credential detail.

### Pitfall 6: Guard Runs After Cost or Dispatch

**What goes wrong:** A 403 is returned after rate-limit writes, AI spend, upload, Stripe session creation, or Inngest dispatch already happened. [VERIFIED: current chat/route ordering shows such pre-guard work]  
**How to avoid:** Resolve minimum auth/company, guard, then do all other work. Assert mocks were not called.

### Pitfall 7: Direct/MCP/Worker Paths Bypass Cookie Guard

**What goes wrong:** A bearer-auth MCP tool, service-role agent tool, or queued job has no Next cookies and writes anyway. [VERIFIED: MCP auth and service-role call sites]  
**How to avoid:** Use the explicit trusted-company context form at shared funnels and worker start.

### Pitfall 8: New Tables Escape a One-Time RLS Sweep

**What goes wrong:** Future authenticated direct writes succeed on a table created after the migration. [VERIFIED: the May/July drift already occurred]  
**How to avoid:** Fresh sweep plus migration/static coverage tests that fail when a new RLS table lacks demo policies.

### Pitfall 9: Storage Is Mistaken for `public` RLS

**What goes wrong:** Direct uploads/deletes succeed even while table writes fail. [VERIFIED: storage schema excluded by current demo sweep]  
**How to avoid:** Explicit restrictive policies on `storage.objects` and integration tests for upload/remove.

### Pitfall 10: Canonical Admin/Owner Exemption

**What goes wrong:** The shared visitor is seeded as owner and is therefore allowed to mutate. [VERIFIED: Xtimator seed; Xkedule exemption]  
**How to avoid:** Demo truth dominates all roles. There is no request-time maintainer escape hatch.

## Threat Model

| Threat | STRIDE | Attack / Failure Path | Required Control | Verification |
|--------|--------|-----------------------|------------------|-------------|
| Cross-host cookie bleed | Information Disclosure / Elevation | Demo auth or active-company cookie uses `.xtimator.com` and overwrites/applies to apex. | Omit `Domain`; exact host flow; inspect cookies before/after. [VERIFIED: D-02] | Playwright asserts apex cookie values unchanged and demo cookies host-scoped. |
| Open redirect / host-header poisoning | Spoofing | Attacker supplies `next`, Host, or forwarded host used as redirect authority. | Fixed parsed `DEMO_APP_ORIGIN`; fixed entry/dashboard paths; exact hostname allowlist; no query-controlled destination. [VERIFIED: security analysis] | Unit cases for evil suffix, credentials, query, path, alternate port/protocol. |
| Credential exposure | Information Disclosure | Demo email/password leaks into `NEXT_PUBLIC_*`, client component, URL, error, or log. | Keep config `server-only`; runtime non-public env; generic 503/error; static import/env sweep. [VERIFIED: current config convention] | Test client bundles/source do not reference password variable/value; log mocks omit it. |
| Session fixation | Spoofing / Elevation | Entry accepts supplied tokens or reuses wrong-user/partial state. | Never accept token input; validate claims email and membership; local sign-out and fresh password sign-in on mismatch. [VERIFIED: D-03/D-06] | Wrong-user and malformed-cookie tests. |
| Redirect loop / availability | Denial of Service | Failed entry continually redirects to protected dashboard and back. | Terminal failure response; entry route is public/exempt from repair redirect; only verified success reaches dashboard. [VERIFIED: architecture] | Bounded redirect-count test. |
| Direct Supabase writes | Tampering | Visitor calls PostgREST/Storage directly with demo access token. | Restrictive user + company RLS and storage policies. [VERIFIED: D-11] | Live integration insert/update/delete/upload attempts fail while SELECT succeeds. |
| Missed Server Action/API guard | Tampering / Repudiation | New/exported mutator omits shared guard. | Static mutation-boundary sweep with explicit read-only/maintenance allowlist; route tests. [VERIFIED: prior project static-sweep pattern] | CI test scans action/route inventory. |
| Service-role bypass | Elevation / Tampering | MCP/chat/agent/public action uses `requireServiceClient`, bypassing RLS. | Explicit company-context guard in shared domain funnel before service client write/effect. [VERIFIED: code inventory] | Unit mocks assert service client method never called. |
| Canonical admin/provider/owner exemption | Elevation | Shared demo owner satisfies role exemption. | No role exemption; assert demo user is not a platform admin; service-role reset is offline/operator only. [VERIFIED: D-07 and seed] | Guard truth-table tests cover owner/admin-like claims. |
| External side effects | Tampering / Financial | AI, Stripe, Resend, Twilio, WhatsApp, S3, Xphere, Inngest are called despite 403. | Guard before first provider/dispatch; repeat at worker/shared send funnel. [VERIFIED: SAFE-02] | Provider mocks `not.toHaveBeenCalled()`. |
| OAuth/MCP stale write capability | Elevation | Demo visitor mints bearer token or reuses an old one after cookie guards ship. | Block demo authorization/token issuance; every write tool rejects `auth.company_id === DEMO_COMPANY_ID`. [VERIFIED: MCP architecture] | MCP tests with demo-company auth context. |
| Signed webhook confusion | Spoofing / DoS | Browser demo cookie changes webhook handling, or UI creates a payment then webhook mutates demo. | Webhook signature remains authority; checkout denied; resolved demo company is refused by product domain service. [VERIFIED: proxy/route architecture] | Regression tests preserve unauthenticated signed route reachability and deny demo company effects. |

## Code Examples

### Host-Only Cookie Contract

```typescript
// Source: existing ACTIVE_COMPANY_COOKIE_OPTIONS + installed @supabase/ssr defaults.
const demoCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
  secure: demoOrigin.protocol === 'https:',
  // Deliberately NO domain property.
}
```

Supabase auth cookies should likewise omit `domain`. The installed SSR default sets `path=/`, `sameSite=lax`, and `httpOnly=false`; do not silently force `httpOnly=true` without proving the browser Supabase client still works, because browser session handling currently uses `createBrowserClient`. [VERIFIED: installed `@supabase/ssr/src/utils/constants.ts`, `lib/supabase/client.ts`]

### Restrictive Company Policy Shape

```sql
-- Source pattern: existing demo restrictive policies; company extension is Phase 180.
CREATE POLICY demo_company_block_update
ON public.projects
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (NOT public.is_demo_company(company_id))
WITH CHECK (NOT public.is_demo_company(company_id));
```

Use dynamic migration generation only for tables proven by catalog inspection to contain a compatible `company_id` column, then assert policy coverage. [VERIFIED: schema/catalog migration patterns]

### Consistent API Denial

```typescript
const blocked = await demoGuardResponse()
if (blocked) return blocked
// No rate-limit mutation, service client, provider, upload, or dispatch above this line.
```

[VERIFIED: existing guarded-route convention]

## State of the Art in the Two Local Codebases

| Older / Current Partial Approach | Phase 180 Approach | Impact |
|----------------------------------|--------------------|--------|
| Standalone `/demo/*` service-role read replica [VERIFIED: Xtimator `app/demo/*`] | Host-isolated real Supabase session entering real `/dashboard` | Real product parity without apex-session collision; legacy files remain until Phase 181. |
| Email-only app guard [VERIFIED: `lib/demo/guard.ts`] | Demo user OR trusted active company; explicit context for non-cookie channels | Covers wrong identity on demo company and service-role/MCP/jobs. |
| User-only one-time public RLS sweep [VERIFIED: demo migrations] | Current-table user sweep + company-row restriction + storage + assertions | Direct writes fail across current schema and deterministic demo rows. |
| Xkedule role-exempt central middleware [VERIFIED: Xkedule middleware] | No role exemption; multi-boundary Next/action/job enforcement | Shared owner/admin identity cannot reopen writes. |
| Demo flag only disables chat tools [VERIFIED: chat route] | Route denies before model/persistence | No AI spend or hidden writes. |

**Deprecated/outdated for this phase:**

- Treating `/demo/*` service-role pages as the target architecture is outdated but their files remain during Phase 180 for rollback/cutover safety. [VERIFIED: D-12]
- Assuming the July demo-policy rerun covers the current schema is false due to later migrations. [VERIFIED: migration order]
- Assuming Vercel config controls the demo domain is false; production is Coolify. [VERIFIED: AGENTS.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `demo.localhost` resolves to loopback in every developer browser/OS used by the team. [ASSUMED] | Host flow | If not, local setup needs a hosts-file alias such as `demo.xtimator.local`; the config contract remains unchanged. |
| A2 | Coolify overwrites/sanitizes `X-Forwarded-Host` rather than forwarding an arbitrary client-supplied value. [ASSUMED] | Host validation | If false, host classification could be spoofed; operator/deployment validation must confirm proxy behavior before production enablement. |
| A3 | Production `demo_config` contains exactly the seeded user/company mapping and can accept a `company_id NOT NULL`/FK hardening change. [ASSUMED] | RLS | Migration must preflight and fail safely rather than guessing or deleting data. |

## Open Questions

1. **Which external host header is canonical behind the current Coolify proxy?**
   - What we know: current URL utilities prefer `X-Forwarded-Host` because the request URL can expose an internal bind origin. [VERIFIED: `lib/utils/site-url.ts`]
   - What's unclear: the proxy's exact sanitization behavior was not tested in this local-only research. [ASSUMED]
   - Recommendation: implement exact allowlisted comparison and add an operator/browser verification in Phase 181; never use the header to construct a destination.

2. **Can `demo_config.company_id` be hardened immediately?**
   - What we know: the seed always writes user and company, but the schema currently permits null. [VERIFIED: seed and migration]
   - What's unclear: live production rows were not queried by instruction. [VERIFIED: research scope]
   - Recommendation: migration preflight raises a clear exception if null/orphan/multiple mappings exist; planner includes a safe operator repair checkpoint only if preflight fails.

No design-choice blocker remains for planning; both questions have fail-closed implementation paths. [VERIFIED: analysis]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next/Vitest/Playwright | ✓ | `v24.13.0` | Project `.nvmrc`/CI uses Node 24. [VERIFIED: local command, workflow] |
| npm / npx | Test commands | ✓ | `11.6.2` | — [VERIFIED: local command] |
| Supabase CLI | Local migration/schema validation | ✓ | `2.75.0` | Static SQL tests when local stack is unavailable. [VERIFIED: local command] |
| Docker | Local Supabase / production parity | ✓ | `29.2.1` | Remote env-gated integration suite. [VERIFIED: local command] |
| Git | Change inspection | ✓ | `2.52.0.windows.1` | — [VERIFIED: local command] |
| Demo credentials | Session entry | ✓ names present in `.env.local` | Values intentionally not inspected/reported | Terminal 503 when absent. [VERIFIED: env-name-only audit] |
| `DEMO_APP_ORIGIN` | Host contract | ✗ | — | Planner adds documented local value; production operator value deferred to Phase 181. [VERIFIED: env-name-only audit and CONTEXT] |

**Missing dependencies with no fallback:** None for implementation or unit planning. A production demo origin is required before live production UAT, but production domain mutation is explicitly deferred. [VERIFIED: CONTEXT]

**Missing dependencies with fallback:** `DEMO_APP_ORIGIN` can be added locally for Phase 180 automated/browser tests; production configuration lands operationally in Phase 181. [VERIFIED: phase boundary]

## Validation Architecture

Nyquist validation is enabled because `.planning/config.json` sets `workflow.nyquist_validation: true`. [VERIFIED: config]

### Test Framework

| Property | Value |
|----------|-------|
| Unit/static framework | Vitest `4.1.4` with jsdom, 30s timeout. [VERIFIED: package/config] |
| Integration framework | Vitest, env-gated live Supabase tests under `tests/integration`. [VERIFIED: existing tests] |
| Browser framework | Playwright `1.59.1`, desktop Chromium plus mobile Safari/Chrome projects, base port 9633. [VERIFIED: package/config] |
| Config files | `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/test.yml` [VERIFIED: codebase] |
| Quick run | `npx vitest run tests/unit/demo tests/unit/middleware.test.ts` |
| Full CI-equivalent | `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` |
| Browser isolation run | `npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` |
| Live RLS run | `npx vitest run tests/integration/demo-readonly-rls.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ENTRY-01 | Apex redirect uses fixed demo origin and apex session remains unchanged | unit + e2e | `npx vitest run tests/unit/demo/host-routing.test.ts && npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` | ❌ Wave 0 |
| ENTRY-02 | Exact demo host signs in, writes host-only auth + active-company cookies, reaches dashboard | unit + e2e | same as above | ❌ Wave 0 |
| ENTRY-03 | valid reuse; stale/wrong/partial repair; terminal failure; no loop | unit + e2e | `npx vitest run tests/unit/demo/session-route.test.ts` | ❌ Wave 0 |
| ENTRY-04 | configured `demo.localhost:<port>` works; production remains secure | unit + e2e | `npx vitest run tests/unit/demo/config.test.ts tests/unit/demo/host-routing.test.ts` | ❌ Wave 0 |
| SAFE-01 | OR truth table and complete action/API mutation coverage | unit + static contract | `npx vitest run tests/unit/demo/guard.test.ts tests/unit/demo/mutation-boundary-sweep.test.ts` | ❌ Wave 0 |
| SAFE-02 | no AI/upload/send/billing/dispatch/provider call after denial | unit | `npx vitest run tests/unit/demo/side-effect-boundaries.test.ts` | ❌ Wave 0 |
| SAFE-03 | authenticated direct table/storage writes denied; reads allowed | static migration + live integration | `npx vitest run tests/unit/demo/rls-migration-contract.test.ts tests/integration/demo-readonly-rls.test.ts` | ❌ Wave 0 |
| SAFE-04 | all above plus apex-before/after browser proof | phase suite | commands above | ❌ Wave 0 |

### Required Test Cases

#### Host/session unit cases

- Apex `/demo` performs no Supabase sign-in/sign-out/cookie write and redirects only to configured origin. [VERIFIED: ENTRY-01 contract]
- Demo entry rejects apex, `www`, evil suffix, wrong port, wrong scheme, and injected forwarded host without setting credentials/cookies. [VERIFIED: threat model]
- Valid demo claims + demo membership reuse the session and repair only `active_company_id`. [VERIFIED: D-03]
- Wrong-user session calls local sign-out, clears demo-host cookies, then signs in as demo. [VERIFIED: D-03/D-06]
- Missing/invalid/chunked auth cookies and wrong/missing company cookie recover once. [VERIFIED: D-03]
- Missing credentials, failed sign-in, identity mismatch, or missing membership returns terminal 503 and zero redirect to dashboard. [VERIFIED: fail-closed architecture]
- Every emitted auth and active-company cookie omits `Domain`; production has `Secure`, local HTTP does not. [VERIFIED: D-02/D-04]
- Entry ignores/rejects `next=https://evil.example`. [VERIFIED: open-redirect control]

#### Guard and boundary unit cases

- demo user + normal company → denied.
- normal user + demo company → denied.
- demo user + demo company → denied.
- normal user + normal company → allowed.
- admin/owner/provider-like role metadata never changes the result.
- Guard runs before AI provider resolution, storage upload, Stripe, Resend/Twilio/WhatsApp, Inngest dispatch, service-role mutation, Auth update/delete, OAuth token issuance, MCP write, and Xphere dispatch.

[VERIFIED: D-07..D-11 and side-effect inventory]

#### RLS integration cases

- Demo client can SELECT seeded demo rows. [VERIFIED: product requirement]
- Demo client cannot INSERT/UPDATE/DELETE a direct `company_id` table.
- Demo client cannot mutate a user-scoped/global RLS table.
- A normal authenticated principal cannot mutate a row whose `company_id` is demo, even when membership would otherwise permit it.
- A normal tenant's writes still succeed.
- Demo client cannot upload/update/delete company-prefixed Storage objects.
- Service role can still seed/reset demo rows.
- Catalog assertion confirms every current public RLS table and company-ID table has the required restrictive policies.

[VERIFIED: SAFE-03 and migration design]

#### Playwright isolation case

Use one browser context so cookie behavior is real:

1. Authenticate or seed an apex normal-user session.
2. Snapshot apex Supabase and `active_company_id` cookies.
3. Navigate to apex `/demo`.
4. Follow to configured demo host and real `/dashboard`.
5. Assert demo banner/app shell and demo-host cookies.
6. Attempt representative action/API mutation and assert 403/no provider call or data change.
7. Navigate back to apex `/dashboard`.
8. Assert original apex identity/company cookies and session still work.
9. Re-enter demo and assert redirect count is bounded and session is reused.

[VERIFIED: ENTRY-01/SAFE-04 acceptance criteria]

### Static Sweep Design

Build a test modeled on `tests/unit/phase83-server-action-sweep.test.ts`: enumerate tenant-facing `'use server'` files and mutating route handlers, require a shared guard import/call or an explicit audited classification (`read-only`, `auth-entry`, `machine-signed`, `admin-only`, `demo-exit`). Also scan service-role write funnels and Inngest company jobs for the explicit-context guard. [VERIFIED: existing static-sweep pattern]

Do not use an ever-growing silent allowlist. Each exception must include a reason in the test and fail when a new export/route appears unclassified. [VERIFIED: coverage-risk analysis]

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/demo tests/unit/middleware.test.ts`
- **Per mutation-boundary task:** run the new focused test plus the closest existing route/action tests.
- **Per RLS task:** `npx vitest run tests/unit/demo/rls-migration-contract.test.ts tests/integration/demo-readonly-rls.test.ts`
- **Per wave merge:** `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval`
- **Phase gate:** Full CI-equivalent suite, live RLS integration when env is present, and Chromium cross-host Playwright isolation green before `$gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/unit/demo/config.test.ts` — validated origin/protocol/host/port/no-secret contract.
- [ ] `tests/unit/demo/host-routing.test.ts` — apex vs demo exact-host routing and no open redirect.
- [ ] `tests/unit/demo/session-route.test.ts` — idempotency, stale-cookie repair, local sign-out, terminal failure.
- [ ] `tests/unit/demo/guard.test.ts` — OR truth table and role-exemption rejection.
- [ ] `tests/unit/demo/mutation-boundary-sweep.test.ts` — complete classified action/API/service/job inventory.
- [ ] `tests/unit/demo/side-effect-boundaries.test.ts` — providers/dispatch/service writes not called.
- [ ] `tests/unit/demo/rls-migration-contract.test.ts` — static SQL coverage/assertions.
- [ ] `tests/integration/demo-readonly-rls.test.ts` — live authenticated direct DB/storage proof.
- [ ] `tests/e2e/demo-session-isolation.spec.ts` — apex-before/after session isolation and no loops.
- [ ] Playwright setup support for `DEMO_APP_ORIGIN=http://demo.localhost:9633` and an apex host distinct from the demo host.

No new test framework install is needed. [VERIFIED: existing dependencies]

## Security Domain

Security enforcement is enabled because `.planning/config.json` does not set `security_enforcement: false`. [VERIFIED: config]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Supabase Auth server-side password sign-in; credentials remain server-only; validate returned identity. [VERIFIED: stack/design] |
| V3 Session Management | yes | Host-only cookies, local-only logout, stale-cookie clearing, fixed host transition, secure production cookies. [VERIFIED: design] |
| V4 Access Control | yes | OR-based application guard plus restrictive RLS/storage; no role exemption. [VERIFIED: D-08..D-11] |
| V5 Input Validation | yes | Parse/validate absolute origin and exact host; fixed paths; no `next` input. [VERIFIED: design] |
| V6 Cryptography | yes | Use Supabase sessions/TLS; do not create custom tokens or cookie signatures. [VERIFIED: stack] |
| V8 Data Protection | yes | Never expose demo password/service role; generic errors; no secret logs. [VERIFIED: AGENTS/config] |
| V10 Malicious Code | yes | No new package installation; static boundary sweep prevents hidden unguarded effect paths. [VERIFIED: phase design] |
| V13 API and Web Service | yes | Guard API/MCP/worker contexts, preserve webhook signature auth, consistent 403. [VERIFIED: route inventory] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Host header injection in absolute redirects | Spoofing | Fixed configured origin and exact allowlist; headers classify only after proxy trust is verified. [VERIFIED: threat analysis] |
| Cookie domain overbreadth | Information Disclosure / Elevation | Never set `Domain`; browser host-only scoping. [VERIFIED: D-02] |
| Shared-account global logout | Denial of Service | `signOut({ scope: 'local' })`. [VERIFIED: installed Auth API] |
| Service-role RLS bypass | Elevation | Explicit company guard before service client; RLS only final for authenticated clients. [VERIFIED: code inventory] |
| PostgREST/Storage direct write | Tampering | Restrictive user and company RLS/storage policies. [VERIFIED: migration strategy] |
| Background event replay | Tampering | Guard inside worker plus existing idempotency; demo company returns no-op/denied before effects. [VERIFIED: job topology] |
| SSR cookie response loss | Session integrity | One response-bound `getAll`/`setAll` adapter. [VERIFIED: installed SSR guidance] |

## Sources

### Primary (HIGH confidence)

- `C:/Users/Vanildo/Dev/xtimator/AGENTS.md` — stack, security, GSD, and Coolify deployment constraints.
- `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, and Phase `180-CONTEXT.md` — locked scope and acceptance requirements.
- `lib/demo/config.ts`, `lib/demo/guard.ts`, `lib/demo/actions.ts` — current canonical demo implementation.
- `lib/queries/active-company.ts`, `lib/actions/active-company.ts` — trusted tenant/cookie behavior.
- `lib/supabase/server.ts`, `lib/supabase/client.ts`, `proxy.ts` — live Supabase SSR and request routing.
- `app/(app)/layout.tsx`, `components/demo/demo-banner.tsx` — real-product demo-mode injection.
- Xtimator Server Action, API, MCP, agent-tool, notification, storage, billing, and Inngest files identified in the inventories above.
- `supabase/migrations/20260530000001_demo_readonly.sql`, `20260706000006_demo_readonly_rerun.sql`, `20260706000004_storage_rls_company_members.sql`, and later migrations — current RLS coverage and drift.
- Installed `node_modules/@supabase/ssr` and `@supabase/auth-js` source/types — cookie defaults, response adapter requirements, local sign-out.
- `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/test.yml` — validation architecture.
- `C:/Users/Vanildo/Dev/xkedule/server/routes/demo.ts`
- `C:/Users/Vanildo/Dev/xkedule/server/routes.ts`
- `C:/Users/Vanildo/Dev/xkedule/server/index.ts`
- `C:/Users/Vanildo/Dev/xkedule/server/middleware/tenant.ts`
- `C:/Users/Vanildo/Dev/xkedule/server/middleware/demo-read-only.ts`
- `C:/Users/Vanildo/Dev/xkedule/server/lib/demo-tenant.ts`
- `C:/Users/Vanildo/Dev/xkedule/server/lib/seo-injector.ts`
- `C:/Users/Vanildo/Dev/xkedule/client/index.html`
- `C:/Users/Vanildo/Dev/xkedule/client/src/components/DemoBanner.tsx`

### Secondary (MEDIUM confidence)

- None. Research was intentionally limited to the two local codebases and installed package source. [VERIFIED: user instruction]

### Tertiary (LOW confidence)

- Local hostname resolution and Coolify forwarded-host sanitization assumptions are isolated in the Assumptions Log. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions and APIs are installed locally and already used by Xtimator. [VERIFIED: package/local source]
- Host/session architecture: HIGH — derived from locked decisions, current SSR adapter, and Xkedule's working host-isolation pattern. [VERIFIED: local sources]
- Mutation inventory: HIGH — Server Actions, route handlers, service-role calls, provider calls, and jobs were enumerated by repository grep and inspected at representative boundaries. [VERIFIED: codebase]
- RLS strategy: HIGH — extends the project's existing restrictive-policy pattern and closes directly observed schema/storage gaps without editing normal tenant policies. [VERIFIED: migrations]
- Production proxy header behavior: MEDIUM — code expectations are known, but live Coolify header sanitization was not tested in this local-only research. [ASSUMED]

**Research date:** 2026-07-26  
**Valid until:** 2026-08-25 (30 days; refresh sooner if auth, proxy, schema, MCP, or Inngest boundaries change)
