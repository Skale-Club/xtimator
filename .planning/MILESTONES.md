# Milestones

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
