/**
 * Phase 188 Plan 04 — PROV-02: the storage-seam census.
 *
 * WHAT PHASE 66's GREP GATE PROVED (and did not prove):
 * Phase 66 shipped a shell `grep` gate (STORAGE-03) asserting there was no
 * raw `supabase.storage.from(...)` call left in `app/`, `lib/`, or
 * `components/`. That gate was GREEN the entire time the provider seam was
 * rotting (Phase 188's field assessment, `docs/STORAGE-MIGRATION.md` §1):
 * ~19 server call sites called `createStorage(client)` directly and got
 * Supabase unconditionally, regardless of `STORAGE_PROVIDER`. The grep gate
 * asked "is there a raw escape hatch?" — the right question is "is every
 * storage call site honoring the provider selection, or has someone quietly
 * reintroduced a hardcoded Supabase-only path?" This census asks the second
 * question and refuses to pass unless every discovered call site is
 * explicitly classified.
 *
 * MECHANISM: walk app/, lib/, components/, hooks/ for every .ts/.tsx file,
 * parse with the TypeScript AST (no hand-maintained file list — a file that
 * exists is a file that gets scanned), and record every call expression
 * named `createStorage`, `serverStorage`, or `getServerStorage`, one census
 * id per (file, symbol) pair. Exact set equality against
 * `STORAGE_SEAM_MANIFEST` means a new call site — anywhere — fails this
 * suite, and therefore fails CI, and therefore fails the deploy.
 *
 * Model: tests/unit/demo/mutation-boundary-sweep.test.ts (Phase 180). Same
 * shape — mechanical AST discovery, an explicit literal manifest, exact set
 * equality, and a synthetic-rejection test proving the diff actually
 * detects an unlisted site.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../..')
const STORAGE_SYMBOLS = new Set(['createStorage', 'serverStorage', 'getServerStorage'])
const SCAN_DIRS = ['app', 'lib', 'components', 'hooks']

type Row =
  | { id: string; disposition: 'server-provider' }
  | { id: string; disposition: 'browser-supabase'; authority: string; reason: string }
  | { id: string; disposition: 'deliberate-supabase'; authority: string; reason: string }

type DiscoveredFile = {
  path: string
  hasUseClientDirective: boolean
  storageSymbols: Set<string>
  importsFromServerSeam: boolean
  hasStorageFromCall: boolean
}

function repoPath(absolutePath: string): string {
  return relative(ROOT, absolutePath).replaceAll('\\', '/')
}

function walk(directory: string): string[] {
  return readdirSync(resolve(ROOT, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(
      (entry) => entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')),
    )
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort()
}

function parseModule(path: string): ts.SourceFile {
  const source = readFileSync(resolve(ROOT, path), 'utf8')
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
}

function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  const first = sourceFile.statements[0]
  if (!first || !ts.isExpressionStatement(first)) return false
  return ts.isStringLiteral(first.expression) && first.expression.text === 'use client'
}

function callName(expression: ts.LeftHandSideExpression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return null
}

/** True for a call expression shaped like `<something>.storage.from(...)`. */
function isStorageFromCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false
  if (node.expression.name.text !== 'from') return false
  const target = node.expression.expression
  return ts.isPropertyAccessExpression(target) && target.name.text === 'storage'
}

function scanFile(path: string): DiscoveredFile {
  const sourceFile = parseModule(path)
  const storageSymbols = new Set<string>()
  let importsFromServerSeam = false
  let hasStorageFromCall = false

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression)
      if (name && STORAGE_SYMBOLS.has(name)) storageSymbols.add(name)
      if (isStorageFromCall(node)) hasStorageFromCall = true
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text
      if (specifier === '@/lib/storage/server' || specifier.endsWith('/lib/storage/server')) {
        importsFromServerSeam = true
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return {
    path,
    hasUseClientDirective: hasUseClientDirective(sourceFile),
    storageSymbols,
    importsFromServerSeam,
    hasStorageFromCall,
  }
}

function discoverFiles(): DiscoveredFile[] {
  return SCAN_DIRS.flatMap((dir) => walk(dir).map(repoPath)).map(scanFile)
}

function manifestDiff(discoveredIds: string[], manifest: Row[]) {
  const discovered = new Set(discoveredIds)
  const manifestIds = new Set(manifest.map((row) => row.id))
  return {
    duplicateManifestIds: manifest
      .map((row) => row.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index),
    missing: [...discovered].filter((id) => !manifestIds.has(id)).sort(),
    stale: [...manifestIds].filter((id) => !discovered.has(id)).sort(),
  }
}

/**
 * `browser-supabase` rows: every one of these files is a `'use client'`
 * component/hook that constructs `createStorage(supabaseBrowserClient)`
 * directly. That is CORRECT today, not a gap this census flags — S3
 * credentials are server-only env vars (`S3_*`, never `NEXT_PUBLIC_*`), so
 * `s3ConfigFromEnv()` always resolves to `null` in the browser and no
 * S3/R2 credential could reach these call sites even if they tried to call
 * `serverStorage()` (which they structurally cannot — `serverStorage()`
 * lives in a server-only module these files never import).
 *
 * Of the 6 browser call sites, 3 are true uploads (Phase 189 / UPLOAD-01-02
 * replaces them with server-issued presigned PUTs) and the other 3 are
 * `getSignedUrl` READS (Phase 190 repoints these at the same-origin asset
 * proxy). `capture-recorder.tsx` contains one of each — a photo-preview
 * `getSignedUrl` read AND the audio upload — so it counts toward both: 3
 * upload operations (capture-recorder's audio upload, inline-audio-recorder,
 * use-ai-input-submit) + 4 read operations (capture-recorder's photo
 * restore, photo-card, photo-lightbox, estimate-document) across 6 distinct
 * call-site files. An earlier draft of this phase's docs said "five" or
 * "six" uploads — that conflated the read sites with the upload sites; the
 * counts above were derived by reading each call site's actual method call
 * (`.upload(...)` vs `.getSignedUrl(...)`), not by trusting either number.
 */
const UPLOAD_REASON =
  'Phase 189 (UPLOAD-01/02) replaces this direct browser upload with a server-issued presigned PUT. Until then, S3_* is server-only env (never NEXT_PUBLIC_*), so s3ConfigFromEnv() is null in the browser and no R2 credential can reach this call site.'
const READ_REASON =
  'This is a getSignedUrl READ, not an upload. Phase 190 repoints browser photo reads at the same-origin asset proxy (GET /storage/{bucket}/{key}); until then this stays on createStorage(supabase) deliberately. S3_* is server-only env, so no R2 credential reaches this call site either way.'

const STORAGE_SEAM_MANIFEST: Row[] = [
  // --- server-provider: server code that honors serverStorageBackend() ---
  { id: 'app/admin/branding/actions.ts#serverStorage', disposition: 'server-provider' },
  { id: 'app/admin/landing/actions.ts#serverStorage', disposition: 'server-provider' },
  { id: 'app/admin/seo/actions.ts#serverStorage', disposition: 'server-provider' },
  { id: 'app/api/health/route.ts#getServerStorage', disposition: 'server-provider' },
  { id: 'lib/actions/admin-company.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/actions/admin-whatsapp.ts#getServerStorage', disposition: 'server-provider' },
  { id: 'lib/actions/client.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/actions/company.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/actions/photo.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/actions/price-book.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/actions/recording.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/actions/settings.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/estimate/adapters/whatsapp.ts#getServerStorage', disposition: 'server-provider' },
  {
    id: 'lib/inngest/functions/analyze-photos.ts#serverStorage',
    disposition: 'server-provider',
  },
  {
    id: 'lib/inngest/functions/cleanup-audio.ts#serverStorage',
    disposition: 'server-provider',
  },
  {
    id: 'lib/inngest/functions/transcribe-audio.ts#serverStorage',
    disposition: 'server-provider',
  },
  {
    id: 'lib/inngest/functions/storage-orphan-cleanup.ts#serverStorage',
    disposition: 'server-provider',
  },
  { id: 'lib/pdf/render-estimate-pdf.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/queries/share.ts#serverStorage', disposition: 'server-provider' },
  { id: 'lib/whatsapp/pdf-delivery.ts#serverStorage', disposition: 'server-provider' },

  // --- browser-supabase: 'use client' call sites, deliberately Supabase ---
  {
    id: 'components/capture/capture-recorder.tsx#createStorage',
    disposition: 'browser-supabase',
    authority: "The client component's own authenticated browser Supabase auth context",
    reason:
      'BOTH an upload and a read live in this file: the audio-upload call site (Phase 189 target) and a photo-preview getSignedUrl read used to restore thumbnails (Phase 190 target). ' +
      UPLOAD_REASON,
  },
  {
    id: 'components/projects/inline-audio-recorder.tsx#createStorage',
    disposition: 'browser-supabase',
    authority: "The client component's own authenticated browser Supabase auth context",
    reason: UPLOAD_REASON,
  },
  {
    id: 'components/workspace/ai-input-group/use-ai-input-submit.ts#createStorage',
    disposition: 'browser-supabase',
    authority: "The client hook's own authenticated browser Supabase auth context",
    reason: UPLOAD_REASON,
  },
  {
    id: 'components/workspace/photos/photo-card.tsx#createStorage',
    disposition: 'browser-supabase',
    authority: "The client component's own authenticated browser Supabase auth context",
    reason: READ_REASON,
  },
  {
    id: 'components/workspace/photos/photo-lightbox.tsx#createStorage',
    disposition: 'browser-supabase',
    authority: "The client component's own authenticated browser Supabase auth context",
    reason: READ_REASON,
  },
  {
    id: 'components/workspace/estimate/estimate-document.tsx#createStorage',
    disposition: 'browser-supabase',
    authority: "The client component's own authenticated browser Supabase auth context",
    reason: READ_REASON,
  },

  // --- deliberate-supabase: server code, pinned to Supabase on purpose ---
  {
    id: 'lib/storage/asset-source.ts#createStorage',
    disposition: 'deliberate-supabase',
    authority: 'PROXY-02 read-through fallback authority, Phase 187 asset-proxy route',
    reason:
      'This is the Supabase read-through fallback behind the same-origin asset proxy — it MUST stay pinned to Supabase in every configuration. Routing it through serverStorage() would turn the fallback into a second R2 read and delete the v4.24 milestone reversibility guarantee (pull S3_*, get Supabase, no code change, no data movement).',
  },
  {
    id: 'lib/storage/server.ts#createStorage',
    disposition: 'deliberate-supabase',
    authority: "lib/storage/server.ts's own PROV-01 selection-matrix implementation",
    reason:
      'This IS the Supabase branch of serverStorageBackend()/getServerStorage()/serverStorage() themselves — the file that defines the server seam cannot import from itself, and this call constructs the real Supabase-mode delegation once the backend decision has already been made. It is the seam, not an escape hatch bypassing it.',
  },
]

describe('Phase 188 storage seam census', () => {
  const discoveredFiles = discoverFiles()
  const discoveredIds = discoveredFiles.flatMap((file) =>
    [...file.storageSymbols].map((symbol) => `${file.path}#${symbol}`),
  )

  it('requires exact discovered-set equality with the explicit manifest', () => {
    expect(
      manifestDiff(discoveredIds, STORAGE_SEAM_MANIFEST),
      'A storage call site was found that is not in STORAGE_SEAM_MANIFEST (see "missing"), or a manifest row no longer has a matching call site (see "stale"). If "missing" is non-empty: a new storage call site was found — if it is server-side, use serverStorage()/getServerStorage() from @/lib/storage/server; if it is a client component, add a browser-supabase row with a written reason; then add the id to STORAGE_SEAM_MANIFEST in tests/unit/storage/storage-seam-census.test.ts. If "stale" is non-empty: delete the row, the call site is gone.',
    ).toEqual({
      duplicateManifestIds: [],
      missing: [],
      stale: [],
    })
  })

  it('requires every server-provider row to use the server seam, never createStorage directly', () => {
    const byPath = new Map(discoveredFiles.map((file) => [file.path, file]))
    for (const row of STORAGE_SEAM_MANIFEST) {
      if (row.disposition !== 'server-provider') continue
      const [path] = row.id.split('#')
      const file = byPath.get(path!)
      expect(file, `${row.id}: file not found among discovered files`).toBeTruthy()
      const hasServerCall =
        file!.storageSymbols.has('serverStorage') || file!.storageSymbols.has('getServerStorage')
      expect(hasServerCall, `${row.id} must call serverStorage() or getServerStorage()`).toBe(
        true,
      )
      expect(
        file!.importsFromServerSeam,
        `${row.id} must import from @/lib/storage/server`,
      ).toBe(true)
      expect(
        file!.storageSymbols.has('createStorage'),
        `${row.id} must NOT call createStorage() directly — that is a Plan 04 census failure`,
      ).toBe(false)
    }
  })

  it('requires every browser-supabase row to be a real \'use client\' file', () => {
    const byPath = new Map(discoveredFiles.map((file) => [file.path, file]))
    for (const row of STORAGE_SEAM_MANIFEST) {
      if (row.disposition !== 'browser-supabase') continue
      const [path] = row.id.split('#')
      const file = byPath.get(path!)
      expect(file, `${row.id}: file not found among discovered files`).toBeTruthy()
      expect(
        file!.hasUseClientDirective,
        `${row.id} is classified browser-supabase but its file has no 'use client' directive`,
      ).toBe(true)
    }
  })

  it("requires no 'use client' file to import @/lib/storage/server (credential-safety property)", () => {
    const offenders = discoveredFiles.filter(
      (file) => file.hasUseClientDirective && file.importsFromServerSeam,
    )
    expect(
      offenders.map((file) => file.path),
      'A client component imports @/lib/storage/server, which pulls the AWS SDK and the service-role client toward the browser module graph — this must never happen. Remove the import.',
    ).toEqual([])
  })

  it("keeps lib/storage/index.ts free of the S3 provider, the service-role client, and any env read (Plan 01's strip must not silently revert)", () => {
    const source = readFileSync(resolve(ROOT, 'lib/storage/index.ts'), 'utf8')
    for (const forbidden of ['s3-provider', '@/lib/supabase/service', 'process.env', 'STORAGE_PROVIDER']) {
      expect(
        source.includes(forbidden),
        `lib/storage/index.ts must not reference "${forbidden}" — that logic belongs in lib/storage/server.ts`,
      ).toBe(false)
    }
  })

  it('finds zero raw .storage.from( calls outside the legitimate adapter holders', () => {
    // Phase 189 Plan 01 (UPLOAD-02/03) adds a second legitimate holder:
    // lib/storage/upload-ticket.ts's Supabase-mode ticket minting calls
    // `args.supabase.storage.from(bucket).createSignedUploadUrl(key)`
    // directly. `createSignedUploadUrl` is NOT part of the StorageProvider
    // interface (createStorage()/serverStorage() only expose upload/
    // download/getSignedUrl(read)/getPublicUrl/delete/list), and 189-01
    // deliberately does not widen that interface to add a write-presign
    // method — see that file's own header docblock. This is therefore the
    // seam itself for signed-upload-URL minting, not an escape hatch
    // bypassing it.
    const EXEMPT = new Set(['lib/storage/supabase-provider.ts', 'lib/storage/upload-ticket.ts'])
    const offenders = discoveredFiles.filter(
      (file) => file.hasStorageFromCall && !EXEMPT.has(file.path),
    )
    expect(
      offenders.map((file) => file.path),
      'A raw `<client>.storage.from(...)` call was found outside the legitimate adapter holders (lib/storage/supabase-provider.ts, lib/storage/upload-ticket.ts). Route through createStorage()/serverStorage() instead — this is the STORAGE-03 grep gate re-expressed as a suite assertion so it cannot silently stop being run.',
    ).toEqual([])
  })

  it('requires reasoned authority and a written reason for every exception row', () => {
    for (const row of STORAGE_SEAM_MANIFEST) {
      if (row.disposition === 'server-provider') continue
      expect(row.authority.trim().length, `${row.id} authority`).toBeGreaterThan(12)
      expect(row.reason.trim().length, `${row.id} reason`).toBeGreaterThan(24)
    }
  })

  it('rejects a synthetic unclassified boundary', () => {
    const synthetic = 'lib/actions/synthetic.ts#createStorage'
    expect(
      manifestDiff([...discoveredIds, synthetic], STORAGE_SEAM_MANIFEST).missing,
    ).toContain(synthetic)
  })
})
