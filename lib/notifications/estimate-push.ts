/**
 * lib/notifications/estimate-push.ts
 *
 * Server-only. The push notification a contractor gets when an estimate
 * generation they started ends, on every device they enabled, even with the
 * app closed or the phone locked (lib/notifications/web-push.ts).
 *
 * Called from the generate-estimate Inngest function: on success (estimate
 * ready, or needs more details when no estimate survived) and from onFailure.
 * Best-effort and never-throw, like every other notification channel.
 */
import { requireServiceClient } from '@/lib/supabase/service'
import { isPlaceholderName } from '@/lib/constants/project'
import { sendPushToUser, type PushMessage, type PushSendResult } from './web-push'
import type { PushLanguage } from './push-devices'

export type EstimatePushKind = 'ready' | 'needs_details' | 'failed'

const COPY: Record<EstimatePushKind, Record<PushLanguage, { title: string; named: string; unnamed: string }>> = {
  ready: {
    en: { title: 'Your estimate is ready', named: '{name}: tap to review and send it.', unnamed: 'Tap to review and send it.' },
    pt: { title: 'Seu orçamento está pronto', named: '{name}: toque para revisar e enviar.', unnamed: 'Toque para revisar e enviar.' },
    es: { title: 'Su presupuesto está listo', named: '{name}: toque para revisarlo y enviarlo.', unnamed: 'Toque para revisarlo y enviarlo.' },
  },
  needs_details: {
    en: { title: 'Your estimate needs more details', named: '{name}: tap to add them.', unnamed: 'Tap to add them.' },
    pt: { title: 'Seu orçamento precisa de mais detalhes', named: '{name}: toque para completar.', unnamed: 'Toque para completar.' },
    es: { title: 'Su presupuesto necesita más detalles', named: '{name}: toque para completarlos.', unnamed: 'Toque para completarlos.' },
  },
  failed: {
    en: { title: "We couldn't generate your estimate", named: '{name}: tap to try again.', unnamed: 'Tap to try again.' },
    pt: { title: 'Não foi possível gerar seu orçamento', named: '{name}: toque para tentar de novo.', unnamed: 'Toque para tentar de novo.' },
    es: { title: 'No pudimos generar su presupuesto', named: '{name}: toque para intentarlo de nuevo.', unnamed: 'Toque para intentarlo de nuevo.' },
  },
}

/** Pure: the message for one language. Exported for tests. */
export function buildEstimatePushMessage(input: {
  kind: EstimatePushKind
  lang: PushLanguage
  projectId: string
  projectName: string | null
  estimateId: string | null
  attemptId: string
}): PushMessage {
  const copy = COPY[input.kind][input.lang] ?? COPY[input.kind].en
  const url =
    input.kind === 'ready' && input.estimateId
      ? `/projects/${input.projectId}?tab=estimate&estimate=${input.estimateId}`
      : `/projects/${input.projectId}`
  return {
    title: copy.title,
    body: input.projectName ? copy.named.replace('{name}', input.projectName) : copy.unnamed,
    url,
    // Same tag as the in-app notice for this attempt (background watcher).
    tag: input.attemptId,
  }
}

async function readProjectName(projectId: string): Promise<string | null> {
  try {
    const { data } = await requireServiceClient()
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle()
    const name = (data as { name?: string | null } | null)?.name?.trim()
    return name && !isPlaceholderName(name) ? name : null
  } catch {
    return null
  }
}

/** Sends the estimate outcome to the user who started the generation. Never throws. */
export async function sendEstimatePush(input: {
  kind: EstimatePushKind
  userId: string | null | undefined
  projectId: string
  estimateId: string | null
  attemptId: string
}): Promise<PushSendResult> {
  try {
    if (!input.userId) return { sent: 0, removed: 0, skipped: 'no_devices' }
    const projectName = await readProjectName(input.projectId)
    return await sendPushToUser(input.userId, (lang) =>
      buildEstimatePushMessage({
        kind: input.kind,
        lang,
        projectId: input.projectId,
        projectName,
        estimateId: input.estimateId,
        attemptId: input.attemptId,
      })
    )
  } catch {
    return { sent: 0, removed: 0 }
  }
}
