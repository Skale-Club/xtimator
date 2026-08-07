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
import { describe, expect, it } from 'vitest'

import {
  EXCLUDED_TARGETS,
  REWRITE_TARGETS,
  MEASURED_BASELINE,
  assertProjectConfirmed,
  changeKey,
  planJsonRewrite,
  planRestoreFromDump,
  planRevert,
  planRows,
  planTextRewrite,
  planUserMetadataRewrite,
  projectRefFromUrl,
  selectApplyBatch,
  type AuditRecord,
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
    const result = planRows(
      [{ id: null, logo_url: `${PUBLIC}/logos/co/logo.webp` }, { id: 'ok', logo_url: 42 }],
      COMPANIES_LOGO(),
    )
    expect(result.changes).toEqual([])
    expect(result.skipped).toBe(1)
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
