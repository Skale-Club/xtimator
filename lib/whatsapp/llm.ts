import 'server-only'
/**
 * lib/whatsapp/llm.ts
 *
 * Single factory for every LangChain chat model the WhatsApp assistant uses.
 * Owner rule: EVERY AI call goes through OpenRouter — never OpenAI directly.
 * `ChatOpenAI` is just an OpenAI-compatible client here; it is pointed at the
 * OpenRouter base URL with the OpenRouter key (the company's BYOK key when it
 * has one, else the platform key from the admin panel).
 *
 * Models:
 *   - 'chat'     → the app's resolved chat slot (company override → platform
 *                  ai_config default → OR_DEFAULTS.chat). Used by the tool-calling
 *                  ReAct agents (confirmation, QUERY, MANAGE).
 *   - 'classify' → OR_DEFAULTS.fast (Haiku): the intent classifier emits a
 *                  single label, so the cheap/fast model fits.
 */
import { ChatOpenAI } from '@langchain/openai'
import { OPENROUTER_BASE, OR_DEFAULTS, getORKey } from '@/lib/ai/openrouter-client'
import { getByokOpenRouterKey } from '@/lib/billing/byok'
import { resolveChatModelId } from '@/lib/chat/provider'
import { meteredFetch, type WhatsAppCostMeter } from '@/lib/whatsapp/cost-meter'

export type WhatsAppLLMKind = 'chat' | 'classify'

export async function makeWhatsAppLLM(
  companyId: string,
  kind: WhatsAppLLMKind = 'chat',
  // Phase 2a: when given, every completion's real OpenRouter cost is added to this
  // per-inbound-message meter (settled once by lib/whatsapp/credits.ts). Absent =
  // unmetered, exactly as before.
  meter?: WhatsAppCostMeter
): Promise<ChatOpenAI> {
  const byokKey = await getByokOpenRouterKey(companyId)
  const apiKey = byokKey ?? (await getORKey())
  const model =
    kind === 'classify' ? OR_DEFAULTS.fast : await resolveChatModelId(companyId)

  return new ChatOpenAI({
    apiKey,
    model,
    configuration: {
      baseURL: OPENROUTER_BASE,
      defaultHeaders: {
        'HTTP-Referer': 'https://xtimator.com',
        'X-Title': 'Xtimator',
      },
      ...(meter ? { fetch: meteredFetch(meter) } : {}),
    },
    // OpenRouter only reliably returns `usage.cost` when asked (same as every
    // other OpenRouter call in lib/ai); without it the meter stays null and the
    // turn would go undebited.
    ...(meter ? { modelKwargs: { usage: { include: true } } } : {}),
  })
}
