# Milestones

## v4.5 Estimate Engine Robustness & Reliability Harness (Shipped: 2026-06-21)

**Phases completed:** 5 (99, 100, 101, 102, 103) · 19 plans · 99 commits · 163 files changed · +16,618/−476 LOC · full unit suite deterministic-green (250 files / 1732 tests, verified 3×)

**Key accomplishments:**

- **Unified error model + provider fallback (Phase 99)** — one typed `FailureReason` drives both the HTTP boundary (`XtimatorError`) and per-channel reply copy; one OpenRouter→Gemini fallback wrapper (`getAIProviderWithFallback`) every AI call path uses (generate, transcribe, vision, refine). The refine path, previously with no Gemini fallback, now inherits it.
- **Output guardrails (Phase 100)** — authoritative zod `estimateOutputSchema` (single-sourced via `z.infer`) with a bounded schema-retry at the provider-fallback seam (`invalid_output` on exhaustion); server-side price anchoring + out-of-bounds clamp; totals authority + `totals_discrepancy` signal; one correlation id (attemptId) across pipeline_events ↔ Langfuse ↔ Sentry (closed the pending OBS-03 stub).
- **Refine through the graph + modality unification (Phase 101)** — refine stops being a parallel re-implementation: it runs the shared graph INLINE (synchronous preview, passthrough StepRunner) reusing `ingestMultimodal`, the shared prompt builder (bespoke prompt deleted from all 3 adapters, closing an injection hole), the Phase-99 fallback and Phase-100 guardrails. Web/WhatsApp/MCP/refine share one audio+image+text path.
- **Resilience hardening (Phase 102)** — per-message WhatsApp batch reporting (a bad item is surfaced, not silently dropped); configurable auto-refine cap (`AUTO_REFINE_MAX_ATTEMPTS`, default 1) + a web `NeedsDetailsBanner` recourse for stuck-vague estimates; replay-safe session TTLs derived from a durable `requestedAt` (no `Date.now()` re-mint).
- **Eval harness + CI regression gate (Phase 103)** — 6 golden multimodal fixtures + deterministic mocked providers driving the REAL engine + a quality-metrics suite (reusing `isVagueEstimate` + `estimateOutputSchema`); a secret-free `.github/workflows/test.yml` running a scoped typecheck + the full unit/eval suite twice. Root-caused and fixed a flaky cross-file test-isolation problem (import-latency under vitest worker contention) so the gate is reliable — full suite now deterministic-green.

**Full archive:** [.planning/milestones/v4.5-ROADMAP.md](milestones/v4.5-ROADMAP.md) · [v4.5-REQUIREMENTS.md](milestones/v4.5-REQUIREMENTS.md) · [audit](v4.5-MILESTONE-AUDIT.md)

---

## v4.1 MCP Server (Shipped: 2026-05-26)

**Phases completed:** 5 (86, 87, 88, 89, 90) · 7 new test files (~152 assertions) · 118 MCP-specific tests green · 1 prod migration applied (`oauth_*` tables)

**Key accomplishments:**

- **OAuth 2.0 authorization server in production** — RFC 8414 + 9728 + 7591 compliant. PKCE S256. sha256-hashed token storage. Refresh-token rotation. Consent UI scoped to the active company via Phase 79's resolvers (Phase 86).
- **`/api/mcp` Streamable HTTP endpoint** — Bearer auth gated, CORS for Claude.ai origins, WWW-Authenticate re-discovery. Uses `@modelcontextprotocol/sdk@1.29` with the Web Standard transport (matches Next.js App Router) (Phase 87).
- **6 MCP tools with auto-grouped permission UI** — 4 read-only (`list_estimates`, `get_estimate`, `list_clients`, `list_projects`) + 2 write (`create_estimate` async returning `job_id`, `check_job_status`). Tool annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`) drive Claude.ai's auto-grouped "Always allow" UX (Phases 88 + 89).
- **Async pattern via existing Inngest** — `create_estimate` sends `EVENT_ESTIMATE_GENERATE`, returns Inngest event id as job_id; `check_job_status` reads runs from the existing job-status path. No parallel job pipeline (Phase 89).
- **Self-service connect UX** — `/settings/integrations/mcp` server-component page with copy-paste `claude mcp add ...` snippet + Claude.ai/Desktop/ChatGPT steps + active-company display so the user sees which tenant the consent binds to (Phase 90).

**Full archive:** [.planning/milestones/v4.1-ROADMAP.md](milestones/v4.1-ROADMAP.md)

---

## v4.0 Multi-Tenancy — Multiple Companies per User (Shipped: 2026-05-26)

**Phases completed:** 6 in scope (79, 81, 82, 83, 84, 85; Phase 80 ran in parallel and is bundled in the archive) · ~16 plan artifacts · 11 new test files · 98/98 tests green at close-out · 4 prod migrations applied

**Key accomplishments:**

- `company_members(user_id, company_id, role)` join table live in prod with idempotent backfill (1 owner per existing company) and `auth.uid()`-gated RLS — multi-tenancy backbone (Phase 79).
- Cookie-based active-company tracking (`active_company_id` httpOnly cookie, 30d rolling) + colocated server helpers `getActiveCompanyId()` / `getActiveCompany()` / `getMembershipCompanies()` (Phases 79 + 81).
- Switcher UI mounted in BOTH sidebar render trees with `useTransition` pending UX. "+ Add new company" routes to `/onboarding?mode=add` which threads `mode: 'add'` end-to-end into `createOrUpdateCompany` (Phase 81).
- 46 tenant-scoped RLS policies across 13 tables rewritten to gate by `company_members` instead of `companies.user_id` (Phase 82) — single idempotent migration with in-migration `RAISE EXCEPTION` assertion.
- 11 server-action files codemodded to derive `company_id` from the active cookie (Phase 83). 3 files allowlisted with documented rationale.
- Billing already per-company at the data layer since prior milestones — Phase 84 closed as investigation-only.
- `companies_*` RLS extended with `OR company_members` clause so multi-company users can SELECT/UPDATE/DELETE rows for every company they belong to (Phase 85). DROP COLUMN `companies.user_id` deferred to v5+.

**Full archive:** [.planning/milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md) · [.planning/milestones/v4.0-REQUIREMENTS.md](milestones/v4.0-REQUIREMENTS.md)

---

## v3.0 Monetization (Shipped: 2026-05-14)

**Phases completed:** 16 phases, 25 plans, 39 tasks

**Key accomplishments:**

- AI-detected client suggestions after estimate generation
- One-liner:
- Migration + entitlements module: 6 new companies columns, usage_events table with deny-all RLS, and null-safe tier definitions covering free/trial/pro/business — foundation for all v3.0 quota enforcement
- TypeScript tier types + 14-day trial INSERT logic + getCompanyTier() query — Phase 55 type system alignment complete
- Quota enforcement library (checkQuota + recordUsage) with idempotency deduplication — all 7 behaviors validated by unit tests passing without a live database.
- One-liner:
- stripe@22.1.1 SDK
- getBillingData() query using requireServiceClient for usage_events + /settings/billing server component showing plan card and usage meters
- Interactive billing controls — UpgradeButtons + ManageSubscriptionButton in /settings/billing, TrialBanner strip + UpgradeModal 402 interceptor wired into every authenticated page via app layout

---

## v1.5 Zero-friction Project Onboarding (Shipped: 2026-05-09)

**Phases completed:** 7 phases, 11 plans, 22 tasks

**Key accomplishments:**

- AI-detected client suggestions after estimate generation

---

## v1.3 Smart Pricing (Shipped: 2026-05-08)

**Phases completed:** 5 phases, 13 plans, 30 tasks

**Key accomplishments:**

- Supabase migration DDL for company_price_book with 4-policy RLS and estimate_items.price_source TEXT column, plus Wave 0 integration test stub
- TypeScript types regenerated from live Supabase schema (15 tables, including company_price_book + estimate_items.price_source), build passes, integration tests SC-1/SC-2/SC-3 green
- Commit:
- Commit:
- Commit:
- One-liner:
- One-liner:
- One-liner:
- Commit:
- Commit:
- Commit:
- One-liner:
- One-liner:

---

## v1.2 Brand Identity & Global Reach (Shipped: 2026-05-06)

**Phases completed:** 9 phases, 27 plans, 34 tasks

**Key accomplishments:**

- Translations DB table (BIGSERIAL PK, unique index, RLS) applied to Supabase + 23 failing stub tests across 5 files establishing the RED baseline for all I18N requirements
- One-liner:
- App Router-owned favicon, SVG/PNG app icons, manifest metadata, and auth-safe metadata routes locked by a fast regression suite.
- Human-verified icon smoke pass: browser tab favicon, direct metadata routes, and mobile install surfaces all render the blue X monogram with no duplicates or login redirects
- Password recovery, OAuth startup, and middleware claim checks now fail closed and recover gracefully instead of trapping users in dead redirects or crashing requests.
- Vitest and Playwright auth coverage now exercises the live /login, /signup, /reset-password, and /callback routes, with landing tests stabilized for framer-motion under jsdom.
- 1. [Rule 3 - Blocking] getCachedCompany cannot use cookie-based createClient
- Reduces the new-project wizard to a single client-select step with eager draft creation, adds a full-screen `/projects/[id]/capture` route group escaping the app shell, and scaffolds all 10 Phase 18 test files covering P18-01 through P18-09.
- One-liner:
- One-liner:

---

## v1.1 Dark-first UX & Modern Redesign (Shipped: 2026-04-22)

**Phases completed:** 9 phases, 40 plans, 53 tasks

**Key accomplishments:**

- Next.js 16 with TypeScript strict, Tailwind 4, 29 shadcn/ui (New York style) components, Supabase SSR deps, typed env vars (SEC-03), and vitest + Playwright test infrastructure wired and green
- One-liner:
- 9-table PostgreSQL schema with full RLS, company-scoped storage policies, and anon share-token access applied to live Supabase project
- Supabase auth UI with Google OAuth + email/password using shadcn/ui — login, signup, reset-password pages with callback route, server actions, and Playwright E2E tests
- Supabase migration creating platform_admins, platform_integrations, platform_branding tables + platform-brand storage bucket + last-admin trigger + seeded singleton branding + bootstrap SQL doc + integration tests. Every downstream Phase 8 plan depends on these tables and RLS semantics.
- AES-256-GCM crypto module, server-only platform-config loader with 60s TTL cache + null-safe Branding fallback + env-var deprecation path, hex→HSL color util, and 5-file Wave-0 test scaffold (26 passing assertions) — unblocks Waves 2+ in parallel with schema plan 08-01.
- 1. [Rule 3 — Blocking] Playwright Chromium binary not installed
- Shipped the dark-themed `/admin` shell (layout + left-rail nav + index redirect + shared zod schemas) and the first of three admin pages — `/admin/integrations` — with full save/delete/test server actions, masked key UI, inline test result, and a fix to `lib/platform-config.ts` that closes the BYTEA round-trip gap left by Plan 02. 18/18 unit + integration tests pass.
- `/admin/branding` lets a super-admin edit app_name + logo + primary_color + email_from_name with a live scoped-dark preview, persists via service-role upload to `platform-brand/` + upsert of `platform_branding.id=1`, and invalidates the loader cache so downstream pages pick up changes within one request.
- Platform admin CRUD with last-admin guard, trigger-error translation, TDD unit tests, and human-verified Wave-3 checkpoint across all three admin pages
- 1. [Rule 1 — Bug] Existing `tests/e2e/auth.spec.ts` asserts on legacy "Xtimator" literal
- All 5 provider-key env reads migrated to `getIntegrationKey()` with graceful 503/error responses on null; all 5 remaining "Xtimator" hardcoded strings replaced with `getBranding()` loader calls; two grep-assertion unit tests enforce future compliance; e2e auth assertion made env-driven via `APP_NAME_E2E`. Phase 8 is now feature-complete.
- Task 1 (commit `ed11146`)

---

## v1.0 MVP (Shipped: 2026-04-21)

**Phases completed:** 8 phases, 32 plans, 53 tasks

**Key accomplishments:**

- Next.js 16 with TypeScript strict, Tailwind 4, 29 shadcn/ui (New York style) components, Supabase SSR deps, typed env vars (SEC-03), and vitest + Playwright test infrastructure wired and green
- One-liner:
- 9-table PostgreSQL schema with full RLS, company-scoped storage policies, and anon share-token access applied to live Supabase project
- Supabase auth UI with Google OAuth + email/password using shadcn/ui — login, signup, reset-password pages with callback route, server actions, and Playwright E2E tests
- Supabase migration creating platform_admins, platform_integrations, platform_branding tables + platform-brand storage bucket + last-admin trigger + seeded singleton branding + bootstrap SQL doc + integration tests. Every downstream Phase 8 plan depends on these tables and RLS semantics.
- AES-256-GCM crypto module, server-only platform-config loader with 60s TTL cache + null-safe Branding fallback + env-var deprecation path, hex→HSL color util, and 5-file Wave-0 test scaffold (26 passing assertions) — unblocks Waves 2+ in parallel with schema plan 08-01.
- 1. [Rule 3 — Blocking] Playwright Chromium binary not installed
- Shipped the dark-themed `/admin` shell (layout + left-rail nav + index redirect + shared zod schemas) and the first of three admin pages — `/admin/integrations` — with full save/delete/test server actions, masked key UI, inline test result, and a fix to `lib/platform-config.ts` that closes the BYTEA round-trip gap left by Plan 02. 18/18 unit + integration tests pass.
- `/admin/branding` lets a super-admin edit app_name + logo + primary_color + email_from_name with a live scoped-dark preview, persists via service-role upload to `platform-brand/` + upsert of `platform_branding.id=1`, and invalidates the loader cache so downstream pages pick up changes within one request.
- Platform admin CRUD with last-admin guard, trigger-error translation, TDD unit tests, and human-verified Wave-3 checkpoint across all three admin pages
- 1. [Rule 1 — Bug] Existing `tests/e2e/auth.spec.ts` asserts on legacy "Xtimator" literal
- All 5 provider-key env reads migrated to `getIntegrationKey()` with graceful 503/error responses on null; all 5 remaining "Xtimator" hardcoded strings replaced with `getBranding()` loader calls; two grep-assertion unit tests enforce future compliance; e2e auth assertion made env-driven via `APP_NAME_E2E`. Phase 8 is now feature-complete.

---
