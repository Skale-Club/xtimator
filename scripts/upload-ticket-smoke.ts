/**
 * Phase 189 Plan 04 — UPLOAD-03: end-to-end content-type proof through the
 * upload-ticket path and the same-origin proxy's own reader.
 *
 * Modelled on `scripts/storage-smoke.ts` (same `import 'dotenv/config'`, same
 * `npx tsx` invocation, same "env vars inline — never write to `.env.local`"
 * convention). Unlike that script, this one drives the TICKET path
 * (`mintUploadTicket` -> PUT/uploadToSignedUrl, exactly what the browser
 * does via `lib/storage/browser-upload.ts`) rather than calling a
 * `StorageProvider` directly, and it reads back through `fetchStoredAsset` —
 * the exact function `app/storage/[bucket]/[...key]/route.ts` calls — not
 * `storage.download()`.
 *
 * Four legs, each prints a per-leg `OK`/`FAIL`/`SKIPPED` line. Exits
 * non-zero on the FIRST failure (a genuine backend failure is a hard stop,
 * not a skip — only leg 1's R2-only gate and leg 4's `SMOKE_BASE_URL` gate
 * are legitimate skips). Every object this script writes is deleted in a
 * `finally`, including on failure.
 *
 *   Leg 1 — ticketed write, R2 strategy (ONLY when serverStorageBackend()
 *           === 'r2'): mints a ticket, PUTs bytes to the presigned URL from
 *           Node exactly as a browser would, asserts 2xx. The only leg that
 *           proves the presigned PUT signature + header-verbatim contract
 *           against a real R2 endpoint.
 *   Leg 2 — read back through fetchStoredAsset('audio', <key>), asserting
 *           contentType === 'audio/webm'. Runs unconditionally: reuses leg
 *           1's object when R2 is active, otherwise mints its own ticket
 *           and writes via the Supabase `uploadToSignedUrl` strategy — this
 *           is the leg that runs by default on every machine today (no
 *           `S3_*` configured, per CONTEXT.md).
 *   Leg 3 — the extensionless key. NOT produced by the ticket path (audio
 *           keys always carry an extension) — real production keys like
 *           `platform/1784854705622-kvwo24` have none, which is why content
 *           type can never be inferred from a path. Writes directly via
 *           `getServerStorage().upload('logos', <no-extension key>, ...,
 *           { contentType: 'image/webp' })`, then reads back through
 *           `fetchStoredAsset`. `logos` is a public bucket — no auth needed.
 *   Leg 4 — optional live HTTP leg. Only when `SMOKE_BASE_URL` is set:
 *           fetches `${SMOKE_BASE_URL}/storage/logos/<key>` and asserts both
 *           `content-type: image/webp` and `content-disposition: inline`
 *           (inline is what makes an image render instead of download — the
 *           literal wording of UPLOAD-03). SKIPPED-with-variable-named
 *           otherwise, never silently passed.
 *
 * Usage:
 *
 *   # Against whatever backend .env.local currently selects (Supabase by
 *   # default in this repo — legs 2-3 run, leg 1 SKIPS with a reason):
 *   npx tsx scripts/upload-ticket-smoke.ts
 *
 *   # Optional positional args: <projectId> <companyId> — any UUID shape;
 *   # mintUploadTicket does not verify DB membership, only shape (the
 *   # caller-authorization gate lives in the route, not this module).
 *   npx tsx scripts/upload-ticket-smoke.ts <projectId-uuid> <companyId-uuid>
 *
 *   # To exercise leg 1 (and leg 2 via the R2 write), supply the R2 vars
 *   # inline on the command line — NEVER write these to .env.local
 *   # (placeholder values only, per CLAUDE.md "Secret Handling"):
 *
 *     S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
 *     S3_REGION=auto \
 *     S3_ACCESS_KEY_ID=<r2-access-key-id> \
 *     S3_SECRET_ACCESS_KEY=<r2-secret-access-key> \
 *     S3_FORCE_PATH_STYLE=true \
 *     npx tsx scripts/upload-ticket-smoke.ts
 *
 *   # Optional live HTTP leg (leg 4) against a running dev server or a
 *   # deployed origin:
 *     SMOKE_BASE_URL=http://localhost:9633 npx tsx scripts/upload-ticket-smoke.ts
 *
 * After running, confirm no `S3_*` vars were left in your committed
 * `.env.local` — this script must never write to it.
 */
// `import 'dotenv/config'` only reads `.env` (there isn't one in this repo);
// local secrets live in `.env.local` (see `scripts/r2-migrate.ts`'s own note
// on this exact pitfall). dotenv never overrides an already-set env var, so
// inline vars on the command line (the R2-leg invocation in this file's
// header docblock) still take precedence over `.env.local`.
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import Module from 'node:module'
import { randomUUID } from 'node:crypto'
import { getServerStorage, serverStorageBackend } from '@/lib/storage/server'
import { requireServiceClient } from '@/lib/supabase/service'
import type { UploadTicket } from '@/lib/storage/upload-ticket-types'

/**
 * `lib/storage/asset-source.ts` and `lib/storage/upload-ticket.ts` both
 * carry `import 'server-only'` (correctly — they are genuinely server-only
 * modules). `vitest.config.ts` aliases that package to its `empty.js` stub
 * for tests; a plain `npx tsx` run has no such alias and would otherwise
 * crash immediately on import (verified: this is exactly the same
 * constraint `lib/storage/server.ts`'s own header docblock and
 * `scripts/pagination-render-calibration.ts`'s header document for their
 * own server-only dependencies). Duplicating either module's logic (that
 * precedent's usual fix) is not an option here — this script's entire
 * point is to exercise the REAL `fetchStoredAsset`/`mintUploadTicket`, not
 * a copy of them. Instead: install the exact same module-resolution
 * redirect vitest.config.ts uses, then import both via a RUNTIME dynamic
 * `import()` so the redirect is already installed before either module's
 * own `import 'server-only'` line evaluates (a static top-level import
 * would still work source-order-wise under tsx's CJS transform, but a
 * dynamic import removes any doubt about evaluation timing).
 */
const emptyServerOnlyPath = require.resolve('server-only').replace(/index\.js$/, 'empty.js')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeModuleInternals = Module as any
const originalResolveFilename = nodeModuleInternals._resolveFilename
nodeModuleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return emptyServerOnlyPath
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return originalResolveFilename.call(this, request, ...rest)
}

const AUDIO_PAYLOAD = Buffer.from('phase189 upload-ticket smoke — audio payload, not a real recording')
const LOGO_PAYLOAD = Buffer.from('phase189 upload-ticket smoke — logo payload, not a real image')

type CreatedObject = { bucket: 'audio' | 'logos'; key: string }
const created: CreatedObject[] = []

function ok(leg: string, message: string): void {
  console.log(`[upload-ticket-smoke] ${leg} OK ${message}`)
}

function skipped(leg: string, reason: string): void {
  console.log(`[upload-ticket-smoke] ${leg} SKIPPED ${reason}`)
}

function fail(leg: string, err: unknown): never {
  console.error(`[upload-ticket-smoke] ${leg} FAIL`, err)
  throw err instanceof Error ? err : new Error(String(err))
}

/**
 * Writes `body` to an already-minted ticket exactly as the browser would —
 * raw PUT for the S3 strategy, `uploadToSignedUrl` for the Supabase
 * strategy. NOT imported from `lib/storage/browser-upload.ts`: that
 * module's helpers are deliberately unexported (browser-internal), and this
 * script runs server-side with the service-role client rather than the
 * browser's anon client — the two are not meant to share code.
 */
async function writeToTicket(ticket: UploadTicket, body: Buffer): Promise<void> {
  if (ticket.strategy === 's3-presigned-put') {
    // `fetch`'s DOM-lib `BodyInit` type rejects Node's `Buffer`/`Uint8Array`
    // nominally under this repo's `lib: ["dom", ...]` + `@types/node`
    // combination (a known cross-lib typed-array generic mismatch, not a
    // real runtime incompatibility — Node's `fetch`/undici accepts a
    // `Uint8Array` body at runtime unconditionally). Cast at the boundary
    // rather than fight the two lib definitions.
    const bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
    const res = await fetch(ticket.url, {
      method: 'PUT',
      headers: ticket.headers,
      body: bytes as BodyInit,
    })
    if (!res.ok) {
      throw new Error(`presigned PUT failed (${ticket.bucket}/${ticket.key}): ${res.status} ${res.statusText}`)
    }
    return
  }
  // @supabase/storage-js's uploadToSignedUrl sends its body as multipart
  // FormData and IGNORES the `contentType` fileOptions in that branch — the
  // stored type comes from the body's own `.type` (verified during Plan
  // 189-01; see lib/storage/browser-upload.ts's "Blob stamping" comment for
  // the browser-side equivalent of this exact re-wrap). A raw Buffer has no
  // `.type`, so without this the bucket stores (and can even reject, as
  // observed here) the wrong content type.
  const blob = new Blob([new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as BlobPart], {
    type: ticket.contentType,
  })
  const { error } = await requireServiceClient()
    .storage.from(ticket.bucket)
    .uploadToSignedUrl(ticket.key, ticket.token, blob, { upsert: false })
  if (error) {
    throw new Error(`uploadToSignedUrl failed (${ticket.bucket}/${ticket.key}): ${error.message}`)
  }
}

async function main(): Promise<void> {
  // Dynamic import — see the module-resolution redirect installed above
  // this file's header docblock explains why these two specifically
  // (not getServerStorage/requireServiceClient, neither of which carries
  // 'server-only') must be loaded this way under plain tsx.
  const { fetchStoredAsset } = await import('@/lib/storage/asset-source')
  const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')

  const backend = serverStorageBackend()
  const projectId = process.argv[2] ?? randomUUID()
  const companyId = process.argv[3] ?? randomUUID()
  console.log(`[upload-ticket-smoke] backend=${backend} projectId=${projectId} companyId=${companyId}`)

  // ---- Leg 1: ticketed write, R2 strategy — proves the presigned PUT
  // signature + header-verbatim contract against a real endpoint. Only
  // meaningful when R2 is the active backend.
  let audioKeyForLeg2: string | null = null
  if (backend === 'r2') {
    try {
      const ticket = await mintUploadTicket({
        bucket: 'audio',
        projectId,
        contentType: 'audio/webm',
        companyId,
        supabase: requireServiceClient(),
      })
      if (ticket.strategy !== 's3-presigned-put') {
        throw new Error(`expected strategy 's3-presigned-put' in r2 mode, got '${ticket.strategy}'`)
      }
      created.push({ bucket: 'audio', key: ticket.key })
      await writeToTicket(ticket, AUDIO_PAYLOAD)
      audioKeyForLeg2 = ticket.key
      ok('leg1', `presigned PUT to R2 succeeded, key=${ticket.key}`)
    } catch (err) {
      fail('leg1', err)
    }
  } else {
    skipped(
      'leg1',
      `serverStorageBackend() === '${backend}' (S3_* not configured — this repo's default state). ` +
        'Supply S3_* env vars inline on the command line to exercise this leg (see this file\'s header docblock).',
    )
  }

  // ---- Leg 2: read back through fetchStoredAsset — the exact reader the
  // Phase 187 proxy route uses. Runs unconditionally: reuses leg 1's R2
  // object when present, otherwise mints its own ticket and writes via the
  // Supabase strategy so this leg is honest about running against Supabase
  // on every machine that has no S3_* configured (this repo's default).
  try {
    if (!audioKeyForLeg2) {
      const ticket = await mintUploadTicket({
        bucket: 'audio',
        projectId,
        contentType: 'audio/webm',
        companyId,
        supabase: requireServiceClient(),
      })
      created.push({ bucket: 'audio', key: ticket.key })
      await writeToTicket(ticket, AUDIO_PAYLOAD)
      audioKeyForLeg2 = ticket.key
    }
    const asset = await fetchStoredAsset('audio', audioKeyForLeg2)
    if (!asset) {
      throw new Error(`fetchStoredAsset('audio', '${audioKeyForLeg2}') returned null — object not found`)
    }
    if (asset.contentType !== 'audio/webm') {
      throw new Error(`content-type mismatch: expected 'audio/webm', got '${asset.contentType}'`)
    }
    ok('leg2', `fetchStoredAsset round trip — contentType=${asset.contentType} source=${asset.source}`)
  } catch (err) {
    fail('leg2', err)
  }

  // ---- Leg 3: the extensionless key — UPLOAD-03's sharp edge. Real
  // production keys (e.g. `platform/1784854705622-kvwo24`) never carry an
  // extension, so content type must come from stored metadata, never a
  // path guess. `logos` is public — no auth session needed.
  let logoKey: string | null = null
  try {
    logoKey = `phase189/${Date.now()}-${randomUUID().slice(0, 8)}-noext`
    await getServerStorage().upload('logos', logoKey, LOGO_PAYLOAD, { contentType: 'image/webp' })
    created.push({ bucket: 'logos', key: logoKey })
    const asset = await fetchStoredAsset('logos', logoKey)
    if (!asset) {
      throw new Error(`fetchStoredAsset('logos', '${logoKey}') returned null — object not found`)
    }
    if (asset.contentType !== 'image/webp') {
      throw new Error(`content-type mismatch: expected 'image/webp', got '${asset.contentType}'`)
    }
    ok('leg3', `extensionless key content-type preserved — contentType=${asset.contentType} source=${asset.source} key=${logoKey}`)
  } catch (err) {
    fail('leg3', err)
  }

  // ---- Leg 4: optional live HTTP leg through the real proxy route.
  const baseUrl = process.env.SMOKE_BASE_URL
  if (baseUrl && logoKey) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/storage/logos/${logoKey}`)
      if (!res.ok) {
        throw new Error(`GET ${baseUrl}/storage/logos/${logoKey} returned ${res.status}`)
      }
      const contentType = res.headers.get('content-type')
      const contentDisposition = res.headers.get('content-disposition')
      if (contentType !== 'image/webp') {
        throw new Error(`content-type mismatch: expected 'image/webp', got '${contentType}'`)
      }
      if (!contentDisposition || !contentDisposition.includes('inline')) {
        throw new Error(`content-disposition must be inline, got '${contentDisposition}'`)
      }
      await res.arrayBuffer().catch(() => undefined) // drain the body
      ok('leg4', `live HTTP fetch — content-type=${contentType} content-disposition=${contentDisposition}`)
    } catch (err) {
      fail('leg4', err)
    }
  } else {
    skipped(
      'leg4',
      'SMOKE_BASE_URL is not set — the live HTTP leg through the real proxy route was not exercised. ' +
        'Set SMOKE_BASE_URL=http://localhost:9633 (or a deployed origin) to run it.',
    )
  }

  console.log('[upload-ticket-smoke] ALL LEGS PASSED (or legitimately SKIPPED)')
}

async function cleanup(): Promise<void> {
  const storage = getServerStorage()
  for (const obj of created) {
    try {
      await storage.delete(obj.bucket, obj.key)
      console.log(`[upload-ticket-smoke] cleanup OK deleted ${obj.bucket}/${obj.key}`)
    } catch (err) {
      // Never let cleanup failure mask the real test result, but never go
      // silent about an orphan either.
      console.error(`[upload-ticket-smoke] cleanup FAILED to delete ${obj.bucket}/${obj.key}`, err)
    }
  }
}

async function run(): Promise<void> {
  try {
    await main()
  } finally {
    // Runs on BOTH success and failure — an orphan in `logos`/`audio` is a
    // real object in a real bucket, not a test artifact that disappears on
    // its own.
    await cleanup()
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[upload-ticket-smoke] FAILED', err)
    process.exit(1)
  })
