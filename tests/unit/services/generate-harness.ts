/**
 * Shared Supabase mock for the SEED-057 generateEstimateForProject tests.
 * Helper module (not a *.test.ts): never collected as a suite.
 *
 * Captures every row the service writes so a test can assert exactly what
 * reached estimates / estimate_items, and lets a test script insert failures
 * (the pre-migration "column does not exist" deploy window).
 */
import { vi } from 'vitest'

export interface HarnessOptions {
  company?: Record<string, unknown>
  project?: Record<string, unknown>
  /** One entry per estimates.insert call; missing entries succeed. */
  estimateInsertErrors?: Array<{ code?: string; message: string } | null>
  /** One entry per estimate_items.insert call; missing entries succeed. */
  itemInsertErrors?: Array<{ code?: string; message: string } | null>
  /** Rows served by the price_observations read (company history). */
  priceObservations?: Array<Record<string, unknown>>
  /** Make the price_observations read fail (table does not exist yet). */
  priceObservationsError?: { code?: string; message: string } | null
}

export function makeServiceMock(opts: HarnessOptions = {}) {
  const estimateInserts: Array<Record<string, unknown>> = []
  const itemInserts: Array<Array<Record<string, unknown>>> = []
  const projectUpdates: Array<Record<string, unknown>> = []
  let estimateCall = 0
  let itemCall = 0

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'projects') {
      const data = {
        id: 'project-1',
        company_id: 'company-1',
        name: 'Untitled project - 5/5/2026',
        project_type: 'General',
        target_budget: null,
        client: null,
        ...opts.project,
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) }),
        }),
        update: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          projectUpdates.push(row)
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                industry: 'painting',
                currency_code: 'USD',
                default_tax_rate: 0,
                default_payment_terms: null,
                default_warranty_terms: null,
                default_validity_days: null,
                document_blocks: null,
                name: 'Test Co',
                default_estimate_language: null,
                tax_config: null,
                ...opts.company,
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'company_price_book') {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.is = vi.fn(() => chain)
      chain.order = vi.fn(() => chain)
      // getPriceBookItems pages with range() (Phase 4a)
      chain.range = vi.fn().mockResolvedValue({ data: [], error: null })
      return chain
    }
    if (table === 'clients') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) }
    }
    if (table === 'price_observations') {
      const result = opts.priceObservationsError
        ? { data: null, error: opts.priceObservationsError }
        : { data: opts.priceObservations ?? [], error: null }
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const m of ['select', 'eq', 'in', 'gt', 'order', 'limit', 'gte']) chain[m] = vi.fn(self)
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return chain
    }
    if (table === 'estimates') {
      return {
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis() }),
        update: vi.fn().mockReturnValue({ eq: vi.fn(() => Object.assign(Promise.resolve({ error: null }), { neq: vi.fn().mockResolvedValue({ error: null }) })) }),
        select: vi.fn().mockImplementation((cols: string) => {
          if (cols === 'id') {
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
              }),
            }
          }
          return {
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
            }),
          }
        }),
        insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
          estimateInserts.push(row)
          const error = opts.estimateInsertErrors?.[estimateCall++] ?? null
          return {
            select: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue(error ? { data: null, error } : { data: { id: 'estimate-1' }, error: null }),
            }),
          }
        }),
      }
    }
    if (table === 'estimate_sections') {
      return {
        insert: vi.fn().mockImplementation((rows: unknown[]) => ({
          select: vi.fn().mockResolvedValue({
            data: rows.map((_row, i) => ({ id: `section-${i + 1}` })),
            error: null,
          }),
        })),
      }
    }
    if (table === 'estimate_items') {
      return {
        insert: vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
          itemInserts.push(rows)
          const error = opts.itemInsertErrors?.[itemCall++] ?? null
          return Promise.resolve({ error })
        }),
      }
    }
    if (table === 'estimate_activity') return { insert: vi.fn().mockResolvedValue({ error: null }) }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    }
  })

  return { from, estimateInserts, itemInserts, projectUpdates }
}
