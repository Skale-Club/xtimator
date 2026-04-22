---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Brand Identity & Global Reach
status: verifying
last_updated: "2026-04-22T12:56:49.207Z"
last_activity: 2026-04-22
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
---

# Project State

## Current Status

- **Milestone**: v1.2 Brand Identity & Global Reach — roadmap defined, Phase 10 ready to plan
- **Last updated**: 2026-04-22
- **Last session**: 2026-04-22
- **Stopped at**: Roadmap created. Run `/gsd:plan-phase 10` to begin.

## Current Position

Phase: 11
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-04-22

## Active Phase

**Phase 10: Global Brand Tokens**

- Goal: Every app surface renders with #406EF1 as the default primary color without any component rewrites
- Requirements: BRAND-01, BRAND-02, BRAND-03
- Plans: TBD

## Completed Phases

- Phase 8: Platform Admin Panel (08-platform-admin-panel-for-centralized-api-integrations) — COMPLETE 2026-04-21
  - Plan 01: Admin DB foundation (tables, migration, bootstrap doc, integration tests) — COMPLETE (df57325, 13039b8)
  - Plan 02: platform-config.ts loader (getIntegrationKey, getBranding, AES-GCM decrypt) — COMPLETE
  - Plan 03: Admin gate (middleware + requireAdmin + 404-rewrite) — COMPLETE
  - Plan 04: Admin shell + integrations UI (/admin/integrations) — COMPLETE
  - Plan 05: Branding admin UI (/admin/branding) — COMPLETE
  - Plan 06: Admins management UI (/admin/admins) — COMPLETE
  - Plan 07: Auth dark pass + branding loader wiring — COMPLETE (1fa1ff8, 4720895, 28ecffe)
  - Plan 08: Env-var sweep + branding sweep — COMPLETE (a86dd16, ca99f14)
- Phase 4: Project Creation & Workspace (04-project-creation-workspace) — COMPLETE 2026-04-10
  - Plan 01: Project data layer (schema, queries, actions) — COMPLETE (b08c8ec, 18205bb)
  - Plan 02: Project creation wizard UI — COMPLETE
  - Plan 03: Project workspace UI — COMPLETE
- Phase 3: Dashboard & Client Management (03-dashboard-client-management) — COMPLETE 2026-04-10
  - Plan 01: App shell, shared components & data layer — COMPLETE (92a9eaf, fc197d3, e22bfd3)
  - Plan 02: Dashboard page — COMPLETE (da4e7cd, 54db067)
  - Plan 03: Client management pages — COMPLETE (450cc7e, b96d64e)
- Phase 2: Company Onboarding (02-company-onboarding) — COMPLETE 2026-04-10
  - Plan 01: INDUSTRIES config & types — COMPLETE (31df2c2, 18fa8d2)
  - Plan 02: Onboarding wizard UI — COMPLETE (b72528f, b2affc6)
  - Plan 03: Logo upload & company persistence — COMPLETE (40017b3)
- Phase 1: Foundation & Auth (01-foundation-auth) — COMPLETE 2026-04-09
  - Plan 01: Project scaffold — COMPLETE (932bb5d, 9db2748)
  - Plan 02: Supabase wiring — COMPLETE (8281f62, 054128d)
  - Plan 03: Database migrations — COMPLETE (bdd9a66)
  - Plan 04: Auth UI — COMPLETE (f67a1f7, cc030f3)

## Decisions

- shadcn/ui New York style (D-09 locked) with neutral base color and CSS variables
- SUPABASE_SERVICE_ROLE_KEY declared without NEXT_PUBLIC_ prefix (SEC-03)
- vitest include pattern explicitly set to tests/unit/** to avoid Playwright import collisions
- app/page.tsx redirects to /auth/login (D-04 — no landing page in v1; v1.2 moves redirect to middleware so / serves landing page)
- [Phase 01-foundation-auth]: getClaims() used instead of getSession() for JWT validation — re-validates signature against Supabase servers (AUTH-04, SEC-03)
- [Phase 01-foundation-auth]: data?.claims ?? null pattern adopted for getClaims() null-safe destructuring
- [Phase 01-foundation-auth 01-03]: RLS subquery pattern: company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))
- [Phase 01-foundation-auth 01-03]: Storage policy pattern: (storage.foldername(name))[1] matches company_id path prefix
- [Phase 01-foundation-auth 01-03]: Supabase migrations applied via bunx supabase db push --db-url {DATABASE_URL}
- [Phase 01-foundation-auth]: useSearchParams wrapped in Suspense boundary in reset-password page — Next.js requires this for static generation
- [Phase 01-foundation-auth]: AuthCard shared wrapper with logo SVG + Xtimator wordmark above Card — used by all three auth pages (D-02)
- [Phase 01-foundation-auth]: GoogleOAuthButton uses window.location.origin for redirectTo — works on localhost and any production domain
- [Phase 02-company-onboarding 02-01]: INDUSTRIES uses `as const satisfies Industry[]` for type safety with literal inference
- [Phase 02-company-onboarding 02-01]: Email/website use `.optional().or(z.literal(''))` zod pattern for empty string bypass
- [Phase 02-company-onboarding 02-01]: STEP_FIELDS typed as Record<number, (keyof OnboardingValues)[]> for type-safe step validation
- [Phase 02-company-onboarding 02-02]: zodResolver cast to any for zod v4 optional+default type mismatch with react-hook-form
- [Phase 02-company-onboarding 02-02]: Single useForm shared across all wizard steps for data preservation on back/forward
- [Phase 02-company-onboarding 02-02]: createOrUpdateCompany stub at lib/actions/company.ts -- Plan 03 replaces
- [Phase 02-company-onboarding]: SELECT-then-INSERT/UPDATE pattern for company upsert (no UNIQUE on user_id)
- [Phase 02-company-onboarding]: Logo stored at {user_id}/logo.{ext} in Storage logos bucket
- [Phase 03-dashboard-client-management]: NAV_ITEMS typed as NavItem[] (not as const satisfies) for uniform property access
- [Phase 03-dashboard-client-management]: getAuthContext() helper DRYs getClaims + company fetch in server actions
- [Phase 03-dashboard-client-management]: getClients uses single projects query + JS counting for project_count (avoids N+1)
- [Phase 03-dashboard-client-management]: Promise.all for parallel getDashboardStats + getProjects fetch in dashboard server component
- [Phase 03-dashboard-client-management]: Client-side search/filter/sort with useMemo in ProjectList for instant responsiveness
- [Phase 03-dashboard-client-management 03-03]: EmptyState extended with onAction callback prop for non-link button actions
- [Phase 03-dashboard-client-management 03-03]: ClientDetailActions extracted as separate client component for edit/delete on server-rendered detail page
- [Phase 03-dashboard-client-management 03-03]: Logo upload uses create-then-update pattern: create client, upload logo, update logo_url
- [Phase 03-dashboard-client-management 03-03]: Next.js 16 params typed as Promise<{ id: string }> with await destructuring
- [Phase 04-project-creation-workspace]: targetBudget stored as string in form schema, parsed to number in server action
- [Phase 04-project-creation-workspace]: createProjectAction returns { data: project } for client-side redirect, not server redirect (D-04 / Pitfall 6)
- [Phase 04-project-creation-workspace]: getProjectQuickStats uses Promise.all with 3 count queries on recordings, photos, estimates
- [Phase 04-project-creation-workspace]: Activity logging pattern: insert estimate_activity row with event_type and metadata after entity creation
- [Phase 04-project-creation-workspace 04-03]: Tab labels hidden on mobile (hidden sm:inline), icons always visible for compact layout
- [Phase 04-project-creation-workspace 04-03]: EVENT_CONFIG Record maps event_type to icon+label with Clock fallback for unknown types
- [Phase 04-project-creation-workspace 04-03]: All workspace child components use 'use client' since Tabs requires client-side interactivity
- [Phase 05-audio-recording-photo-management 05-01]: getAuthContext duplicated in recording.ts and photo.ts (not exported from project.ts)
- [Phase 05-audio-recording-photo-management 05-01]: Whisper transcription uses direct fetch to OpenAI API (no SDK dependency)
- [Phase 05-audio-recording-photo-management 05-01]: Photo reorder uses Promise.all for parallel sort_order updates
- [Phase 05-audio-recording-photo-management 05-01]: Service role client pattern: createServiceClient() for privileged server operations
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Admin gate runs BEFORE updateSession redirect for /admin/* paths — 404-rewrite takes precedence over login-redirect to never reveal admin surface (D-07)
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: requireAdmin() throws notFound() — clean call sites and matches Next.js idiom for hiding routes
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Scoped dark theme via [data-theme] selector + var(--platform-primary, fallback) for runtime-overridable accent — does not collide with next-themes (D-20)
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Inline brandingSchema mock in branding-actions test decouples Plan 05 unit tests from Plan 04 wave timing
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: saveBranding normalises 0-byte logoFile to null before schema parse to handle browser variance
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: BrandingPreviewCard wraps both mini previews in a single data-theme='dark-auth' div with --platform-primary inline so accent color updates instantly without iframe
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Auth dark pass: page+form split (server fetches branding, client owns interactive state) + AuthCard branding prop + LogoFallback exported + semantic-token-only styling drives dark theme via [data-theme="dark-auth"] CSS-vars
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Send BYTEA as '\xHEX' strings to Supabase PostgREST (not Buffer instances) — supabase-js JSON.stringifies Buffer payloads, corrupting bytea round-trips
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Decrypt integration keys server-side and project to {configured, last4, updatedAt, updatedByEmail} only — ciphertext and plaintext never enter the RSC payload (R-02 / ADMIN-14)
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Class-based vi.mock factories for Resend / Anthropic constructors — vi.fn().mockImplementation produces non-constructible functions after vi.resetModules()
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: Discriminated-union return { ok: boolean; message?: string } for admin server actions so clients surface inline errors verbatim
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: All provider SDK clients initialized per-request using getIntegrationKey(); no module-level SDK instances that read env at import time (ADMIN-06)
- [Phase 08-platform-admin-panel-for-centralized-api-integrations]: generateMetadata async function in app/layout.tsx for dynamic page title from getBranding(); static metadata export removed (ADMIN-07)
- [Phase 09-system-wide-dark-mode-default]: theme_preference stored as nullable TEXT on companies with CHECK constraint; eb-theme cookie mirrors DB for SSR hydration (httpOnly:false so next-themes can read pre-hydration)
- [Phase 09-system-wide-dark-mode-default]: saveThemePreference validates input BEFORE auth check (no DB round-trip for invalid input); cookie written AFTER successful DB update so cookie never drifts ahead of DB
- [Phase 09-system-wide-dark-mode-default]: Primitives redesigned to consume Plan-06 tokens via Tailwind arbitrary-value syntax; removed all dark:* color variants that don't fire inside scoped [data-theme] wrappers (RESEARCH Pitfall 4)
- [Phase 09-system-wide-dark-mode-default]: Skeleton uses gradient-shimmer before-pseudo-element with @keyframes shimmer defined at top level of globals.css (outside @layer) for arbitrary-value animate-[shimmer_...] consumption
- [Phase 10-global-brand-tokens]: 224 86% 60% HSL triplet locked as global brand primary (#406EF1) across all CSS scopes; .dark --primary-foreground changed to 0 0% 100% for white-on-blue contrast; var(--platform-primary, ...) runtime override path preserved

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01-foundation-auth | 01 | 14min | 2 | 52 |
| 01-foundation-auth | 02 | 6min | 2 | 6 |
| 01-foundation-auth | 03 | 3min | 1 | 2 |
| 01-foundation-auth | 04 | 12min | 3 | 12 |
| 02-company-onboarding | 01 | 5min | 2 | 4 |
| 02-company-onboarding | 02 | 22min | 2 | 12 |
| 02-company-onboarding | 03 | 8min | 2 | 2 |
| Phase 03-dashboard-client-management P01 | 6min | 3 tasks | 20 files |
| 03-dashboard-client-management | 02 | 4min | 2 | 9 |
| 03-dashboard-client-management | 03 | 7min | 2 | 9 |
| Phase 04-project-creation-workspace P01 | 5min | 2 tasks | 4 files |
| 04-project-creation-workspace | 03 | 5min | 2 | 7 |
| 05-audio-recording-photo-management | 01 | 5min | 2 | 11 |
| Phase 08-platform-admin-panel-for-centralized-api-integrations P03 | 8min | 2 tasks | 7 files |
| Phase 08-platform-admin-panel-for-centralized-api-integrations P05 | 5min | 2 tasks | 6 files |
| Phase 08-platform-admin-panel-for-centralized-api-integrations P07 | 9min | 2 tasks | 11 files |
| Phase 08-platform-admin-panel-for-centralized-api-integrations P04 | 14min | 2 tasks | 14 files |
| Phase 08-platform-admin-panel-for-centralized-api-integrations P06 | 15min | 3 tasks | 6 files |
| Phase 08-platform-admin-panel-for-centralized-api-integrations P08 | 9min | 2 tasks | 12 files |
| Phase 09-system-wide-dark-mode-default P01 | 7min | 2 tasks | 4 files |
| Phase 09-system-wide-dark-mode-default P07 | 6min | 2 tasks | 10 files |
| Phase 10-global-brand-tokens P01 | 8min | 2 tasks | 4 files |

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** Business owner → job site audio recording → sent professional estimate in under 5 minutes
**Current focus:** Phase 10 — global-brand-tokens

## Notes

Project initialized from comprehensive spec on 2026-04-09.
v1.0: 8 phases, 32 plans, 151+ commits. v1.1: Phase 9, 8 plans, 38 commits. YOLO mode, standard granularity.
v1.2: 3 phases (10-12), 16 requirements. Seeds: SEED-001 (i18n EN/PT-BR/ES), SEED-002 (landing page + #406EF1 brand identity).

## Accumulated Context

### Roadmap Evolution

- Phase 8 added: Platform admin panel — scope covers centralized API integrations (Resend/Anthropic/OpenAI) AND global branding (app name, logo, theme). Removes all hardcoded "Xtimator" strings and process.env key coupling; replaces with DB-backed config fetched via server-side loader. Drives v1.1.
- v1.2 phases 10-12: Brand tokens (BRAND-01–03) → Landing page (LAND-01–05) → i18n system (I18N-01–08). Ordering constraint: landing page must exist before i18n so translations layer on top of real UI strings.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-tqz | Add login event logging | 2026-04-22 | e5ba1c5 | [260421-tqz-add-login-event-logging](.planning/quick/260421-tqz-add-login-event-logging/) |
| 260422-o7y | Rename project from EstimateBuilder Pro to Xtimator | 2026-04-22 | bafcb2c | [260422-o7y-rename-project-from-estimatebuilder-pro-](.planning/quick/260422-o7y-rename-project-from-estimatebuilder-pro-/) |
