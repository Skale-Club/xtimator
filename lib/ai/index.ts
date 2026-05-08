// lib/ai/index.ts
// Server-only by convention — only imported from API routes. Do not import in client components.
import { createServiceClient } from '@/lib/supabase/service'
import type { AIProvider } from './provider.interface'

export type { EstimateInput, EstimateOutput, LineItemOutput, PriceBookEntry, EstimateSectionOutput } from './types'

export async function getAIProvider(): Promise<AIProvider> {
  const svc = createServiceClient()
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'ai_config')
    .maybeSingle()

  const selected =
    (data?.metadata as { selected_ai_provider?: string } | null)
      ?.selected_ai_provider === 'gemini'
      ? 'gemini'
      : 'anthropic'

  if (selected === 'gemini') {
    const { GeminiAdapter } = await import('./providers/gemini')
    return new GeminiAdapter()
  }
  const { AnthropicAdapter } = await import('./providers/anthropic')
  return new AnthropicAdapter()
}
