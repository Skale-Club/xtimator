import 'server-only'
/**
 * lib/chat/provider.ts — CHATBE-01
 *
 * The slot → OpenRouter-provider resolver for the in-app chat channel. The chat
 * resolves its model the SAME way `getAIProvider` (lib/ai/index.ts) does — over
 * the `ai_config` slot — so an admin model change applies to chat with no code
 * change. The model is wrapped as an AI-SDK `LanguageModelV3` via the dedicated
 * `@openrouter/ai-sdk-provider` (createOpenRouter), keyed by the encrypted
 * `getIntegrationKey('openrouter')` (env fallback) — NEVER `process.env`
 * directly (Pitfall 5).
 *
 * `lib/chat/` is the CHANNEL ADAPTER (not `lib/agent-tools/`, which stays
 * channel-neutral); it MAY import the neutral barrel + platform config.
 */
import { createOpenRouter, type LanguageModelV3 } from '@openrouter/ai-sdk-provider'
import { getIntegrationKey, getOpenRouterDefaultModel } from '@/lib/platform-config'
import { requireServiceClient } from '@/lib/supabase/service'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'

/** App-attribution headers — mirrors SITE_HEADERS in lib/ai/openrouter-client.ts. */
const SITE_HEADERS = {
  'HTTP-Referer': 'https://xtimator.com',
  'X-Title': 'Xtimator',
}

/**
 * Resolve the OpenRouter model id for the chat turn, mirroring `getAIProvider`'s
 * slot order EXACTLY:
 *   1. companies.ai_model_override (per-company) — read via the service client.
 *   2. platform ai_config.openrouter_default_model (getOpenRouterDefaultModel).
 *   3. OR_DEFAULTS.chat ('anthropic/claude-sonnet-4-5').
 */
export async function resolveChatModelId(companyId?: string): Promise<string> {
  if (companyId) {
    const svc = requireServiceClient()
    const { data: company } = await svc
      .from('companies')
      .select('ai_model_override')
      .eq('id', companyId)
      .maybeSingle()
    const override = (company as { ai_model_override?: string | null } | null)
      ?.ai_model_override
    if (override && override.trim()) return override
  }

  const platformDefault = await getOpenRouterDefaultModel()
  if (platformDefault && platformDefault.trim()) return platformDefault

  return OR_DEFAULTS.chat
}

/**
 * Build the AI-SDK chat model: the resolved slot id wrapped through OpenRouter
 * with the encrypted key. Throws when the key is unconfigured.
 *
 * `deps.modelOverride` is a TEST SEAM — when provided (e.g. a MockLanguageModelV3
 * in the route's unit test), it is returned directly, skipping the key + provider
 * so the route is testable without a live OpenRouter key. The override is optional
 * and last so the runtime signature stays backward-compatible.
 */
export async function resolveChatModel(
  companyId?: string,
  deps?: { modelOverride?: LanguageModelV3 },
): Promise<LanguageModelV3> {
  if (deps?.modelOverride) return deps.modelOverride

  const apiKey = await getIntegrationKey('openrouter')
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  const modelId = await resolveChatModelId(companyId)
  const openrouter = createOpenRouter({ apiKey, headers: SITE_HEADERS })
  return openrouter(modelId)
}
