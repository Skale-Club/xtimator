# Phase 180: Isolated Demo Session & Read-Only Foundation - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning
**Source:** Owner-approved product discussion + Xkedule reference analysis

<domain>
## Phase Boundary

Establish the secure entry and identity foundation for a product-native public demo. This phase creates an isolated demo-host session, selects the deterministic demo tenant, guarantees read-only behavior at every mutation boundary, and proves the contract with automated tests. It does not switch the landing-page CTA or remove the existing standalone demo; those actions belong to Phase 181 after this foundation passes verification.

</domain>

<decisions>
## Implementation Decisions

### Host and session isolation
- D-01: Production demo traffic uses `demo.xtimator.com`. Phase 180 exposes an apex `/demo/entry` handoff for direct verification without changing the legacy `/demo` experience; Phase 181 switches the public `/demo` entry and landing CTA to that verified handoff.
- D-02: Supabase auth cookies and `active_company_id` created on the demo host are host-only. No `.xtimator.com` domain cookie is introduced.
- D-03: The demo entry is idempotent: a valid existing demo session reuses the demo identity; stale, wrong-user, wrong-company, or partial demo cookies are cleared/repaired without redirect loops.
- D-04: Local development uses a configured demo host (for example `demo.localhost`) and the actual configured port; production secure-cookie behavior is not weakened to make local development work.

### Demo identity and tenant
- D-05: Reuse `lib/demo/config.ts` as the canonical source for `DEMO_COMPANY_ID`, `DEMO_USER_EMAIL`, and `DEMO_USER_PASSWORD`.
- D-06: The demo host authenticates only the dedicated demo user and sets the deterministic demo company as active before redirecting to the real `/dashboard`.
- D-07: Never grant or reuse a canonical platform-admin/provider identity for public visitors. Xkedule's admin-exemption write hole is explicitly rejected.

### Read-only enforcement
- D-08: A request is treated as demo/read-only if either the authenticated session matches the dedicated demo user or the resolved active company matches `DEMO_COMPANY_ID`. Guards must fail closed on either signal.
- D-09: UI suppression is convenience only. Server actions, API routes, upload/generation/send/billing/background-job entry points, and database/RLS policies independently deny demo mutations and external effects.
- D-10: Existing `lib/demo/guard.ts`, `assertWritable`, and `demoGuardResponse` remain the shared server contract and are strengthened rather than replaced by a parallel guard system.
- D-11: RLS/database protection is the final boundary. The dedicated demo user/company cannot write through direct Supabase client access even if an application guard is missed.

### Cutover safety
- D-12: The current standalone `/demo/*` pages remain intact throughout Phase 180, except for the additive `/demo/entry` handoff route. The legacy `/demo` index and its CTA behavior do not change until Phase 181; duplicate-page removal happens only after verification.

### the agent's Discretion
- Exact route names for the cross-host entry/callback.
- Whether the demo-host URL is supplied by one absolute environment variable or a small host configuration object, provided local and production behavior is deterministic and validated.
- The smallest maintainable RLS migration strategy that denies writes without weakening normal tenant policies.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Xtimator demo and app identity
- `lib/demo/config.ts` — deterministic demo identifiers and credentials.
- `lib/demo/guard.ts` — current session-level mutation guard.
- `app/(app)/layout.tsx` — real app shell, active-company resolution, and existing demo-mode behavior.
- `components/demo/demo-banner.tsx` — shared read-only demo indicator.
- `lib/supabase/server.ts` — server-side Supabase cookie/session conventions.
- `lib/company/active-company.ts` — active-company cookie resolution contract.

### Existing divergent demo
- `app/demo/layout.tsx` — standalone demo shell retained until Phase 181.
- `app/demo/dashboard/page.tsx` — service-role read-only page proving the current divergence.

### Deployment and middleware
- `proxy.ts` — request routing/auth boundary for host-aware behavior.
- `.github/workflows/build-deploy.yml` — actual production deployment topology.
- `AGENTS.md` — production is Coolify, not Vercel.

### External reference implementation
- `C:/Users/Vanildo/Dev/xkedule` — read-only reference codebase. Find and inspect its demo host redirect, demo-entry/auth route, host-only cookie handling, tenant demo-mode injection, and read-only middleware. Copy the architecture, not its canonical-admin mutation exemption.

</canonical_refs>

<specifics>
## Specific Ideas

- Phase 180 verification flow: `https://xtimator.com/demo/entry` → `https://demo.xtimator.com/demo/entry` → host-only demo session + host-only `active_company_id` → `/dashboard`.
- Phase 181 cutover flow: `https://xtimator.com/demo` and landing CTAs use the verified `/demo/entry` handoff.
- The replacement must render the real authenticated application, not a service-role-powered replica.
- Automated coverage must include an existing apex session before and after visiting the demo host.

</specifics>

<deferred>
## Deferred Ideas

- Landing CTA switch, removal of `app/demo/*`, and full responsive browser parity are Phase 181.
- Periodic demo-data reset and multi-industry demo scenarios are future milestones.
- DNS, Supabase redirect allow-list, and Coolify custom-domain mutations are operator actions; repository configuration/documentation lands in Phase 181.

</deferred>

---

*Phase: 180-isolated-demo-session-read-only-foundation*
*Context gathered: 2026-07-26 via autonomous owner-approved scope*
