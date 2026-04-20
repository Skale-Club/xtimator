---
phase: 08-platform-admin-panel-for-centralized-api-integrations
plan: 02
subsystem: infra

tags: [crypto, aes-256-gcm, platform-config, server-only, vitest, shadcn-theme]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: lib/supabase/service.ts (service-role client bypassing RLS)
provides:
  - lib/crypto/aes.ts (AES-256-GCM encrypt/decrypt with 12-byte IV + 16-byte auth tag)
  - lib/platform-config.ts (server-only loader — getBranding, getIntegrationKey, invalidatePlatformConfig)
  - lib/color.ts (hexToHslTriplet for shadcn CSS-var theme assignment)
  - Deterministic test encryption key fixture
  - server-only alias in vitest config so server-only modules are testable under jsdom
affects:
  - 08-03 admin-gate (consumes checkPlatformAdmin pattern — independent but parallel wave)
  - 08-04 admin UI (consumes getIntegrationKey, getBranding, invalidatePlatformConfig)
  - 08-05 usage migration (all process.env.*_API_KEY reads swap to getIntegrationKey)
  - 08-06 auth dark pass (consumes hexToHslTriplet + getBranding.primaryColor)
  - All future plans needing platform secrets at rest

# Tech tracking
tech-stack:
  added:
    - server-only@0.0.1 (marker package for Next.js server-module boundary)
  patterns:
    - "AES-256-GCM with fresh 12-byte random IV per encryption (prevents R-02 IV-reuse)"
    - "Module-scoped in-memory TTL cache (60s) on Vercel Fluid Compute warm instances"
    - "Null-safe Branding fallback ({appName:'Xtimator',...}) so pages never crash pre-seed (R-04)"
    - "Env-var fallback with one-time warn when DB integration row absent (D-16)"
    - "import 'server-only' as first line of every server-only lib module (R-01)"
    - "Static-analysis test walking app/** + components/** flagging 'use client' imports of server modules"
    - "vitest alias 'server-only' → empty stub to allow server-module unit tests under jsdom"

key-files:
  created:
    - lib/crypto/aes.ts
    - lib/platform-config.ts
    - lib/color.ts
    - tests/fixtures/test-encryption-key.ts
    - tests/unit/crypto.aes.test.ts
    - tests/unit/color.test.ts
    - tests/unit/platform-config.test.ts
    - tests/unit/server-only-imports.test.ts
    - tests/unit/env-example.test.ts
  modified:
    - .env.example (APP_ENCRYPTION_KEY section + Phase 8 fallback notes on RESEND/ANTHROPIC/OPENAI)
    - vitest.config.ts (server-only alias)
    - package.json (server-only dependency)

key-decisions:
  - "vitest alias 'server-only' to node_modules/server-only/empty.js so server-only modules are testable under jsdom without throwing (Rule 3 blocking fix)"
  - "Integration keys cached per-provider in a Map with TTL 60s; branding cached in a single slot"
  - "Decrypt errors are caught and logged (null returned); never bubble to caller to avoid leaking internals to the UI"
  - "hexToHslTriplet returns null for malformed input (consumers branch + fall back) rather than throwing"
  - "Deterministic test key committed in tests/fixtures — safe by construction (never used in any prod environment)"

patterns-established:
  - "Server-only boundary: import 'server-only' first line + alias in vitest — enforces runtime + test parity"
  - "Dynamic import pattern in tests: `await import('@/lib/…')` inside each test after vi.resetModules() to re-evaluate module state when env changes"
  - "Supabase chain mock factory: makeClient({data,error}) returns {from,select,eq,single,maybeSingle} all chainable to one terminal vi.fn()"

requirements-completed: [ADMIN-04, ADMIN-05, ADMIN-13, ADMIN-14]

# Metrics
duration: 7min
completed: 2026-04-20
---

# Phase 08 Plan 02: Crypto + Platform Config Loader Summary

**AES-256-GCM crypto module, server-only platform-config loader with 60s TTL cache + null-safe Branding fallback + env-var deprecation path, hex→HSL color util, and 5-file Wave-0 test scaffold (26 passing assertions) — unblocks Waves 2+ in parallel with schema plan 08-01.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T13:15:00Z
- **Completed:** 2026-04-20T13:22:00Z
- **Tasks:** 2 (both TDD)
- **Files created:** 9
- **Files modified:** 3
- **Test assertions:** 26 passing (9 crypto, 5 color, 3 env-example, 8 platform-config, 1 server-only-imports)

## Accomplishments

- **`lib/crypto/aes.ts`** — canonical AES-256-GCM reference: fresh 12-byte IV per call (R-02 mitigation), 16-byte auth tag, actionable error messages ("generate with: openssl rand -base64 32"), server-only guard.
- **`lib/platform-config.ts`** — single loader exposing `getBranding()`, `getIntegrationKey(provider)`, `invalidatePlatformConfig()`. 60s TTL cache, null-safe Branding fallback (R-04), env-var fallback with one-time warn (D-16), decrypt-errors-swallowed-to-null (prevents UI leaks).
- **`lib/color.ts`** — hex → HSL triplet for shadcn CSS-var injection on the auth dark layout (used by 08-06).
- **Wave-0 test scaffold** — 5 unit test files covering every requirement this plan owns (ADMIN-04 / 05 / 13 / 14) plus a static-analysis guard that prevents any `'use client'` file from importing either server module.
- **`.env.example`** documents `APP_ENCRYPTION_KEY` with rotation command and marks RESEND / ANTHROPIC / OPENAI keys as Phase 8 local-dev fallbacks.

## Task Commits

1. **Task 1: AES crypto + hex→HSL + tests + fixture + .env.example entry** — `ac951c6` (feat, TDD RED+GREEN combined)
2. **Task 2: platform-config loader + tests + server-only guard** — `29cb085` (feat, TDD RED+GREEN combined)

Both tasks followed the TDD spec but the "write-then-run" cycle produced only GREEN-path commits because the AES module and loader were ported from verified reference implementations in `08-RESEARCH.md §Key Pattern 1` / `§Key Pattern 5`. Writing a failing test first and then copying the reference would have inverted the cycle for zero behavioural benefit.

## Files Created/Modified

### Created

- `lib/crypto/aes.ts` — server-only encrypt/decrypt + EncryptedBlob type
- `lib/platform-config.ts` — server-only getBranding / getIntegrationKey / invalidatePlatformConfig + Branding / IntegrationProvider types
- `lib/color.ts` — hexToHslTriplet (pure util, handles 3- and 6-digit hex, returns null for invalid)
- `tests/fixtures/test-encryption-key.ts` — deterministic 32-byte base64 key + setTestEncryptionKey()
- `tests/unit/crypto.aes.test.ts` — 9 assertions: shape, IV randomness, roundtrip over 4 inputs, ciphertext/auth-tag tamper, invalid IV/tag lengths, invalid key length with actionable message, missing env
- `tests/unit/color.test.ts` — 5 assertions: valid 6-digit, white, black, malformed → null, 3-digit shorthand expansion
- `tests/unit/platform-config.test.ts` — 8 assertions: DB-to-Branding mapping, cache-hit no-reinvoke, invalidate forces re-fetch, null-row fallback, decrypt roundtrip via real crypto, env-var fallback warn, null-when-unset, provider-key cache
- `tests/unit/server-only-imports.test.ts` — static scan over app/** + components/** for forbidden server-only imports in `'use client'` files
- `tests/unit/env-example.test.ts` — 3 assertions on `.env.example` contents

### Modified

- `.env.example` — new "Platform Admin (Phase 8)" section with APP_ENCRYPTION_KEY + rotation command; Phase 8 fallback notes appended to RESEND_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY
- `vitest.config.ts` — aliased `'server-only'` to `node_modules/server-only/empty.js` so server-only modules can be exercised in jsdom (the real package throws when imported outside React Server Components; Next's build aliases it identically)
- `package.json` + `bun.lock` — added `server-only@0.0.1`

## Decisions Made

- **vitest alias for `server-only`** (Rule 3 blocking fix) — without this, every crypto/loader test throws with "This module cannot be imported from a Client Component module." before the first assertion runs. The chosen alias mirrors Next.js's own `react-server` resolution and keeps tests exercising the real production code path modulo the marker.
- **Per-provider cache key** — `integrationCache` is a `Map<provider, …>` so evicting one provider's key doesn't invalidate the other two's.
- **Decrypt failures swallowed to `null`** — rather than throw to the caller. Callers already handle `null` (via the D-15 "feature not configured → 503" pattern from commit `3492264`). Bubbling a decrypt error would leak internals into logs shipped to clients.
- **Branding fallback cached** — the null-safe fallback is stored in the 60s TTL slot too, preventing a hot loop of failed DB fetches if the seed migration hasn't run yet (common on first deploy).
- **Deterministic test key in fixture (not .env.test)** — keeps the fixture self-contained and obvious; `setTestEncryptionKey()` is explicit at the top of each `beforeEach`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Install `server-only` package + alias in vitest**

- **Found during:** Task 1 first test run
- **Issue:** `import 'server-only'` in `lib/crypto/aes.ts` threw `This module cannot be imported from a Client Component module` under vitest's jsdom environment, causing all 9 crypto tests to fail at import time. The plan assumes `'server-only'` resolves transparently; in Next.js it does (Next's bundler aliases it), but vitest has no such alias and the package wasn't in `package.json`.
- **Fix:** (a) `bun add server-only` to make the package resolvable. (b) Added `'server-only': node_modules/server-only/empty.js` alias to `vitest.config.ts` → tests now load the no-op variant, identical to how Next serves `server-only` to React Server Components.
- **Files modified:** `package.json`, `bun.lock`, `vitest.config.ts`
- **Verification:** All 17 Task 1 tests + 9 Task 2 tests pass (26/26).
- **Committed in:** `ac951c6` (Task 1)

**2. [Rule 1 — Bug] Placeholder test key in plan decoded to 34 bytes, not 32**

- **Found during:** Task 1 (fixture creation)
- **Issue:** The plan's reference placeholder `'dGVzdC1rZXktMzItYnl0ZXMtZm9yLXRlc3Rpbmctb25seQ=='` is 44 base64 chars but decodes to **34 bytes** (the ASCII string "test-key-32-bytes-for-testing-only" is 34 chars long). AES-256 requires exactly 32 bytes — every test would have thrown `"must decode to 32 bytes… got 34"`. The plan flagged this risk and provided the regeneration command; I ran it.
- **Fix:** Generated a fresh 32-byte key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` → `ef0exbvvYVla+w6WJDY9k3H0s8pO5pAbGnTd1g7rGpc=` (44-char base64, exactly 32 bytes decoded).
- **Files modified:** `tests/fixtures/test-encryption-key.ts`
- **Verification:** `Buffer.from(TEST_ENCRYPTION_KEY, 'base64').length === 32` ✓; all encrypt/decrypt roundtrip tests pass.
- **Committed in:** `ac951c6` (Task 1)

---

**Total deviations:** 2 auto-fixed (1 blocking test-env issue, 1 bug in plan-provided fixture).
**Impact on plan:** Both deviations necessary for tests to run at all. No scope creep; plan's stated behaviour unchanged.

## Issues Encountered

- **Parallel executor race on `vitest.config.ts`** — plan 08-01 (running in parallel in the same wave) was simultaneously modifying `vitest.config.ts` to add `setupFiles: ['tests/setup/load-env.ts']` and extend `include` for `tests/integration/**`. My second edit re-read the file and merged cleanly (Edit tool's stale-file check saved the merge), and the final config includes both changes. No conflict in the git index.

## User Setup Required

**New env var introduced this plan:** `APP_ENCRYPTION_KEY`

In local dev:

```bash
# Generate and paste into .env.local
echo "APP_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env.local
# OR (if openssl not available):
echo "APP_ENCRYPTION_KEY=$(node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))')" >> .env.local
```

In Vercel prod (once Phase 8 is deployed): add `APP_ENCRYPTION_KEY` under Project Settings → Environment Variables (Production scope). Must decode to exactly 32 bytes — the loader will throw on boot with an actionable error if not.

Rotation procedure: documented in `supabase/ADMIN-BOOTSTRAP.md` (owned by plan 08-01).

## Next Phase Readiness

- **Wave 2 unblocked:** `getIntegrationKey` and `getBranding` exports are stable and tested. Plans 08-04 (admin UI) and 08-05 (usage migration) can `import { getIntegrationKey, getBranding, invalidatePlatformConfig } from '@/lib/platform-config'` without further work here.
- **Wave 2 unblocked for 08-06:** `hexToHslTriplet` consumable for auth-layout primary-color injection.
- **Integration tests (Wave 2+):** Integration test helpers (`tests/integration/platform-integrations.test.ts`) will use the same `TEST_ENCRYPTION_KEY` fixture this plan commits — one source of truth.
- **Nothing blocking on 08-01:** This plan's tests all mock the Supabase service client, so they run green without the `platform_*` tables existing yet. When 08-01 lands, the real `platform_integrations` schema (`ciphertext/iv/auth_tag` columns as BYTEA) matches the shape this loader reads.

## Self-Check: PASSED

- `lib/crypto/aes.ts` — FOUND
- `lib/platform-config.ts` — FOUND
- `lib/color.ts` — FOUND
- `tests/fixtures/test-encryption-key.ts` — FOUND
- `tests/unit/crypto.aes.test.ts` — FOUND (9 tests, all passing)
- `tests/unit/color.test.ts` — FOUND (5 tests, all passing)
- `tests/unit/platform-config.test.ts` — FOUND (8 tests, all passing)
- `tests/unit/server-only-imports.test.ts` — FOUND (1 test, passing)
- `tests/unit/env-example.test.ts` — FOUND (3 tests, all passing)
- `.env.example` — APP_ENCRYPTION_KEY present + "openssl rand -base64 32" rotation command present
- Commit `ac951c6` — FOUND in `git log --oneline`
- Commit `29cb085` — FOUND in `git log --oneline`
- Full test run `bunx vitest run tests/unit/crypto.aes.test.ts tests/unit/color.test.ts tests/unit/platform-config.test.ts tests/unit/server-only-imports.test.ts tests/unit/env-example.test.ts` → 26/26 passed

---
*Phase: 08-platform-admin-panel-for-centralized-api-integrations*
*Completed: 2026-04-20*
