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

export type WhatsAppLLMKind = 'chat' | 'classify'

export async function makeWhatsAppLLM(
  companyId: string,
  kind: WhatsAppLLMKind = 'chat'
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
    },
  })
}
