// lib/ai/index.ts
// Server-only by convention — only imported from API routes. Do not import in client components.
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

const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet'

type AIConfigMetadata = {
  selected_ai_provider?: string
  openrouter_default_model?: string
}

/**
 * Resolve which AI provider to use for a given company.
 *
 * Resolution order (260519-or1):
 *   1. If companyId is provided and that company has `ai_model_override` set,
 *      always use OpenRouter with that specific model.
 *   2. Otherwise, fall back to the platform-wide `selected_ai_provider`:
 *      - 'openrouter' → OpenRouter with metadata.openrouter_default_model
 *      - 'gemini'     → GeminiAdapter
 *      - default      → AnthropicAdapter
 */
export async function getAIProvider(companyId?: string): Promise<AIProvider> {
  const svc = requireServiceClient()

  if (companyId) {
    const { data: company } = await svc
      .from('companies')
      .select('ai_model_override')
      .eq('id', companyId)
      .maybeSingle()
    const override = (company as { ai_model_override?: string | null } | null)
      ?.ai_model_override
    if (override) {
      const { OpenRouterAdapter } = await import('./providers/openrouter')
      return new OpenRouterAdapter(override)
    }
  }

  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()

  const meta = (data?.metadata as AIConfigMetadata | null) ?? null
  const selected = meta?.selected_ai_provider

  if (selected === 'openrouter') {
    const { OpenRouterAdapter } = await import('./providers/openrouter')
    return new OpenRouterAdapter(meta?.openrouter_default_model || DEFAULT_OPENROUTER_MODEL)
  }
  if (selected === 'gemini') {
    const { GeminiAdapter } = await import('./providers/gemini')
    return new GeminiAdapter()
  }
  const { AnthropicAdapter } = await import('./providers/anthropic')
  return new AnthropicAdapter()
}
