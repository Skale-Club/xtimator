/**
 * tests/eval/price-research-regression.test.ts
 *
 * RFALL-03 — THE ORIGINATING-BUG REGRESSION. Locks "Couch cleaning 8 seats → $0 →
 * blocked as vague" as a green FULL-GRAPH regression now that the wire is live
 * (108-04): generateEstimateForProject calls researchUnmatchedPrices between
 * anchorAndClampSections and the server totals, so a researched regional price
 * flows into the authoritative totals + the persisted estimate the vagueness gate
 * reads.
 *
 * Three variants, all driven through the REAL canonical graph (provider seam +
 * raw-ingestion seam mocked; the service + graph + Phase-100 normalize/schema/
 * anchoring/totals + the assess gate run for real — Pitfall 3) against the
 * deterministic Phase-107 fixture provider under a FIXED CLOCK with ZERO live
 * network:
 *
 *  - Test 1 EVIDENCED (the bug fixed): the provider response is a single
 *    ai_estimate "Couch cleaning 8 seats" line at $0 (the originating $0). The
 *    fixture provider returns the EVIDENCED $180 for {Austin, TX}, so the
 *    orchestrator re-tags the line `researched` $180 → persisted grandTotal>0 AND
 *    isVague===false. The $0→vague bug is fixed.
 *  - Test 2 EMPTY-research + context: same case but the fixture map has NO couch
 *    entry (a clean miss → the couch line keeps ai_estimate at $0). A SECOND
 *    non-zero ai_estimate line ("Stain treatment" $90) keeps total>0, so the
 *    never-$0 ladder proves it: grandTotal>0 AND isVague===false. The couch line
 *    is the flagged-unpriced one; the estimate still proceeds.
 *  - Test 3 ALL-EMPTY (still blocks): the ONLY line is the $0 couch item AND the
 *    fixture map misses → total 0 → isVague===true (needs-details). This guards
 *    against over-relaxing the vagueness gate.
 *
 * ISOLATION (Pitfall 5): per-file vi.setConfig timeout (heavy real-graph import
 * latency under forks-pool contention — 103-01), afterEach clearAllMocks +
 * resetModules + capture reset + a lazy `await import` of the graph inside the
 * runner. A LIVE-NETWORK TRIPWIRE (vi.stubGlobal fetch throws) proves the fixture
 * path makes zero network calls (Pitfall 9).
 *
 * Synthetic data only (the case JSON + the Phase-107 fixtures use *.test
 * placeholder URLs) → gitleaks-safe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The real estimate graph loads the heavy LangGraph/AI module tree at runtime; under
// vitest's reused forked worker the first import can exceed the 5s default (import
// latency under contention, not a mock leak — 103-01-SUMMARY).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

import type { EvalCase } from './fixtures/types'
import { scorePersistedEstimate } from './metrics'
import { makeMockProvider, setActiveCase } from './mock-providers'
import { PRICE_RESEARCH_FIXTURES } from './fixtures/price-research'
import {
  makeFixtureProvider,
  fixtureKey,
  FIXTURE_FIXED_NOW,
  type PriceResearchFixtures,
} from '@/lib/estimate/price-research/adapters/fixture'

// --- Provider seam: the ONLY AI mocks (Pitfall 3 — service stays real) ---------
vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: async () => makeMockProvider(),
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: async () => '',
  analyzePhotoOR: async () => '',
}))

// --- Post-ingestion input helpers (this case is text-only — empty rows) --------
vi.mock('@/lib/queries/recording', () => ({ getProjectRecordings: vi.fn() }))
vi.mock('@/lib/queries/photo', () => ({ getProjectPhotos: vi.fn() }))

// --- next/cache: revalidatePath is a no-op in tests --------------------------
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// --- Service client: chainable mock + persisted-estimate capture -------------
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

// --- Price-research deps the orchestrator composes ---------------------------
// The price-research CACHE forced to a MISS (get→null / put→noop) so the provider
// path runs. The provider seam returns the deterministic fixture adapter built over
// the runner-selected fixture map. Quota always allows; recordUsage is a noop.
const priceResearchProviderMock = vi.fn()
vi.mock('@/lib/estimate/price-research/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/estimate/price-research/provider')>()
  return {
    ...actual, // keep the REAL isUsableCandidate evidence gate
    getPriceResearchProvider: () => priceResearchProviderMock(),
  }
})
vi.mock('@/lib/estimate/price-research/cache', () => ({
  get: vi.fn(async () => null),
  put: vi.fn(async () => {}),
  PRICE_RESEARCH_TTL_MS: 0,
}))
vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 50 })),
  recordUsage: vi.fn(async () => {}),
}))

import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { requireServiceClient } from '@/lib/supabase/service'

const COMPANY_ID = 'company-eval-couch'
const PROJECT_ID = 'project-eval-couch'

// The originating regression item — the SPACED form keyed by the Phase-107 fixture.
const COUCH = 'Couch cleaning 8 seats'

// ---------------------------------------------------------------------------
// Regression cases (kept in this file, NOT cases.ts: adding them to CASES would
// run the couch line through harness.test.ts WITHOUT these research mocks and
// alter its describe.each counts — Claude's discretion per the plan).
// ---------------------------------------------------------------------------

/** EVIDENCED + ALL-EMPTY share one shape: a single $0 ai_estimate couch line. */
const COUCH_ONLY_CASE: EvalCase = {
  id: 'couch-cleaning-8seats-evidenced',
  modality: 'text',
  description:
    'Originating regression: a single "Couch cleaning 8 seats" line the model priced ' +
    'at $0 (ai_estimate). EVIDENCED research fills it to $180 → non-zero/non-vague.',
  inputs: { texts: ['Clean an 8 seat couch'] },
  providerResponse: {
    suggested_project_name: 'Couch Cleaning',
    summary: 'Clean an 8-seat couch.',
    sections: [
      {
        title: 'Cleaning',
        items: [
          {
            description: COUCH,
            quantity: 1,
            unit: 'each',
            unit_price: 0, // the originating $0 the model produced
            price_source: 'ai_estimate',
          },
        ],
      },
    ],
  },
  expected: { schemaValid: true, minLineItems: 1, positiveTotal: true, isVague: false },
}

/** EMPTY-research-with-context: couch line misses, but a second priced line keeps total>0. */
const COUCH_WITH_CONTEXT_CASE: EvalCase = {
  id: 'couch-cleaning-8seats-empty-research-with-context',
  modality: 'text',
  description:
    'Empty-research variant: "Couch cleaning 8 seats" misses (no fixture) and keeps ' +
    'ai_estimate $0, but a non-zero ai_estimate "Stain treatment" $90 keeps the ' +
    'estimate non-zero/non-vague (the never-$0 ladder falls to non-zero ai_estimate).',
  inputs: { texts: ['Clean an 8 seat couch and treat the stains'] },
  providerResponse: {
    suggested_project_name: 'Couch Cleaning',
    summary: 'Clean an 8-seat couch plus stain treatment.',
    sections: [
      {
        title: 'Cleaning',
        items: [
          {
            description: COUCH,
            quantity: 1,
            unit: 'each',
            unit_price: 0, // misses research → stays ai_estimate $0 (flagged unpriced)
            price_source: 'ai_estimate',
          },
          {
            description: 'Stain treatment',
            quantity: 1,
            unit: 'each',
            unit_price: 90, // non-zero ai_estimate → keeps the estimate priced
            price_source: 'ai_estimate',
          },
        ],
      },
    ],
  },
  expected: { schemaValid: true, minLineItems: 2, positiveTotal: true, isVague: false },
}

// A fixtures map WITHOUT the couch entry — every couch lookup is a clean miss.
const COUCHLESS_FIXTURES: PriceResearchFixtures = {
  [fixtureKey('Drywall repair', { city: 'Austin', state: 'TX' })]:
    PRICE_RESEARCH_FIXTURES[fixtureKey('Drywall repair', { city: 'Austin', state: 'TX' })],
}

// ---------------------------------------------------------------------------
// Capture-based chainable Supabase mock (mirrors harness.test.ts) — the CRUCIAL
// difference: the projects client is { city:'Austin', state:'TX' } so research has
// a region, and company_price_book is EMPTY so the couch line stays ai_estimate.
// ---------------------------------------------------------------------------
type CapturedItem = { id: string }
type CapturedSection = { items: CapturedItem[] }
interface Capture {
  total: number | null
  subtotal: number | null
  sections: CapturedSection[]
}
function freshCapture(): Capture {
  return { total: null, subtotal: null, sections: [] }
}
let capture = freshCapture()

function makeSupabaseMock() {
  let itemId = 0
  let sectionId = 0

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'projects') {
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'name') {
            return {
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: { name: 'Eval Couch Project' }, error: null }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: PROJECT_ID,
                  name: 'Eval Couch Project',
                  project_type: 'Cleaning',
                  target_budget: null,
                  client: {
                    name: 'Eval Client',
                    email: null,
                    phone: null,
                    address: null,
                    // CRUCIAL: a real region so research has a city/state (Austin, TX).
                    city: 'Austin',
                    state: 'TX',
                    zip: null,
                    preferred_language: null,
                  },
                },
                error: null,
              }),
            }),
          }
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }
    }

    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                industry: 'cleaning',
                currency_code: 'USD',
                default_tax_rate: 0, // no tax → totals == subtotal (clean assertions)
                default_payment_terms: 'Net 30',
                default_warranty_terms: '1 year',
                name: 'Eval Co',
                default_estimate_language: 'en',
              },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'company_price_book') {
      // EMPTY book → the couch line stays ai_estimate after anchoring.
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }
    }

    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }

    if (table === 'estimates') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols.includes('estimate_sections')) {
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { total: capture.total, sections: capture.sections },
                  error: null,
                }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }),
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capture.subtotal = (row.subtotal as number) ?? null
          capture.total = (row.total as number) ?? null
          return {
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue({ data: { id: 'estimate-eval-couch' }, error: null }),
            }),
          }
        }),
      }
    }

    if (table === 'estimate_sections') {
      return {
        insert: vi.fn().mockImplementation(() => {
          capture.sections.push({ items: [] })
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: `section-${sectionId++}` },
                error: null,
              }),
            }),
          }
        }),
      }
    }

    if (table === 'estimate_items') {
      return {
        insert: vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
          const target = capture.sections[capture.sections.length - 1]
          if (target) {
            for (let i = 0; i < rows.length; i++) {
              target.items.push({ id: `item-${itemId++}` })
            }
          }
          return Promise.resolve({ error: null })
        }),
      }
    }

    if (table === 'estimate_activity') {
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
  })

  return { from }
}

/**
 * Drive ONE case through the REAL full graph with the supplied fixture map wired
 * into the price-research provider seam. Lazy-imports the graph INSIDE the runner
 * (isolation discipline) so the heavy module tree binds against this file's mocks.
 */
async function runCaseWithFixtures(c: EvalCase, fixtures: PriceResearchFixtures) {
  capture = freshCapture()
  setActiveCase(c)

  // The deterministic fixture provider under a FIXED CLOCK (zero live network).
  priceResearchProviderMock.mockResolvedValue(
    makeFixtureProvider(fixtures, { now: FIXTURE_FIXED_NOW })
  )

  vi.mocked(getProjectRecordings).mockResolvedValue([])
  vi.mocked(getProjectPhotos).mockResolvedValue([])

  const { from } = makeSupabaseMock()
  vi.mocked(requireServiceClient).mockReturnValue({ from } as never)

  const { buildEstimateGraph } = await import('@/lib/estimate/graph')
  const { makeDefaultAdapter } = await import('@/lib/estimate/adapters/default')

  const graph = buildEstimateGraph(
    makeDefaultAdapter({ companyId: COMPANY_ID, supabase: { from } as never })
  )

  await graph.invoke({
    companyId: COMPANY_ID,
    projectId: PROJECT_ID,
    channel: 'web',
    prompts: c.inputs.texts,
  })

  return scorePersistedEstimate({ total: capture.total, sections: capture.sections })
}

describe('RFALL-03 regression: "Couch cleaning 8 seats" full-graph', () => {
  beforeEach(() => {
    capture = freshCapture()
    // LIVE-NETWORK TRIPWIRE — the fixture path makes zero network calls (Pitfall 9).
    vi.stubGlobal('fetch', () => {
      throw new Error('NO LIVE NETWORK IN EVAL')
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
    capture = freshCapture()
    setActiveCase(null)
  })

  it('Test 1 EVIDENCED — research fills the $0 couch line to $180 → non-zero, non-vague (the bug fixed)', async () => {
    const m = await runCaseWithFixtures(COUCH_ONLY_CASE, PRICE_RESEARCH_FIXTURES)
    expect(m.grandTotal).toBeGreaterThan(0)
    expect(m.grandTotal).toBe(180) // $180 × qty 1, tax 0
    expect(m.isVague).toBe(false)
    expect(m.lineItemCount).toBe(1)
  })

  it('Test 2 EMPTY-research + context — couch misses but a non-zero ai_estimate line keeps it non-zero, non-vague', async () => {
    const m = await runCaseWithFixtures(COUCH_WITH_CONTEXT_CASE, COUCHLESS_FIXTURES)
    expect(m.grandTotal).toBeGreaterThan(0)
    expect(m.grandTotal).toBe(90) // couch $0 (flagged) + stain $90
    expect(m.isVague).toBe(false)
    expect(m.lineItemCount).toBe(2)
  })

  it('Test 3 ALL-EMPTY — only the $0 couch line and research misses → total 0, isVague (still blocks)', async () => {
    const m = await runCaseWithFixtures(COUCH_ONLY_CASE, COUCHLESS_FIXTURES)
    expect(m.grandTotal).toBe(0)
    expect(m.isVague).toBe(true)
  })
})
