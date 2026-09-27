import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * 260927: streamed estimator call.
 *
 * The drafting stretch used to be blind for a minute or more. Streaming the
 * `create_estimate` tool-call arguments lets the pipeline report sections as
 * the model writes them. These tests pin that the reassembled stream is
 * byte-for-byte what a buffered response would have been (so every existing
 * check still applies), and that progress is read honestly off the partial
 * JSON.
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: vi.fn(() => ({ end: vi.fn() })),
    flushAsync: vi.fn().mockResolvedValue(undefined),
  },
}))

import {
  draftProgressFromArguments,
  readChatCompletionStream,
} from '@/lib/ai/providers/openrouter-stream'
import { OpenRouterAdapter } from '@/lib/ai/providers/openrouter'
import { TruncatedOutputError } from '@/lib/ai/with-fallback'
import { getIntegrationKey } from '@/lib/platform-config'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import type { EstimateInput } from '@/lib/ai/types'

const TOOL_ARGS = JSON.stringify({
  suggested_project_name: 'Smith Bathroom Remodel',
  detected_trade: 'remodeling',
  summary: 'Bathroom remodel with a note that says "title": nothing',
  sections: [
    {
      title: 'Demo',
      items: [{ description: 'Remove old tile', quantity: 1, unit_price: 100, price_source: 'ai_estimate' }],
    },
    {
      title: 'Tile "premium" install',
      items: [
        { description: 'Set tile', quantity: 40, unit: 'sqft', unit_price: 12, price_source: 'ai_estimate' },
        { description: 'Grout', quantity: 1, unit_price: 80, price_source: 'ai_estimate' },
      ],
    },
  ],
})

/** Builds an SSE body that delivers `args` in `pieces` tool-call deltas, split at awkward byte boundaries. */
function sseBody(opts: {
  args: string
  pieces?: number
  finishReason?: string
  usage?: Record<string, unknown>
  error?: { message: string }
}): ReadableStream<Uint8Array> {
  const { args, pieces = 7, finishReason = 'tool_calls', usage, error } = opts
  const size = Math.ceil(args.length / pieces)
  const events: string[] = [': OPENROUTER PROCESSING\n\n']
  for (let i = 0; i < args.length; i += size) {
    const delta = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                ...(i === 0 ? { function: { name: 'create_estimate', arguments: args.slice(i, i + size) } } : { function: { arguments: args.slice(i, i + size) } }),
              },
            ],
          },
        },
      ],
    }
    events.push(`data: ${JSON.stringify(delta)}\n\n`)
  }
  if (error) events.push(`data: ${JSON.stringify({ error })}\n\n`)
  events.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n`)
  if (usage) events.push(`data: ${JSON.stringify({ choices: [], usage })}\n\n`)
  events.push('data: [DONE]\n\n')
  // Re-chunk the whole byte stream at a prime stride so frames and even
  // multi-byte characters straddle chunk boundaries.
  const bytes = new TextEncoder().encode(events.join(''))
  const chunks: Uint8Array[] = []
  for (let i = 0; i < bytes.length; i += 37) chunks.push(bytes.slice(i, i + 37))
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

describe('readChatCompletionStream', () => {
  it('reassembles the tool call exactly as a buffered response would carry it', async () => {
    const result = await readChatCompletionStream(sseBody({ args: TOOL_ARGS, usage: { cost: 0.02 } }))
    expect(result.choices[0].message.tool_calls[0].function).toEqual({
      name: 'create_estimate',
      arguments: TOOL_ARGS,
    })
    expect(result.choices[0].finish_reason).toBe('tool_calls')
    expect(result.usage).toEqual({ cost: 0.02 })
  })

  it('reports the growing argument text as it streams', async () => {
    const seen: string[] = []
    await readChatCompletionStream(sseBody({ args: TOOL_ARGS, pieces: 5 }), (a) => seen.push(a))
    expect(seen.length).toBe(5)
    expect(seen[seen.length - 1]).toBe(TOOL_ARGS)
    for (let i = 1; i < seen.length; i++) expect(seen[i].startsWith(seen[i - 1])).toBe(true)
  })

  it('carries a mid-stream provider error through', async () => {
    const result = await readChatCompletionStream(sseBody({ args: '{"sum', error: { message: 'overloaded' } }))
    expect(result.error).toEqual({ message: 'overloaded' })
  })

  it('never lets a throwing progress callback break the read', async () => {
    const result = await readChatCompletionStream(sseBody({ args: TOOL_ARGS }), () => {
      throw new Error('boom')
    })
    expect(result.choices[0].message.tool_calls[0].function.arguments).toBe(TOOL_ARGS)
  })
})

describe('draftProgressFromArguments', () => {
  it('counts sections and items and lists the finished titles', () => {
    expect(draftProgressFromArguments(TOOL_ARGS)).toEqual({
      sections: 2,
      items: 3,
      titles: ['Demo', 'Tile "premium" install'],
    })
  })

  it('reads a partial document without inventing anything', () => {
    const partial = TOOL_ARGS.slice(0, TOOL_ARGS.indexOf('install'))
    const progress = draftProgressFromArguments(partial)
    expect(progress.sections).toBe(2)
    // The second title is still being written, so only the first is named.
    expect(progress.titles).toEqual(['Demo'])
  })

  it('does not count a quoted "title": inside the summary text', () => {
    const onlySummary = JSON.stringify({ summary: 'the "title": and "description": words' })
    expect(draftProgressFromArguments(onlySummary)).toEqual({ sections: 0, items: 0, titles: [] })
  })

  it('truncates very long titles', () => {
    const long = JSON.stringify({ sections: [{ title: 'x'.repeat(80), items: [] }] })
    const [title] = draftProgressFromArguments(long).titles
    expect(title.length).toBe(40)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('OpenRouterAdapter streaming', () => {
  const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>
  const mockRecord = recordAICost as ReturnType<typeof vi.fn>

  function input(extra: Partial<EstimateInput> = {}): EstimateInput {
    return {
      industry: 'construction',
      projectName: 'Smith Remodel',
      projectType: null,
      targetBudget: null,
      clientName: null,
      clientAddress: null,
      transcripts: ['bathroom remodel'],
      photoDescriptions: [],
      priceBookItems: [],
      defaultPaymentTerms: null,
      defaultWarrantyTerms: null,
      costContext: { attemptId: 'attempt-1', companyId: 'company-1', projectId: 'project-1' },
      ...extra,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKey.mockResolvedValue('or-key')
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('streams only when progress is requested, and reports it', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: sseBody({ args: TOOL_ARGS, usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.05 } }),
    })
    const onDraftProgress = vi.fn()
    const out = await new OpenRouterAdapter('m').generateEstimate(input({ onDraftProgress }))

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.stream).toBe(true)
    expect(onDraftProgress).toHaveBeenCalled()
    expect(out.sections.map((s) => s.title)).toEqual(['Demo', 'Tile "premium" install'])
    // Cost capture still reads usage, now off the final stream chunk.
    expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ realCostUsd: 0.05 }))
  })

  it('keeps the buffered request when nobody asked for progress', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { tool_calls: [{ function: { name: 'create_estimate', arguments: TOOL_ARGS } }] } }],
      }),
    })
    await new OpenRouterAdapter('m').generateEstimate(input())
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.stream).toBeUndefined()
  })

  it('still types a streamed truncation as truncation', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      body: sseBody({ args: TOOL_ARGS.slice(0, 120), finishReason: 'length' }),
    })
    await expect(
      new OpenRouterAdapter('m').generateEstimate(input({ onDraftProgress: vi.fn() }))
    ).rejects.toBeInstanceOf(TruncatedOutputError)
  })
})
