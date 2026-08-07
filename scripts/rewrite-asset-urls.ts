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

import { rewriteAssetUrl, rewriteJsonAssetUrls } from '@/lib/storage/url-rewrite'

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
