---
phase: 08-platform-admin-panel-for-centralized-api-integrations
plan: 05
subsystem: admin-ui

tags: [admin-panel, branding, react-hook-form, zod, scoped-dark-theme, live-preview, server-action, vitest, playwright]

# Dependency graph
requires:
  - phase: 08-platform-admin-panel-for-centralized-api-integrations
    provides: requireAdmin (08-03), getBranding/invalidatePlatformConfig (08-02), platform_branding singleton + platform-brand bucket (08-01), brandingSchema (08-04)
provides:
  - app/admin/branding/page.tsx (admin branding page)
  - app/admin/branding/actions.ts (saveBranding server action)
  - app/admin/branding/branding-editor.tsx (client form + lifted state for live preview)
  - app/admin/branding/branding-preview-card.tsx (scoped dark preview using --platform-primary)
affects:
  - 08-07 auth dark pass (consumers see updated app_name + logo + primary color via getBranding loader)
  - 08-08 rebrand sweep (admins can change branding from the UI rather than DB)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server action FormData -> safeParse(brandingSchema) -> service-role upload + upsert -> invalidatePlatformConfig + revalidatePath('/', 'layout')"
    - "Logo upload via Buffer.from(File.arrayBuffer()) -> svc.storage.from('platform-brand').upload(path, body, { upsert: true })"
    - "Live preview pattern: client wrapper holds form + logo objectURL state, watches RHF values, passes derived branding to scoped dark preview card"
    - "Scoped --platform-primary triplet: inline style='--platform-primary: H S% L%' on data-theme='dark-auth' wrapper renders accent without leaking outside the card"
    - "FormData logoFile normalisation: accept File only when size>0; treat 0-byte File and null identically"
    - "Editor consumes brandingSchema from @/lib/schemas/admin (Plan 04); test mocks the module to decouple wave timing"

key-files:
  created:
    - app/admin/branding/page.tsx
    - app/admin/branding/actions.ts
    - app/admin/branding/branding-editor.tsx
    - app/admin/branding/branding-preview-card.tsx
    - tests/unit/branding-actions.test.ts
    - tests/e2e/admin-branding.spec.ts
  modified: []

key-decisions:
  - "Inline brandingSchema mock in unit test (not import from @/lib/schemas/admin) so the test passes during parallel-wave execution before Plan 04 commits"
  - "logoFile normalisation in saveBranding: treat 0-byte File same as null; covers browser variance in empty <input type='file'> behaviour"
  - "Preview card wraps both mini-previews in a SINGLE data-theme='dark-auth' div with inline --platform-primary; admin nav mini gets a nested data-theme='admin-dark' but inherits the same primary triplet"
  - "Color picker + free-text hex Input pair (mirrors company-info-form.tsx:320-335 pattern) so admins can paste exact hex codes"
  - "revalidatePath('/', 'layout') after save so the auth/admin layout wordmark refreshes on the next request without waiting for the 60s cache TTL"
  - "Logo objectURL preview lives in BrandingEditor local state, not in RHF, so the LogoUploader's existing onFileSelect(file, preview) signature is preserved verbatim (D-11)"

patterns-established:
  - "Admin page triple: page.tsx (server, requireAdmin + load) -> editor.tsx (client, RHF + lifted state) -> preview-card.tsx (presentational, scoped theme)"
  - "Server action upload-then-upsert: build path with Date.now() suffix, upload with upsert:true, getPublicUrl, then upsert DB row with logo_url"

requirements-completed: [ADMIN-08]

# Metrics
duration: 5min
completed: 2026-04-21
---

# Phase 08 Plan 05: Branding Admin Page Summary

**`/admin/branding` lets a super-admin edit app_name + logo + primary_color + email_from_name with a live scoped-dark preview, persists via service-role upload to `platform-brand/` + upsert of `platform_branding.id=1`, and invalidates the loader cache so downstream pages pick up changes within one request.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-21T01:29:34Z
- **Completed:** 2026-04-21T01:34:01Z
- **Tasks:** 2 (both TDD)
- **Files created:** 6
- **Files modified:** 0
- **Test assertions:** 4 unit (all passing) + 1 e2e (skips cleanly without TEST_ADMIN_EMAIL)

## Accomplishments

- **`saveBranding` server action** — `requireAdmin()` -> safeParse(brandingSchema) -> conditional upload to `platform-brand` bucket via service-role -> upsert singleton `platform_branding.id=1` -> `invalidatePlatformConfig()` + `revalidatePath('/', 'layout')`. Returns `{ ok: true } | { ok: false, errors } | { ok: false, message }`.
- **`/admin/branding` page** — server component, `requireAdmin()` then `getBranding()`, renders `<h1>Branding</h1>` + description + `<BrandingEditor initial={...} />`. Copy verbatim from UI-SPEC §"Copywriting Contract /admin/branding".
- **`BrandingEditor` (client)** — react-hook-form + zodResolver(brandingSchema). 4-field form with shadcn `<Form>`. Reuses `components/onboarding/logo-uploader.tsx` verbatim (D-11). Color picker + free-text hex Input pair (D-12 pattern). Submit builds FormData, calls `saveBranding`, surfaces result via sonner toast.
- **`BrandingPreviewCard` (client)** — styled `<div>` (NOT iframe per UI-SPEC) with two mini previews: auth dark (200px tall, logo + wordmark + mock "Sign in" button) and admin nav (left-rail with three nav items, active item highlighted). Both wrapped in a SINGLE `data-theme="dark-auth"` div with `--platform-primary` set inline from `hexToHslTriplet(primaryColor)`.
- **Unit test (`tests/unit/branding-actions.test.ts`)** — 4 tests: happy path no-logo, happy path with logo + storage upload, schema violation, upload error. Mocks `requireAdmin`, `createServiceClient`, `invalidatePlatformConfig`, `next/cache`, AND a local copy of `brandingSchema` so the test never blocks on Plan 04.
- **E2E (`tests/e2e/admin-branding.spec.ts`)** — gated on `TEST_ADMIN_EMAIL` + `TEST_ADMIN_PASSWORD`. Logs in -> navigates to `/admin/branding` -> edits app_name -> clicks Save -> asserts toast -> reloads -> asserts persistence. Skips cleanly when env unset.

## Task Commits

1. **Task 1 RED — failing unit tests for saveBranding** — `d77c8ae` (test)
2. **Task 1 GREEN — saveBranding server action** — `b8c6ee9` (feat)
3. **Task 2 — branding page + editor + preview card + e2e spec** — `6657314` (feat)

TDD cycle followed for Task 1 (RED commit + GREEN commit). Task 2 combined the page tree + e2e because they're verified together as one user flow.

## Files Created/Modified

### Created

- `app/admin/branding/page.tsx` — server component, requireAdmin + getBranding loader, renders BrandingEditor
- `app/admin/branding/actions.ts` — `saveBranding(formData: FormData)` server action with service-role upload + upsert + cache invalidation
- `app/admin/branding/branding-editor.tsx` — client component, RHF + zodResolver(brandingSchema), lifted state for logo preview
- `app/admin/branding/branding-preview-card.tsx` — client component, scoped data-theme='dark-auth' preview with --platform-primary inline
- `tests/unit/branding-actions.test.ts` — 4 vitest assertions covering all branches of saveBranding
- `tests/e2e/admin-branding.spec.ts` — env-gated Playwright spec for round-trip persistence

### Modified

None.

## Decisions Made

- **Inline brandingSchema mock in unit tests.** Plan 04 owns `lib/schemas/admin.ts` and runs in parallel with this plan. The unit test mocks `@/lib/schemas/admin` with a local copy of `brandingSchema` (matching the contract documented in 08-04's `<interfaces>` block) so the test never depends on Plan 04 commit timing within the wave. Production code still imports from the real path, which resolves once the wave completes and Plan 04 has committed.
- **logoFile normalisation in `saveBranding`.** Browsers differ on what `formData.get('logoFile')` returns when the user hasn't picked a file: some return `null`, others return a 0-byte `File`. The action treats both identically via `rawLogo instanceof File && rawLogo.size > 0` before passing to the schema, so an empty submit never trips the upload branch.
- **Single shared `data-theme="dark-auth"` wrapper for both mini previews** — keeps `--platform-primary` consistent across the auth and admin previews even though the admin nav technically uses `[data-theme="admin-dark"]` in production. The CSS-var indirection (Plan 03 P-04) makes this safe: both selectors resolve to the same `--platform-primary` slot.
- **Logo objectURL preview lives in editor local state, not in RHF.** The reused `LogoUploader` from `components/onboarding/logo-uploader.tsx` already calls `URL.createObjectURL(file)` and passes both `file` and `objectUrl` to its `onFileSelect` prop. Keeping the preview URL outside RHF preserves the verbatim reuse mandate (D-11) without forking the component.
- **`revalidatePath('/', 'layout')` after save** — without this, the auth/admin layout would still display the old wordmark for up to 60s (the `getBranding` cache TTL). With it, the next request to any layout-served route refreshes immediately.
- **`export const dynamic = 'force-dynamic'` on the page** — `getBranding()` is server-only and depends on the singleton row that may have just been mutated by an action. Force-dynamic guarantees the page never gets statically prerendered with stale branding.

## Deviations from Plan

### Auto-fixed Issues

None — implementation followed the plan as written. The only judgment calls:

1. **Mocking `next/cache` in the unit test** (not in the plan, but required for the action to run under vitest where `revalidatePath` is otherwise undefined).
2. **Adding the local `brandingSchema` mock** (anticipated by the plan's note that Plan 04 may not have committed yet at the time this test runs in the same wave).

Both are scope-preserving — no behavioural change.

## Issues Encountered

- **Concurrent file additions in working tree from sibling parallel agents.** `git status` showed untracked files from Plan 04 (`app/admin/admins/*`, `app/admin/integrations/*`) and Plan 06 (`tests/e2e/admin-admins.spec.ts`, `tests/integration/platform-integrations.test.ts`) before I committed Task 2. Resolved by staging only my plan's files explicitly (no `git add .`).
- **TS compile of `app/admin/branding/actions.ts` and `branding-editor.tsx` will fail in isolation** because `lib/schemas/admin.ts` doesn't exist yet (owned by Plan 04). This is expected for parallel-wave execution and resolves once the orchestrator validates the wave end. Vitest doesn't trip on this because the test mocks the module.
- **Windows line-ending warnings (LF -> CRLF) on every commit** — cosmetic, no file corruption.

## User Setup Required

For the e2e test to run (instead of skip):

1. Bootstrap an admin per `supabase/ADMIN-BOOTSTRAP.md` (already done as part of Plan 01 setup).
2. In `.env.local` (or shell): set `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` matching that admin's auth credentials.
3. After running the e2e (which renames `app_name` to `Xtimator Test {timestamp}`), reset via Supabase SQL editor:
   ```sql
   UPDATE platform_branding SET app_name='Xtimator' WHERE id=1;
   ```

No new env vars or migrations introduced by this plan.

## Next Phase Readiness

- **Wave 3 sibling Plan 06 (admins page)** — same `requireAdmin` + service-role + `revalidatePath` pattern is ready to reuse.
- **Wave 4 Plan 07 (auth dark pass)** — once an admin saves a primary color via this page, `getBranding().primaryColor` carries it forward to `app/(auth)/layout.tsx`. Cache invalidation here means the auth layout sees the change on its next request rather than after a 60s TTL.
- **Wave 4 Plan 08 (rebrand sweep)** — every place currently rendering hardcoded "Xtimator" can swap to `(await getBranding()).appName`. Operators can now change that string from the UI; deploys are no longer required for rebrand.
- **Verifier hooks:** unit test runs in <2s; e2e runs in <10s when env-gated, instant skip otherwise. No flakey selectors (uses `input[name="appName"]` and `getByRole('button', { name: /save branding/i })`).

## Self-Check: PASSED

- `app/admin/branding/page.tsx` — FOUND (commit `6657314`)
- `app/admin/branding/actions.ts` — FOUND (commit `b8c6ee9`)
- `app/admin/branding/branding-editor.tsx` — FOUND (commit `6657314`)
- `app/admin/branding/branding-preview-card.tsx` — FOUND (commit `6657314`)
- `tests/unit/branding-actions.test.ts` — FOUND (commit `d77c8ae`); 4/4 tests pass
- `tests/e2e/admin-branding.spec.ts` — FOUND (commit `6657314`); 1 skipped (no env), exit 0
- Acceptance grep counts — all met:
  - `'use server'` in actions.ts (line 1) ✓
  - `requireAdmin` x2, `invalidatePlatformConfig` x2, `platform-brand` x2, `platform_branding` x1, `revalidatePath` x3 in actions.ts ✓
  - `'use client'` x1 in branding-editor.tsx ✓
  - `hexToHslTriplet` x2 in branding-preview-card.tsx ✓
  - `data-theme="dark-auth"|admin-dark"` x3 in branding-preview-card.tsx ✓
  - `LogoUploader` x2 in branding-editor.tsx ✓
  - `saveBranding` x2 in branding-editor.tsx ✓
  - `TEST_ADMIN_EMAIL` x3 in admin-branding.spec.ts ✓
- Commit `d77c8ae` — FOUND in git log (Task 1 RED)
- Commit `b8c6ee9` — FOUND in git log (Task 1 GREEN)
- Commit `6657314` — FOUND in git log (Task 2)

---
*Phase: 08-platform-admin-panel-for-centralized-api-integrations*
*Completed: 2026-04-21*
