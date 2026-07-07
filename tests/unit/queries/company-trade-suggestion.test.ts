import { describe, expect, it, vi } from 'vitest'

/**
 * QUICK-psh-03 — getTradeSuggestion coverage.
 *
 * A generic chainable query-builder mock (every filter method returns `this`;
 * the terminal method — `maybeSingle` for the companies lookup, `limit` for
 * the estimate_activity read — resolves `{ data }`) since the real
 * implementation applies filters (`.eq`/`.gt`) before the terminal `.order()
 * .limit()`, regardless of which branch (dismissal present or not) is taken.
 */

import { getTradeSuggestion } from '@/lib/queries/company'

function makeChainable(data: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.gt = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.limit = vi.fn(async () => ({ data }))
  builder.maybeSingle = vi.fn(async () => ({ data }))
  return builder
}

function makeSupabaseMock(opts: {
  company: { industry: string | null; trade_suggestion_dismissed_at: string | null } | null
  activityRows: Array<{ metadata: { detected?: string } | null; created_at: string }>
}) {
  const companyBuilder = makeChainable(opts.company)
  const activityBuilder = makeChainable(opts.activityRows)
  const from = vi.fn((table: string) => (table === 'companies' ? companyBuilder : activityBuilder))
  return { supabase: { from }, companyBuilder, activityBuilder }
}

function row(detected: string, createdAt = '2026-07-07T00:00:00Z') {
  return { metadata: { detected }, created_at: createdAt }
}

describe('getTradeSuggestion (QUICK-psh-03)', () => {
  it('3-of-5 threshold met + differs from configured industry → suggestion', async () => {
    const { supabase } = makeSupabaseMock({
      company: { industry: 'construction', trade_suggestion_dismissed_at: null },
      activityRows: [row('cleaning'), row('cleaning'), row('cleaning'), row('electrical'), row('plumbing')],
    })

    const result = await getTradeSuggestion(supabase as never, 'company-1')

    expect(result).toEqual({ suggestedTrade: 'cleaning', occurrences: 3 })
  })

  it('below 3-of-5 threshold → null', async () => {
    const { supabase } = makeSupabaseMock({
      company: { industry: 'construction', trade_suggestion_dismissed_at: null },
      activityRows: [row('cleaning'), row('cleaning'), row('electrical'), row('plumbing'), row('painting')],
    })

    const result = await getTradeSuggestion(supabase as never, 'company-1')

    expect(result).toBeNull()
  })

  it('fewer than 3 total rows → null (never queries a false positive off a tiny sample)', async () => {
    const { supabase } = makeSupabaseMock({
      company: { industry: 'construction', trade_suggestion_dismissed_at: null },
      activityRows: [row('cleaning'), row('cleaning')],
    })

    const result = await getTradeSuggestion(supabase as never, 'company-1')

    expect(result).toBeNull()
  })

  it('detected trade matches the CURRENT configured industry → null (industry already changed)', async () => {
    const { supabase } = makeSupabaseMock({
      company: { industry: 'cleaning', trade_suggestion_dismissed_at: null },
      activityRows: [row('cleaning'), row('cleaning'), row('cleaning')],
    })

    const result = await getTradeSuggestion(supabase as never, 'company-1')

    expect(result).toBeNull()
  })

  it('dismissal honored: applies a gt(created_at, dismissedAt) filter when a prior dismissal exists', async () => {
    const { supabase, activityBuilder } = makeSupabaseMock({
      company: { industry: 'construction', trade_suggestion_dismissed_at: '2026-07-01T00:00:00Z' },
      activityRows: [row('cleaning'), row('cleaning'), row('cleaning')],
    })

    const result = await getTradeSuggestion(supabase as never, 'company-1')

    expect(activityBuilder.gt).toHaveBeenCalledWith('created_at', '2026-07-01T00:00:00Z')
    expect(result).toEqual({ suggestedTrade: 'cleaning', occurrences: 3 })
  })

  it('no dismissal on record → does not apply a gt() filter', async () => {
    const { supabase, activityBuilder } = makeSupabaseMock({
      company: { industry: 'construction', trade_suggestion_dismissed_at: null },
      activityRows: [row('cleaning'), row('cleaning'), row('cleaning')],
    })

    await getTradeSuggestion(supabase as never, 'company-1')

    expect(activityBuilder.gt).not.toHaveBeenCalled()
  })

  it('never throws: a read failure degrades to null', async () => {
    const supabase = {
      from: vi.fn(() => {
        throw new Error('db unavailable')
      }),
    }

    const result = await getTradeSuggestion(supabase as never, 'company-1')

    expect(result).toBeNull()
  })
})
