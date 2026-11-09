// @vitest-environment node
//
// SEED-057 Phase G guard: the AI's assumptions, exclusions, open questions,
// structure findings and per-line confidence / basis are OWNER-FACING ONLY. They
// must not appear on any client-facing surface: the public share page (classic +
// modern), both PDFs, the WhatsApp message or the plain-text message.
//
// Two layers:
//   1. behavioural: the public share loaders strip ai_meta and the per-line
//      columns before the row is spread into a CLIENT component's props (the
//      page serialises props into the browser, so rendering is not the only leak);
//   2. static: no client-facing source file so much as mentions an owner-only field.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const { serviceClientMock } = vi.hoisted(() => ({ serviceClientMock: { from: vi.fn() } }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => serviceClientMock }))

import { stripOwnerOnlyEstimate, stripOwnerOnlyItem } from '@/lib/estimate/ai-meta'
import { getEstimateByPublicToken, getEstimateByShareToken } from '@/lib/queries/share'

type AnyRow = Record<string, unknown>

const ESTIMATE: AnyRow = {
  id: 'e1',
  project_id: 'p1',
  company_id: 'c1',
  total: 100,
  currency_code: 'USD',
  summary: 'Job summary',
  share_token: 'tok-SECRET',
  public_slug_token: 'shorttok123',
  share_expires_at: null,
  payment_status: 'unpaid',
  ai_meta: {
    v: 1,
    assumptions: ['SECRET-ASSUMPTION'],
    open_questions: [{ question: 'SECRET-QUESTION', impact: 'high' }],
    quality: { score: 40, band: 'refine', findings: ['SECRET-FINDING'] },
  },
}
const SECTION: AnyRow = { id: 's1', estimate_id: 'e1', title: 'Work', sort_order: 0, subtotal: 100 }
const ITEM: AnyRow = {
  id: 'i1',
  section_id: 's1',
  description: 'Paint walls',
  quantity: 1,
  unit: 'job',
  unit_price: 100,
  total: 100,
  sort_order: 0,
  price_source: 'ai_estimate',
  confidence: 'low',
  basis: 'SECRET-BASIS',
  optional: true,
}

function installMock() {
  serviceClientMock.from.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { ...ESTIMATE } }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
        })),
      }
    }
    if (table === 'estimate_sections') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [SECTION] }) })) })) }
    }
    if (table === 'estimate_items') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ ...ITEM }] }) })) })) }
    }
    if (table === 'projects') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { name: 'Kitchen', client: null } }) })) })) }
    }
    if (table === 'companies') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { name: 'Acme' } }) })) })) }
    }
    if (table === 'estimate_photos') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })) })) }
    }
    if (table === 'estimate_signatures') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })) })),
        })),
      }
    }
    return { select: vi.fn() }
  })
}

describe('strip helpers', () => {
  it('remove only the owner-only fields', () => {
    expect(stripOwnerOnlyEstimate({ id: 'e', ai_meta: { v: 1 }, summary: 's' })).toEqual({ id: 'e', summary: 's' })
    expect(stripOwnerOnlyItem({ id: 'i', confidence: 'low', basis: 'b', optional: true, unit_price: 5 })).toEqual({ id: 'i', unit_price: 5 })
  })

  it('never mutate their input', () => {
    const row = { id: 'e', ai_meta: { v: 1 } }
    stripOwnerOnlyEstimate(row)
    expect(row).toHaveProperty('ai_meta')
  })
})

describe('public share loaders never hand owner-only AI data to the page', () => {
  beforeEach(() => installMock())

  it.each([
    ['getEstimateByPublicToken', () => getEstimateByPublicToken('shorttok123')],
    ['getEstimateByShareToken', () => getEstimateByShareToken('tok-SECRET')],
  ] as const)('%s', async (_name, load) => {
    const data = await load()
    expect(data).not.toBeNull()
    const serialised = JSON.stringify(data)
    for (const secret of ['SECRET-ASSUMPTION', 'SECRET-QUESTION', 'SECRET-FINDING', 'SECRET-BASIS', 'ai_meta']) {
      expect(serialised, secret).not.toContain(secret)
    }
    const estimate = (data as { estimate: AnyRow }).estimate
    expect(estimate).not.toHaveProperty('ai_meta')
    const items = (estimate.sections as Array<{ items: AnyRow[] }>).flatMap((s) => s.items)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item).not.toHaveProperty('confidence')
      expect(item).not.toHaveProperty('basis')
      expect(item).not.toHaveProperty('optional')
    }
    // ...while the content the client is meant to see is intact.
    expect(estimate.summary).toBe('Job summary')
    expect(items[0].description).toBe('Paint walls')
  })
})

// ---------------------------------------------------------------------------
// Static guard over the client-facing sources.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..', '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const CLIENT_FACING = [
  'components/share',
  'components/pdf',
  'lib/pdf',
  'lib/estimate/pagination',
  'lib/estimate/templates',
  'lib/whatsapp/formatter.ts',
  'lib/whatsapp/send-estimate.ts',
  'lib/utils/estimate-template.ts',
  'app/estimate',
  // The MCP read tools return whole rows to an external agent.
  'lib/mcp/tools/read.ts',
].flatMap((p) => {
  const full = join(ROOT, p)
  try {
    return statSync(full).isDirectory() ? walk(full) : [full]
  } catch {
    return []
  }
})

// The names of owner-only data. `confidence` is matched as a property access or
// key so an unrelated English word in a comment does not trip it.
const OWNER_ONLY = [
  /\bai_meta\b/,
  /\bparseAiMeta\b/,
  /\bopen_questions\b/,
  /\bAiInsightsPanel\b/,
  /\bConfidenceDot\b/,
  /\bscope_confidence\b/,
  /\.(confidence|basis)\b(?!\s*:)/,
  /\bitem\.(confidence|basis)\b/,
]

describe('client-facing sources never reference owner-only AI data', () => {
  it('finds the surfaces it is supposed to guard', () => {
    expect(CLIENT_FACING.length).toBeGreaterThan(10)
    const rel = CLIENT_FACING.map((f) => relative(ROOT, f).replace(/\\/g, '/'))
    expect(rel.some((f) => f.startsWith('components/share/'))).toBe(true)
    expect(rel.some((f) => f.startsWith('components/pdf/'))).toBe(true)
    expect(rel).toContain('lib/whatsapp/formatter.ts')
    expect(rel).toContain('lib/utils/estimate-template.ts')
    expect(rel).toContain('lib/mcp/tools/read.ts')
  })

  it('the MCP get_estimate tool strips the owner-only fields before returning a row', () => {
    const source = readFileSync(join(ROOT, 'lib/mcp/tools/read.ts'), 'utf8')
    expect(source).toContain('stripOwnerOnlyEstimate(')
    expect(source).toContain('stripOwnerOnlyItem')
  })

  it.each(CLIENT_FACING.map((f) => [relative(ROOT, f).replace(/\\/g, '/'), f] as const))('%s', (_name, file) => {
    const source = readFileSync(file, 'utf8')
    for (const pattern of OWNER_ONLY) {
      expect(pattern.test(source), `${_name} mentions ${pattern}`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// ai_meta is platform-admin-only inside the app too: it is stripped on the server
// before it can reach a non-admin browser.
// ---------------------------------------------------------------------------

describe('ai_meta never reaches a non-admin browser from the project page', () => {
  it('the project page strips ai_meta from the current estimate and every version unless the viewer is a platform admin', () => {
    const source = readFileSync(join(ROOT, 'app/(app)/projects/[id]/page.tsx'), 'utf8')
    expect(source).toContain("from '@/lib/auth/platform-admin'")
    expect(source).toContain('isPlatformAdmin()')
    expect(source).toContain('stripOwnerOnlyEstimate(currentEstimateRaw)')
    expect(source).toContain('allVersionsRaw.map(stripOwnerOnlyEstimate)')
    expect(source).toContain('isPlatformAdmin={viewerIsPlatformAdmin}')
  })

  it('the version-switch server action strips ai_meta for non-admins too', () => {
    const source = readFileSync(join(ROOT, 'lib/actions/estimate.ts'), 'utf8')
    expect(source).toContain('(await isPlatformAdmin()) ? estimate : stripOwnerOnlyEstimate(estimate)')
  })

  it('the admin flag is decided on the server only', () => {
    const helper = readFileSync(join(ROOT, 'lib/auth/platform-admin.ts'), 'utf8')
    expect(helper).toContain("import 'server-only'")
    expect(helper).toContain('getAdminContext')
  })
})

