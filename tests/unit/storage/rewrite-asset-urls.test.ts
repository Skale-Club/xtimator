/**
 * Phase 192 Plan 02 — URL-02: offline coverage for `scripts/rewrite-asset-urls.ts`.
 *
 * Everything here drives the PURE planning core with plain arrays of rows. Zero
 * network, zero Supabase client, zero credentials — which is the whole reason the
 * script keeps its decision logic in exported functions and its I/O in `main()`.
 *
 * Hostnames below are obviously fake (`fakeproj123.supabase.co`). Nothing in this
 * file names a real project ref.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  EXCLUDED_TARGETS,
  REWRITE_TARGETS,
  MEASURED_BASELINE,
  assertProjectConfirmed,
  changeKey,
  isWriteMode,
  parseArgs,
  planJsonRewrite,
  planRestoreFromDump,
  planRevert,
  planRows,
  planTextRewrite,
  planUserMetadataRewrite,
  projectRefFromUrl,
  runApply,
  runDryRun,
  runPreflight,
  runRestoreFromDump,
  runRevert,
  selectApplyBatch,
  type AuditRecord,
  type CliOptions,
  type DumpEntry,
  type RewriteTarget,
} from '@/scripts/rewrite-asset-urls'

/** Obviously-fake project. The real ref never appears in this repo's tests. */
const HOST = 'https://fakeproj123.supabase.co'
const PUBLIC = `${HOST}/storage/v1/object/public`

function target(id: string): RewriteTarget {
  const found = REWRITE_TARGETS.find((t) => t.id === id)
  if (!found) throw new Error(`test fixture error: no such target ${id}`)
  return found
}

const COMPANIES_LOGO = () => target('companies.logo_url')
const LANDING = () => target('platform_branding.landing_content')

/**
 * Mirrors the production `platform_branding.landing_content` shape measured on
 * 2026-08-06: 8 `.webp` images (1 hero + 3 step + 4 feature) plus ONE
 * `hero-bg-videos/` leaf that must stay absolute.
 */
function landingFixture() {
  return {
    hero: {
      title: 'Estimates in five minutes',
      imageUrl: `${PUBLIC}/platform-brand/landing/hero.webp`,
      backgroundVideoUrl: `${PUBLIC}/platform-brand/hero-bg-videos/loop.mp4`,
    },
    steps: [
      { label: 'Record', image: `${PUBLIC}/platform-brand/landing/step-1.webp` },
      { label: 'Review', image: `${PUBLIC}/platform-brand/landing/step-2.webp` },
      { label: 'Send', image: `${PUBLIC}/platform-brand/landing/step-3.webp` },
    ],
    features: [
      { image: `${PUBLIC}/platform-brand/landing/feature-1.webp` },
      { image: `${PUBLIC}/platform-brand/landing/feature-2.webp` },
      { image: `${PUBLIC}/platform-brand/landing/feature-3.webp` },
      { image: `${PUBLIC}/platform-brand/landing/feature-4.webp` },
    ],
    externalPartnerLogo: 'https://images.pexels.com/photos/1/partner.jpeg',
  }
}

describe('REWRITE_TARGETS / EXCLUDED_TARGETS — the census in code', () => {
  it('holds exactly the 8 census targets', () => {
    expect(REWRITE_TARGETS.map((t) => t.id).sort()).toEqual(
      [
        'auth.users.user_metadata',
        'blog_posts.cover_image_url',
        'clients.logo_url',
        'companies.logo_url',
        'platform_branding.favicon_url',
        'platform_branding.landing_content',
        'platform_branding.logo_url',
        'platform_branding.og_image_url',
      ].sort(),
    )
  })

  it('gives every target the five fields the apply/revert paths read', () => {
    for (const t of REWRITE_TARGETS) {
      expect(typeof t.id, t.id).toBe('string')
      expect(typeof t.table, t.id).toBe('string')
      expect(typeof t.column, t.id).toBe('string')
      expect(typeof t.pk, t.id).toBe('string')
      expect(['text', 'jsonb', 'user_metadata'], t.id).toContain(t.kind)
    }
  })

  it('records the measured 2026-08-06 baseline: 11 across 4 columns, four targets at zero', () => {
    const total = REWRITE_TARGETS.reduce((sum, t) => sum + (MEASURED_BASELINE[t.id] ?? 0), 0)
    expect(total).toBe(11)
    expect(MEASURED_BASELINE['companies.logo_url']).toBe(1)
    expect(MEASURED_BASELINE['platform_branding.logo_url']).toBe(1)
    expect(MEASURED_BASELINE['platform_branding.og_image_url']).toBe(1)
    expect(MEASURED_BASELINE['platform_branding.landing_content']).toBe(8)
    expect(
      REWRITE_TARGETS.filter((t) => (MEASURED_BASELINE[t.id] ?? 0) === 0).map((t) => t.id).sort(),
    ).toEqual(
      [
        'auth.users.user_metadata',
        'blog_posts.cover_image_url',
        'clients.logo_url',
        'platform_branding.favicon_url',
      ].sort(),
    )
  })

  it('has NO price-book entry in REWRITE_TARGETS — re-adding it fails here', () => {
    const offenders = REWRITE_TARGETS.filter(
      (t) => t.table.includes('price_book') || t.id.includes('price_book'),
    )
    expect(
      offenders.map((t) => t.id),
      'company_price_book.image_url holds 293 external images.pexels.com URLs and ZERO ' +
        'Supabase URLs. Adding it as a target would put 293 rows of working data in scope.',
    ).toEqual([])
  })

  it('carries the exclusion, its reason and its measured numbers IN CODE', () => {
    expect(EXCLUDED_TARGETS).toHaveLength(1)
    const excluded = EXCLUDED_TARGETS[0]
    expect(excluded.id).toBe('company_price_book.image_url')
    expect(excluded.table).toBe('company_price_book')
    expect(excluded.column).toBe('image_url')
    expect(excluded.measuredRows).toBe(293)
    expect(excluded.measuredSupabaseUrls).toBe(0)
    expect(excluded.reason.length).toBeGreaterThan(40)
    expect(excluded.reason).toMatch(/pexels/i)
  })
})

describe('planTextRewrite — selection is by Supabase URL prefix, never by column name', () => {
  it('rewrites an absolute Supabase logo URL to the same-origin path', () => {
    const changes = planTextRewrite(
      [{ id: 'co-1', logo_url: `${PUBLIC}/logos/co/logo.webp` }],
      COMPANIES_LOGO(),
    )
    expect(changes).toHaveLength(1)
    expect(changes[0].target).toBe('companies.logo_url')
    expect(changes[0].rowPk).toBe('co-1')
    expect(changes[0].kind).toBe('text')
    expect(changes[0].oldValue).toBe(`${PUBLIC}/logos/co/logo.webp`)
    expect(changes[0].newValue).toBe('/storage/logos/co/logo.webp')
    expect(changes[0].occurrences).toBe(1)
  })

  it('is idempotent: a row already on the same-origin path yields ZERO changes', () => {
    expect(
      planTextRewrite([{ id: 'co-1', logo_url: '/storage/logos/co/logo.webp' }], COMPANIES_LOGO()),
    ).toEqual([])
  })

  it('yields zero changes for null and for an empty string', () => {
    expect(planTextRewrite([{ id: 'a', logo_url: null }], COMPANIES_LOGO())).toEqual([])
    expect(planTextRewrite([{ id: 'b', logo_url: '' }], COMPANIES_LOGO())).toEqual([])
  })

  it('leaves an EXTERNAL url alone — the property that protects 293 price-book rows', () => {
    expect(
      planTextRewrite(
        [{ id: 'p-1', logo_url: 'https://images.pexels.com/photos/1/x.jpeg' }],
        COMPANIES_LOGO(),
      ),
      'an external stock-photo URL is not a Supabase storage URL and must never be touched',
    ).toEqual([])
  })

  it('never throws on a malformed row — it is skipped and counted', () => {
    // Two distinct malformed shapes: no usable primary key, and a non-string value
    // in a text column. Neither may throw, neither may be planned, and neither may
    // vanish silently — a dropped row that is not counted looks like a clean pass.
    const result = planRows(
      [{ id: null, logo_url: `${PUBLIC}/logos/co/logo.webp` }, { id: 'ok', logo_url: 42 }],
      COMPANIES_LOGO(),
    )
    expect(result.changes).toEqual([])
    expect(result.skipped).toBe(2)
  })

  it('counts an unserveable key without changing it', () => {
    // An empty inner segment survives parsing and is refused by the emitter.
    const result = planRows(
      [{ id: 'co-1', logo_url: `${PUBLIC}/logos//logo.webp` }],
      COMPANIES_LOGO(),
    )
    expect(result.changes).toEqual([])
    expect(result.unserveable).toBe(1)
  })
})

describe('planJsonRewrite — 8 of the 11 occurrences live in ONE document', () => {
  it('yields ONE document-level change carrying the whole old and new documents', () => {
    const original = landingFixture()
    const changes = planJsonRewrite([{ id: 1, landing_content: original }], LANDING())

    expect(changes).toHaveLength(1)
    expect(changes[0].rowPk).toBe('1')
    expect(changes[0].kind).toBe('jsonb')
    expect(changes[0].occurrences).toBe(8)
    expect(changes[0].oldValue, 'oldValue is the WHOLE document, so restore is one assignment').toEqual(
      landingFixture(),
    )

    const next = changes[0].newValue as ReturnType<typeof landingFixture>
    expect(next.hero.imageUrl).toBe('/storage/platform-brand/landing/hero.webp')
    expect(next.steps.map((s) => s.image)).toEqual([
      '/storage/platform-brand/landing/step-1.webp',
      '/storage/platform-brand/landing/step-2.webp',
      '/storage/platform-brand/landing/step-3.webp',
    ])
    expect(next.features.map((f) => f.image)).toEqual([
      '/storage/platform-brand/landing/feature-1.webp',
      '/storage/platform-brand/landing/feature-2.webp',
      '/storage/platform-brand/landing/feature-3.webp',
      '/storage/platform-brand/landing/feature-4.webp',
    ])
  })

  it('leaves the hero-bg-videos leaf ABSOLUTE (the documented exemption)', () => {
    const changes = planJsonRewrite([{ id: 1, landing_content: landingFixture() }], LANDING())
    const next = changes[0].newValue as ReturnType<typeof landingFixture>
    expect(
      next.hero.backgroundVideoUrl,
      'the proxy has no Range/206; Safari refuses such a <video>. This leaf stays absolute.',
    ).toBe(`${PUBLIC}/platform-brand/hero-bg-videos/loop.mp4`)
    expect(next.externalPartnerLogo).toBe('https://images.pexels.com/photos/1/partner.jpeg')
  })

  it('counts the exempt leaf without changing it', () => {
    const result = planRows([{ id: 1, landing_content: landingFixture() }], LANDING())
    expect(result.exempt).toBe(1)
    expect(result.occurrences).toBe(8)
  })

  it('yields zero changes for a document with no matching URLs', () => {
    expect(
      planJsonRewrite(
        [{ id: 1, landing_content: { hero: { title: 'x', imageUrl: '/storage/platform-brand/a.webp' } } }],
        LANDING(),
      ),
    ).toEqual([])
  })

  it('reads the optimistic-lock guard value alongside the document', () => {
    const changes = planJsonRewrite(
      [{ id: 1, landing_content: landingFixture(), updated_at: '2026-08-06T10:00:00Z' }],
      LANDING(),
    )
    expect(changes[0].guardValue).toBe('2026-08-06T10:00:00Z')
  })
})

describe('planUserMetadataRewrite — 8 production avatars, all OAuth, all untouched', () => {
  it('leaves an OAuth provider avatar alone', () => {
    expect(
      planUserMetadataRewrite([
        { id: 'u-1', user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/AAcd' } },
      ]),
    ).toEqual([])
  })

  it('rewrites a supabase-hosted avatar and records the WHOLE metadata object', () => {
    const changes = planUserMetadataRewrite([
      {
        id: 'u-2',
        user_metadata: { full_name: 'A B', avatar_url: `${PUBLIC}/logos/u-2/avatar.webp` },
      },
    ])
    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe('user_metadata')
    expect(changes[0].rowPk).toBe('u-2')
    expect(changes[0].oldValue).toEqual({
      full_name: 'A B',
      avatar_url: `${PUBLIC}/logos/u-2/avatar.webp`,
    })
    expect(changes[0].newValue).toEqual({
      full_name: 'A B',
      avatar_url: '/storage/logos/u-2/avatar.webp',
    })
  })

  it('yields zero changes for a null metadata object', () => {
    expect(planUserMetadataRewrite([{ id: 'u-3', user_metadata: null }])).toEqual([])
  })
})

describe('projectRefFromUrl / assertProjectConfirmed — the wrong-database guard', () => {
  it('extracts the ref from a well-formed project URL', () => {
    expect(projectRefFromUrl('https://abc123.supabase.co')).toBe('abc123')
    expect(projectRefFromUrl('https://abc123.supabase.co/')).toBe('abc123')
  })

  it('returns null for malformed or non-Supabase input', () => {
    expect(projectRefFromUrl(undefined)).toBeNull()
    expect(projectRefFromUrl('')).toBeNull()
    expect(projectRefFromUrl('not a url')).toBeNull()
    expect(projectRefFromUrl('http://localhost:54321')).toBeNull()
    expect(projectRefFromUrl('https://evil.example.com')).toBeNull()
  })

  it('confirms only an exact match', () => {
    expect(assertProjectConfirmed('abc123', 'abc123')).toEqual({ ok: true })
  })

  it('refuses a MISMATCHED ref', () => {
    const result = assertProjectConfirmed('abc123', 'other')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/confirm-project/)
  })

  it('refuses an ABSENT ref and names the flag', () => {
    const result = assertProjectConfirmed('abc123', null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/--confirm-project/)
  })

  it('refuses when the environment itself yields no ref', () => {
    expect(assertProjectConfirmed(null, 'abc123').ok).toBe(false)
  })
})

describe('planRevert — a newer upload is never clobbered', () => {
  const record: AuditRecord = {
    id: 7,
    batch_id: 'batch-a',
    target: 'companies.logo_url',
    row_pk: 'co-1',
    value_kind: 'text',
    old_value: `${PUBLIC}/logos/co/logo.webp`,
    new_value: '/storage/logos/co/logo.webp',
  }

  it('restores a row still holding exactly what the rewrite wrote', () => {
    const current = new Map<string, unknown>([
      [changeKey('companies.logo_url', 'co-1'), '/storage/logos/co/logo.webp'],
    ])
    const { restore, drifted } = planRevert([record], current)
    expect(restore).toEqual([record])
    expect(drifted).toEqual([])
  })

  it('marks a row that changed after the rewrite as DRIFTED, never restored', () => {
    const current = new Map<string, unknown>([
      [changeKey('companies.logo_url', 'co-1'), '/storage/logos/co/newer-upload.webp'],
    ])
    const { restore, drifted } = planRevert([record], current)
    expect(restore).toEqual([])
    expect(drifted).toEqual([record])
  })

  it('never puts the same record in both buckets', () => {
    const current = new Map<string, unknown>([
      [changeKey('companies.logo_url', 'co-1'), '/storage/logos/co/logo.webp'],
    ])
    const { restore, drifted } = planRevert([record], current)
    const overlap = restore.filter((r) => drifted.some((d) => d.id === r.id))
    expect(overlap).toEqual([])
    expect(restore.length + drifted.length).toBe(1)
  })

  it('treats a vanished row as drifted rather than silently restoring nothing', () => {
    const { restore, drifted } = planRevert([record], new Map())
    expect(restore).toEqual([])
    expect(drifted).toEqual([record])
  })

  it('compares whole documents structurally (jsonb does not preserve key order)', () => {
    const jsonRecord: AuditRecord = {
      id: 8,
      batch_id: 'batch-a',
      target: 'platform_branding.landing_content',
      row_pk: '1',
      value_kind: 'jsonb',
      old_value: { a: 1, b: { c: 2 } },
      new_value: { a: 1, b: { c: 3 } },
    }
    const current = new Map<string, unknown>([
      [changeKey('platform_branding.landing_content', '1'), { b: { c: 3 }, a: 1 }],
    ])
    const { restore, drifted } = planRevert([jsonRecord], current)
    expect(restore).toEqual([jsonRecord])
    expect(drifted).toEqual([])
  })
})

describe('selectApplyBatch — a crashed apply must not mint a second batch', () => {
  it('mints a new uuid when nothing is open', () => {
    const { batchId, reused } = selectApplyBatch([])
    expect(reused).toBe(false)
    expect(batchId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('REUSES an open batch instead of minting a second one', () => {
    const open = '11111111-2222-3333-4444-555555555555'
    expect(selectApplyBatch([open])).toEqual({ batchId: open, reused: true })
  })

  it('reuses the FIRST id given (the caller supplies them newest-first)', () => {
    const newest = '11111111-2222-3333-4444-555555555555'
    const older = '99999999-8888-7777-6666-555555555555'
    expect(selectApplyBatch([newest, older]).batchId).toBe(newest)
  })
})

describe('planRestoreFromDump — the independent second restore path', () => {
  const dump: DumpEntry[] = [
    {
      target: 'companies.logo_url',
      rowPk: 'co-1',
      kind: 'text',
      value: `${PUBLIC}/logos/co/logo.webp`,
    },
    { target: 'platform_branding.logo_url', rowPk: '1', kind: 'text', value: null },
  ]

  it('produces one entry per differing value', () => {
    const current = new Map<string, unknown>([
      [changeKey('companies.logo_url', 'co-1'), '/storage/logos/co/logo.webp'],
      [changeKey('platform_branding.logo_url', '1'), null],
    ])
    expect(planRestoreFromDump(dump, current)).toEqual([dump[0]])
  })

  it('produces nothing when every value already equals the dump', () => {
    const current = new Map<string, unknown>([
      [changeKey('companies.logo_url', 'co-1'), `${PUBLIC}/logos/co/logo.webp`],
      [changeKey('platform_branding.logo_url', '1'), null],
    ])
    expect(planRestoreFromDump(dump, current)).toEqual([])
  })
})

describe('importing the module has no side effects', () => {
  it('did not set a process exit code and did not touch process.argv', () => {
    expect(process.exitCode).toBeUndefined()
  })
})

// ===========================================================================
// CLI surface
// ===========================================================================

describe('parseArgs — an ignored flag is how a read-only check becomes a write run', () => {
  it('defaults to dry-run', () => {
    expect(parseArgs([]).mode).toBe('dry-run')
    expect(isWriteMode('dry-run')).toBe(false)
    expect(isWriteMode('preflight')).toBe(false)
  })

  it('recognises every mode and marks the writing ones', () => {
    expect(parseArgs(['--preflight']).mode).toBe('preflight')
    expect(parseArgs(['--apply']).mode).toBe('apply')
    expect(parseArgs(['--revert-latest']).mode).toBe('revert-latest')
    expect(parseArgs(['--revert', 'b-1'])).toMatchObject({ mode: 'revert', batchId: 'b-1' })
    expect(parseArgs(['--restore-from-dump', '/tmp/x.json'])).toMatchObject({
      mode: 'restore-from-dump',
      restorePath: '/tmp/x.json',
    })
    for (const mode of ['apply', 'revert-latest', 'revert', 'restore-from-dump'] as const) {
      expect(isWriteMode(mode), mode).toBe(true)
    }
  })

  it('carries --confirm-project, --dump and --force', () => {
    expect(
      parseArgs(['--preflight', '--dump', '/out/pre.json', '--confirm-project', 'abc123', '--force']),
    ).toMatchObject({
      mode: 'preflight',
      dumpPath: '/out/pre.json',
      confirmProject: 'abc123',
      force: true,
    })
  })

  it('THROWS on an unrecognized flag rather than ignoring it', () => {
    expect(() => parseArgs(['--dryrun'])).toThrow(/unrecognized flag/)
  })

  it('THROWS when two modes are requested', () => {
    expect(() => parseArgs(['--apply', '--preflight'])).toThrow(/two modes/)
  })

  it('THROWS when a value-taking flag has no value', () => {
    expect(() => parseArgs(['--confirm-project'])).toThrow(/requires a value/)
    expect(() => parseArgs(['--dump', '--force'])).toThrow(/requires a value/)
  })
})

// ===========================================================================
// The I/O shell, driven offline against a fake PostgREST client
// ===========================================================================

interface FakeDb {
  seq: number
  tables: Record<string, Record<string, unknown>[]>
  users: { id: string; user_metadata: Record<string, unknown> | null }[]
  missingTables: Set<string>
  /** Fires just before an update executes — used to simulate a concurrent save. */
  beforeUpdate?: (table: string) => void
}

type Filter = { op: 'eq' | 'is'; col: string; value: unknown }

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((f) => {
    const actual = row[f.col]
    if (f.op === 'is') return actual === null || actual === undefined
    if (actual === f.value) return true
    if (actual === null || actual === undefined) return false
    if (typeof actual === 'object' || typeof f.value === 'object') {
      return JSON.stringify(actual) === JSON.stringify(f.value)
    }
    return String(actual) === String(f.value)
  })
}

/**
 * A deliberately small stand-in for the PostgREST query builder: enough to drive
 * the apply/revert/restore paths with real data and a real unique constraint, and
 * nothing more. It exists so the ONE script that mutates production rows has its
 * compare-and-set, its 1-row assertion, its crash-resume and its rollback
 * exercised with zero credentials and zero network.
 */
function fakeClient(db: FakeDb) {
  const AUDIT = 'storage_url_rewrites'

  function from(table: string) {
    const filters: Filter[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Record<string, unknown> | Record<string, unknown>[] | null = null
    let returning = false
    let limitN: number | null = null
    let orderCol: string | null = null
    let orderAscending = true

    function execute(): { data: unknown; error: unknown } {
      if (db.missingTables.has(table)) {
        return {
          data: null,
          error: { message: `relation "public.${table}" does not exist`, code: '42P01' },
        }
      }
      const rows = (db.tables[table] ??= [])

      if (op === 'insert') {
        const incoming = Array.isArray(payload) ? payload : [payload as Record<string, unknown>]
        const created: Record<string, unknown>[] = []
        for (const candidate of incoming) {
          if (table === AUDIT) {
            const clash = rows.some(
              (r) =>
                r.batch_id === candidate.batch_id &&
                r.target === candidate.target &&
                r.row_pk === candidate.row_pk,
            )
            if (clash) {
              return {
                data: null,
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
              }
            }
          }
          const row = { id: (db.seq += 1), reverted_at: null, ...candidate }
          rows.push(row)
          created.push(row)
        }
        return { data: returning ? created : null, error: null }
      }

      if (op === 'update') {
        db.beforeUpdate?.(table)
        const affected = rows.filter((r) => matches(r, filters))
        for (const row of affected) Object.assign(row, payload)
        return { data: returning ? affected : null, error: null }
      }

      if (op === 'delete') {
        const affected = rows.filter((r) => matches(r, filters))
        db.tables[table] = rows.filter((r) => !affected.includes(r))
        return { data: returning ? affected : null, error: null }
      }

      let selected = rows.filter((r) => matches(r, filters))
      if (orderCol) {
        const col = orderCol
        selected = [...selected].sort((a, b) => {
          const left = Number(a[col] ?? 0)
          const right = Number(b[col] ?? 0)
          return orderAscending ? left - right : right - left
        })
      }
      if (limitN !== null) selected = selected.slice(0, limitN)
      return { data: selected.map((r) => ({ ...r })), error: null }
    }

    const api: Record<string, unknown> = {
      select(_cols?: string) {
        if (op !== 'select') returning = true
        return api
      },
      insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
        op = 'insert'
        payload = rows
        return api
      },
      update(patch: Record<string, unknown>) {
        op = 'update'
        payload = patch
        return api
      },
      delete() {
        op = 'delete'
        return api
      },
      eq(col: string, value: unknown) {
        filters.push({ op: 'eq', col, value })
        return api
      },
      is(col: string, value: unknown) {
        filters.push({ op: 'is', col, value })
        return api
      },
      limit(n: number) {
        limitN = n
        return api
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col
        orderAscending = opts?.ascending !== false
        return api
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(execute()).then(onFulfilled, onRejected)
      },
    }
    return api
  }

  return {
    from,
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: db.users.map((u) => ({ ...u })) }, error: null }
        },
        async getUserById(id: string) {
          const user = db.users.find((u) => u.id === id)
          return { data: { user: user ? { ...user } : null }, error: null }
        },
        async updateUserById(id: string, attrs: { user_metadata?: Record<string, unknown> }) {
          const user = db.users.find((u) => u.id === id)
          if (!user) return { data: { user: null }, error: null }
          user.user_metadata = { ...(user.user_metadata ?? {}), ...(attrs.user_metadata ?? {}) }
          return { data: { user: { ...user } }, error: null }
        },
      },
    },
  }
}

/** Mirrors the measured production census exactly: 11 occurrences, 4 columns. */
function seedDb(): FakeDb {
  return {
    seq: 0,
    missingTables: new Set<string>(),
    tables: {
      companies: [{ id: 'co-1', logo_url: `${PUBLIC}/logos/co/logo.webp` }],
      clients: [],
      platform_branding: [
        {
          id: 1,
          logo_url: `${PUBLIC}/platform-brand/logo.webp`,
          og_image_url: `${PUBLIC}/platform-brand/og.png`,
          favicon_url: null,
          landing_content: landingFixture(),
          updated_at: '2026-08-06T10:00:00Z',
        },
      ],
      blog_posts: [],
      company_price_book: [{ image_url: 'https://images.pexels.com/photos/1/x.jpeg' }],
      storage_url_rewrites: [],
    },
    users: [{ id: 'u-1', user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/AAcd' } }],
  }
}

type Client = Parameters<typeof runApply>[0]

function asClient(db: FakeDb): Client {
  return fakeClient(db) as unknown as Client
}

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string[] }> {
  const out: string[] = []
  const push = (...args: unknown[]) => {
    out.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
  }
  const logSpy = vi.spyOn(console, 'log').mockImplementation(push)
  const errSpy = vi.spyOn(console, 'error').mockImplementation(push)
  try {
    const code = await fn()
    return { code, out }
  } finally {
    logSpy.mockRestore()
    errSpy.mockRestore()
  }
}

const PREFLIGHT_OPTS: CliOptions = {
  mode: 'preflight',
  confirmProject: null,
  dumpPath: null,
  restorePath: null,
  batchId: null,
  force: false,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('--dry-run — the default mode writes NOTHING', () => {
  it('reports the measured census and plans 4 changes over 11 occurrences', async () => {
    const db = seedDb()
    const { code, out } = await capture(() => runDryRun(asClient(db)))

    expect(code).toBe(0)
    expect(out).toContain('CENSUS_TOTAL=11')
    expect(out).toContain('PLANNED_CHANGES=4')
    expect(out).toContain('EXEMPT_VIDEO=1')
    expect(out).toContain('SKIPPED_UNSERVEABLE=0')
  })

  it('leaves every row and the audit table untouched', async () => {
    const db = seedDb()
    await capture(() => runDryRun(asClient(db)))
    expect(db.tables.companies[0].logo_url).toBe(`${PUBLIC}/logos/co/logo.webp`)
    expect(db.tables.storage_url_rewrites).toEqual([])
  })
})

describe('--apply — safe writes and a complete record', () => {
  it('rewrites all four columns, records four audit rows, and is idempotent on re-run', async () => {
    const db = seedDb()
    const first = await capture(() => runApply(asClient(db)))

    expect(first.code).toBe(0)
    expect(first.out).toContain('APPLIED_CHANGES=4')
    expect(first.out).toContain('BATCH_REUSED=false')
    expect(first.out).toContain('CENSUS_TOTAL=11')

    expect(db.tables.companies[0].logo_url).toBe('/storage/logos/co/logo.webp')
    expect(db.tables.platform_branding[0].logo_url).toBe('/storage/platform-brand/logo.webp')
    expect(db.tables.platform_branding[0].og_image_url).toBe('/storage/platform-brand/og.png')

    const landing = db.tables.platform_branding[0].landing_content as ReturnType<typeof landingFixture>
    expect(landing.hero.imageUrl).toBe('/storage/platform-brand/landing/hero.webp')
    expect(
      landing.hero.backgroundVideoUrl,
      'the exempt video leaf must survive a real apply, not just the planner',
    ).toBe(`${PUBLIC}/platform-brand/hero-bg-videos/loop.mp4`)
    expect(db.tables.storage_url_rewrites).toHaveLength(4)

    const second = await capture(() => runApply(asClient(db)))
    expect(second.code).toBe(0)
    expect(second.out).toContain('PLANNED_CHANGES=0')
    expect(second.out).toContain('APPLIED_CHANGES=0')
    expect(db.tables.storage_url_rewrites).toHaveLength(4)
  })

  it('REUSES an open batch after a crash instead of minting a second one', async () => {
    const db = seedDb()
    // A crashed run that recorded one row and died before writing it.
    db.tables.storage_url_rewrites.push({
      id: (db.seq += 1),
      batch_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      target: 'companies.logo_url',
      row_pk: 'co-1',
      value_kind: 'text',
      old_value: `${PUBLIC}/logos/co/logo.webp`,
      new_value: '/storage/logos/co/logo.webp',
      reverted_at: null,
    })

    const { code, out } = await capture(() => runApply(asClient(db)))
    expect(code).toBe(0)
    expect(out).toContain('BATCH_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(out).toContain('BATCH_REUSED=true')
    expect(out).toContain('APPLIED_CHANGES=4')

    const batches = new Set(db.tables.storage_url_rewrites.map((r) => r.batch_id))
    expect(
      [...batches],
      'a second batch here is exactly how --revert-latest restores half of production',
    ).toEqual(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])
    expect(db.tables.companies[0].logo_url).toBe('/storage/logos/co/logo.webp')
  })

  it('ABORTS on a 0-row update and deletes the audit row it had just inserted', async () => {
    const db = seedDb()
    // A concurrent admin save landing between the read and the write: the
    // compare-and-set filter stops matching.
    let fired = false
    db.beforeUpdate = (table) => {
      if (table !== 'companies' || fired) return
      fired = true
      db.tables.companies[0].logo_url = `${PUBLIC}/logos/co/someone-elses-upload.webp`
    }

    const { code, out } = await capture(() => runApply(asClient(db)))

    expect(code, 'a 0-row update must abort the run, not be reported as applied').toBe(1)
    expect(out).toContain('APPLIED_CHANGES=0')
    expect(out.join('\n')).toMatch(/expected exactly 1 row affected, got 0/)
    expect(
      db.tables.storage_url_rewrites,
      'an audit row claiming a change that did not happen would later read as drift',
    ).toEqual([])
    expect(db.tables.companies[0].logo_url).toBe(`${PUBLIC}/logos/co/someone-elses-upload.webp`)
  })
})

describe('--revert-latest — completeness over convenience', () => {
  function revertOpts(overrides: Partial<CliOptions> = {}): CliOptions {
    return { ...PREFLIGHT_OPTS, mode: 'revert-latest', ...overrides }
  }

  function seedTwoOpenBatches(): FakeDb {
    const db = seedDb()
    db.tables.companies[0].logo_url = '/storage/logos/co/logo.webp'
    db.tables.platform_branding[0].logo_url = '/storage/platform-brand/logo.webp'
    db.tables.storage_url_rewrites.push(
      {
        id: (db.seq += 1),
        batch_id: 'batch-older',
        target: 'companies.logo_url',
        row_pk: 'co-1',
        value_kind: 'text',
        old_value: `${PUBLIC}/logos/co/logo.webp`,
        new_value: '/storage/logos/co/logo.webp',
        reverted_at: null,
      },
      {
        id: (db.seq += 1),
        batch_id: 'batch-newer',
        target: 'platform_branding.logo_url',
        row_pk: '1',
        value_kind: 'text',
        old_value: `${PUBLIC}/platform-brand/logo.webp`,
        new_value: '/storage/platform-brand/logo.webp',
        reverted_at: null,
      },
    )
    return db
  }

  it('reverts ALL open batches in one run and closes them', async () => {
    const db = seedTwoOpenBatches()
    const { code, out } = await capture(() => runRevert(asClient(db), revertOpts()))

    expect(code).toBe(0)
    expect(out).toContain('UNREVERTED_BATCHES=2')
    expect(out).toContain('REVERTED=2')
    expect(out).toContain('DRIFTED=0')
    expect(out[out.length - 1], 'the final count must be zero, not the opening one').toBe(
      'UNREVERTED_BATCHES=0',
    )
    expect(db.tables.companies[0].logo_url).toBe(`${PUBLIC}/logos/co/logo.webp`)
    expect(db.tables.platform_branding[0].logo_url).toBe(`${PUBLIC}/platform-brand/logo.webp`)
    expect(db.tables.storage_url_rewrites.every((r) => r.reverted_at !== null)).toBe(true)
  })

  it('refuses a DRIFTED row and exits non-zero so a partial rollback cannot read as clean', async () => {
    const db = seedTwoOpenBatches()
    db.tables.companies[0].logo_url = '/storage/logos/co/newer-upload.webp'

    const { code, out } = await capture(() => runRevert(asClient(db), revertOpts()))

    expect(code).toBe(1)
    expect(out).toContain('DRIFTED=1')
    expect(out).toContain('REVERTED=1')
    expect(db.tables.companies[0].logo_url).toBe('/storage/logos/co/newer-upload.webp')
  })

  it('--force restores the drifted row and says so loudly', async () => {
    const db = seedTwoOpenBatches()
    db.tables.companies[0].logo_url = '/storage/logos/co/newer-upload.webp'

    const { code, out } = await capture(() => runRevert(asClient(db), revertOpts({ force: true })))

    expect(code).toBe(0)
    expect(out).toContain('DRIFTED=0')
    expect(out).toContain('REVERTED=2')
    expect(out.join('\n')).toMatch(/--force: ALSO restoring 1 DRIFTED row/)
    expect(db.tables.companies[0].logo_url).toBe(`${PUBLIC}/logos/co/logo.webp`)
  })

  it('--revert <batch-id> prints what it is NOT reverting', async () => {
    const db = seedTwoOpenBatches()
    const { out } = await capture(() =>
      runRevert(asClient(db), revertOpts({ mode: 'revert', batchId: 'batch-newer' })),
    )
    expect(out).toContain('UNREVERTED_BATCHES=2')
    expect(out.join('\n')).toMatch(/NOT touching the others/)
    expect(out[out.length - 1]).toBe('UNREVERTED_BATCHES=1')
  })
})

describe('--restore-from-dump — the independent second restore path', () => {
  it('restores only what differs from the dumped pre-state', async () => {
    const db = seedDb()
    const dir = mkdtempSync(join(tmpdir(), 'rewrite-dump-'))
    const dumpPath = join(dir, 'pre-state.json')

    // Take the pre-state, apply, then restore from the dump alone.
    const preflight = await capture(() =>
      runPreflight(asClient(db), { ...PREFLIGHT_OPTS, dumpPath }),
    )
    expect(preflight.out).toContain('CENSUS_TOTAL=11')

    await capture(() => runApply(asClient(db)))
    expect(db.tables.companies[0].logo_url).toBe('/storage/logos/co/logo.webp')

    const { code, out } = await capture(() =>
      runRestoreFromDump(asClient(db), {
        ...PREFLIGHT_OPTS,
        mode: 'restore-from-dump',
        restorePath: dumpPath,
      }),
    )

    expect(code).toBe(0)
    expect(out).toContain('REVERTED=4')
    expect(db.tables.companies[0].logo_url).toBe(`${PUBLIC}/logos/co/logo.webp`)
    expect(db.tables.platform_branding[0].og_image_url).toBe(`${PUBLIC}/platform-brand/og.png`)

    const dumped = JSON.parse(readFileSync(dumpPath, 'utf8')) as { entries: DumpEntry[] }
    expect(dumped.entries.length).toBeGreaterThan(0)
  })
})

describe('--preflight — read-only, and it BLOCKS rather than warns', () => {
  it('passes on a healthy database and prints the exclusion re-counted live', async () => {
    const db = seedDb()
    const { code, out } = await capture(() => runPreflight(asClient(db), PREFLIGHT_OPTS))

    expect(code).toBe(0)
    expect(out).toContain('PREFLIGHT_BLOCKERS=0')
    expect(out).toContain('CENSUS_TOTAL=11')
    expect(out).toContain('EXCLUDED_PRICE_BOOK_ROWS=1')
    expect(out).toContain('EXCLUDED_PRICE_BOOK_SUPABASE_URLS=0')
    expect(out).toContain('UNREVERTED_BATCHES=0')
    expect(out).toContain('EXEMPT_VIDEO=1')
  })

  it('BLOCKS when the audit table has not been applied by hand yet', async () => {
    const db = seedDb()
    db.missingTables.add('storage_url_rewrites')

    const { code, out } = await capture(() => runPreflight(asClient(db), PREFLIGHT_OPTS))

    expect(code, 'Plan 03 treats a preflight blocker as a STOP').toBe(1)
    expect(out).toContain('PREFLIGHT_BLOCKERS=1')
    expect(out.join('\n')).toMatch(/applied to production BY HAND/)
  })

  it('BLOCKS if a Supabase URL ever appears in the excluded price-book column', async () => {
    const db = seedDb()
    db.tables.company_price_book.push({ image_url: `${PUBLIC}/photos/co/item.webp` })

    const { code, out } = await capture(() => runPreflight(asClient(db), PREFLIGHT_OPTS))

    expect(code).toBe(1)
    expect(out).toContain('EXCLUDED_PRICE_BOOK_SUPABASE_URLS=1')
    expect(out).toContain('EXCLUDED_PRICE_BOOK_ROWS=2')
    expect(out.join('\n')).toMatch(/exclusion was decided on the measured fact/)
  })

  it('WARNS (never passes) about R2 and about an already-open batch', async () => {
    const db = seedDb()
    db.tables.storage_url_rewrites.push({
      id: (db.seq += 1),
      batch_id: 'batch-open',
      target: 'companies.logo_url',
      row_pk: 'co-1',
      value_kind: 'text',
      old_value: 'x',
      new_value: 'y',
      reverted_at: null,
    })

    const { out } = await capture(() => runPreflight(asClient(db), PREFLIGHT_OPTS))
    const text = out.join('\n')
    // No `s` flag: this repo's tsconfig target predates it (TS1501).
    expect(text).toMatch(/\[WARN\] R2 object presence \(Phase 191\) is NOT verified/)
    expect(text).toMatch(/\[WARN\] 1 unreverted batch\(es\) exist/)
    expect(out).toContain('UNREVERTED_BATCHES=1')
  })
})

// ===========================================================================
// Static properties of the script itself
// ===========================================================================

describe('scripts/rewrite-asset-urls.ts — static invariants', () => {
  const SCRIPT_PATH = resolve(process.cwd(), 'scripts/rewrite-asset-urls.ts')
  const raw = readFileSync(SCRIPT_PATH, 'utf8')

  /**
   * Per Plan 01's finding: three of its verification greps returned COMMENT-only
   * matches because the plan's own mandated comments contained the identifiers
   * being searched for. These checks run against the comment-stripped body, and
   * the stripper is proven non-vacuous below.
   */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/)
      .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
      .join('\n')
  }

  const body = stripComments(raw)

  it('the comment stripper is not vacuous', () => {
    expect(raw).toMatch(/LOAD-BEARING/)
    expect(body, 'the stripper failed to remove the docblock').not.toMatch(/LOAD-BEARING/)
    expect(body, 'the stripper removed executable code').toMatch(/export const REWRITE_TARGETS/)
  })

  it('never mentions the raw absolute-URL provider method, in code OR in comments', () => {
    // Phase 190 repointed ~14 CALL SITES; the provider method itself is still
    // absolute on purpose (the video exemption depends on it). A preflight check
    // asserting it returns a same-origin path would be FALSE and would fire on
    // every run, deadlocking Plan 03.
    expect(raw).not.toMatch(/getPublicUrl/)
  })

  it('asserts storageProxyPath instead', () => {
    expect(body).toMatch(/storageProxyPath\('logos', 'x\/y\.webp'\)/)
    expect(body).toMatch(/'\/storage\/logos\/x\/y\.webp'/)
  })

  it('names the price-book table ONLY inside EXCLUDED_TARGETS', () => {
    const excludedBlock = /export const EXCLUDED_TARGETS[\s\S]*?\n\]/.exec(body)?.[0] ?? ''
    const totalHits = (body.match(/company_price_book/g) ?? []).length
    const inExclusion = (excludedBlock.match(/company_price_book/g) ?? []).length
    expect(totalHits).toBeGreaterThan(0)
    expect(inExclusion, 'selection must be by URL prefix, never by column name').toBe(totalHits)
  })

  it('contains no paging machinery — the measured scope is 11 occurrences', () => {
    expect(body).not.toMatch(/PAGE_SIZE|chunk|offset/i)
  })

  it('reads back the affected rows of every update it performs', () => {
    const segments = body.split('.update(').slice(1)
    expect(segments.length).toBeGreaterThan(0)
    for (const segment of segments) {
      expect(
        segment.slice(0, 400),
        'every update must .select() its affected rows so "the write landed" is OBSERVED',
      ).toMatch(/\.select\(/)
    }
  })

  it('delegates all URL translation to lib/storage/url-rewrite', () => {
    expect(body).toMatch(/from '@\/lib\/storage\/url-rewrite'/)
    expect(body).toMatch(/rewriteAssetUrl/)
    expect(body).toMatch(/rewriteJsonAssetUrls/)
  })
})

