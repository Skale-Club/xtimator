import 'server-only'
/**
 * lib/ai/plan-scope.ts
 *
 * SEED-057 Phase C, step 1 of two-step generation (flag ESTIMATOR_TWO_STEP,
 * default OFF): the `plan_scope` call. See lib/ai/scope-plan.ts for the contract.
 *
 * Model (decision E4): the `plan` slot when set, else OR_DEFAULTS.fast (Haiku). The expensive
 * `create_estimate` call stays on the configured model; this one only reads and
 * organises, it prices nothing, so a small model is enough and cheap.
 *
 * Never throws. Any failure (no key, timeout, truncation, malformed or empty
 * plan) returns null and the caller simply generates in one step, exactly as
 * with the flag off. The cost is recorded against the generation's attempt as an
 * 'estimate' operation, so it is billed (or BYOK-bypassed) with the estimate.
 *
 * Untrusted input: the user message is the SAME hardened content the estimator
 * gets (buildUserContent: every field sanitised and tagged), and the Security
 * block stays LAST in the system prompt.
 */
import { getORKey, OPENROUTER_BASE, OR_DEFAULTS, AI_CHAT_TIMEOUT_MS } from '@/lib/ai/openrouter-client'
import { resolveSlotModel } from '@/lib/ai/step-models'
import { getByokOpenRouterKey } from '@/lib/billing/byok'
import { buildUserContent, languageInstruction, playbookFor, securityPrompt } from './prompt-builder'
import { ESTIMATE_V2_TEXT, ESTIMATE_V2_TOP_PROPERTIES } from './tool-schema-v2'
import { CANONICAL_UNITS } from './units'
import { isUsablePlan, scopePlanSchema, type ScopePlan } from './scope-plan'
import type { EstimateInput } from './types'

/** ~1-3k output tokens is the design target; the cap leaves room without inviting essays. */
const PLAN_MAX_TOKENS = 3_000
const PLAN_TIMEOUT_MS = 60_000

export const planScopeToolSchema = {
  type: 'object' as const,
  required: ['detected_trade', 'measurements', 'sections'],
  properties: {
    detected_trade: {
      type: 'string' as const,
      description:
        "The trade of the REQUESTED work: one of cleaning, painting, landscaping, plumbing, electrical, hvac, roofing, remodel, or general. Independent of the company's configured industry.",
    },
    measurements: {
      type: 'array' as const,
      description:
        'ONE consolidated table of every distinct measurement in the source material. A surface or item seen in several photos or mentioned twice is ONE row.',
      items: {
        type: 'object' as const,
        required: ['subject', 'value', 'unit', 'source'],
        properties: {
          subject: { type: 'string' as const, description: 'What was measured, e.g. "living room floor".' },
          value: { type: 'number' as const },
          unit: { type: 'string' as const, description: `One of: ${CANONICAL_UNITS.join(', ')}.` },
          source: {
            type: 'string' as const,
            enum: ['stated', 'estimated'],
            description: "'stated' if said aloud, written or measured; 'estimated' if judged from a photo.",
          },
          from: { type: 'string' as const, description: 'Where it came from, e.g. "audio" or "photo 2".' },
        },
      },
    },
    sections: {
      type: 'array' as const,
      description: "The sections the estimate should have, in the trade playbook's order.",
      items: {
        type: 'object' as const,
        required: ['title'],
        properties: {
          title: { type: 'string' as const },
          purpose: { type: 'string' as const, description: ESTIMATE_V2_TEXT.purpose },
        },
      },
    },
    assumptions: ESTIMATE_V2_TOP_PROPERTIES.assumptions,
    exclusions: ESTIMATE_V2_TOP_PROPERTIES.exclusions,
    open_questions: ESTIMATE_V2_TOP_PROPERTIES.open_questions,
    scope_confidence: ESTIMATE_V2_TOP_PROPERTIES.scope_confidence,
  },
}

/** System prompt for the planning call. Our own text; the Security block is shared and last. */
export function buildPlanSystemPrompt(input: EstimateInput): string {
  const pb = playbookFor(input)
  const language = input.language ?? 'en'
  return [
    `You are a scoping assistant for a ${input.industry ?? 'field service'} business. Read the job-site material and produce a SCOPE PLAN that a separate estimator will price. Do NOT include any price, cost or total.`,
    '',
    '1. detected_trade: the trade of the work that was actually requested.',
    '2. measurements: one consolidated table. Merge duplicates (the same wall in three photos is one row). Mark each "stated" when it was said aloud, written or measured, "estimated" when judged from a photo. Derive areas and lengths from stated dimensions (length x width; perimeter x height minus openings) and keep the unit.',
    `3. sections: the sections the estimate should have, in this order where they apply: ${pb.sections.join(' > ')}. One line of purpose each.`,
    '4. assumptions, exclusions and open_questions: what you had to assume, what the price will not cover, and anything that could move the price by more than about 10% (at most 5 questions).',
    '5. scope_confidence: how complete the material is for pricing.',
    '',
    languageInstruction(language),
    '',
    // Claude 5.5 rejects a forced tool_choice, so the call asks for the tool here.
    // Security stays the last block of the system prompt.
    'Respond only by calling the plan_scope tool.',
    '',
    securityPrompt(),
  ].join('\n')
}

/** Run the planning call. Returns null on ANY failure; the caller then generates in one step. */
export interface PlanScopeOutcome {
  /** null = no usable plan; the caller generates in one step. */
  plan: ScopePlan | null
  /**
   * What the call cost, known even when the plan is unusable. NOT recorded here:
   * ai_cost_events is unique per (attempt, operation), so the caller hands this to the
   * estimator via costContext.extraCostUsd and the drafting row carries draft + plan.
   */
  costUsd: number | null
}

export async function planScope(input: EstimateInput): Promise<PlanScopeOutcome> {
  let costUsd: number | null = null
  try {
    const companyId = input.costContext?.companyId ?? null
    const byok = companyId ? await getByokOpenRouterKey(companyId).catch(() => null) : null
    const apiKey = byok ?? (await getORKey())
    // Slot `plan` (admin) else Haiku, exactly as before.
    const model = await resolveSlotModel('plan', OR_DEFAULTS.fast)
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xtimator.com',
        'X-Title': 'Xtimator',
      },
      body: JSON.stringify({
        model,
        max_tokens: PLAN_MAX_TOKENS,
        messages: [
          { role: 'system', content: buildPlanSystemPrompt(input) },
          { role: 'user', content: buildUserContent(input) },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'plan_scope',
              description: 'Produce the scope plan: trade, consolidated measurements, sections, assumptions.',
              parameters: planScopeToolSchema,
            },
          },
        ],
        // Claude 5.5 models (Sonnet 5.5 / Haiku 5.5) reject a forced tool_choice
        // ("type tool and any are not supported for this model", HTTP 400) and any
        // non-default temperature. So: tool_choice 'auto' + an explicit instruction to
        // call plan_scope; a reply without the tool call is handled by the guards below.
        tool_choice: 'auto',
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(Math.min(PLAN_TIMEOUT_MS, AI_CHAT_TIMEOUT_MS)),
    })
    if (!res.ok) return { plan: null, costUsd }

    const json = (await res.json()) as {
      choices?: Array<{
        finish_reason?: string
        message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> }
      }>
      error?: { message?: string }
      usage?: { cost?: number }
    }
    costUsd = typeof json.usage?.cost === 'number' ? json.usage.cost : null
    if (json.error?.message) return { plan: null, costUsd }
    const choice = json.choices?.[0]
    if (choice?.finish_reason === 'length') return { plan: null, costUsd }
    const args = choice?.message?.tool_calls?.find((t) => t.function?.name === 'plan_scope')?.function?.arguments
    if (!args) return { plan: null, costUsd }

    const parsed = scopePlanSchema.safeParse(JSON.parse(args))
    if (!parsed.success || !isUsablePlan(parsed.data)) return { plan: null, costUsd }
    return { plan: parsed.data, costUsd }
  } catch (err) {
    console.warn('[plan-scope] planning failed (generating in one step):', err)
    return { plan: null, costUsd }
  }
}
