/**
 * Phase 188 Plan 01 — PROV-01: the ONE server-side storage provider seam.
 *
 * WHY THIS MODULE EXISTS:
 * Before this phase, `STORAGE_PROVIDER` was read inline inside
 * `lib/storage/index.ts`'s `getServerStorage()`, and only that function's 4
 * call sites (`app/api/health`, `lib/actions/admin-whatsapp.ts`,
 * `lib/estimate/adapters/whatsapp.ts` x2) honored it. The other ~19 server
 * call sites called `createStorage(client)` directly, which always returns
 * the Supabase provider regardless of the flag. Flipping
 * `STORAGE_PROVIDER=s3` therefore split the app in half: the WhatsApp
 * inbound-media adapter would write to R2 while every reader still read
 * Supabase — silent 404s on inbound media. This module is the fix: every
 * server-side storage decision now funnels through `serverStorageBackend()`,
 * and `lib/storage/index.ts` no longer makes that decision at all.
 *
 * SELECTION MATRIX (verbatim — see tests/unit/storage/server-provider.test.ts):
 *
 * | STORAGE_PROVIDER      | S3_* complete? | Result                                  |
 * |------------------------|-----------------|------------------------------------------|
 * | unset / unrecognized  | yes             | 'r2'                                    |
 * | unset / unrecognized  | no              | 'supabase'                              |
 * | 'supabase'             | yes             | 'supabase' (explicit kill switch wins)  |
 * | 'supabase'             | no              | 'supabase'                              |
 * | 's3'                   | yes             | 'r2'                                    |
 * | 's3'                   | no              | THROWS — names the missing var(s), never silently degrades |
 *
 * Only the exact strings `'s3'` and `'supabase'` are recognized values of
 * `STORAGE_PROVIDER`; anything else (unset, empty string, a typo) is
 * treated as unset and falls through to the S3_*-presence check.
 *
 * `serverStorage(client)` DROPS Supabase `storage.objects` RLS in R2 mode,
 * because an S3-compatible backend has no per-user policy layer of its own.
 * In Supabase mode the passed client's RLS still applies exactly as before.
 * Downstream call sites that pass a user-scoped client therefore rely on
 * their own app-level authorization once R2 is active — Plans 02/03 annotate
 * each one as they migrate.
 *
 * `lib/storage/asset-source.ts` DELIBERATELY DOES NOT use this module: its
 * Supabase read-through (PROXY-02) must stay pinned to Supabase in every
 * configuration, because it is the fallback that makes the whole v4.24
 * milestone reversible. Routing it through `serverStorage()` would turn the
 * fallback into a second R2 read and silently delete the reversibility
 * guarantee (pull the S3_* env vars, get Supabase, no code change).
 *
 * `lib/storage/s3-provider.ts` is proven working against R2 unmodified
 * (Phase 187 field verification) and MUST NOT be edited by this module or
 * any consumer of it.
 *
 * NO `import 'server-only'` IN THIS FILE: `scripts/storage-smoke.ts` imports
 * this module and runs under plain `tsx`, where `server-only` throws at
 * import time — the same reason `lib/storage/s3-config.ts` omits it. Server-
 * ness is enforced at runtime instead via `assertServer()`, called at the
 * top of every exported function. Plan 04 adds the static import-graph gate
 * that proves no client module reaches this file.
 *
 * NO CACHING / NO MODULE-LEVEL SINGLETON: every exported function
 * constructs its provider fresh on each call, exactly as the old
 * `getServerStorage()` did. A cached S3 client would survive env changes
 * between tests and would make the reversibility property untrue until a
 * process restart.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageProvider } from './index'
import { createStorage } from './index'
import { s3ConfigFromEnv } from './s3-config'

export type StorageBackend = 'r2' | 'supabase'

/**
 * TEST SEAM ONLY — do not call from application code.
 *
 * Vitest's SSR `require()` shim performs plain Node CJS extension probing
 * (.js/.json/.node) and never resolves an extensionless local `.ts`
 * specifier, so a bare `require('./s3-provider')` executed inside a
 * transformed test module throws "Cannot find module" — independent of
 * `vi.mock`, which only intercepts ESM `import`/dynamic `import()`, never a
 * literal `require()` call. Next.js's real bundler resolves these requires
 * fine at build time (this exact lazy-require pattern already shipped in
 * `getServerStorage()` for phases). Routing the two lazy loads through this
 * exported object gives `tests/unit/storage/server-provider.test.ts` a
 * `vi.spyOn` seam without changing the real require()-based runtime
 * behavior at all.
 */
export const __internal = {
  loadS3Provider: (): typeof import('./s3-provider') =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./s3-provider') as typeof import('./s3-provider'),
  loadServiceClient: (): typeof import('@/lib/supabase/service') =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/lib/supabase/service') as typeof import('@/lib/supabase/service'),
}

const REQUIRED_S3_VARS = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const

function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      '[lib/storage/server] this module is server-only — S3 credentials and ' +
        'the service-role client must never reach the browser',
    )
  }
}

function missingS3Vars(): string[] {
  return REQUIRED_S3_VARS.filter((name) => {
    const v = process.env[name]
    return !v || v.length === 0
  })
}

/**
 * The ONE provider decision for the whole server process. See the selection
 * matrix in this file's header docblock.
 */
export function serverStorageBackend(): StorageBackend {
  assertServer()

  const raw = process.env.STORAGE_PROVIDER
  const explicit = raw === 's3' || raw === 'supabase' ? raw : undefined
  const cfg = s3ConfigFromEnv()

  if (explicit === 'supabase') {
    // Explicit kill switch always wins, regardless of S3_* completeness.
    return 'supabase'
  }

  if (explicit === 's3') {
    if (!cfg) {
      const missing = missingS3Vars()
      throw new Error(
        `serverStorageBackend: STORAGE_PROVIDER=s3 but required env var(s) ` +
          `missing or empty: ${missing.join(', ')}`,
      )
    }
    return 'r2'
  }

  // Unset or unrecognized STORAGE_PROVIDER value: decide by S3_* presence.
  return cfg ? 'r2' : 'supabase'
}

function buildS3Provider(): StorageProvider {
  const cfg = s3ConfigFromEnv()
  if (!cfg) {
    // Unreachable in practice — serverStorageBackend() already validated
    // completeness before returning 'r2'. Guards against future misuse of
    // this private helper.
    throw new Error(
      '[lib/storage/server] buildS3Provider called without a complete S3 config',
    )
  }
  // Lazy require (via __internal, see its docblock) so the AWS SDK stays
  // off the cold path when Supabase is selected. Import only —
  // lib/storage/s3-provider.ts is proven against R2 and must never be
  // edited.
  const { createS3StorageProvider } = __internal.loadS3Provider()
  return createS3StorageProvider(cfg)
}

/**
 * Server default provider. Supabase mode uses the service-role client via
 * `requireServiceClient()`. Replaces the `getServerStorage()` that used to
 * live in `./index.ts`.
 */
export function getServerStorage(): StorageProvider {
  assertServer()

  if (serverStorageBackend() === 'r2') {
    return buildS3Provider()
  }

  // Lazy require (via __internal, see its docblock) so the service-role
  // client module stays off the R2 cold path, same rationale as
  // buildS3Provider() above.
  const { requireServiceClient } = __internal.loadServiceClient()
  return createStorage(requireServiceClient())
}

/**
 * Drop-in replacement for `createStorage(client)` at SERVER call sites.
 *
 * Supabase mode: byte-identical to `createStorage(client)` — same client,
 * same RLS scoping as today.
 *
 * R2 mode: the client argument is ignored entirely, and Supabase
 * `storage.objects` RLS no longer applies (see this file's header
 * docblock).
 */
export function serverStorage(client: SupabaseClient): StorageProvider {
  assertServer()

  if (serverStorageBackend() === 'r2') {
    return buildS3Provider()
  }

  return createStorage(client)
}
