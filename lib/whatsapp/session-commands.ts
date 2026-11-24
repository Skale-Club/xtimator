import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Session = {
  id: string
  state: string
  draft_project_id: string | null
  draft_estimate_id: string | null
}

export type CommandScope = {
  session: Session
  companyId: string
  ownerPhone: string
  messageId: string
  senderUserId?: string | null
}

export type CommandClaim = {
  commandId: string
  attemptId: string
}

export class SessionCommandError extends Error {
  constructor(readonly reason: 'stale' | 'busy' | 'replayed' | 'answered' | 'already_sent' | 'changed') {
    super(reason)
  }
}

export const SESSION_COMMAND_ERROR_MESSAGES = {
  stale: 'This WhatsApp draft changed or expired. Open the estimate in the app or reply to its latest WhatsApp confirmation.',
  busy: 'An estimate action is still running. Try again in a moment.',
  replayed: 'This message has already been processed. Send a new message to make another change.',
  answered: "The client already answered this estimate, so it can't be changed anymore. For new or changed work, create a change order in the app.",
  already_sent: 'This estimate has already been sent. Open it in the app to review its delivery history.',
  changed: 'The estimate changed while I was editing it. Check the latest line items before trying again.',
} as const

export async function loadCurrentSession(
  supabase: SupabaseClient,
  companyId: string,
  ownerPhone: string,
): Promise<Session | null> {
  const { data, error } = await supabase.from('whatsapp_sessions')
    .select('id, state, draft_project_id, draft_estimate_id')
    .eq('company_id', companyId)
    .eq('phone_number', ownerPhone)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error('Could not read the current WhatsApp session', { cause: error })
  return data as Session | null
}

export function sameSession(current: Session | null, snapshot: Session): boolean {
  return current?.id === snapshot.id && current.state === snapshot.state
    && current.draft_project_id === snapshot.draft_project_id
    && current.draft_estimate_id === snapshot.draft_estimate_id
}

export function estimateReplyAuthorization(text: string): 'send' | 'cancel' | null {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/[.!?]+$/u, '').replace(/\s+/gu, ' ')
  // Deliberately match the full message. A compound edit/send request cannot
  // send the previous price while the agent is still interpreting the edit.
  if (/^(?:send|send it|send (?:the )?(?:estimate|quote)(?: to (?:the )?client)?|yes(?:,? please)?|yes,? send(?: it)?|confirm|go ahead|please send(?: it)?|pode enviar|pode mandar|envia(?:r)?(?: o orcamento)?|manda(?:r)?(?: o orcamento)?|sim|sim,? pode (?:enviar|mandar)|si|si,? (?:envia|enviar)|envia(?:r)?(?: el presupuesto)?|mandalo|envialo)$/u.test(normalized)) return 'send'
  if (/^(?:no|cancel(?: it| the (?:estimate|quote))?|discard(?: it| the (?:estimate|quote))?|don't send(?: it)?|nao|nao (?:envie|mande)|cancela(?:r)?(?: (?:o orcamento|el presupuesto))?|descartar(?: (?:o orcamento|el presupuesto))?|no (?:envies|mandes))$/u.test(normalized)) return 'cancel'
  return null
}

export async function openEstimateSession(supabase: SupabaseClient, input: {
  companyId: string
  ownerPhone: string
  senderUserId?: string | null
  projectId: string
  estimateId: string | null
  state: 'awaiting_confirm' | 'awaiting_details'
  requestedAt: string
  expiresAt: string
}): Promise<boolean> {
  const { data, error } = await supabase.rpc('whatsapp_open_estimate_session', {
    p_company_id: input.companyId,
    p_phone_number: input.ownerPhone,
    p_sender_user_id: input.senderUserId ?? null,
    p_project_id: input.projectId,
    p_estimate_id: input.estimateId,
    p_state: input.state,
    p_requested_at: input.requestedAt,
    p_expires_at: input.expiresAt,
  })
  if (error || typeof data !== 'boolean') {
    throw new Error('Could not open the WhatsApp estimate session', { cause: error })
  }
  return data
}

type CommandKind = 'send' | 'cancel' | 'regenerate' | 'edit'

export async function withSessionCommand<T>(
  supabase: SupabaseClient,
  scope: CommandScope,
  kind: CommandKind,
  operation: unknown,
  execute: (claim: CommandClaim) => Promise<T>,
): Promise<T> {
  const { session, companyId, ownerPhone, messageId } = scope
  if (!messageId || !session.draft_project_id || !session.draft_estimate_id
      || session.state !== 'awaiting_confirm') {
    throw new SessionCommandError('stale')
  }
  const attemptId = randomUUID()
  const commandKey = createHash('sha256').update(JSON.stringify([kind, operation])).digest('hex')
  const { data, error } = await supabase.rpc('whatsapp_claim_estimate_command', {
    p_company_id: companyId,
    p_phone_number: ownerPhone,
    p_sender_user_id: scope.senderUserId ?? null,
    p_session_id: session.id,
    p_project_id: session.draft_project_id,
    p_estimate_id: session.draft_estimate_id,
    p_message_id: messageId,
    p_command_kind: kind,
    p_command_key: commandKey,
    p_attempt_id: attemptId,
  })
  if (error || !data) throw new Error('Could not claim the WhatsApp estimate command', { cause: error })
  if (Object.hasOwn(SESSION_COMMAND_ERROR_MESSAGES, data.status)) throw new SessionCommandError(data.status)
  if (data.status !== 'claimed' || typeof data.command_id !== 'string') {
    throw new Error('Invalid WhatsApp estimate command claim')
  }

  // SQL completes the same claim along with any database-only mutation. The
  // finalizer also covers no-op tool results and read/provider failures.
  const claim = { commandId: data.command_id as string, attemptId }
  try {
    return await execute(claim)
  } finally {
    const { error: finishError } = await supabase.rpc('whatsapp_finish_estimate_command', {
      p_command_id: claim.commandId,
      p_attempt_id: claim.attemptId,
    })
    if (finishError) throw new Error('Could not finish the WhatsApp estimate command', { cause: finishError })
  }
}

export async function runClaimedCommandRpc(
  supabase: SupabaseClient,
  name: string,
  claim: CommandClaim,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await supabase.rpc(name, {
    p_command_id: claim.commandId,
    p_attempt_id: claim.attemptId,
    ...args,
  })
  if (error?.message === 'whatsapp_estimate_session_stale') throw new SessionCommandError('stale')
  if (error?.message === 'whatsapp_estimate_answered') throw new SessionCommandError('answered')
  if (error?.message === 'whatsapp_estimate_already_sent') throw new SessionCommandError('already_sent')
  if (error?.message === 'whatsapp_estimate_changed') throw new SessionCommandError('changed')
  if (error) throw new Error('Could not complete the WhatsApp estimate command', { cause: error })
  return data
}
