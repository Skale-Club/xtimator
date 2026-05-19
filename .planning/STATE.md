---
gsd_state_version: 1.0
milestone: v3.1.1
milestone_name: MVP Launch Prep + Future-Proofing
status: verifying
last_updated: "2026-05-19T10:31:09.751Z"
last_activity: "2026-05-19 - Completed quick task 260518-v0z: Unify folder + category in price book (folder is sole taxonomy)"
progress:
  total_phases: 17
  completed_phases: 17
  total_plans: 47
  completed_plans: 47
---

# Project State

## Current Status

- **Milestone**: v3.1.1 MVP Launch Prep + Future-Proofing — Roadmap complete (4 phases); Phase 67 (Inngest) plans ready; Phase 66 (Storage) needs planning next
- **Last updated**: 2026-05-15

## Current Position

Phase: 72
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-05-19 - Completed quick task 260518-v0z: Unify folder + category in price book (folder is sole taxonomy)

## v3.1.1 Phases

- Phase 66: Storage Abstraction Layer (STORAGE-01..07) — Not started (needs `/gsd:plan-phase 66`)
- Phase 67: Inngest Background AI Job Processing (INNGEST-01..08) — Plans ready (5 plans in `.planning/phases/67-inngest-background-ai-jobs/`)
- Phase 68: Hetzner Cloud Deploy-Readiness Artifacts (HETZNER-01..06) — Not started
- Phase 69: UAT Validation + Bug Triage + Perf Audit (UAT-V22-01..02, UAT-V30-01..06, UAT-INNGEST-01..02, UAT-STORAGE-01, UAT-E2E-01..03, FIX-01..02, PERF-01..02) — Not started

> **Numbering note:** v3.1.1 starts at Phase 66 (not 62) because Phases 62-65 are reserved as DEFERRED placeholders for v3.2 (Vercel→Hetzner deploy, Stripe live, monitoring, prod UAT). Skipping past keeps the global phase counter unambiguous.

## v3.1 Phases (predecessor milestone)

- Phase 61: Production Database Foundation — COMPLETE 2026-05-15
- Phase 62: Vercel Deployment + Custom Domain — DEFERRED → v3.2
- Phase 63: Stripe Live Mode Activation — DEFERRED → v3.2
- Phase 64: Monitoring + Backup & Resilience — DEFERRED → v3.2
- Phase 65: Production UAT + Bug Triage — DEFERRED → v3.2

## v3.0 Phases

- Phase 55: Schema + Tier Definitions (TIER-01..04) — Not started
- Phase 56: Usage Tracking (QUOTA-01..02) — Not started
- Phase 57: Enforcement Layer (QUOTA-03..06) — Not started
- Phase 58: Stripe Integration (STRIPE-01..04) — Not started
- Phase 59: Billing UI (BILLING-01..05) — IN PROGRESS (Plan 01 complete)
- Phase 60: Trial Automation + Admin Tooling (TRIAL-01..02, ADMIN-BILLING-01..03) — Not started

## v2.2 Phases Shipped

- Phase 53: PDF Attachment Delivery (WAPDF-01..04) — COMPLETE 2026-05-11
- Phase 54: WhatsApp Status Flow (WASTATUS-01..04) — COMPLETE 2026-05-13

## v2.1 Phases Shipped

- Phase 46: Typed Error Handling Foundation (SEED-014 harvested)
- Phase 47: Redis + Rate Limiting Infrastructure (SEED-012 harvested)
- Phase 48: WhatsApp Multi-Message Debounce (SEED-010 harvested)
- Phase 49: WhatsApp Typing + Read Receipts (SEED-011 harvested)
- Phase 50: WhatsApp OTP Number Verification (SEED-015 Gap 2 harvested)
- Phase 51: WhatsApp Pre-Send Edit Commands (SEED-015 Gap 1 — MVP subset)
- Phase 52: Per-Estimate Language Selection (SEED-016 backend harvested)

## Completed Phases

- Phase 54: WhatsApp Status Flow (54-whatsapp-status-flow) — COMPLETE 2026-05-13
  - Plan 01: updateWhatsAppStatus server action + unit tests (WASTATUS-02, WASTATUS-03, WASTATUS-04) — COMPLETE
  - Plan 02: WhatsAppConnectCard: StatusBadge + Suspend/Reactivate buttons (WASTATUS-01, WASTATUS-03) — COMPLETE
- Phase 53: PDF Attachment Delivery (53-pdf-attachment-delivery) — COMPLETE 2026-05-11
  - Plan 01: Wave 0 test stubs + DB migration + lib/whatsapp/pdf-delivery.ts helper — COMPLETE
  - Plan 02: confirm.ts handleSend pdf_attachment branch + WhatsAppConnectCard third SelectItem — COMPLETE
- Phase 45: Settings UI + Admin Token (45-settings-ui-admin-token) — COMPLETE 2026-05-10
  - Plan 01: meta_whatsapp IntegrationProvider + admin integrations card + testIntegrationKey (graph.facebook.com/v21.0/me) + lib/actions/whatsapp-settings.ts + WhatsAppConnectCard + /settings/integrations page + settings entry card — COMPLETE
- Phase 44: Outbound Client Delivery (44-outbound-client-delivery) — COMPLETE 2026-05-10
  - Plan 01: delivery_format migration + formatter.ts + confirm.ts delivery branching + tests — COMPLETE
- Phase 43: Confirmation Flow (43-confirmation-flow) — COMPLETE 2026-05-10
  - Plan 01: lib/whatsapp/confirm.ts (send/cancel parser + basic share-link delivery + handler wiring) — COMPLETE
  - Plan 02: /api/cron/cleanup-whatsapp-sessions + pg_cron migration + vercel.json — COMPLETE
- Phase 42: Inbound Processing (42-inbound-processing) — COMPLETE 2026-05-10
  - Plan 01: lib/whatsapp/handler.ts (text/audio/image dispatch, session create, confirm reply) + webhook wiring + unit tests — COMPLETE
- Phase 41: Generate-Estimate Service Extraction (41-generate-estimate-service-extraction) — COMPLETE 2026-05-10
  - Plan 01: lib/services/generate-estimate.ts + slim route + unit tests — COMPLETE
- Phase 36: Voice Refinement (36-voice-refinement) — COMPLETE 2026-05-09
  - Plan 01: VoiceRefineRecorder component + voice refinement API route + panel wiring — COMPLETE (83b81a7, 0602d29, 4eee7ff)
- Phase 26: Bulk Price Adjustment (26-bulk-price-adjustment) — COMPLETE 2026-05-08
  - Plan 01: bulkAdjustSchema + bulkAdjustPriceBookCategory server action (TDD, .upsert() atomicity) — COMPLETE
  - Plan 02: BulkAdjustDialog component + "Adjust %" button wired into PriceBookList category headers — COMPLETE
- Phase 27: Capture Schema Migration (27-capture-schema-migration) — COMPLETE 2026-05-09
  - Plan 01: Migration to make storage_path nullable in recordings + client_id nullable in projects — COMPLETE
- Phase 28: Unified Capture Screen (28-unified-capture-screen) — COMPLETE 2026-05-09
  - Plan 01: Multi-modal capture (text + photos) as alternatives to audio — COMPLETE
- Phase 29: Frictionless Project Creation & Client Linking (29-frictionless-project-creation-client-linking) — COMPLETE 2026-05-09
  - Plan 01: client-optional wizard + new-project button + link-client card (CLIENTASSOC-01, CLIENTASSOC-02, CLIENTASSOC-04) — COMPLETE
- Phase 30: [planned]
- Phase 25: Plain Text Tab + Copy UI (25-plain-text-tab-copy-ui) — COMPLETE 2026-05-08
  - Plan 01: buildItemsBreakdown utility + unit tests (TDD RED→GREEN) — COMPLETE
  - Plan 02: PlainTextCard component + data chain wiring (page.tsx → ProjectWorkspace → SendTab) — COMPLETE
- Phase 24: Estimate Template Engine + Settings Page (24-estimate-template-engine-settings-page) — COMPLETE 2026-05-08
  - Plan 01: Migration (4 estimate_template_* columns on companies) + resolveTemplate utility + zod schema + query (TDD) — COMPLETE
  - Plan 02: saveEstimateTemplate server action + EstimateTemplateForm client component — COMPLETE
  - Plan 03: /settings/estimate-templates page + loading skeleton + entry card on /settings — COMPLETE
- Phase 23: Estimate Editor Price Badges (23-estimate-editor-price-badges) — COMPLETE 2026-05-08
  - Plan 01: Badge rendering (price_source display logic, EditorItem type extension) — COMPLETE
  - Plan 02: Badge persistence (saveEstimate price_source nullification on edited items) — COMPLETE
- Phase 14: Auth system hardening (14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state) — COMPLETE 2026-05-01
  - Plan 01: Live auth route targets across middleware, redirects, callback flows, and production links — COMPLETE (ecbf990, 84d5d1f)
  - Plan 02: Password reset, callback, OAuth, and proxy error hardening — COMPLETE (0ed3585, 4dc4a15)
  - Plan 03: Unit + Playwright auth route alignment — COMPLETE (a3aeade, 05ace7f)
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

- [Phase 59-billing-ui 59-01]: requireServiceClient (not createClient) for usage_events — deny-all RLS requires service role bypass; single event_type query counted in JS to avoid N+1
- [Phase 59-billing-ui 59-01]: Billing entry card placed before Price Book on /settings — billing is a top-level business concern; Plan 02 owns interactive checkout/portal buttons (no client components in Plan 01 page)
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
- [Phase 11-marketing-landing-page]: Authenticated root redirects stay in proxy.ts so signed-in users fast-path before landing-page rendering.
- [Phase 11-marketing-landing-page]: Landing-page baseline uses shallow components/landing sections plus env-gated Playwright coverage for the authenticated root path.
- [Phase 11-marketing-landing-page]: Hero workflow panel hidden on mobile (sm:hidden) to guarantee CTAs above fold on 390px viewports
- [Phase 11-marketing-landing-page]: Footer converted to async server component consuming getBranding().appName; no hardcoded app name strings in landing
- [Phase 12-i18n-translation-system]: LanguageContext uses pendingCount/setPendingCount (not isTranslating) to prevent premature overlay dismissal on concurrent translation batches
- [Phase 12-i18n-translation-system]: Wave 0 test scaffold pattern: vi.mock the target module itself so test files compile before source modules exist
- [Phase 12-i18n-translation-system]: translations table uses service-role-only writes (no INSERT policy) — service role bypasses RLS by design
- [Phase 12-i18n-translation-system]: Per-language batch accumulator (Map<lang,...>) avoids language switch mid-debounce mixing PT and ES translations (Pitfall 3)
- [Phase 12-i18n-translation-system]: LanguageProvider nests inside ThemeProvider in app/layout.tsx; Language type exported from language-context.tsx for downstream modules
- [Phase 12-i18n-translation-system 12-03]: upsert(rows, { onConflict, ignoreDuplicates: true }) used instead of insert() with onConflict — Supabase JS v2 TypeScript types only support onConflict on upsert(); ignoreDuplicates:true = ON CONFLICT DO NOTHING
- [Phase 12-i18n-translation-system 12-03]: /api/translate adds getClaims() auth check for rate-limit protection — not required by generate-estimate pattern but added to prevent unauthenticated AI abuse (translations are platform-wide, no companyId needed)
- [Phase 12-i18n-translation-system 12-04]: LanguageToggle placed outside NAV_ITEMS.map() in BottomNav — it is a button action not a nav link (Pitfall 4)
- [Phase 12-i18n-translation-system 12-04]: TranslationLoadingOverlay uses pendingCount counter (not isTranslating boolean) for concurrent batch overlay management; mounted in app/(app)/layout.tsx so I18N-07 triggers from any authenticated page
- [Phase 12-i18n-translation-system]: nav-items.ts left unmodified — t() applied at render site in sidebar.tsx and bottom-nav.tsx (data files have no React context)
- [Phase 12-i18n-translation-system]: empty-state.tsx is a server component; caller passes pre-translated strings as props at call site instead of wrapping inside the component
- [Phase 13]: Phase 13 Plan 01 keeps all browser/install icon assets under app/ and relies on App Router metadata files instead of manual head links.
- [Phase 13]: Phase 13 Plan 01 explicitly marks /icon, /apple-icon, and /manifest.webmanifest as public in both proxy layers to protect favicon and install surfaces from auth redirects.
- [Phase 13]: Phase 13 Plan 01 keeps app/manifest.ts static for app naming so manifest prerendering does not depend on Supabase branding env/config at build time.
- [Phase 14]: Phase 14: all runtime auth URLs use /login, /signup, /reset-password, and /callback because App Router route-group names are silent in the URL.
- [Phase 14]: Phase 14: updatePassword now mirrors signIn/callback by querying companies and redirecting to /dashboard or /onboarding after a successful password reset.
- [Phase 14]: Phase 14: auth transport failures degrade gracefully - proxy getClaims() falls back to anonymous handling, callback logs claims errors, and Google OAuth resets loading on startup failure.
- [Phase 15-owner-admin-panel]: DEFAULT_LANDING_CONTENT seeded from actual component source (icon names stored as strings for DB serialization)
- [Phase 15-owner-admin-panel]: getLandingContent() delegates to getBranding() to reuse TTL cache rather than adding a second cache layer
- [Phase 15-owner-admin-panel]: EditPostWrapper extracted to separate file for server/client boundary; BlogPostActions extracted to blog-post-actions.tsx for same reason
- [Phase 15-owner-admin-panel]: getPlatformStats uses Promise.all for 3 concurrent Supabase queries; get_platform_user_count RPC bypasses RLS for platform-level user count
- [Phase 15-owner-admin-panel]: Admin nav /admin Dashboard item uses exact pathname match; all other items use startsWith prefix match
- [Phase 15-owner-admin-panel]: ICON_MAP pattern: icons stored as strings in DB resolved at render via ICON_MAP[feature.icon] fallback BrainCircuit
- [Phase 15-owner-admin-panel]: BENTO_CLASSES positional array: bento grid classes are layout concerns fixed by position not DB-editable
- [Phase 15-owner-admin-panel]: details HTML element for collapsible editor sections in LandingEditor (no JS dependency for expand/collapse)
- [Phase 15-owner-admin-panel]: saveSeo follows identical server action pattern as saveBranding: validate -> upload -> upsert -> invalidate -> revalidate
- [Phase 15-owner-admin-panel]: app-icons.test.ts updated to allow dynamic icons in generateMetadata (Phase 15-03) while still forbidding hardcoded <link> tags
- [Phase 15-owner-admin-panel]: seo-actions.test.ts uses inline seoSchema mock for wave-order safety (same pattern as branding-actions.test.ts)
- [Phase 16]: ProjectSummary is minimal (4 fields) — enough for sidebar list without pulling full ProjectDetail; hasMore sentinel avoids extra COUNT query
- [Phase 16]: getMoreProjects has no extra auth check — RLS on projects table enforces company_id ownership automatically
- [Phase 16]: Projects section uses hidden lg:flex to disappear in collapsed sidebar without icon stub
- [Phase 16]: useTransition wraps getMoreProjects pagination call to avoid blocking navigation
- [Phase 16-sidebar-projects-panel]: revalidatePath('/', 'layout') wired in project create/duplicate actions; delete action intentionally excluded from layout revalidation
- [Phase 16-sidebar-projects-panel]: SidebarProjectItem isActive uses exact match OR startsWith with trailing slash to cover sub-routes without false positives
- [Phase 17]: Used shadcn/ui Skeleton component for loading states matching existing clients/ and dashboard/ patterns
- [Phase 17]: ProjectTabs receives typed promises (ReturnType<typeof fn>) for streaming semantics; company query co-located inside async sub-component to keep page shell fast
- [Phase 17-navigation-performance]: getCachedCompany uses createServiceClient (not createClient) — unstable_cache cannot call cookies() inside its memoized function; service role bypasses RLS and userId argument scopes the query correctly
- [Phase 17-navigation-performance]: revalidateTag('company') wired into updateCompanySettings so layout sidebar reflects updated company name/logo immediately after save (no 60s TTL wait)
- [Phase 18-voice-first-project-onboarding]: (capture) route group is a sibling to (app) — mounts /projects/[id]/capture with own full-screen layout (no sidebar/topbar)
- [Phase 18-voice-first-project-onboarding]: PLACEHOLDER_PREFIX exported from lib/actions/project.ts for plan 18-03 name-patcher to import and guard against overwriting user-set names
- [Phase 18-voice-first-project-onboarding]: Wave 0 scaffold pattern: vi.mock target module + explicit vi import + expect.fail() for Nyquist-compliant failing tests before implementation
- [Phase 18-voice-first-project-onboarding]: pg_cron primary path with DO $do$ guard for idempotency; Vercel cron also wired as harmless fallback (D-03)
- [Phase 18-voice-first-project-onboarding]: Name patcher only updates project.name if it starts with PLACEHOLDER_PREFIX — preserves user-edited names (D-05)
- [Phase 18-voice-first-project-onboarding]: App-shell test-ids added unconditionally to prevent false-positive shell-escape e2e assertions
- [Phase 19-price-book-db-foundation]: Wave 0 test stub covers SC-1/SC-2/SC-3 smoke criteria; SC-1 and SC-3 intentionally RED until Plan 02 applies db push
- [Phase 19-price-book-db-foundation]: price_source CHECK uses IS NULL OR IN ('price_book','ai_estimate') to allow pre-v1.3 NULL rows; no Postgres enum (TEXT+CHECK consistent with D-07/D-08)
- [Phase 19-price-book-db-foundation]: Used Supabase REST API OpenAPI introspection for type generation on Windows — supabase gen types --db-url requires Docker which is unavailable
- [Phase 20-price-book-crud-ui]: z.coerce.number().min(0) used for unit_price (Pitfall 1) — auto-coerces HTML number input strings, no valueAsNumber prop required
- [Phase 20-price-book-crud-ui]: PriceBookItem.category typed as string (non-null) despite generated types showing string | null — DDL is NOT NULL; type generator nullability is a known gap (Phase 19 SUMMARY)
- [Phase 20-price-book-crud-ui]: getAuthContext duplicated in lib/actions/price-book.ts (mirrors lib/actions/client.ts) — established codebase convention since Phase 03
- [Phase 20-price-book-crud-ui]: Helper paragraph below /settings/price-book heading is conditional on items.length > 0 — empty state owns the optionality messaging via D-10, secondary helper would be redundant
- [Phase 20-price-book-crud-ui]: Price-book sub-route page wrapper uses w-full max-w-none space-y-6 (matches /settings parent), not the narrow mx-auto max-w-xl pattern of /settings/appearance — a grouped table list needs full width to avoid truncation
- [Phase 20-price-book-crud-ui]: Price Book entry-point card placed strictly below SettingsTabs in the parent space-y-6 stack (D-02); SettingsTabs untouched per D-01 — price-book is a sibling sub-route, not a new tab
- [Phase 21-csv-import]: papaparse@5.5.3 installed via npm (D-20 locked); parsePriceBookCsv + importPriceBookItems Wave 0 stubs return error/fatal to fail loudly before Wave 1
- [Phase 21-csv-import]: parsePriceBookCsv uses extension-first validation (isCsvByName OR isCsvByType) — iOS Safari may report empty MIME for .csv files from Numbers/Excel
- [Phase 21-csv-import]: In-file duplicate key uses case-insensitive category::name Set; only added to seenInFile when row has no errors
- [Phase 21-csv-import]: Close dialog BEFORE router.refresh() (Pitfall 5 pattern): onOpenChange(false) then router.refresh() in importPriceBookItems success path
- [Phase 21-csv-import]: Import CSV button positioned in header flex group (next to Add Item) using variant=outline; empty state Import CSV button rendered as separate div below EmptyState since EmptyState only supports one action prop
- [Phase 21-csv-import]: handleImportClose pattern mirrors handleDialogChange (closes state, calls router.refresh) — consistent with Phase 20 close-then-refresh convention (Pitfall 5)
- [Phase 22-ai-price-anchoring]: lib/ai/normalize.ts created as Wave 0 stub so price-source-tagging.test.ts import resolves without TypeScript errors — Wave 1 implements the real function
- [Phase 22-ai-price-anchoring]: explicit expect added to all vitest imports in test files — tsc fails on globals even with globals:true; existing test pattern requires explicit import from 'vitest'
- [Phase 22-ai-price-anchoring]: lib/ai/index.ts uses dynamic import() for adapter modules — avoids loading both adapter SDKs on every request
- [Phase 22-ai-price-anchoring]: integrationKeySchema extended with 'gemini' (auto-fix) — required for TypeScript compatibility after IntegrationProvider extension
- [Phase 22-ai-price-anchoring]: testIntegrationKey 'gemini' case added (D-18) — avoids exhaustiveness fallback, tests Gemini key with 1-token generateContent
- [Phase 22-ai-price-anchoring]: generate-estimate route no longer imports Anthropic SDK — all AI logic delegated to getAIProvider() factory (D-09)
- [Phase 22-ai-price-anchoring]: ai_config row filtered from decrypt loop via .filter(r => r.provider !== 'ai_config') — null ciphertext would crash toBuffer()
- [Phase 22-ai-price-anchoring]: generate-estimate-name-patch.test.ts updated to mock @/lib/ai (Rule 1 auto-fix) — old test mocked @anthropic-ai/sdk which is no longer used in route
- [Phase 23-estimate-editor-price-badges]: EditorItem.price_source typed as literal union 'price_book' | 'ai_estimate' | null; isManuallyEdited client-only flag; UPDATE_ITEM sets isManuallyEdited true only for unit_price field (D-01/D-02/D-03)
- [Phase 23-estimate-editor-price-badges]: isManuallyEdited checked first in badge JSX — Edited displaces price_source badge regardless of value (D-10)
- [Phase 23-estimate-editor-price-badges]: saveEstimate nullifies price_source for edited items via isManuallyEdited ? null : (price_source ?? null) across all 3 DB write paths (D-04/D-11)
- [Phase 24-estimate-template-engine-settings-page]: Template columns added to companies table (not a separate table) — 4 text fields don't warrant a join
- [Phase 24-estimate-template-engine-settings-page]: NULL initial state with no SQL DEFAULT — defaults resolved at render time in pure utility, not at insert time
- [Phase 24-estimate-template-engine-settings-page]: Empty string treated same as NULL in resolveTemplate() — (field || null) ?? default pattern
- [Phase 24-estimate-template-engine-settings-page]: ctx.error cast as string to satisfy explicit Promise return type annotation (literal union vs string mismatch in TypeScript narrowing)
- [Phase 24-estimate-template-engine-settings-page]: database.types.ts manually extended with 4 estimate_template_* columns — migration applied in Plan 01 but types not regenerated (same pattern as Plan 19)
- [Phase 24-estimate-template-engine-settings-page]: Use getEstimateTemplateSettings not getCachedCompany per RESEARCH Pitfall 2; cast as unknown as CompanySettings for form prop compatibility
- [Phase 24-estimate-template-engine-settings-page]: Use getEstimateTemplateSettings not getCachedCompany for settings sub-pages (per RESEARCH Pitfall 2)
- [Phase 24-estimate-template-engine-settings-page]: Cast narrow query result as unknown as CompanySettings — form accesses only the 4 template fields
- [Phase 24-estimate-template-engine-settings-page]: Estimate Templates card placed below Price Book in /settings — grouping AI-related settings together
- [Phase 25-plain-text-tab-copy-ui]: buildItemsBreakdown placed at bottom of estimate-template.ts alongside resolveTemplate — single cohesive module for all plain-text template logic
- [Phase 25-plain-text-tab-copy-ui]: clientName added as explicit SendTabProps field — keeps prop interface clean and consistent with clientEmail pattern
- [Phase 25-plain-text-tab-copy-ui]: key={estimate.id} on PlainTextCard remounts component on estimate version change — guards stale textarea state (Pitfall 2)
- [Phase 26-bulk-price-adjustment]: isValid removed from BulkAdjustDialog submit button disabled — react-hook-form isValid false before first submit; percent guard sufficient
- [Phase 26-bulk-price-adjustment]: BulkAdjustDialog items prop uses items.filter(i.category === adjustCategory) from unfiltered PriceBookList items prop (Pitfall 7) — not search-filtered categoryItems from grouped.map
- [Phase 27-capture-schema-migration]: recordings.storage_path DROP NOT NULL via migration — non-destructive, existing rows unaffected
- [Phase 27-capture-schema-migration]: projects.client_id already nullable in DB — only app-layer Zod schema change needed
- [Phase 27-capture-schema-migration]: STEP_FIELDS[1] emptied — clientId optional means no required field validation at wizard step 1
- [Phase 28 P01]: Multi-modal capture: text + photos as alternatives to audio
- [Phase 29]: Client-optional project creation with linking from wizard, client detail, and project overview surfaces
- [Phase 30]: [planned]
- [Phase 29]: setValue(clientId, undefined) — undefined is treated as optional by zod, not empty string (which fails validation)
- [Phase 29]: LinkClientCard uses lazy fetch with client state + loaded flag pattern to avoid SSR issues
- [Phase 31]: Wizard step indicator: numbered circles (1, 2) with connector line, active step highlighted with bg-primary
- [Phase 35-text-refinement]: Refinement panel hidden on read-only old versions, shows new version number on success
- [Phase 37]: Photo upload uses same collapsible pattern as voice recorder
- [Phase 38-custom-domain-db-settings-ui]: NULL initial state with no DEFAULT clause for custom_domain — same pattern as Phase 24 estimate_template_* columns
- [Phase 38-custom-domain-db-settings-ui]: Manual TypeScript type extension (not regeneration) for custom_domain — Docker unavailable on Windows, established since Phase 19
- [Phase 38-custom-domain-db-settings-ui]: Local useState for savedDomain: updates DNS card immediately post-save before router.refresh() round-trip
- [Phase 38-custom-domain-db-settings-ui]: Apex detection by split('.').length === 2 — 2 parts = apex (e.g. mycompany.com), 3+ = subdomain
- [Phase 38-custom-domain-db-settings-ui]: Local useState for savedDomain: updates DNS card immediately post-save before router.refresh() round-trip
- [Phase 38-custom-domain-db-settings-ui]: Apex detection by split('.').length === 2 (2 parts = apex e.g. mycompany.com)
- [Phase 39-subdomain-routing-white-label]: Custom host detection placed BEFORE updateSession() in proxy so unauthenticated estimate visitors are not redirected to login
- [Phase 39-subdomain-routing-white-label]: No DB lookup to resolve company by host in proxy — estimate token uniqueness guarantees correct estimate is served without extra round-trip
- [Phase 40-webhook-infrastructure]: verifyWebhookSignature catches timingSafeEqual exception for length mismatch — returns false instead of throwing (Pitfall 4)
- [Phase 40-webhook-infrastructure]: whatsapp client.ts reads env vars at call time (not module init) — consistent with per-request getIntegrationKey() pattern
- [Phase 40-webhook-infrastructure]: whatsapp_processed_messages uses message_id TEXT PRIMARY KEY (wamid from Meta) not UUID — dedup key is the Meta message ID
- [Phase 40-webhook-infrastructure]: requireServiceClient (non-nullable) used in webhook handler — runtime-only context, nullable createServiceClient is wrong variant
- [Phase 40-webhook-infrastructure]: new URL(request.url) in GET handler for searchParams — works in both NextRequest and plain Request test environment
- [Phase 40-webhook-infrastructure]: proxy.ts early return for /api/webhooks/ placed before updateSession — Meta Cloud API cannot send auth cookies (WA-04)
- [Phase 41-generate-estimate-service-extraction]: generateEstimateForProject uses requireServiceClient (not createClient) — no auth cookies available in webhook/cron context; service role bypasses RLS and companyId scopes the query
- [Phase 41-generate-estimate-service-extraction]: Route catches named error messages to distinguish 400 client errors from 500 server errors — avoids leaking DB internals while returning meaningful status codes
- [Phase 42-inbound-processing]: processInboundMessage checks awaiting_confirm session first — Phase 43 will handle "send"/"cancel" parsing; Phase 42 sends reminder and returns to avoid duplicate processing
- [Phase 42-inbound-processing]: Audio transcription passes audio/ogg to Whisper (WhatsApp voice notes are OGG/Opus) — no storage_path persisted for WhatsApp recordings (consistent with Phase 27 nullable pattern)
- [Phase 42-inbound-processing]: Image handler uploads to photos bucket before Claude Vision — storage_path required by photos table NOT NULL constraint; upload before insert to avoid orphan rows
- [Phase 42-inbound-processing]: Class-based MockAnthropic with module-level mockAnthropicCreate — consistent with admin-test-button.test.ts pattern (D decision)
- [Phase 43-confirmation-flow]: parseCommand strips non-word chars before matching — handles "cancel!" and "SEND" without extra branches
- [Phase 43-confirmation-flow]: "send" delivers to client phone if found; non-fatal catch on WhatsApp send failure so owner always gets the share link regardless
- [Phase 43-confirmation-flow]: pg_cron purge runs at */10 (safety net); Vercel cron runs at */5 (primary — sends expiry notifications before pg_cron deletes rows)
- [Phase 43-confirmation-flow]: handler.ts mocks processConfirmationReply in tests — handler unit tests only verify routing, confirm.test.ts owns the command logic
- [Phase 44-outbound-client-delivery]: confirm.ts loads company_whatsapp.delivery_format + companies.name in the same Promise.all as estimate + project — single round-trip
- [Phase 44-outbound-client-delivery]: formatted_text path passes full estimate (sections+items) to formatEstimateForWhatsApp; share_link path only needs share_token — both share the same estimate query (superset select)
- [Phase 44-outbound-client-delivery]: delivery_format defaults to 'share_link' when company_whatsapp row has no config or query fails — safe fallback, no crash
- [Phase 45-settings-ui-admin-token]: meta_whatsapp added to IntegrationProvider union, integrationKeySchema enum, and PROVIDERS array in admin page
- [Phase 45-settings-ui-admin-token]: testIntegrationKey meta_whatsapp case hits graph.facebook.com/v21.0/me with Bearer token — returns token owner name on success
- [Phase 45-settings-ui-admin-token]: getAuthContext in whatsapp-settings.ts uses explicit discriminated union return type (AuthSuccess | AuthFailure) to avoid TypeScript 'in' narrowing pitfall with string | undefined
- [Phase 45-settings-ui-admin-token]: WhatsAppConnectCard uses local useState(initial) for optimistic UI — connect/disconnect update local state immediately without waiting for router.refresh()
- [Phase 45-settings-ui-admin-token]: connectWhatsApp upserts on company_id conflict (onConflict: 'company_id') — allows re-configuration without delete-then-insert
- [Phase 45-settings-ui-admin-token]: Buffer→Uint8Array cast in handler.ts Whisper FormData fixed (tsc was clean but not for SharedArrayBuffer compatibility)
- [Phase 53-pdf-attachment-delivery]: supabase injected by caller in pdf-delivery.ts — not created internally; consistent with Phase 41 webhook context pattern
- [Phase 53-pdf-attachment-delivery]: 86400s signed URL TTL for WhatsApp PDF delivery; timestamp-suffix in storage path prevents Meta URL cache reuse
- [Phase 53-pdf-attachment-delivery]: Space-first sanitization in buildPdfFilename: spaces→hyphens before stripping non-alphanumeric so OBrien & Sons → OBrien--Sons
- [Phase 53-pdf-attachment-delivery]: pdfDelivered boolean flag separates PDF success from fallback path — avoids re-querying state after try/catch
- [Phase 53-pdf-attachment-delivery]: pdf_attachment branch is an if/else with existing two formats — keeps existing behavior untouched and fallback structurally separate
- [Phase 53-pdf-attachment-delivery]: WhatsAppStatus.deliveryFormat type extended inline (not a separate DeliveryFormat alias) — consistent with existing component pattern
- [Phase 54-whatsapp-status-flow]: StatusBadge pattern: collocated helper function + LABELS map above component for clean inline badge rendering without export
- [Phase 54-whatsapp-status-flow]: onUpdateStatus optimistic pattern: setCurrent before server confirmation, toast on both success and error paths
- [v3.0 monetization]: Per-company flat pricing (not per-seat) — matches current 1:1 user→company model
- [v3.0 monetization]: checkQuota() before AI call → recordUsage() after success only (never charge for failed calls)
- [v3.0 monetization]: recordUsage() deduplicates by idempotency key (WhatsApp: message_id; web: request_id)
- [v3.0 monetization]: WhatsApp entitlement checked BEFORE first Meta download — not after Whisper; free tier with whatsappEnabled:false pays nothing
- [v3.0 monetization]: Existing estimates after downgrade remain read-only forever (good UX — share links never break)
- [v3.0 monetization]: Redis (Phase 47) used for hourly rate limiting; tier limits handled via usage_events
- [v3.0 monetization]: Stripe for US-first SaaS billing; USD-only for v3.0 (BRL deferred to LatAm expansion)
- [v3.0 monetization]: Admin granularity is hybrid — force tier (coarse) + bonus credits (fine)
- [v3.0 monetization]: HTTP 402 for quota-exceeded responses (not 403) per REQUIREMENTS.md key decisions
- [Phase 55-schema-tier-definitions]: Use null (not Infinity) for unlimited tier quotas — JSON.stringify(Infinity) === null silently
- [Phase 55-schema-tier-definitions]: TEXT + CHECK for companies.tier (no Postgres enum — D-07/D-08 pattern); deny-all RLS on usage_events (service role writes only)
- [Phase 55-schema-tier-definitions]: tier_trial_ends_at spread via {...row, tier_trial_ends_at} in INSERT — keeps shared row clean, trial-start field stays INSERT-only
- [Phase 55-schema-tier-definitions]: getCompanyTier() focused query (id, tier, tier_trial_ends_at) — not select('*') anti-pattern, for Phase 56/57 quota checks
- [Phase 56-usage-tracking]: checkQuota queries companies by id directly (not via getCompanyTier) — avoids userId lookup in pure library layer
- [Phase 56-usage-tracking]: photo_batch and audio_minutes return { allowed: true, remaining: null } in Phase 56 — per-estimate enforcement deferred to Phase 57
- [Phase 56-usage-tracking]: Partial unique index (WHERE idempotency_key IS NOT NULL) allows multiple NULL rows while enforcing uniqueness for non-null keys
- [Phase 57-enforcement-layer]: requestId generated at handler top via crypto.randomUUID() — available only in success path, never in catch block
- [Phase 57-enforcement-layer]: Authenticated supabase client (not service role) used for checkQuota/recordUsage in web routes — companyId scoping via RLS is sufficient
- [Phase 57-enforcement-layer]: Entitlement gate in processInboundMessages queries companies.tier before any message dispatch — blocks free-tier WhatsApp before Whisper/Vision costs
- [Phase 58-stripe-integration]: stripe@22.1.1 API version is 2026-04-22.dahlia (not 2025-04-30.basil as planned — auto-fixed)
- [Phase 58-stripe-integration]: getStripeClient() per-request factory follows ADMIN-06 — no module-level Stripe instance
- [Phase 58-stripe-integration]: checkout/portal routes use supabase.auth.getClaims() pattern (established codebase convention)
- [Phase 58-stripe-integration]: invoice.paid subscription ID extracted via legacy field cast + parent.subscription_details fallback (Stripe API 2026-04-22 moved subscription to nested structure)
- [Phase 58-stripe-integration]: invoice.payment_failed makes zero DB writes — Stripe dunning handles retries; customer.subscription.deleted triggers tier=free downgrade
- [Phase 59-billing-ui]: TrialBanner is a server component (no use client) accepting daysRemaining prop — layout server component does inline Supabase query for tier + tier_trial_ends_at only to keep layout fast
- [Phase 59-billing-ui]: UpgradeModal uses window.fetch monkey-patch returning null — invisible effect-only component intercepts 402 from AI routes without modifying call sites
- [Phase 59-billing-ui]: billingRow added to existing Promise.all in layout.tsx — branding + adminRow + billingRow all fetched concurrently, no sequential blocking
- [Phase 60-trial-automation-admin-tooling]: pg_cron trial-warning-emails entry is SELECT 1 no-op — Resend API requires Node.js runtime unavailable in pg_cron; only expire-trials has a real pg_cron SQL implementation
- [Phase 66]: Storage abstraction: createStorage(client) factory per-call-site (no singleton) — caller owns auth context (server/browser/service-role)
- [Phase 66]: getSignedUrl(bucket, path, expiresInSeconds) requires explicit expiry — no implicit default that hides expiry behavior (STORAGE-04)
- [Phase 66-storage-abstraction-layer]: Plan 02: Migrated 10 additional discovered call sites inline (Rule 3) — the 8 in plan + 10 discovered = 18 production files; STORAGE-03 grep gate is binding so splitting was not viable
- [Phase 66-storage-abstraction-layer]: Plan 02: StorageProvider.UploadOptions intentionally restricted to contentType + upsert — dropped cacheControl: '3600' from logo uploads to keep abstraction storage-agnostic (Hetzner/S3 don't have a uniform cacheControl shape)
- [Phase 66-storage-abstraction-layer]: S3 PutObject does not enforce upsert: false — documented as known behavioral diff (callers either use timestamped keys or want overwrite)
- [Phase 66-storage-abstraction-layer]: Lazy require for S3 provider inside getServerStorage() — keeps AWS SDK off cold-start path while STORAGE_PROVIDER unset (Supabase remains default)
- [Phase 66-storage-abstraction-layer]: MinIO smoke executed against in-process pure-Node S3 mock (Docker unavailable in dev env) — real @aws-sdk/client-s3 over real socket, functionally equivalent for the 4 ops we use
- [Phase 67-inngest-background-ai-jobs]: [Phase 67-01]: Wave 0 RED stubs use bare expect.fail() rather than importing not-yet-existent production modules — keeps Wave 0 commit non-breaking and avoids module-resolution failures before implementation lands
- [Phase 67-inngest-background-ai-jobs]: [Phase 67-01]: describe() titles prefixed with INNGEST-XX requirement ID for grep-based traceability across waves
- [Phase 67-inngest-background-ai-jobs]: [Phase 67-01]: usage_events_idempotency partial UNIQUE index verified via Phase 56 migration source-of-truth (live psql skipped — .env.local target offline); no follow-up migration needed since the original is intact
- [Phase 67-inngest-background-ai-jobs]: AI routes are pure Inngest dispatchers — recordUsage moved out of routes into worker step.run('record-usage') (only fires on AI success)
- [Phase 67-inngest-background-ai-jobs]: /api/jobs/[jobId] server-side proxy with Bearer auth — browser never sees INNGEST_SIGNING_KEY; empty data[] maps to Running
- [Phase 67-inngest-background-ai-jobs]: transcribeRecording shape changed from { transcript } to { jobId }; capture-recorder.tsx shim with TODO(67-05) for polling rewire
- [Phase 67-inngest-background-ai-jobs]: Lazy await-import of inngest client inside processInboundMessages — keeps handler import graph slim and decouples future Inngest function additions from the webhook hot path
- [Phase 67-inngest-background-ai-jobs]: Pre-flight (entitlements + draft project insert) stays in handler.ts; only AI work moves to Inngest — guarantees free-tier rejection is synchronous and avoids orphan drafts from worker races
- [Phase 67]: useJobStatus hook + standalone pollJob helper exported from hooks/use-job-status.ts — React vs imperative consumers
- [Phase 67]: Stage progression: setStage('analyzing') BEFORE dispatch, setStage('generating') AFTER receiving { jobId } — visible distinction between dispatch wait and worker execution
- [Phase 68]: Deploy artifacts use multi-stage Node 22 alpine Dockerfile + Caddy reverse proxy on Hetzner Cloud VPS — Next.js standalone output keeps runtime image at 150-300 MB target
- [Phase 68]: Health endpoint contract: { ok, db, storage, commit, error? } — 503 on probe failure, errorMessage() helper to handle PostgrestError plain-object shape (not Error subclass)
- [Phase 68]: Storage probe via getServerStorage().list('logos','') (Phase 66 abstraction) — never raw supabase.storage.from; works for both STORAGE_PROVIDER=supabase and =s3 backends
- [Phase 70]: Stateless HMAC-signed OAuth state (no DB) chosen over DB-nonce for Stripe Connect — 10-min TTL keeps replay surface tight
- [Phase 70]: stripe_connect_client_id stored via existing platform_integrations AES-GCM path despite being non-secret — uniform admin UX wins over schema purity
- [Phase 70]: Callback IDEMPOTENCY: check stripe_account_id before exchangeCode to prevent OAuth-spec connection revocation on re-run (RESEARCH Pitfall 3)
- [Phase 70]: Callback always redirects (302/307) with ?error=... query — never returns 4xx — so user lands on /settings/payments with a banner
- [Phase 70]: Disconnect preserves stripe_account_email + stripe_account_display_name as audit trail (clears only account_id + status)
- [Phase 70]: Pay Now flow: per-request stripeAccount + Direct Charges + omitted application_fee_amount (Pitfall 2) + URL-driven banners (Plan 70-03)
- [Phase 70]: Plan 70-04: Connect handler extracted to lib/billing/connect-webhook.ts (vs inlined); plain-text emails for ship-fast; Promise.allSettled wrapper + never-throw email helpers so webhook never 5xx's on Resend outages
- [Phase 70]: Snapshot baselines minted by CI on first run with --update-snapshots, not committed from laptop (font/AA differences)
- [Phase 70]: Dashboard Paid pill on project rows (not estimate rows) — joins is_current estimate into projects query to avoid N+1
- [Phase 70]: Owner runbook expanded from 6 to 8 sections — explicit migration apply + 9-row troubleshooting table
- [Phase 71]: Inter font retained (overrides SEED's Geist suggestion per RESEARCH G1)
- [Phase 71]: Brand gradient uses hsl(var(--primary)) for tenant white-label cascade
- [Phase 71]: Glow shadows namespaced --glow-* (not --shadow-*) to avoid Tailwind v4 wildcard collision
- [Phase 71]: Card gets CVA from scratch (RESEARCH G3) — chose this over parallel <GlassCard> wrapper so hundreds of existing call sites stay untouched via backward-compat default variant
- [Phase 71]: Input/Textarea focus migrated from --focus-shadow to gradient-brand glow (shadow-glow-brand)
- [Phase 71]: 71-04: AuthCard switched from ad-hoc bg-black/40 to Card variant=glass primitive (single source of truth via 71-02)
- [Phase 71]: Plan 71-07: removed per-trigger after:hidden override that was hiding the gradient tab indicator from 71-02
- [Phase 72-admin-menu-performance]: getUserById batched by unique updated_by Set in loadCategoryInitials — 1-2 API calls instead of N per integration row
- [Phase 72-admin-menu-performance]: listUsers(perPage:1000) replaced with Promise.all getUserById per platform_admins row — research confirmed table has 1-5 rows, paginated listUsers adds complexity with zero perf benefit
- [Phase 72-admin-menu-performance]: loading.tsx at every admin route segment + animate-pulse/glass-bg skeletons for streaming without blank flash
- [Phase 72-admin-menu-performance]: ISR revalidate=60 for stable admin pages (dashboard/branding/seo/landing); force-dynamic kept for billing/blog/admins
- [Phase 72-admin-menu-performance]: getCachedBranding = cache(getBranding) added as new export; original getBranding preserved for non-layout callers
- [Phase 72-admin-menu-performance]: Admin layout Suspense has no explicit fallback — loading.tsx (Plan 01) serves as App Router automatic fallback
- [Phase 72-admin-menu-performance]: brandingPromise starts immediately after getAuthClaims resolves; getBranding has no dependency on company data
- [Phase 73-language-onboarding-estimate-language-ui]: resolveEstimateLanguageWithSource used with userAppLanguage only in EstimateTab — company/client layers need props not yet available as props (TODO LANG-ONBOARD-03)
- [Phase 73-language-onboarding-estimate-language-ui]: LANG_INDICATOR uses plain text (EN/PT/ES) not emoji flags — react-pdf emoji rendering is unreliable cross-platform; CURRENCY_CODE map added with BRL for PT (was missing from 73-02 implementation)

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
| Phase 11-marketing-landing-page P01 | 9min | 2 tasks | 11 files |
| Phase 11-marketing-landing-page P02 | 6min | 2 tasks | 6 files |
| Phase 12-i18n-translation-system P01 | 5min | 2 tasks | 6 files |
| Phase 12-i18n-translation-system P02 | 7min | 2 tasks | 4 files |
| Phase 12-i18n-translation-system P03 | 12min | 1 task | 2 files |
| Phase 12-i18n-translation-system P04 | 6min | 2 tasks | 7 files |
| Phase 12-i18n-translation-system P05 | 16min | 3 tasks | 8 files |
| Phase 13-visual-identity-polish-robust-favicon-and-app-icons-across-all-surfaces P01 | 6min | 2 tasks | 8 files |
| Phase 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state P01 | 12min | 2 tasks | 15 files |
| Phase 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state P02 | 11min | 2 tasks | 4 files |
| Phase 14-auth-system-hardening-fix-url-routing-inconsistency-redirect-bugs-error-handling-and-oauth-loading-state P03 | 14min | 2 tasks | 11 files |
| Phase 15-owner-admin-panel P01 | 5min | 3 tasks | 11 files |
| Phase 15-owner-admin-panel P05 | 5min | 10 tasks | 13 files |
| Phase 15-owner-admin-panel P02 | 11min | 2 tasks | 4 files |
| Phase 15-owner-admin-panel P04 | 11min | 9 tasks | 10 files |
| Phase 15-owner-admin-panel P03 | 13min | 2 tasks | 8 files |
| Phase 16 P01 | 8 | 2 tasks | 4 files |
| Phase 16 P02 | 8 | 2 tasks | 2 files |
| Phase 16-sidebar-projects-panel P03 | 2min | 2 tasks | 2 files |
| Phase 17 P01 | 2m | 4 tasks | 4 files |
| Phase 17-navigation-performance P03 | 3min | 4 tasks | 4 files |
| Phase 17-navigation-performance P02 | spread | 11 tasks | 8 files |
| Phase 18-voice-first-project-onboarding P01 | 11min | 3 tasks | 20 files |
| Phase 18-voice-first-project-onboarding P03 | 9min | 3 tasks | 13 files |
| Phase 19-price-book-db-foundation P01 | 11min | 2 tasks | 2 files |
| Phase 19-price-book-db-foundation P02 | 19min | 2 tasks | 2 files |
| Phase 20-price-book-crud-ui P01 | 2min | 2 tasks | 5 files |
| Phase 20-price-book-crud-ui P03 | 3min | 2 tasks | 3 files |
| Phase 21-csv-import P01 | 4min | 3 tasks | 8 files |
| Phase 21-csv-import P02 | 7min | 3 tasks | 6 files |
| Phase 21-csv-import P03 | 11min | 3 tasks | 4 files |
| Phase 22-ai-price-anchoring P01 | 12min | 2 tasks | 13 files |
| Phase 22-ai-price-anchoring P02 | 6min | 3 tasks | 13 files |
| Phase 22-ai-price-anchoring P03 | 13min | 2 tasks | 5 files |
| Phase 23-estimate-editor-price-badges P01 | 3min | 2 tasks | 3 files |
| Phase 23-estimate-editor-price-badges P02 | 12min | 2 tasks | 5 files |
| Phase 24-estimate-template-engine-settings-page P01 | 13min | 2 tasks | 5 files |
| Phase 24-estimate-template-engine-settings-page P02 | 8min | 2 tasks | 3 files |
| Phase 24-estimate-template-engine-settings-page P03 | 2min | 2 tasks | 3 files |
| Phase 24-estimate-template-engine-settings-page P03 | 4min | 3 tasks | 3 files |
| Phase 25-plain-text-tab-copy-ui P01 | 3min | 2 tasks | 2 files |
| Phase 25-plain-text-tab-copy-ui P02 | 39min | 2 tasks | 4 files |
| Phase 26-bulk-price-adjustment P02 | 4min | 2 tasks | 4 files |
| Phase 27-capture-schema-migration P01 | 3 | 2 tasks | 7 files |
| Phase 28 P01 | 8 | 3 tasks | 3 files |
| Phase 29 P01 | 8 | 3 tasks | 8 files |
| Phase 31 P01 | 1 | 5 tasks | 5 files |
| Phase 35-text-refinement P01 | 2 | 4 tasks | 3 files |
| Phase 36 P01 | 145 | 3 tasks | 4 files |
| Phase 37 P01 | 3 | 2 tasks | 2 files |
| Phase 38-custom-domain-db-settings-ui P01 | 20min | 3 tasks | 7 files |
| Phase 38-custom-domain-db-settings-ui P02 | 5min | 2 tasks | 3 files |
| Phase 38-custom-domain-db-settings-ui P02 | 5min | 3 tasks | 3 files |
| Phase 39-subdomain-routing-white-label P01 | 8min | 5 tasks | 4 files |
| Phase 40-webhook-infrastructure P01 | 4min | 2 tasks | 7 files |
| Phase 40-webhook-infrastructure P02 | 3 | 2 tasks | 3 files |
| Phase 41-generate-estimate-service-extraction P01 | 10min | 4 tasks | 5 files |
| Phase 42-inbound-processing P01 | 12min | 4 tasks | 5 files |
| Phase 43-confirmation-flow P01 | 8min | 2 tasks | 3 files |
| Phase 43-confirmation-flow P02 | 5min | 3 tasks | 4 files |
| Phase 44-outbound-client-delivery P01 | 8min | 5 tasks | 5 files |
| Phase 53-pdf-attachment-delivery P01 | 9min | 3 tasks | 3 files |
| Phase 53-pdf-attachment-delivery P02 | 7min | 2 tasks | 3 files |
| Phase 54-whatsapp-status-flow P02 | 10min | 2 tasks | 2 files |
| Phase 55-schema-tier-definitions P01 | 3 | 3 tasks | 4 files |
| Phase 55-schema-tier-definitions P02 | 10min | 3 tasks | 3 files |
| Phase 56-usage-tracking P01 | 6min | 3 tasks | 3 files |
| Phase 57-enforcement-layer P01 | 8min | 3 tasks | 4 files |
| Phase 57-enforcement-layer P02 | 8min | 2 tasks | 2 files |
| Phase 58-stripe-integration P01 | 5min | 3 tasks | 11 files |
| Phase 58-stripe-integration P02 | 25 | 2 tasks | 4 files |
| Phase 59-billing-ui P02 | 3 | 2 tasks | 6 files |
| Phase 60-trial-automation-admin-tooling P01 | 2min | 2 tasks | 4 files |
| Phase 66 P01 | 7m | 3 tasks | 7 files |
| Phase 66-storage-abstraction-layer P02 | 22min | 3 tasks | 21 files |
| Phase 66-storage-abstraction-layer P03 | 11min | 3 tasks | 5 files |
| Phase 67-inngest-background-ai-jobs P01 | 30min | 1 tasks | 16 files |
| Phase 67-inngest-background-ai-jobs P03 | 8 | 3 tasks | 13 files |
| Phase 67-inngest-background-ai-jobs P04 | 3 | 1 tasks | 3 files |
| Phase 67 P05 | 6m | 3 tasks | 6 files |
| Phase 68 P01 | 7min | 3 tasks | 6 files |
| Phase 68 P02 | 4min | 2 tasks | 3 files |
| Phase 70 P01 | 35 min | 3 tasks | 14 files |
| Phase 70 P02 | 6 min | 3 tasks | 9 files |
| Phase 70 P03 | 7 min | 3 tasks | 10 files |
| Phase 70 P04 | 4min | 2 tasks | 4 files |
| Phase 70 P05 | ~8 min | 3 tasks | 7 files |
| Phase 71 P01 | 326 | 4 tasks | 8 files |
| Phase 71 P02 | 716 | 4 tasks | 16 files |
| Phase 71 P03 | 360 | 4 tasks | 8 files |
| Phase 71 P04 | 480 | 4 tasks | 12 files |
| Phase 71 P06 | 1320 | 4 tasks | 12 files |
| Phase 71 P08 | 480 | 3 tasks | 5 files |
| Phase 71 P07 | 228 | 4 tasks | 13 files |
| Phase 71 P10 | 660 | 5 tasks | 27 files |
| Phase 72-admin-menu-performance P03 | 2min | 2 tasks | 2 files |
| Phase 72-admin-menu-performance P01 | 4min | 2 tasks | 14 files |
| Phase 72-admin-menu-performance P02 | 2.5min | 3 tasks | 3 files |
| Phase 73-language-onboarding-estimate-language-ui P03 | 5 | 1 tasks | 1 files |
| Phase 73-language-onboarding-estimate-language-ui P05 | 2min | 1 tasks | 1 files |

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-13)

**Core value:** Business owner → job site audio recording → sent professional estimate in under 5 minutes
**Current focus:** Phase 72 — Admin Menu Performance — Instant Navigation

## Notes

Project initialized from comprehensive spec on 2026-04-09.
v1.0: 8 phases, 32 plans, 151+ commits. v1.1: Phase 9, 8 plans, 38 commits. YOLO mode, standard granularity.
v1.2: 3 phases (10-12), 16 requirements. Seeds: SEED-001 (i18n EN/PT-BR/ES), SEED-002 (brand identity → v1.2), SEED-003 (price book → v1.3), SEED-004 (plain-text estimate → v1.4), SEED-005 (multi-modal input → v1.5/v1.6), SEED-006 (iterative refinement → v1.8), SEED-007 (frictionless client → v1.5/v1.7). SEED-009 (custom domain → v1.9 — active).
v1.3: 5 phases (19-23), 12 requirements. Price book DB + CRUD UI + CSV import + AI anchoring + editor badges.
v1.4: 3 phases (24-26), 8 requirements. Estimate template engine + settings page + plain text tab + copy UI + bulk price adjustment.
v1.5: 4 phases (27-30), 8 requirements. Capture schema migration + unified capture screen + frictionless project creation + AI client extraction.
v1.6: 3 phases (31-33), 13 requirements. Wizard modality selection + text input route + photos input route (SEED-005).
v1.7: Phase 34 (completed 2026-05-09). SEED-007 Client-Project Quick Actions verification.
v1.8: Phases 35-37 (completed 2026-05-09). SEED-006 Iterative Estimate Refinement — text/voice/photo refinement panel in estimate editor.
v1.9: Phases 38-39 (started 2026-05-10). SEED-009 Custom Domain Support — per-company domain configuration + subdomain routing + white-label estimate view.
v2.0: Phases 40-45 (shipped 2026-05-10). SEED-008 WhatsApp Estimate Channel MVP.
v2.1: Phases 46-52 (shipped 2026-05-11). WhatsApp Launch-Readiness — 7 phases, typed errors, Redis rate limiting, debounce, typing indicators, OTP verification, pre-send edit commands, per-estimate language selection.
v2.2: Phases 53-54 (shipped 2026-05-13). WhatsApp Channel Polish — PDF attachment delivery (Gap 3) + real status flow (Gap 5).
v3.0: Phases 55-60 (shipped 2026-05-14). Monetization — SEED-013 harvested. 24 requirements: tier schema + entitlements, usage tracking, enforcement, Stripe billing, billing UI, trial automation + admin tooling.
v3.1: Phases 61-65 (started 2026-05-15). Production Go-Live — 27 requirements across 5 phases: production DB foundation, Vercel deploy + custom domain, Stripe live mode, monitoring + backup + resilience, end-to-end UAT + bug triage. Unblocks first paying customer.

## Accumulated Context

### Roadmap Evolution

- Phase 8 added: Platform admin panel — scope covers centralized API integrations (Resend/Anthropic/OpenAI) AND global branding (app name, logo, theme). Removes all hardcoded "Xtimator" strings and process.env key coupling; replaces with DB-backed config fetched via server-side loader. Drives v1.1.
- v1.2 phases 10-12: Brand tokens (BRAND-01–03) → Landing page (LAND-01–05) → i18n system (I18N-01–08). Ordering constraint: landing page must exist before i18n so translations layer on top of real UI strings.
- Phase 13 added: Visual identity polish — robust favicon and app icons across all surfaces (.ico legacy, icon.svg with light/dark, icon.png fallback, apple-icon.png, web manifest, no public/ vs app/ conflict, no manual <link> in head)
- Phase 14 added: Auth system hardening. Root cause: route group `app/(auth)/` is silent in URL (parens), but 32+ code sites use `/auth/login`, `/auth/signup`, `/auth/reset-password` — those URLs are 404s. Two conflicting URL conventions split across codebase (proxy.isPublicRoute, server actions, layout/page redirects, callback route, internal Links, Playwright + unit tests). Also covers: dead-code fallback redirect in signIn (auth.ts:59), updatePassword skipping company check (auth.ts:102), missing try/catch in callback getClaims and proxy updateSession, OAuth button loading-state never resets on failure/cancel, SELECT-then-INSERT race in createOrUpdateCompany.
- Phase 18 added: Voice-First Project Onboarding. Repositions the AI voice recorder as the centerpiece of new project creation. Wizard reduced to a single client-pick step; recorder becomes a full-screen primary surface (large timer, wide waveform, circular progress ring around mic). 10-minute hard cap optimized for Whisper + Claude (≤5MB upload, ~$0.06/recording, ≤2K transcript tokens) with neutral→amber→red timer escalation, 60s warning, auto-stop. Multi-stage progress stepper (Saving → Transcribing → Analyzing → Generating estimate) replaces the current tiny `Loader2` spinner, with the Whisper transcript revealed mid-flow. Estimate generation auto-fires post-transcript and lands the user in the editor with a populated draft. Escape hatch ("Skip recording") preserves manual-entry path. Closes UX gap identified during post-Phase-17 review: today the recorder is buried in an Audio tab and AI generation requires a manual click.
- v1.3 phases 19-23: DB foundation (Phase 19) → CRUD UI (Phase 20) → CSV import (Phase 21) → AI anchoring (Phase 22) → editor badges (Phase 23). Key constraint: price book is optional — companies without entries continue working as before (AIPRICE-02 covers fallback with no regression). Phase 22 depends on Phase 19 (needs price_source column) but NOT on Phase 20/21 (AI integration doesn't require UI to be built first). Phase 23 depends on Phase 22 (needs price_source data on estimate_items).
- v1.4 phases 24-26: Template engine + settings page (Phase 24) → Plain text tab + copy UI (Phase 25) → Bulk price adjustment (Phase 26). Key constraint: Phase 25 depends on Phase 24 (template engine must exist to drive text rendering). Phase 26 is independent of the plain-text phases — depends only on Phase 19-20 (price book infrastructure).
- v1.5 phases 27-30: Schema migration (Phase 27) → Unified capture screen (Phase 28) → Frictionless creation + client linking UI (Phase 29) → AI client extraction (Phase 30). Key constraint: Phase 27 is a hard prerequisite for everything — nullable storage_path enables text-only recordings, optional client_id enables client-less projects. Phase 28 depends on Phase 27. Phase 29 depends on Phase 27 (optional client_id) and is informed by Phase 28 but not blocked by it. Phase 30 is highest risk (AI adapter changes) and ships last, depending on Phase 28 (estimate generation must have run first).
- v1.6 phases 31-33 (SEED-005): Wizard modality selection (Phase 31) → Text input route /describe (Phase 32) → Photos input route /photos-input (Phase 33). Key constraint: Phase 27 (nullable storage_path) already enables text-only and photos-only recordings. Phase 31 adds the wizard selection UI and input_mode storage. Phases 32-33 are independent entry points that reuse the existing generate-estimate pipeline.
- v1.9 phases 38-39 (SEED-009): Domain config + settings UI (Phase 38) → Subdomain routing + white-label (Phase 39). Key constraint: Phase 38 must ship first — Phase 39 reads the custom_domain column that Phase 38 creates. DOMAIN-05 (no regression) is validated in Phase 38 by ensuring companies with no domain see no change. custom_domain goes on companies table (not platform_branding — that is platform-level config). proxy.ts hosts the subdomain detection (no middleware.ts exists).
- v2.2 phases 53-54 (SEED-015 Gaps 3 & 5): PDF attachment delivery (Phase 53) → WhatsApp status flow (Phase 54). Key constraint: Phase 53 touches confirm.ts delivery branching and adds pdf_attachment to delivery_format enum — complete that before Phase 54 also touches the same UI selector to add suspend/reactivate. Both phases build on Phase 50 (OTP verification) which established the pending→active transition. Phase 54 closes the status flow loop by wiring verified→active auto-promotion and adding the suspended state with admin controls.
- v3.0 phases 55-60 (SEED-013): Schema + tier definitions (Phase 55) → Usage tracking helpers (Phase 56) → Enforcement wiring (Phase 57) → Stripe integration (Phase 58) → Billing UI (Phase 59) → Trial automation + admin tooling (Phase 60). Key constraint: Phase 55 is a hard prerequisite for all others — tier columns and usage_events table must exist. Phase 56 builds the quota library; Phase 57 wires it to routes. Phase 58 is independent of 56-57 (depends only on Phase 55 tier columns). Phase 59 requires both Phase 57 (usage data) and Phase 58 (Stripe endpoints). Phase 60 depends on Phase 55 (tier columns) and Phase 58 (Stripe state) but not on Phase 59 UI.
- v3.1 phases 61-65 (Production Go-Live): Production DB foundation (Phase 61) → Vercel deploy + custom domain (Phase 62) → Stripe live mode activation (Phase 63) → Monitoring + backup + resilience (Phase 64) → Production UAT + bug triage (Phase 65). Hard dep order: Phase 61 (DB) before Phase 62 (deployed app needs DB). Phase 62 before Phase 63 (Stripe live webhook URL needs reachable production endpoint). Phase 64 depends on both 61 (health endpoint DB check) and 62 (Sentry/uptime point at deployed app). Phase 65 ships last — UAT only meaningful after all infra + payments are live. PROD-BACKUP grouped with PROD-MONITOR in Phase 64 because both are post-deploy ops concerns sharing the runbook surface.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-tqz | Add login event logging | 2026-04-22 | e5ba1c5 | [260421-tqz-add-login-event-logging](.planning/quick/260421-tqz-add-login-event-logging/) |
| 260422-o7y | Rename project from EstimateBuilder Pro to Xtimator | 2026-04-22 | bafcb2c | [260422-o7y-rename-project-from-estimatebuilder-pro-](.planning/quick/260422-o7y-rename-project-from-estimatebuilder-pro-/) |
| 260518-gf3 | Price book category optional (SEED-010) | 2026-05-18 | 59447d2 | [260518-gf3-price-book-optional-category](.planning/quick/260518-gf3-price-book-optional-category/) |
| 260518-gxy | Price book item photo (SEED-024) | 2026-05-18 | 3cacc15 | [260518-gxy-price-book-item-photo](.planning/quick/260518-gxy-price-book-item-photo/) |
| 260518-hkp | Price book category hierarchy — folders (SEED-025) | 2026-05-18 | 3a79b52 | [260518-hkp-price-book-category-hierarchy](.planning/quick/260518-hkp-price-book-category-hierarchy/) |
| 260518-v0z | Unify folder + category in price book (folder is sole taxonomy) | 2026-05-19 | 45f98d0 | [260518-v0z-unificar-folder-e-category-no-price-book](.planning/quick/260518-v0z-unificar-folder-e-category-no-price-book/) |
| 2026-05-18 | fast | Center auth card logo+wordmark | done |
| 2026-05-18 | fast | Restyle sidebar New Project as filled gradient, remove dashboard CTA | done |
