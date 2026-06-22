import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// Heavy real-module imports (AI provider adapters) loaded at runtime via dynamic
// import; under vitest's reused forked worker they can exceed the 5s default
// (import latency under contention, not a mock leak). Per-file timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
import { resolve } from 'node:path'

/**
 * Criterion 5 — generate-vs-refine equivalence (Wave 0 RED scaffold; sources land in Wave 1).
 *
 * For equivalent inputs, refine and generate must exercise the SAME shared seams: the shared
 * `buildSystemPrompt` (one prompt source of truth) — refine with `{ mode: 'refine' }`, generate
 * with no opts (or `{ mode: 'generate' }`). And the refine adapters must no longer carry a bespoke
 * refine prompt: the literal deletion marker `## Refinement Instruction` must be ABSENT from BOTH
 * `lib/ai/providers/openrouter.ts` and `lib/ai/providers/gemini.ts` (Pitfall 4 — easy to miss one).
 *
 * RED today:
 *   - `OpenRouterAdapter.refineEstimate` builds a bespoke prompt and does NOT call buildSystemPrompt,
 *     so the `{ mode: 'refine' }` spy assertion fails.
 *   - The `## Refinement Instruction` marker is still present in both adapters, so the deletion
 *     assertions fail.
 *
 * `@/lib/ai/prompt-builder` is spied via `importActual` so `buildSystemPrompt`'s real string is kept
 * (so the generate path still produces a usable prompt) while invocations are recorded. `fetch`, the
 * API key, and `normalizeOutput` are mocked so the assertion targets which prompt seam each path calls.
 *
 * Wave-1 owner: 101-01 (prompt-builder mode:'refine' + bespoke-prompt deletion in both adapters).
 */

const buildSystemPromptSpy = vi.fn()

vi.mock('@/lib/ai/prompt-builder', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/ai/prompt-builder')>()
  return {
    ...actual,
    buildSystemPrompt: (...args: Parameters<typeof actual.buildSystemPrompt>) => {
      buildSystemPromptSpy(...args)
      return actual.buildSystemPrompt(...args)
    },
    // buildRefineUserContent lands in Wave 1; passthrough to actual if/when present.
    buildRefineUserContent: (
      actual as unknown as { buildRefineUserContent?: (...a: unknown[]) => string }
    ).buildRefineUserContent,
  }
})

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(async () => 'test-key'),
}))

vi.mock('@/lib/ai/normalize', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/ai/normalize')>()
  return {
    ...actual,
    // Always treat the (mocked) AI output as valid so the adapter returns without throwing.
    normalizeOutput: vi.fn(() => ({
      ok: true,
      value: {
        suggested_project_name: 'X',
        suggested_client_name: null,
        summary: 'S',
        sections: [],
      },
    })),
  }
})

const validToolArgs = JSON.stringify({
  suggested_project_name: 'X',
  summary: 'S',
  sections: [],
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: validToolArgs,
              tool_calls: [
                { function: { name: 'create_estimate', arguments: validToolArgs } },
              ],
            },
          },
        ],
        usage: {},
      }),
      text: async () => '',
    })) as unknown as typeof fetch
  )
})

const baseEstimateInput = {
  industry: 'plumbing',
  projectName: 'Test Project',
  projectType: null,
  targetBudget: null,
  clientName: 'John Smith',
  clientAddress: null,
  transcripts: ['Replace water heater'],
  photoDescriptions: [],
  priceBookItems: [],
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

const existingEstimate = {
  suggested_project_name: 'Test Project',
  suggested_client_name: null,
  summary: 'Original',
  sections: [],
}

describe('Criterion 5: generate + refine both call the shared buildSystemPrompt', () => {
  it('generate path calls buildSystemPrompt with no mode (or mode: "generate")', async () => {
    const { OpenRouterAdapter } = await import('@/lib/ai/providers/openrouter')
    const adapter = new OpenRouterAdapter('anthropic/claude-sonnet-4-5')

    await adapter.generateEstimate(baseEstimateInput as never)

    expect(buildSystemPromptSpy).toHaveBeenCalled()
    const opts = buildSystemPromptSpy.mock.calls[0]?.[1]
    // generate must NOT pass refine mode.
    expect(opts?.mode).not.toBe('refine')
  })

  it('refine path calls buildSystemPrompt with { mode: "refine" } (shared prompt source)', async () => {
    const { OpenRouterAdapter } = await import('@/lib/ai/providers/openrouter')
    const adapter = new OpenRouterAdapter('anthropic/claude-sonnet-4-5')

    await adapter.refineEstimate({
      existingEstimate: existingEstimate as never,
      instruction: 'Add a cleanup section.',
      priceBookItems: [],
      currencyCode: 'USD',
    })

    // RED until Wave 1 routes refine through buildSystemPrompt({ mode: 'refine' }).
    expect(buildSystemPromptSpy).toHaveBeenCalled()
    const refineModeUsed = buildSystemPromptSpy.mock.calls.some(
      (call) => call[1]?.mode === 'refine'
    )
    expect(refineModeUsed).toBe(true)
  })
})

describe('Criterion 5: bespoke refine prompt deleted from BOTH adapters', () => {
  const ROOT = process.cwd()
  const OPENROUTER = resolve(ROOT, 'lib/ai/providers/openrouter.ts')
  const GEMINI = resolve(ROOT, 'lib/ai/providers/gemini.ts')

  it('openrouter.ts no longer contains the bespoke "## Refinement Instruction" marker', () => {
    const src = readFileSync(OPENROUTER, 'utf8')
    expect(src).not.toContain('## Refinement Instruction')
  })

  it('gemini.ts no longer contains the bespoke "## Refinement Instruction" marker', () => {
    const src = readFileSync(GEMINI, 'utf8')
    expect(src).not.toContain('## Refinement Instruction')
  })
})
