# Phase 1: Foundation & Auth - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold the Next.js 14+ App Router project with all tooling configured, wire Supabase auth and clients, run migrations for all 8 database tables with RLS and Storage bucket policies, and deliver working auth UI (login, signup, password reset, Google OAuth) with session-aware routing middleware. This phase ends when a user can sign up, sign in via email/password or Google OAuth, and sign out — with correct redirect behavior based on company onboarding state.

</domain>

<decisions>
## Implementation Decisions

### Auth Page Layout
- **D-01:** Centered card layout on all auth pages (`/auth/login`, `/auth/signup`, `/auth/reset-password`). Single form card centered on a plain/subtle background. Works well on mobile.
- **D-02:** App logo + wordmark ("EstimateBuilder Pro") appears above the card on all auth pages. This is the app's own brand (no company branding at this point — user isn't logged in).
- **D-03:** Google OAuth button at top of card, visual divider ("or"), then email/password form below. Google is the primary CTA; email is secondary.

### Root Route & Middleware
- **D-04:** No landing/marketing page in v1. Root `/` redirects: logged-out → `/auth/login`, logged-in → `/dashboard`.
- **D-05:** Middleware protects **all routes except** `/auth/*` and `/estimate/*`. Everything else (dashboard, onboarding, settings, project workspace) requires authentication. This is the exhaustive protection rule.

### Database Schema
- **D-06:** Executor infers the full column-level schema from `REQUIREMENTS.md` and domain knowledge. No pre-defined spec file.
- **D-07:** All primary keys use `UUID DEFAULT gen_random_uuid()` on every table. This is the Supabase-idiomatic standard.
- **D-08:** Hard-delete for v1 — records are removed from the database on delete. No `deleted_at` soft-delete columns. Keeps queries simple.

### shadcn/ui Installation Scope
- **D-09:** Install the full app component set in Phase 1 so later phases never need to install components. Minimum set: `button`, `input`, `form`, `card`, `dialog`, `toast` (sonner), `badge`, `select`, `tabs`, `avatar`, `dropdown-menu`, `label`, `separator`, `sheet`, `skeleton`, `textarea`, `alert`, `alert-dialog`, `progress`, `scroll-area`, `tooltip`, `popover`, `calendar`, `checkbox`, `radio-group`, `switch`, `table`, `command`, `navigation-menu`.

### Claude's Discretion
- Exact Tailwind theme token values and color palette (brand primary color is set per-company during onboarding, not in Phase 1 — use a neutral default)
- Specific waveform and animation choices on auth pages (keep it clean)
- Exact shadcn/ui theme configuration (New York style is locked; specific radius/color tokens are Claude's call)
- Error message copy for auth failures (follow Supabase error codes; be user-friendly)
- Whether to use `next-themes` for future dark mode groundwork (out of scope for v1 but installing the provider costs nothing)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-07, SEC-01 through SEC-04, UX-01 through UX-06 are all in scope for Phase 1
- `.planning/PROJECT.md` — Tech stack constraints, key decisions, existing Supabase project URL

### Roadmap & State
- `.planning/ROADMAP.md` §Phase 1 — Plan descriptions, success criteria, dependency notes
- `.planning/STATE.md` — Current project state

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project. No existing components, hooks, or utilities.

### Established Patterns
- None yet — Phase 1 establishes all patterns.

### Integration Points
- Existing Supabase project: `prmqgcrnpuvpzruyzvuv.supabase.co` (clean, empty database)
- `.env.local` already exists with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` configured

</code_context>

<specifics>
## Specific Ideas

- The existing Supabase project URL is `prmqgcrnpuvpzruyzvuv.supabase.co` — use this, don't create a new project
- `.env.local` already exists with credentials — the scaffold task should validate these load correctly but not overwrite them
- shadcn/ui **New York** style is locked (not Default)
- Bun is the package manager (not npm/yarn/pnpm)
- ESLint should be configured in the scaffold (Next.js default config is fine)
- Vercel deployment config means the project should work with `vercel.json` or rely on Next.js auto-detection

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation-auth*
*Context gathered: 2026-04-09*
