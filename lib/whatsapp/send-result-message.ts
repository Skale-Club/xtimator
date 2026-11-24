import type { SendResult } from '@/lib/whatsapp/confirm-actions'
import { describeChannels } from '@/lib/notifications/deliver-estimate-to-client'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

/**
 * Owner-facing result of send_estimate, one short message. The client is reached
 * by email and/or SMS only; with no contact on file nothing is sent.
 */
export function describeSendResult(result: SendResult, language: EstimateLanguage = 'en'): string {
  const via = describeChannels(result.channels, language)
  const note = result.problems.length > 0 ? ` (${result.problems.join('; ')})` : ''
  if (language === 'pt') {
    const who = result.clientName ?? 'cliente'
    if (result.outcome === 'no_contact') return `Adicione o telefone ou email de ${who} antes de enviar o orçamento.`
    if (result.outcome === 'not_delivered') return `Não foi possível enviar o orçamento para ${who}${note}. Link para compartilhar: ${result.shareUrl}`
    if (result.outcome === 'unverified') return `Não consegui confirmar a entrega para ${who}${note}.`
    return `Orçamento enviado para ${who} por ${via}${note}. Link para compartilhar: ${result.shareUrl}`
  }
  if (language === 'es') {
    const who = result.clientName ?? 'el cliente'
    if (result.outcome === 'no_contact') return `Añade el teléfono o correo electrónico de ${who} antes de enviar el presupuesto.`
    if (result.outcome === 'not_delivered') return `No se pudo enviar el presupuesto a ${who}${note}. Enlace para compartir: ${result.shareUrl}`
    if (result.outcome === 'unverified') return `No pude confirmar la entrega a ${who}${note}.`
    return `Presupuesto enviado a ${who} por ${via}${note}. Enlace para compartir: ${result.shareUrl}`
  }
  const who = result.clientName ?? 'the client'
  if (result.outcome === 'no_contact') {
    return `There's no phone or email on file for ${who}. Send me their name and phone or add their email in the app, then reply SEND.`
  }
  if (result.outcome === 'not_delivered') {
    const why = result.problems.length > 0 ? result.problems.join('; ') : 'delivery failed'
    return `Not sent to ${who}: ${why}. Share link if the owner wants to send it themselves: ${result.shareUrl}`
  }
  if (result.outcome === 'unverified') {
    return `I could not confirm delivery to ${who}${note}.`
  }
  return `Estimate sent to ${who} by ${via}${note}. Share link: ${result.shareUrl}`
}
