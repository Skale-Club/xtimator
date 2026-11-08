// lib/ai/index.ts
// Server-only by convention — only imported from API routes. Do not import in client components.
//
// ALL AI calls route through OpenRouter — single key, single endpoint, every model.
// The OpenRouterAdapter is the only provider; the model is resolved per-company or
// per-platform-config. Anthropic/Gemini SDKs are no longer used here.
import { requireServiceClient } from '@/lib/supabase/service'
import type { AIProvider } from './provider.interface'

export type {
  EstimateInput,
  EstimateOutput,
  LineItemOutput,
  PriceBookEntry,
  EstimateSectionOutput,
  RefineEstimateInput,
} from './types'

import { OR_DEFAULTS } from './openrouter-client'
import { coerceChatModel, isAllowedChatModel, pickSlotModel, parseModelSlots } from './model-policy'

type AIConfigMetadata = {
  openrouter_default_model?: string
  models?: unknown
}

/** Options for `getAIProvider`. */
export type GetAIProviderOptions = {
  /**
   * Force the model for this provider (Opus escalation, Phase 4g). Ignored unless
   * it passes the Sonnet/Opus chat policy; beats the company override and slots.
   */
  modelOverride?: string
}

/**
 * Resolve which OpenRouter model — and which KEY — to use for a given company.
 *
 * Model resolution order:
 *   0. `opts.modelOverride` — explicit escalation model (Phase 4g), when allowed.
 *   1. Company-level `ai_model_override` — per-company model selection.
 *   2. Platform `ai_config.metadata.models.draft` — admin per-step slot (Phase 4c).
 *   3. Platform `ai_config.openrouter_default_model` — admin-configured default.
 *   4. Hard-coded fallback from OR_DEFAULTS.chat.
 *
 * Key resolution (Billing v2 BYOK): when the company is BYOK-enabled with a
 * stored key, its DECRYPTED OpenRouter key overrides the platform key for every
 * call this provider makes — the company pays its own AI bill and the credit
 * ledger bypasses it. Otherwise the adapter falls back to the platform key.
 */
export async function getAIProvider(
  companyId?: string,
  opts?: GetAIProviderOptions
): Promise<AIProvider> {
  const svc = requireServiceClient()
  const { OpenRouterAdapter } = await import('./providers/openrouter')

  if (companyId) {
    const { getByokOpenRouterKey } = await import('@/lib/billing/byok')
    const [{ data: company }, byokKey] = await Promise.all([
      svc
        .from('companies')
        .select('ai_model_override')
        .eq('id', companyId)
        .maybeSingle(),
      getByokOpenRouterKey(companyId),
    ])
    if (isAllowedChatModel(opts?.modelOverride)) {
      return new OpenRouterAdapter(opts.modelOverride.trim(), byokKey ?? undefined)
    }
    const override = (company as { ai_model_override?: string | null } | null)
      ?.ai_model_override
    // Policy: a stored override that is not Claude Sonnet/Opus is ignored.
    if (isAllowedChatModel(override)) {
      return new OpenRouterAdapter(override.trim(), byokKey ?? undefined)
    }
    if (byokKey) {
      const model = await resolvePlatformDefaultModel(svc)
      return new OpenRouterAdapter(model, byokKey)
    }
  }

  if (isAllowedChatModel(opts?.modelOverride)) {
    return new OpenRouterAdapter(opts.modelOverride.trim())
  }
  const model = await resolvePlatformDefaultModel(svc)
  return new OpenRouterAdapter(model)
}

async function resolvePlatformDefaultModel(
  svc: ReturnType<typeof requireServiceClient>
): Promise<string> {
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()

  const meta = (data?.metadata as AIConfigMetadata | null) ?? null
  // Draft slot (validated at read time) sits between the company override and
  // the platform default; absent/invalid -> today's chain.
  const draft = pickSlotModel(parseModelSlots(meta?.models), 'draft', null)
  if (draft) return draft
  return coerceChatModel(meta?.openrouter_default_model, OR_DEFAULTS.chat)
}
