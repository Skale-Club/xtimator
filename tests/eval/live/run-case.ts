/**
 * tests/eval/live/run-case.ts
 *
 * SEED-057 Phase F: run ONE golden case against a REAL model and score it.
 *
 * It builds the exact system prompt, user content and tool schema production
 * uses (buildSystemPrompt / buildUserContent / buildEstimateToolSchema) and calls
 * OpenRouter directly with OPENROUTER_API_KEY from the environment. It does NOT
 * go through getIntegrationKey: that reads keys from the platform database, and a
 * canary must not need one. Everything else (zod gate, rubric) is production code.
 *
 * Optional two-step mode (EVAL_LIVE_TWO_STEP=1) runs the plan_scope call first
 * with the same prompt and tool schema the pipeline uses, so Phase C is judged on
 * score, latency AND cost, as the seed requires.
 *
 * Helper module (not a *.test.ts). It only talks to the network when something
 * calls runLiveCase; the CI test stubs fetch.
 */
import { buildSystemPrompt, buildUserContent } from '@/lib/ai/prompt-builder'
import { normalizeOutput } from '@/lib/ai/normalize'
import { buildEstimateToolSchema } from '@/lib/ai/providers/openrouter'
import { buildPlanSystemPrompt, planScopeToolSchema } from '@/lib/ai/plan-scope'
import { isUsablePlan, scopePlanSchema } from '@/lib/ai/scope-plan'
import type { EstimateInput, EstimateOutput } from '@/lib/ai/types'
import type { GoldenCase } from '../golden/types'
import { scoreAgainstRubric, type RubricResult } from '../rubric'

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const DEFAULT_ESTIMATE_MODEL = 'anthropic/claude-sonnet-5'
export const DEFAULT_PLAN_MODEL = 'anthropic/claude-haiku-4-5'

export interface LiveOptions {
  apiKey: string
  model?: string
  planModel?: string
  twoStep?: boolean
  fetchImpl?: typeof fetch
}

export interface LiveCaseResult {
  id: string
  ok: boolean
  error?: string
  rubric: RubricResult | null
  latencyMs: number
  costUsd: number | null
  /** Present in two-step mode. */
  plan?: { latencyMs: number; costUsd: number | null; usable: boolean }
}

type ChatResponse = {
  choices?: Array<{ finish_reason?: string; message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>
  error?: { message?: string }
  usage?: { cost?: number }
}

export function inputFor(c: GoldenCase): EstimateInput {
  return {
    industry: c.trade === 'general' ? null : c.trade,
    projectName: 'Eval job',
    projectType: 'General',
    targetBudget: null,
    clientName: null,
    clientAddress: null,
    transcripts: c.inputs.transcripts,
    photoDescriptions: c.inputs.photoDescriptions ?? [],
    priceBookItems: [],
    currencyCode: 'USD',
    language: c.language,
    aiBlocks: { timeline: false, notes: false },
  }
}

async function callTool(
  opts: LiveOptions,
  body: Record<string, unknown>,
  toolName: string,
): Promise<{ args: unknown; costUsd: number | null }> {
  const doFetch = opts.fetchImpl ?? fetch
  const res = await doFetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://xtimator.com',
      'X-Title': 'Xtimator eval',
    },
    body: JSON.stringify({ ...body, usage: { include: true } }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = (await res.json()) as ChatResponse
  if (json.error?.message) throw new Error(json.error.message)
  const choice = json.choices?.[0]
  if (choice?.finish_reason === 'length') throw new Error('truncated (finish_reason length)')
  const raw = choice?.message?.tool_calls?.find((t) => t.function?.name === toolName)?.function?.arguments
  if (!raw) throw new Error(`no ${toolName} tool call`)
  return { args: JSON.parse(raw), costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null }
}

export async function runLiveCase(c: GoldenCase, opts: LiveOptions): Promise<LiveCaseResult> {
  const started = Date.now()
  let planInfo: LiveCaseResult['plan']
  let costUsd: number | null = null
  try {
    const input = inputFor(c)

    if (opts.twoStep) {
      const planStarted = Date.now()
      try {
        const planned = await callTool(
          opts,
          {
            model: opts.planModel ?? DEFAULT_PLAN_MODEL,
            max_tokens: 3000,
            temperature: 0.2,
            messages: [
              { role: 'system', content: buildPlanSystemPrompt(input) },
              { role: 'user', content: buildUserContent(input) },
            ],
            tools: [{ type: 'function', function: { name: 'plan_scope', description: 'Produce the scope plan.', parameters: planScopeToolSchema } }],
            tool_choice: { type: 'function', function: { name: 'plan_scope' } },
          },
          'plan_scope',
        )
        const parsed = scopePlanSchema.safeParse(planned.args)
        const usable = parsed.success && isUsablePlan(parsed.data)
        if (usable && parsed.success) {
          input.plan = parsed.data
          if (parsed.data.detected_trade) input.playbookTrade = parsed.data.detected_trade
        }
        planInfo = { latencyMs: Date.now() - planStarted, costUsd: planned.costUsd, usable: !!usable }
        costUsd = planned.costUsd
      } catch {
        // A failed plan falls back to one step, exactly as production does.
        planInfo = { latencyMs: Date.now() - planStarted, costUsd: null, usable: false }
      }
    }

    const estimated = await callTool(
      opts,
      {
        model: opts.model ?? DEFAULT_ESTIMATE_MODEL,
        max_tokens: 16384,
        temperature: 0.3,
        messages: [
          { role: 'system', content: buildSystemPrompt(input) },
          { role: 'user', content: buildUserContent(input) },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'create_estimate',
              description: 'Create a structured estimate with sections and line items',
              parameters: buildEstimateToolSchema({ mode: 'generate', aiBlocks: input.aiBlocks }),
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'create_estimate' } },
      },
      'create_estimate',
    )
    costUsd = estimated.costUsd === null && costUsd === null ? null : (costUsd ?? 0) + (estimated.costUsd ?? 0)

    const normalized = normalizeOutput(estimated.args as Record<string, unknown>)
    if (!normalized.ok) {
      return { id: c.id, ok: false, error: `schema: ${normalized.error.message.slice(0, 200)}`, rubric: null, latencyMs: Date.now() - started, costUsd, plan: planInfo }
    }
    const output: EstimateOutput = normalized.value
    return { id: c.id, ok: true, rubric: scoreAgainstRubric(c, output), latencyMs: Date.now() - started, costUsd, plan: planInfo }
  } catch (err) {
    return { id: c.id, ok: false, error: err instanceof Error ? err.message : String(err), rubric: null, latencyMs: Date.now() - started, costUsd, plan: planInfo }
  }
}

/** Mean rubric score, counting a failed run as 0 so an outage cannot hide a regression. */
export function meanScore(results: LiveCaseResult[]): number {
  if (results.length === 0) return 0
  const total = results.reduce((sum, r) => sum + (r.rubric?.score ?? 0), 0)
  return Math.round((total / results.length) * 10) / 10
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
