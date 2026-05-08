# Milestones

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
