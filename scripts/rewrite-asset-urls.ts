/**
 * Phase 192 Plan 02 — URL-02: the operator tool that rewrites every persisted
 * absolute Supabase storage URL to this app's same-origin `/storage/{bucket}/{key}`
 * path, and reverses that rewrite exactly.
 *
 * PURE FIRST, I/O LAST. Every decision this script makes lives in an exported
 * function that takes plain arrays of rows and returns plain data. Importing this
 * module opens no socket, reads no table and never calls `process.exit`.
 *
 * --- Measured scope (direct query against production 2026-08-06) ---
 *
 * 11 occurrences across 4 columns: `companies.logo_url` (1),
 * `platform_branding.logo_url` (1), `platform_branding.og_image_url` (1) and
 * `platform_branding.landing_content` (8, inside ONE jsonb document). Four
 * further targets are measured at ZERO and stay in the table for drift
 * detection. See `.planning/phases/192-url-rewrite-cutover-cdn-verification/CONTEXT.md`.
 *
 * Correctness is the entire job at this size. There is deliberately NO paging,
 * no windowing, no partial application and no resumability machinery here —
 * unexercised code has no place in the one script that mutates production rows.
 *
 * --- The exclusion ---
 *
 * The price-book image column is NOT a target. It holds 293 non-null rows and
 * ZERO Supabase URLs — every one is an external images.pexels.com stock photo.
 * The requirement text names "price-book image URLs", which is exactly the trap:
 * selecting on COLUMN NAME instead of on the Supabase storage URL PREFIX would
 * corrupt 293 rows of working data. Selection here always runs the value through
 * `rewriteAssetUrl`, which only matches a Supabase public storage URL for a
 * persistable, non-exempt bucket. See `EXCLUDED_TARGETS`, which carries the
 * reason and the measured numbers in code so `--preflight` can print them.
 *
 * --- The video exemption ---
 *
 * `hero-bg-videos/` keys keep their absolute Supabase URL, mirroring the Phase
 * 190 writer exemption: the asset proxy is whole-object pass-through with no
 * Range/206, and Safari refuses to play such a `<video>`. NO video is set in
 * production today, so the exemption currently matches nothing — it is counted
 * and printed as `EXEMPT_VIDEO` rather than assumed.
 *
 * --- OPERATIONAL, and dry-run by default ---
 *
 * This is a step run BY HAND against a target environment, never by CI and never
 * by the deploy pipeline. `.env.local` in this repo points at PRODUCTION.
 * Running it with no flags plans and prints, and writes nothing; `--apply`
 * (together with `--confirm-project <ref>`) is the only way to write.
 *
 * Migrations in this repo are also applied to production BY HAND — the deploy
 * pipeline ships code only. `--preflight` exits non-zero when
 * `public.storage_url_rewrites` is absent, which is what makes "I forgot to
 * apply the migration" a loud stop rather than a confusing runtime error.
 *
 *   npm run rewrite:asset-urls -- --preflight --dump "<path-outside-the-repo>/pre-state.json"
 *   npm run rewrite:asset-urls                       # dry run - writes nothing
 *   npm run rewrite:asset-urls -- --apply --confirm-project <project-ref>
 *
 * Rollback is ONE command:
 *
 *   npm run rewrite:asset-urls -- --revert-latest --confirm-project <project-ref>
 *
 * The `--` is LOAD-BEARING when invoked through npm. Without it npm swallows the
 * flag as an npm option instead of forwarding it to the script — the same trap
 * `scripts/r2-migrate.ts` documents for its own `--verify-only`. A swallowed
 * `--revert-latest` turns an intended rollback into a dry run that reports
 * nothing wrong.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import dotenv from 'dotenv'
import type { SupabaseClient } from '@supabase/supabase-js'

import { storageProxyPath } from '@/lib/storage/asset-url'
import {
  parseSupabasePublicUrl,
  rewriteAssetUrl,
  rewriteJsonAssetUrls,
} from '@/lib/storage/url-rewrite'
import { requireServiceClient } from '@/lib/supabase/service'

// `import 'dotenv/config'` only reads `.env`; this repo keeps the Supabase URL
// and service key in `.env.local`, the same way `scripts/r2-migrate.ts` does.
// dotenv never overrides an already-set var and silently no-ops when the file is
// absent, so importing this module in CI is inert.
dotenv.config({ path: '.env.local' })

// ---------------------------------------------------------------------------
// The census, in code
// ---------------------------------------------------------------------------

export type ValueKind = 'text' | 'jsonb' | 'user_metadata'

export interface RewriteTarget {
  id: string
  table: string
  column: string
  pk: string
  kind: ValueKind
  /**
   * Optimistic-lock column read alongside the value and used as the
   * compare-and-set predicate when the value itself cannot be compared through
   * PostgREST (a jsonb equality filter is not reliable; a timestamp is).
   */
  guardColumn?: string
}

export interface ExcludedTarget {
  id: string
  table: string
  column: string
  reason: string
  measuredRows: number
  measuredSupabaseUrls: number
}

/**
 * The 8 census targets. The four measured at zero (see `MEASURED_BASELINE`) stay
 * here on purpose: they cost one small select each and they are the only thing
 * that would notice a new absolute URL appearing in a column nobody was watching.
 */
export const REWRITE_TARGETS: RewriteTarget[] = [
  { id: 'companies.logo_url', table: 'companies', column: 'logo_url', pk: 'id', kind: 'text' },
  { id: 'clients.logo_url', table: 'clients', column: 'logo_url', pk: 'id', kind: 'text' },
  {
    id: 'platform_branding.logo_url',
    table: 'platform_branding',
    column: 'logo_url',
    pk: 'id',
    kind: 'text',
  },
  {
    id: 'platform_branding.og_image_url',
    table: 'platform_branding',
    column: 'og_image_url',
    pk: 'id',
    kind: 'text',
  },
  {
    id: 'platform_branding.favicon_url',
    table: 'platform_branding',
    column: 'favicon_url',
    pk: 'id',
    kind: 'text',
  },
  {
    id: 'platform_branding.landing_content',
    table: 'platform_branding',
    column: 'landing_content',
    pk: 'id',
    kind: 'jsonb',
    // `platform_branding.updated_at` is `not null default now()` and every admin
    // save sets it, so it is a sound optimistic lock for the one jsonb target.
    guardColumn: 'updated_at',
  },
  {
    id: 'blog_posts.cover_image_url',
    table: 'blog_posts',
    column: 'cover_image_url',
    pk: 'id',
    kind: 'text',
  },
  {
    id: 'auth.users.user_metadata',
    table: 'auth.users',
    column: 'user_metadata',
    pk: 'id',
    kind: 'user_metadata',
  },
]

/** The one target `auth.users` reads through the Admin API rather than PostgREST. */
export const AUTH_USERS_TARGET: RewriteTarget = REWRITE_TARGETS.find(
  (t) => t.kind === 'user_metadata',
) as RewriteTarget

/**
 * Occurrences measured per target on 2026-08-06 by direct query. Printed next to
 * the live census so a divergence is visible without arithmetic — this is a
 * BASELINE to compare against, never a value the script enforces.
 */
export const MEASURED_BASELINE: Record<string, number> = {
  'companies.logo_url': 1,
  'clients.logo_url': 0,
  'platform_branding.logo_url': 1,
  'platform_branding.og_image_url': 1,
  'platform_branding.favicon_url': 0,
  'platform_branding.landing_content': 8,
  'blog_posts.cover_image_url': 0,
  'auth.users.user_metadata': 0,
}

/**
 * Deliberately NOT a rewrite target, with the numbers in code rather than in a
 * comment so `--preflight` prints them and a later reader cannot mistake the
 * omission for an oversight. `--preflight` re-counts the Supabase-URL figure LIVE
 * and blocks if it is ever non-zero.
 */
export const EXCLUDED_TARGETS: ExcludedTarget[] = [
  {
    id: 'company_price_book.image_url',
    table: 'company_price_book',
    column: 'image_url',
    reason:
      'Every non-null value is an external images.pexels.com stock photo; not one is a ' +
      'Supabase storage URL. The requirement text names "price-book image URLs", so ' +
      'selecting on the column NAME rather than on the Supabase URL PREFIX would corrupt ' +
      '293 rows of working data.',
    measuredRows: 293,
    measuredSupabaseUrls: 0,
  },
]

// ---------------------------------------------------------------------------
// Planning core — plain rows in, plain data out. No client, no network.
// ---------------------------------------------------------------------------

export interface PlannedChange {
  target: string
  rowPk: string
  kind: ValueKind
  /** For jsonb / user_metadata this is the WHOLE document, never a patch. */
  oldValue: unknown
  newValue: unknown
  /** URL-level occurrences inside this change: 1 for text, N for a document. */
  occurrences: number
  /** Value of the target's `guardColumn`, when it defines one. */
  guardValue?: unknown
}

export interface PlanResult {
  changes: PlannedChange[]
  /** URL-level occurrences, which is what the census counts. */
  occurrences: number
  /** Leaves left absolute because they are the exempt video asset class. */
  exempt: number
  /** Values the emitter refused. Counted, never thrown, always investigated. */
  unserveable: number
  /** Rows too malformed to plan (no primary key, non-string/-object value). */
  skipped: number
}

export interface AuditRecord {
  id: number
  batch_id: string
  target: string
  row_pk: string
  value_kind: ValueKind
  old_value: unknown
  new_value: unknown
}

export interface DumpEntry {
  target: string
  rowPk: string
  kind: ValueKind
  value: unknown
  guardValue?: unknown
}

/** The identity of one planned/recorded row across every mode. */
export function changeKey(target: string, rowPk: string): string {
  return `${target}#${rowPk}`
}

/**
 * Structural equality. `jsonb` preserves neither key order nor insignificant
 * whitespace, so "the row still holds what we wrote" is a DEEP-EQUAL question and
 * no stronger claim about bytes is made anywhere in this script.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (leftKeys.length !== rightKeys.length) return false
  if (!leftKeys.every((key, index) => key === rightKeys[index])) return false
  return leftKeys.every((key) => deepEqual(left[key], right[key]))
}

function readPk(row: Record<string, unknown>, pk: string): string | null {
  const value = row[pk]
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * The single planning entry point, dispatching on `target.kind`. The three
 * kind-specific exports below are thin wrappers over it.
 *
 * NEVER THROWS. A row this cannot make sense of is skipped and counted — one bad
 * legacy row must not abort a production run, and a silently dropped row must not
 * look like a clean pass.
 */
export function planRows(rows: Record<string, unknown>[], target: RewriteTarget): PlanResult {
  const result: PlanResult = { changes: [], occurrences: 0, exempt: 0, unserveable: 0, skipped: 0 }
  if (!Array.isArray(rows)) return result

  for (const row of rows) {
    try {
      if (!row || typeof row !== 'object') {
        result.skipped += 1
        continue
      }

      const rowPk = readPk(row, target.pk)
      if (rowPk === null) {
        result.skipped += 1
        continue
      }

      const value = row[target.column]

      if (target.kind === 'text') {
        if (value === null || value === undefined || value === '') continue
        if (typeof value !== 'string') {
          result.skipped += 1
          continue
        }
        const rewritten = rewriteAssetUrl(value)
        if (rewritten.exempt) result.exempt += 1
        if (rewritten.unserveable) result.unserveable += 1
        if (!rewritten.changed) continue
        result.occurrences += 1
        result.changes.push({
          target: target.id,
          rowPk,
          kind: target.kind,
          oldValue: value,
          newValue: rewritten.value,
          occurrences: 1,
          ...(target.guardColumn ? { guardValue: row[target.guardColumn] } : {}),
        })
        continue
      }

      // jsonb / user_metadata — value-level rewrite, DOCUMENT-level record.
      if (value === null || value === undefined) continue
      if (typeof value !== 'object') {
        result.skipped += 1
        continue
      }

      const rewritten = rewriteJsonAssetUrls(value)
      result.exempt += rewritten.exempt
      result.unserveable += rewritten.unserveable
      if (rewritten.changed === 0) continue
      result.occurrences += rewritten.changed
      result.changes.push({
        target: target.id,
        rowPk,
        kind: target.kind,
        // The WHOLE document, old and new, so a restore is one exact assignment
        // and never a merge.
        oldValue: value,
        newValue: rewritten.value,
        occurrences: rewritten.changed,
        ...(target.guardColumn ? { guardValue: row[target.guardColumn] } : {}),
      })
    } catch {
      result.skipped += 1
    }
  }

  return result
}

export function planTextRewrite(
  rows: Record<string, unknown>[],
  target: RewriteTarget,
): PlannedChange[] {
  return planRows(rows, target).changes
}

export function planJsonRewrite(
  rows: Record<string, unknown>[],
  target: RewriteTarget,
): PlannedChange[] {
  return planRows(rows, target).changes
}

export function planUserMetadataRewrite(
  users: { id: string; user_metadata: Record<string, unknown> | null }[],
): PlannedChange[] {
  return planUserMetadataRows(users).changes
}

/** The counting variant `main()` uses; `planUserMetadataRewrite` is its `.changes`. */
export function planUserMetadataRows(
  users: { id: string; user_metadata: Record<string, unknown> | null }[],
): PlanResult {
  const rows = (users ?? []).map((user) => ({
    id: user?.id,
    user_metadata: user?.user_metadata ?? null,
  })) as Record<string, unknown>[]
  return planRows(rows, AUTH_USERS_TARGET)
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * `https://<ref>.supabase.co` -> `<ref>`. Returns null for anything else,
 * including a local/self-hosted URL — this script's write modes refuse to run
 * without a confirmed ref, so "no ref" must never silently mean "any project".
 *
 * The project ref is PUBLIC and safe to print. No other part of the environment
 * is ever printed by this script.
 */
export function projectRefFromUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const match = /^([a-z0-9-]+)\.supabase\.(co|in)$/.exec(parsed.hostname)
  return match ? match[1] : null
}

/**
 * The wrong-database guard. `.env.local` in this repo points at PRODUCTION, so
 * every write mode requires the operator to name the project out loud and refuses
 * unless it matches what the environment resolves to.
 */
export function assertProjectConfirmed(
  envRef: string | null,
  flagRef: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!envRef) {
    return {
      ok: false,
      reason:
        'NEXT_PUBLIC_SUPABASE_URL did not resolve to a Supabase project ref, so ' +
        '--confirm-project cannot be checked against anything. Refusing to write.',
    }
  }
  if (!flagRef) {
    return {
      ok: false,
      reason:
        `--confirm-project <ref> is REQUIRED for every write mode and was not supplied. ` +
        `The environment resolves to project "${envRef}". Re-run with ` +
        `--confirm-project ${envRef} once you are certain that is the project you mean.`,
    }
  }
  if (flagRef !== envRef) {
    return {
      ok: false,
      reason:
        `--confirm-project "${flagRef}" does not match the project the environment ` +
        `resolves to ("${envRef}"). Refusing to write to a project you did not name.`,
    }
  }
  return { ok: true }
}

/**
 * CRASH RECOVERY. If an unreverted batch already exists, apply REUSES it rather
 * than minting a second one.
 *
 * This is the property that keeps `--revert-latest` complete: two batches for one
 * logical apply is exactly how a rollback restores half of production and still
 * exits 0. The unique index on `(batch_id, target, row_pk)` makes re-recording a
 * row inside a reused batch a conflict to handle rather than a double-record.
 *
 * The caller supplies open batch ids NEWEST-FIRST; the newest open batch is the
 * one a crashed run left behind.
 */
export function selectApplyBatch(openBatchIds: string[]): { batchId: string; reused: boolean } {
  const existing = (openBatchIds ?? []).find((id) => typeof id === 'string' && id !== '')
  if (existing) return { batchId: existing, reused: true }
  return { batchId: randomUUID(), reused: false }
}

/**
 * Splits recorded rows into those safe to restore and those that DRIFTED.
 *
 * A record is restorable only while the row still holds exactly what the rewrite
 * wrote. Anything else — a newer upload, a manual edit, a deleted row — is
 * drifted and is never restored implicitly: clobbering a newer upload during a
 * rollback is a data-loss event dressed up as a recovery.
 */
export function planRevert(
  records: AuditRecord[],
  current: Map<string, unknown>,
): { restore: AuditRecord[]; drifted: AuditRecord[] } {
  const restore: AuditRecord[] = []
  const drifted: AuditRecord[] = []

  for (const record of records ?? []) {
    const key = changeKey(record.target, record.row_pk)
    if (!current.has(key)) {
      drifted.push(record)
      continue
    }
    if (deepEqual(current.get(key), record.new_value)) restore.push(record)
    else drifted.push(record)
  }

  return { restore, drifted }
}

/**
 * The independent second restore path: compares a `--dump` pre-state against the
 * live values and returns only what actually differs. It reads nothing from the
 * audit table, which is the point — it is what works when the audit table itself
 * is the thing that went wrong.
 */
export function planRestoreFromDump(dump: DumpEntry[], current: Map<string, unknown>): DumpEntry[] {
  return (dump ?? []).filter(
    (entry) => !deepEqual(current.get(changeKey(entry.target, entry.rowPk)), entry.value),
  )
}

// ---------------------------------------------------------------------------
// CLI surface
// ---------------------------------------------------------------------------

export type Mode = 'preflight' | 'dry-run' | 'apply' | 'revert-latest' | 'revert' | 'restore-from-dump'

export interface CliOptions {
  mode: Mode
  confirmProject: string | null
  dumpPath: string | null
  restorePath: string | null
  batchId: string | null
  force: boolean
}

const SUPPORTED_FLAGS =
  '--preflight, --dry-run, --apply, --revert-latest, --revert <batch-id>, ' +
  '--restore-from-dump <path>, --dump <path>, --confirm-project <ref>, --force'

/** Modes that WRITE. Each one requires `--confirm-project <ref>`. */
const WRITE_MODES: Mode[] = ['apply', 'revert-latest', 'revert', 'restore-from-dump']

/**
 * Hand-rolled, like `scripts/r2-migrate.ts`. An unrecognized flag THROWS rather
 * than being ignored: a silently-ignored `--dry-run` typo is exactly how an
 * intended read-only check becomes an unintended write run. Two modes at once
 * also throws — "which one won?" is not a question an operator should have to
 * answer after the fact.
 */
export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'dry-run',
    confirmProject: null,
    dumpPath: null,
    restorePath: null,
    batchId: null,
    force: false,
  }
  let modeSeen: Mode | null = null

  const setMode = (mode: Mode) => {
    if (modeSeen && modeSeen !== mode) {
      throw new Error(
        `[rewrite-asset-urls] two modes requested (--${modeSeen} and --${mode}). Pass exactly one.`,
      )
    }
    modeSeen = mode
    options.mode = mode
  }

  const requireValue = (argv_: string[], index: number, flag: string): string => {
    const value = argv_[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`[rewrite-asset-urls] ${flag} requires a value`)
    }
    return value
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--preflight') {
      setMode('preflight')
      continue
    }
    if (arg === '--dry-run') {
      setMode('dry-run')
      continue
    }
    if (arg === '--apply') {
      setMode('apply')
      continue
    }
    if (arg === '--revert-latest') {
      setMode('revert-latest')
      continue
    }
    if (arg === '--revert') {
      setMode('revert')
      options.batchId = requireValue(argv, i, '--revert')
      i += 1
      continue
    }
    if (arg === '--restore-from-dump') {
      setMode('restore-from-dump')
      options.restorePath = requireValue(argv, i, '--restore-from-dump')
      i += 1
      continue
    }
    if (arg === '--dump') {
      options.dumpPath = requireValue(argv, i, '--dump')
      i += 1
      continue
    }
    if (arg === '--confirm-project') {
      options.confirmProject = requireValue(argv, i, '--confirm-project')
      i += 1
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }

    throw new Error(
      `[rewrite-asset-urls] unrecognized flag ${JSON.stringify(arg)}. Supported: ${SUPPORTED_FLAGS}`,
    )
  }

  return options
}

export function isWriteMode(mode: Mode): boolean {
  return WRITE_MODES.includes(mode)
}

// ---------------------------------------------------------------------------
// Machine-readable summary tokens
// ---------------------------------------------------------------------------

/**
 * The phase's automated gates assert against THESE, never against prose. A gate
 * that greps free text passes on its own mandated wording — four gates earlier in
 * this milestone did exactly that. Only tokens printed by the running mode appear,
 * and every token printed is accurate.
 */
function token(name: string, value: string | number | boolean): void {
  console.log(`${name}=${value}`)
}

function log(message: string): void {
  console.log(`[rewrite-asset-urls] ${message}`)
}

function truncate(value: unknown, max = 100): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return 'undefined'
  return text.length > max ? `${text.slice(0, max)}...` : text
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const AUDIT_TABLE = 'storage_url_rewrites'

/**
 * Ceiling on the Admin API user listing. Production has 8 users; reaching this
 * means something is wrong (or the product grew past what this one-shot
 * operational script was measured for) and it is reported loudly rather than
 * silently truncated into a partial census.
 */
const AUTH_USERS_LIMIT = 1000

function columnsFor(target: RewriteTarget): string {
  const columns = [target.pk, target.column]
  if (target.guardColumn) columns.push(target.guardColumn)
  return columns.join(', ')
}

/**
 * Loads every row for one target. Plain full selects: the measured scope is 11
 * occurrences and a paging loop here would be untested machinery in the one
 * script that mutates production rows.
 */
export async function loadRows(
  svc: SupabaseClient,
  target: RewriteTarget,
): Promise<Record<string, unknown>[]> {
  if (target.kind === 'user_metadata') {
    const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: AUTH_USERS_LIMIT })
    if (error) throw error
    const users = data?.users ?? []
    if (users.length >= AUTH_USERS_LIMIT) {
      throw new Error(
        `[rewrite-asset-urls] the Admin API returned ${users.length} users, at or above the ` +
          `${AUTH_USERS_LIMIT} ceiling this script was measured for. Refusing to report a ` +
          `census that may be incomplete.`,
      )
    }
    return users.map((user) => ({
      id: user.id,
      user_metadata: (user.user_metadata ?? null) as Record<string, unknown> | null,
    }))
  }

  const { data, error } = await svc.from(target.table).select(columnsFor(target))
  if (error) throw error
  return (data ?? []) as unknown as Record<string, unknown>[]
}

export interface TargetCensus {
  target: RewriteTarget
  rows: Record<string, unknown>[]
  plan: PlanResult
}

/** Reads every target once and plans it. Read-only; shared by every mode. */
export async function buildCensus(svc: SupabaseClient): Promise<TargetCensus[]> {
  const census: TargetCensus[] = []
  for (const target of REWRITE_TARGETS) {
    const rows = await loadRows(svc, target)
    census.push({ target, rows, plan: planRows(rows, target) })
  }
  return census
}

/** Unreverted batch ids, NEWEST FIRST — the order `selectApplyBatch` expects. */
export async function openBatchIds(svc: SupabaseClient): Promise<string[]> {
  const { data, error } = await svc
    .from(AUDIT_TABLE)
    .select('id, batch_id')
    .is('reverted_at', null)
    .order('id', { ascending: false })
  if (error) throw error

  const seen = new Set<string>()
  const ordered: string[] = []
  for (const row of (data ?? []) as { batch_id: string }[]) {
    if (seen.has(row.batch_id)) continue
    seen.add(row.batch_id)
    ordered.push(row.batch_id)
  }
  return ordered
}

/**
 * Current value (and optimistic-lock guard value) for every row of every target
 * named, indexed by `changeKey`. This is what the revert and dump-restore paths
 * compare against before touching anything.
 */
export async function currentValues(
  svc: SupabaseClient,
  targetIds: Iterable<string>,
): Promise<{ values: Map<string, unknown>; guards: Map<string, unknown> }> {
  const values = new Map<string, unknown>()
  const guards = new Map<string, unknown>()

  for (const id of new Set(targetIds)) {
    const target = REWRITE_TARGETS.find((t) => t.id === id)
    if (!target) {
      throw new Error(
        `[rewrite-asset-urls] recorded target ${JSON.stringify(id)} is not in REWRITE_TARGETS. ` +
          `Refusing to guess which table it meant.`,
      )
    }
    for (const row of await loadRows(svc, target)) {
      const rowPk = readPk(row, target.pk)
      if (rowPk === null) continue
      const key = changeKey(target.id, rowPk)
      values.set(key, row[target.column] ?? null)
      if (target.guardColumn) guards.set(key, row[target.guardColumn])
    }
  }

  return { values, guards }
}

// ---------------------------------------------------------------------------
// Writes — every one is compare-and-set and asserts exactly 1 row affected
// ---------------------------------------------------------------------------

export interface WriteOutcome {
  ok: boolean
  detail: string
}

/**
 * ONE compare-and-set write.
 *
 * `expected` is what the row must still hold for the write to land — for a text
 * target that is an exact-string filter on the column itself; for the jsonb target
 * it is a timestamp filter on `updated_at`, because a jsonb equality filter is not
 * reliable through PostgREST and `platform_branding.updated_at` is `not null
 * default now()` and set by every admin save.
 *
 * `.select()` reads back the affected rows, so "the write landed" is OBSERVED
 * rather than assumed. A concurrent save between the read and this write leaves
 * the filter unmatched and returns zero rows — detected, never silently destroyed.
 */
async function casUpdate(
  svc: SupabaseClient,
  target: RewriteTarget,
  rowPk: string,
  nextValue: unknown,
  expected: { column: string; value: unknown },
): Promise<WriteOutcome> {
  let query = svc
    .from(target.table)
    .update({ [target.column]: nextValue })
    .eq(target.pk, rowPk)

  // PostgREST has no `eq.null`; null must be matched with `is`.
  query =
    expected.value === null || expected.value === undefined
      ? query.is(expected.column, null)
      : query.eq(expected.column, expected.value as never)

  const { data, error } = await query.select(target.pk)
  if (error) return { ok: false, detail: `update failed: ${error.message}` }

  const affected = (data ?? []).length
  if (affected !== 1) {
    return {
      ok: false,
      detail:
        `expected exactly 1 row affected, got ${affected}. The compare-and-set filter on ` +
        `${expected.column} did not match — the row was changed by someone else between the ` +
        `read and this write, or the read was stale.`,
    }
  }
  return { ok: true, detail: 'ok' }
}

/**
 * The `auth.users` write. The Admin API has NO compare-and-set, so the row is
 * re-read immediately before the write and the run aborts if the metadata moved.
 *
 * RESIDUAL RACE, stated plainly: a change landing between that re-read and the
 * update would be overwritten. It cannot be closed through the Admin API. It has
 * ZERO subjects in production today — all 8 avatars are OAuth provider URLs and
 * this target plans zero changes.
 */
async function updateUserMetadata(
  svc: SupabaseClient,
  rowPk: string,
  expected: unknown,
  nextValue: unknown,
): Promise<WriteOutcome> {
  const { data: fresh, error: readError } = await svc.auth.admin.getUserById(rowPk)
  if (readError) return { ok: false, detail: `re-read failed: ${readError.message}` }
  if (!fresh?.user) return { ok: false, detail: 'user vanished between plan and write' }
  if (!deepEqual(fresh.user.user_metadata ?? null, expected)) {
    return {
      ok: false,
      detail: 'user_metadata changed between the read and this write — refusing to overwrite it',
    }
  }

  const { data, error } = await svc.auth.admin.updateUserById(rowPk, {
    user_metadata: nextValue as Record<string, unknown>,
  })
  if (error) return { ok: false, detail: `update failed: ${error.message}` }
  if (!data?.user) return { ok: false, detail: 'update returned no user — treating as not applied' }
  return { ok: true, detail: 'ok' }
}

/** Dispatches one write to the right compare-and-set strategy for its kind. */
async function writeValue(
  svc: SupabaseClient,
  target: RewriteTarget,
  rowPk: string,
  nextValue: unknown,
  expectedValue: unknown,
  guardValue: unknown,
): Promise<WriteOutcome> {
  if (target.kind === 'user_metadata') {
    return updateUserMetadata(svc, rowPk, expectedValue, nextValue)
  }

  if (target.guardColumn) {
    if (guardValue === undefined) {
      return {
        ok: false,
        detail:
          `no ${target.guardColumn} value was read for this row, so there is no ` +
          `compare-and-set predicate. Refusing to write a document unguarded.`,
      }
    }
    return casUpdate(svc, target, rowPk, nextValue, {
      column: target.guardColumn,
      value: guardValue,
    })
  }

  return casUpdate(svc, target, rowPk, nextValue, { column: target.column, value: expectedValue })
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/**
 * Resolved LAZILY and defensively. Under `tsx` this file's own URL gives the repo
 * root regardless of the operator's working directory; under a bundler that
 * rewrites `import.meta.url` (Vitest) it is not a file URL at all, and the
 * working directory is the repo root anyway. Neither may throw at import time —
 * importing this module must stay inert.
 */
function repoRoot(): string {
  try {
    return fileURLToPath(new URL('..', import.meta.url))
  } catch {
    return process.cwd()
  }
}

/**
 * Phase 190 shipped ONE emitter for the same-origin path and repointed every
 * writer at it. If that is not true, the rewrite would be writing a form the app
 * does not produce, and the next admin save would put an absolute URL straight
 * back. These are the writers that persist an asset URL.
 *
 * Note what is deliberately NOT asserted here: the raw storage-provider method
 * that mints an absolute backend URL was never repointed — it is still absolute
 * on purpose, and the hero-background-video exemption depends on that. A check
 * claiming otherwise would be false and would fire on every run.
 */
const SAME_ORIGIN_WRITERS = [
  'lib/actions/company.ts',
  'lib/actions/settings.ts',
  'app/admin/branding/actions.ts',
  'app/admin/landing/actions.ts',
]

const EMITTER_IMPORT = "from '@/lib/storage/asset-url'"

interface PreflightFinding {
  level: 'BLOCKER' | 'WARN'
  detail: string
}

export async function runPreflight(svc: SupabaseClient, options: CliOptions): Promise<number> {
  const findings: PreflightFinding[] = []
  const envRef = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
  // The project ref is public. Nothing else from the environment is ever printed.
  log(`project ref: ${envRef ?? '(unresolved)'}`)

  // --- BLOCKER: the reversible record must already exist -------------------
  const { error: auditError } = await svc.from(AUDIT_TABLE).select('id').limit(1)
  const auditPresent = !auditError
  if (auditError) {
    findings.push({
      level: 'BLOCKER',
      detail:
        `public.${AUDIT_TABLE} is not readable (${auditError.message}). Migrations in this repo ` +
        `are applied to production BY HAND and the deploy pipeline never runs them — apply ` +
        `supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql first.`,
    })
  } else {
    log(`public.${AUDIT_TABLE} present`)
  }

  // --- BLOCKER: Phase 190's same-origin emitter is present and correct ------
  const emitted = storageProxyPath('logos', 'x/y.webp')
  if (emitted !== '/storage/logos/x/y.webp') {
    findings.push({
      level: 'BLOCKER',
      detail: `storageProxyPath('logos','x/y.webp') returned ${JSON.stringify(emitted)}, not '/storage/logos/x/y.webp'`,
    })
  } else {
    log(`storageProxyPath emits ${emitted}`)
  }

  for (const writer of SAME_ORIGIN_WRITERS) {
    let source: string
    try {
      source = readFileSync(resolvePath(repoRoot(), writer), 'utf8')
    } catch (err) {
      findings.push({ level: 'BLOCKER', detail: `${writer} is unreadable: ${String(err)}` })
      continue
    }
    if (!source.includes(EMITTER_IMPORT)) {
      findings.push({
        level: 'BLOCKER',
        detail: `${writer} does not import ${EMITTER_IMPORT} — it is not on Phase 190's one emitter`,
      })
    }
  }

  // --- BLOCKER: the exclusion must still be structurally true ---------------
  let excludedRows = 0
  let excludedSupabaseUrls = 0
  for (const excluded of EXCLUDED_TARGETS) {
    const { data, error } = await svc.from(excluded.table).select(excluded.column)
    if (error) {
      findings.push({
        level: 'BLOCKER',
        detail: `could not re-count the exclusion ${excluded.id}: ${error.message}`,
      })
      continue
    }
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    for (const row of rows) {
      const value = row[excluded.column]
      if (typeof value !== 'string' || value === '') continue
      excludedRows += 1
      if (parseSupabasePublicUrl(value)) excludedSupabaseUrls += 1
    }
    log(
      `${excluded.id} — EXCLUDED — ${excludedRows} non-null rows, ${excludedSupabaseUrls} ` +
        `Supabase URLs (measured 2026-08-06: ${excluded.measuredRows} rows, ` +
        `${excluded.measuredSupabaseUrls} Supabase URLs). ${excluded.reason}`,
    )
    if (excludedSupabaseUrls !== 0) {
      findings.push({
        level: 'BLOCKER',
        detail:
          `${excluded.id} now holds ${excludedSupabaseUrls} Supabase storage URL(s). The ` +
          `exclusion was decided on the measured fact that it holds none. Re-decide it before ` +
          `running anything.`,
      })
    }
  }

  // --- WARN: R2 object presence is NOT checked here -------------------------
  findings.push({
    level: 'WARN',
    detail:
      'R2 object presence (Phase 191) is NOT verified by this script — this is a warning, not ' +
      "a pass. The rewrite is still correct with an empty R2 because the proxy reads through " +
      'to Supabase for anything missing. Use `npm run migrate:r2 -- --verify-only` to check R2.',
  })

  // --- WARN: an earlier apply is still open ---------------------------------
  // With no audit table there are, by construction, zero recorded batches — and
  // reading it would throw over the top of the blocker that already fired.
  const open = auditPresent ? await openBatchIds(svc) : []
  if (open.length > 0) {
    findings.push({
      level: 'WARN',
      detail: `${open.length} unreverted batch(es) exist; --apply would REUSE ${open[0]}`,
    })
  }

  // --- the census -----------------------------------------------------------
  const census = await buildCensus(svc)
  let total = 0
  let exempt = 0
  let unserveable = 0
  const dumpEntries: DumpEntry[] = []

  for (const entry of census) {
    total += entry.plan.occurrences
    exempt += entry.plan.exempt
    unserveable += entry.plan.unserveable
    const baseline = MEASURED_BASELINE[entry.target.id] ?? 0
    const marker = entry.plan.occurrences === baseline ? 'as measured' : 'DIVERGES from baseline'
    log(
      `census ${entry.target.id}: rows=${entry.rows.length} occurrences=${entry.plan.occurrences} ` +
        `baseline=${baseline} (${marker}) skipped=${entry.plan.skipped}`,
    )

    for (const row of entry.rows) {
      const rowPk = readPk(row, entry.target.pk)
      if (rowPk === null) continue
      dumpEntries.push({
        target: entry.target.id,
        rowPk,
        kind: entry.target.kind,
        value: row[entry.target.column] ?? null,
        ...(entry.target.guardColumn ? { guardValue: row[entry.target.guardColumn] } : {}),
      })
    }
  }

  if (options.dumpPath) {
    // The dump holds tenant rows. Point it OUTSIDE the repo and never commit it.
    writeFileSync(
      options.dumpPath,
      `${JSON.stringify({ generatedAt: new Date().toISOString(), projectRef: envRef, entries: dumpEntries }, null, 2)}\n`,
    )
    log(`pre-state written to ${options.dumpPath} (${dumpEntries.length} entries) — contains tenant data, keep it outside the repo`)
  }

  for (const finding of findings) log(`[${finding.level}] ${finding.detail}`)

  const blockers = findings.filter((f) => f.level === 'BLOCKER').length
  token('CENSUS_TOTAL', total)
  token('EXEMPT_VIDEO', exempt)
  token('SKIPPED_UNSERVEABLE', unserveable)
  token('EXCLUDED_PRICE_BOOK_ROWS', excludedRows)
  token('EXCLUDED_PRICE_BOOK_SUPABASE_URLS', excludedSupabaseUrls)
  token('UNREVERTED_BATCHES', open.length)
  token('PREFLIGHT_BLOCKERS', blockers)
  return blockers === 0 ? 0 : 1
}

export async function runDryRun(svc: SupabaseClient): Promise<number> {
  const census = await buildCensus(svc)
  let planned = 0
  let occurrences = 0
  let exempt = 0
  let unserveable = 0

  for (const entry of census) {
    occurrences += entry.plan.occurrences
    exempt += entry.plan.exempt
    unserveable += entry.plan.unserveable
    for (const change of entry.plan.changes) {
      planned += 1
      log(
        `${change.target} | ${change.rowPk} | ${truncate(change.oldValue)} -> ${truncate(change.newValue)}` +
          (change.occurrences > 1 ? ` (${change.occurrences} URLs in one document)` : ''),
      )
    }
  }

  log('DRY RUN — nothing was written. Add --apply --confirm-project <ref> to write.')
  token('CENSUS_TOTAL', occurrences)
  token('PLANNED_CHANGES', planned)
  token('EXEMPT_VIDEO', exempt)
  token('SKIPPED_UNSERVEABLE', unserveable)
  return 0
}

export async function runApply(svc: SupabaseClient): Promise<number> {
  // Crash recovery FIRST: a re-run after a crash must stay one batch, or
  // --revert-latest restores half of production and still exits 0.
  const open = await openBatchIds(svc)
  const { batchId, reused } = selectApplyBatch(open)
  token('UNREVERTED_BATCHES', open.length)
  // Printed BEFORE any write so it survives a crash in the operator's scrollback.
  token('BATCH_ID', batchId)
  token('BATCH_REUSED', reused)

  const census = await buildCensus(svc)
  const changes = census.flatMap((entry) => entry.plan.changes)
  const targetById = new Map(REWRITE_TARGETS.map((t) => [t.id, t]))
  let occurrences = 0
  let exempt = 0
  let unserveable = 0
  for (const entry of census) {
    occurrences += entry.plan.occurrences
    exempt += entry.plan.exempt
    unserveable += entry.plan.unserveable
  }
  token('CENSUS_TOTAL', occurrences)
  token('PLANNED_CHANGES', changes.length)
  token('EXEMPT_VIDEO', exempt)
  token('SKIPPED_UNSERVEABLE', unserveable)

  let applied = 0
  for (const change of changes) {
    const target = targetById.get(change.target)
    if (!target) throw new Error(`[rewrite-asset-urls] unknown target ${change.target}`)

    // 1. Record BEFORE writing. A record with no write is recoverable; a write
    //    with no record is not.
    let auditId: number | null = null
    let insertedNow = false
    const { data: inserted, error: insertError } = await svc
      .from(AUDIT_TABLE)
      .insert({
        batch_id: batchId,
        target: change.target,
        row_pk: change.rowPk,
        value_kind: change.kind,
        old_value: change.oldValue,
        new_value: change.newValue,
      })
      .select('id')

    if (insertError) {
      if ((insertError as { code?: string }).code !== '23505') {
        console.error(`[rewrite-asset-urls] recording ${change.target} ${change.rowPk} failed: ${insertError.message}`)
        token('APPLIED_CHANGES', applied)
        token('BATCH_ID', batchId)
        return 1
      }
      // Already recorded inside this REUSED batch — the crash-resume path. Only
      // safe to continue if the recorded pre-state is exactly what we just read;
      // anything else is ambiguous and must stop the run.
      const { data: existing, error: existingError } = await svc
        .from(AUDIT_TABLE)
        .select('id, old_value')
        .eq('batch_id', batchId)
        .eq('target', change.target)
        .eq('row_pk', change.rowPk)
        .limit(1)
      if (existingError || !existing || existing.length !== 1) {
        console.error(
          `[rewrite-asset-urls] ${change.target} ${change.rowPk} is already recorded in batch ` +
            `${batchId} but could not be re-read. Stopping.`,
        )
        token('APPLIED_CHANGES', applied)
        token('BATCH_ID', batchId)
        return 1
      }
      const row = existing[0] as { id: number; old_value: unknown }
      if (!deepEqual(row.old_value, change.oldValue)) {
        console.error(
          `[rewrite-asset-urls] ${change.target} ${change.rowPk} is already recorded in batch ` +
            `${batchId} with a DIFFERENT pre-state. Restoring from this batch would be ` +
            `ambiguous. Stopping without writing.`,
        )
        token('APPLIED_CHANGES', applied)
        token('BATCH_ID', batchId)
        return 1
      }
      auditId = row.id
      log(`${change.target} ${change.rowPk} already recorded in ${batchId} — resuming its write`)
    } else {
      auditId = ((inserted ?? [])[0] as { id: number } | undefined)?.id ?? null
      insertedNow = true
    }

    // 2. Compare-and-set write, reading back the affected rows.
    const outcome = await writeValue(
      svc,
      target,
      change.rowPk,
      change.newValue,
      change.oldValue,
      change.guardValue,
    )

    // 3. Zero rows affected: undo the record and stop. An audit row claiming a
    //    change that did not happen would later read as "drifted" and be
    //    indistinguishable from a legitimate re-upload.
    if (!outcome.ok) {
      if (insertedNow && auditId !== null) {
        const { error: deleteError } = await svc.from(AUDIT_TABLE).delete().eq('id', auditId)
        if (deleteError) {
          console.error(
            `[rewrite-asset-urls] CRITICAL: could not delete audit row ${auditId} after a ` +
              `failed write (${deleteError.message}). Delete it by hand before reverting.`,
          )
        } else {
          log(`audit row ${auditId} deleted — it recorded a change that did not happen`)
        }
      }
      console.error(`[rewrite-asset-urls] ${change.target} ${change.rowPk}: ${outcome.detail}`)
      token('APPLIED_CHANGES', applied)
      token('BATCH_ID', batchId)
      return 1
    }

    applied += 1
    log(`applied ${change.target} ${change.rowPk} -> ${truncate(change.newValue)}`)
  }

  token('APPLIED_CHANGES', applied)
  token('BATCH_ID', batchId)
  token('BATCH_REUSED', reused)
  return 0
}

interface RevertTotals {
  reverted: number
  drifted: number
  failed: boolean
}

async function revertOneBatch(
  svc: SupabaseClient,
  batchId: string,
  force: boolean,
): Promise<RevertTotals> {
  const totals: RevertTotals = { reverted: 0, drifted: 0, failed: false }

  const { data, error } = await svc
    .from(AUDIT_TABLE)
    .select('id, batch_id, target, row_pk, value_kind, old_value, new_value')
    .eq('batch_id', batchId)
    .is('reverted_at', null)
    .order('id', { ascending: false })
  if (error) throw error

  const records = (data ?? []) as unknown as AuditRecord[]
  if (records.length === 0) {
    log(`batch ${batchId}: nothing left to revert`)
    return totals
  }

  const { values, guards } = await currentValues(
    svc,
    records.map((r) => r.target),
  )
  const { restore, drifted } = planRevert(records, values)

  let toRestore = restore
  if (force && drifted.length > 0) {
    const forcible = drifted.filter((r) => values.has(changeKey(r.target, r.row_pk)))
    log(
      `--force: ALSO restoring ${forcible.length} DRIFTED row(s). Whatever was written to them ` +
        `after the rewrite is being overwritten with the pre-rewrite value. This is data loss ` +
        `if that newer value mattered.`,
    )
    toRestore = [...restore, ...forcible]
  }

  const stillDrifted = drifted.filter((r) => !toRestore.includes(r))
  for (const record of stillDrifted) {
    const key = changeKey(record.target, record.row_pk)
    log(
      `[DRIFTED] ${record.target} ${record.row_pk}: current=${truncate(values.get(key))} ` +
        `expected=${truncate(record.new_value)} — NOT restored (re-run with --force to overwrite)`,
    )
  }
  totals.drifted = stillDrifted.length

  const targetById = new Map(REWRITE_TARGETS.map((t) => [t.id, t]))
  for (const record of toRestore) {
    const target = targetById.get(record.target)
    if (!target) throw new Error(`[rewrite-asset-urls] unknown target ${record.target}`)
    const key = changeKey(record.target, record.row_pk)

    const outcome = await writeValue(
      svc,
      target,
      record.row_pk,
      record.old_value,
      values.get(key),
      guards.get(key),
    )
    if (!outcome.ok) {
      console.error(`[rewrite-asset-urls] restore ${record.target} ${record.row_pk}: ${outcome.detail}`)
      totals.failed = true
      return totals
    }

    const { data: stamped, error: stampError } = await svc
      .from(AUDIT_TABLE)
      .update({ reverted_at: new Date().toISOString() })
      .eq('id', record.id)
      .is('reverted_at', null)
      .select('id')
    if (stampError || (stamped ?? []).length !== 1) {
      console.error(
        `[rewrite-asset-urls] CRITICAL: restored ${record.target} ${record.row_pk} but could not ` +
          `stamp audit row ${record.id} as reverted. Stamp it by hand before re-running.`,
      )
      totals.failed = true
      return totals
    }

    totals.reverted += 1
    log(`restored ${record.target} ${record.row_pk} -> ${truncate(record.old_value)}`)
  }

  return totals
}

export async function runRevert(svc: SupabaseClient, options: CliOptions): Promise<number> {
  const open = await openBatchIds(svc)
  token('UNREVERTED_BATCHES', open.length)

  // Completeness over convenience: --revert-latest takes ALL open batches,
  // newest-first. A crashed apply that somehow produced two batches must not
  // leave production half-restored while the command reports success.
  const batches = options.mode === 'revert-latest' ? open : [options.batchId as string]
  if (options.mode === 'revert') {
    log(
      `reverting ONLY batch ${options.batchId}. ${open.length} unreverted batch(es) exist in ` +
        `total — this command is NOT touching the others.`,
    )
  } else {
    log(`reverting ALL ${batches.length} open batch(es), newest first`)
  }

  let reverted = 0
  let drifted = 0
  let failed = false
  for (const batchId of batches) {
    const totals = await revertOneBatch(svc, batchId, options.force)
    reverted += totals.reverted
    drifted += totals.drifted
    if (totals.failed) {
      failed = true
      break
    }
  }

  token('REVERTED', reverted)
  token('DRIFTED', drifted)
  token('UNREVERTED_BATCHES', (await openBatchIds(svc)).length)
  // A partial rollback must never read as clean.
  return failed || drifted > 0 ? 1 : 0
}

export async function runRestoreFromDump(svc: SupabaseClient, options: CliOptions): Promise<number> {
  const raw = JSON.parse(readFileSync(options.restorePath as string, 'utf8')) as {
    entries?: DumpEntry[]
  }
  const entries = raw.entries ?? []
  const { values, guards } = await currentValues(
    svc,
    entries.map((e) => e.target),
  )
  const differing = planRestoreFromDump(entries, values)
  log(`${entries.length} dumped value(s), ${differing.length} differ from what is live now`)

  const targetById = new Map(REWRITE_TARGETS.map((t) => [t.id, t]))
  let restored = 0
  for (const entry of differing) {
    const target = targetById.get(entry.target)
    if (!target) throw new Error(`[rewrite-asset-urls] unknown target ${entry.target}`)
    const key = changeKey(entry.target, entry.rowPk)

    const outcome = await writeValue(
      svc,
      target,
      entry.rowPk,
      entry.value,
      values.get(key),
      guards.get(key),
    )
    if (!outcome.ok) {
      console.error(`[rewrite-asset-urls] restore ${entry.target} ${entry.rowPk}: ${outcome.detail}`)
      token('REVERTED', restored)
      return 1
    }
    restored += 1
    log(`restored ${entry.target} ${entry.rowPk} -> ${truncate(entry.value)}`)
  }

  token('REVERTED', restored)
  return 0
}

/**
 * `argv` defaults to `process.argv.slice(2)` for real CLI invocations, and is
 * overridable so a test can drive it without inheriting the test runner's argv.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)

  if (isWriteMode(options.mode)) {
    const envRef = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const confirmed = assertProjectConfirmed(envRef, options.confirmProject)
    if (!confirmed.ok) {
      console.error(`[rewrite-asset-urls] REFUSING TO WRITE: ${confirmed.reason}`)
      return 1
    }
    log(`writing to project ${envRef} (confirmed)`)
  }

  const svc = requireServiceClient()

  switch (options.mode) {
    case 'preflight':
      return runPreflight(svc, options)
    case 'dry-run':
      return runDryRun(svc)
    case 'apply':
      return runApply(svc)
    case 'revert-latest':
    case 'revert':
      return runRevert(svc, options)
    case 'restore-from-dump':
      return runRestoreFromDump(svc, options)
  }
}

// Guard direct execution so importing this module runs no query, writes no row
// and never calls process.exit — the same pattern as scripts/r2-verify.ts and
// scripts/r2-migrate.ts.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[rewrite-asset-urls] failed:', err)
      process.exit(1)
    })
}
