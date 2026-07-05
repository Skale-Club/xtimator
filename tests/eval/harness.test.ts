/**
 * tests/eval/harness.test.ts
 *
 * EVAL-02/03 — the eval harness. Runs the REAL canonical estimate graph
 * (buildEstimateGraph → ingest → generate(generateEstimateForProject) → assess →
 * finalize/autoRefine) against deterministic mocked providers, then scores the
 * PERSISTED estimate with the reused production metrics and asserts each golden
 * case's quality thresholds.
 *
 * HARNESS PATH: FULL-GRAPH. We compose the real default-adapter graph and invoke
 * it per case — NOT the research-approved service-only fallback. The provider seam
 * (getAIProviderWithFallback) + raw-ingestion seam (transcribeAudioOR/
 * analyzePhotoOR) are mocked; generateEstimateForProject + the graph topology +
 * Phase-100 normalize/schema/anchoring/totals + the assess vagueness gate all run
 * for real. (Pitfall 3: we do NOT mock generateEstimateForProject.)
 *
 * ISOLATION (Pitfall 5): per-file vi.setConfig timeout (heavy real-graph import
 * latency under forks-pool contention — 103-01's proven root cause), afterEach
 * clearAllMocks + a per-case capture reset, and a lazy `await import` of the graph
 * inside the runner. These keep the eval files from becoming new contaminators —
 * the full suite stays 3x-green.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The real estimate graph loads the heavy LangGraph/AI module tree at runtime;
// under vitest's reused forked worker the first import can exceed the 5s default
// (import latency under contention, not a mock leak — see 103-01-SUMMARY).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

import { CASES } from './fixtures/cases'
import type { EvalCase } from './fixtures/types'
import { scoreProviderResponse, scorePersistedEstimate } from './metrics'
import {
  makeMockProvider,
  mockTranscribeAudioOR,
  mockAnalyzePhotoOR,
  setActiveCase,
} from './mock-providers'

// --- Provider seam: the ONLY AI mocks (Pitfall 3 — service stays real) ---------
vi.mock('@/lib/ai/provider-with-fallback', () => ({
  getAIProviderWithFallback: async () => makeMockProvider(),
}))
vi.mock('@/lib/ai/openrouter-client', () => ({
  transcribeAudioOR: (...a: unknown[]) => mockTranscribeAudioOR(...(a as [])),
  analyzePhotoOR: (...a: unknown[]) => mockAnalyzePhotoOR(...(a as [])),
}))

// --- Post-ingestion inputs: the service reads transcripts/photoDescriptions from
//     these query helpers; we serve the active case's inputs as fixture rows. -----
vi.mock('@/lib/queries/recording', () => ({
  getProjectRecordings: vi.fn(),
}))
vi.mock('@/lib/queries/photo', () => ({
  getProjectPhotos: vi.fn(),
}))

// --- next/cache: revalidatePath is a no-op in tests --------------------------
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// --- Chainable-Supabase service mock + persisted-estimate capture ------------
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { requireServiceClient } from '@/lib/supabase/service'

const COMPANY_ID = 'company-eval-1'
const PROJECT_ID = 'project-eval-1'

/**
 * Captures what the service persists so the per-case runner (and the assess
 * node's re-read) can read the estimate back. Reset before every case.
 */
type CapturedItem = { id: string }
type CapturedSection = { items: CapturedItem[] }
interface Capture {
  total: number | null
  subtotal: number | null
  sections: CapturedSection[]
  /** current section index being filled (sections inserted then items inserted) */
}

function freshCapture(): Capture {
  return { total: null, subtotal: null, sections: [] }
}

let capture = freshCapture()

/**
 * Builds a chainable Supabase `from()` mock that:
 *  - serves project / company / price_book reads (fixture-shaped),
 *  - captures the estimate insert (subtotal/total) + section/item inserts,
 *  - serves the assess node's nested re-read from the capture so the REAL
 *    isVagueEstimate gate runs on the actually-persisted shape.
 */
function makeSupabaseMock() {
  let itemId = 0
  let sectionId = 0

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'projects') {
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'name') {
            // placeholder-name patch lookup — return a non-placeholder name so we
            // never trigger the rename update path.
            return {
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: { name: 'Eval Project' }, error: null }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: PROJECT_ID,
                  name: 'Eval Project',
                  project_type: 'General',
                  target_budget: null,
                  client: {
                    name: 'Eval Client',
                    email: null,
                    phone: null,
                    address: null,
                    city: null,
                    state: null,
                    zip: null,
                    preferred_language: null,
                  },
                },
                error: null,
              }),
            }),
          }
        }),
        // project status / name updates — chainable no-op
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
                industry: 'construction',
                currency_code: 'USD',
                default_tax_rate: 0.1,
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
      // getPriceBookItems chain: select().eq().order().order() → empty book
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
        // REPLACE-BLANK: delete pristine blank before versioning
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
        }),
        // version reset (update is_current=false)
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockImplementation((cols: string) => {
          // assess node re-read: nested total + items
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
          if (cols === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }
          }
          // version lookup: select('version').eq().order().limit()
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }),
        // CAPTURE the persisted estimate header (subtotal/total).
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          capture.subtotal = (row.subtotal as number) ?? null
          capture.total = (row.total as number) ?? null
          return {
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue({ data: { id: 'estimate-eval-1' }, error: null }),
            }),
          }
        }),
      }
    }

    if (table === 'estimate_sections') {
      return {
        // CAPTURE each section; subsequent item inserts attach to the last section.
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
        // CAPTURE items onto the most-recently-inserted section.
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

    // default chainable no-op
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
 * Drives ONE case through the REAL full graph and returns the metrics on the
 * persisted estimate. Lazy-imports the graph/adapter INSIDE the runner (isolation
 * discipline) so the heavy module tree binds against this file's hoisted mocks.
 */
async function runCaseThroughGraph(c: EvalCase) {
  // Reset capture + active case for this run.
  capture = freshCapture()
  setActiveCase(c)

  // Wire the post-ingestion inputs as fixture rows the service reads.
  vi.mocked(getProjectRecordings).mockResolvedValue(
    (c.inputs.transcripts ?? []).map((t, i) => ({ id: `rec-${i}`, transcript: t })) as never
  )
  vi.mocked(getProjectPhotos).mockResolvedValue(
    (c.inputs.photoDescriptions ?? []).map((d, i) => ({
      id: `photo-${i}`,
      ai_description: d,
    })) as never
  )

  const { from } = makeSupabaseMock()
  vi.mocked(requireServiceClient).mockReturnValue({ from } as never)

  // Lazy imports (isolation discipline — bind to THIS file's mocks).
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

// Cases driven through the full graph (everything except the metrics-unit case).
const GRAPH_CASES = CASES.filter((c) => c.id !== 'schema-drift-guard')

describe('EVAL harness: real engine + golden fixtures', () => {
  beforeEach(() => {
    capture = freshCapture()
  })

  afterEach(() => {
    vi.clearAllMocks()
    // Drop the cached real-consumer bindings (graph/adapter/service) so the next
    // case's lazy `await import` rebinds against this file's hoisted mocks — the
    // Wave-1 isolation discipline (Pitfall 5). Safe here because each case's
    // `await import` + graph.invoke fully resolves WITHIN the test body, so this
    // never evicts a mid-flight dynamic import (the failure mode 103-01 hit when
    // resetModules ran against the @vite-ignore runtime imports).
    vi.resetModules()
    capture = freshCapture()
    setActiveCase(null)
  })

  // EVAL-03 schema metric — asserted for ALL 6 cases (incl. schema-drift false).
  describe.each(CASES)('schema metric — $id', (c) => {
    it(`schemaValid === ${c.expected.schemaValid}`, () => {
      expect(scoreProviderResponse(c.providerResponse).schemaValid).toBe(
        c.expected.schemaValid
      )
    })
  })

  // EVAL-02/03 per-case full-graph runs (cases 1-5).
  describe.each(GRAPH_CASES)('full-graph case — $id', (c) => {
    it('meets its quality thresholds', async () => {
      const m = await runCaseThroughGraph(c)
      expect(m.grandTotal > 0).toBe(c.expected.positiveTotal)
      expect(m.lineItemCount).toBeGreaterThanOrEqual(c.expected.minLineItems)
      expect(m.isVague).toBe(c.expected.isVague)
    })
  })

  // Aggregate: fails if ANY case regresses (per-case + schema), with a summary.
  it('aggregate — no case regresses', async () => {
    const failures: string[] = []

    for (const c of CASES) {
      const schemaOk =
        scoreProviderResponse(c.providerResponse).schemaValid === c.expected.schemaValid
      if (!schemaOk) failures.push(`${c.id}: schema validity drifted`)
    }

    for (const c of GRAPH_CASES) {
      const m = await runCaseThroughGraph(c)
      if (m.grandTotal > 0 !== c.expected.positiveTotal)
        failures.push(`${c.id}: positiveTotal expected ${c.expected.positiveTotal}`)
      if (m.lineItemCount < c.expected.minLineItems)
        failures.push(
          `${c.id}: lineItemCount ${m.lineItemCount} < ${c.expected.minLineItems}`
        )
      if (m.isVague !== c.expected.isVague)
        failures.push(`${c.id}: isVague expected ${c.expected.isVague}`)
    }

    expect(failures, failures.join('\n')).toHaveLength(0)
  })
})
