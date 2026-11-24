import 'server-only'
import { createHash } from 'node:crypto'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { isShareLinkExpired } from '@/lib/estimates/share-link'
import { inngest } from '@/lib/inngest/client'
import { assertSendAllowed } from '@/lib/notifications/customer-send-gate'
import { sendCustomerMessage } from '@/lib/notifications/customer-send'
import { dataApiMode } from '@/lib/supabase/data-api'
import { requireServiceClient } from '@/lib/supabase/service'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'

export const EVENT_SIGNATURE_RECEIPT_QUEUED = 'document/signature.receipt.queued'

export interface SignatureReceiptRequest {
  kind: 'estimate' | 'change_order'
  documentId: string
  companyId: string
}

interface ReceiptRow {
  id: string
  kind: SignatureReceiptRequest['kind']
  document_id: string
  company_id: string
  client_id: string | null
  recipient_sha256: string | null
  share_token_sha256: string | null
  business_name: string
  language: 'en' | 'pt' | 'es'
  attempts: number
  created_at: string
}

const RECEIPT_TABLE = 'signature_receipt_outbox'
const BATCH_SIZE = 10
const MAX_ATTEMPTS = 8
const MINUTE = 60_000
// Keep every retry well within the provider's idempotency window.
const MAX_AGE = 12 * 60 * MINUTE
const CLAIM_DURATION = 5 * MINUTE

const receiptCopy = {
  en: {
    estimate: ['Your signed estimate', 'Open the estimate to view and download your signed copy.'],
    change_order: ['Your signed change order', 'Open the change order to view and download your signed copy.'],
  },
  pt: {
    estimate: ['Seu orçamento assinado', 'Abra o orçamento para ver e baixar sua cópia assinada.'],
    change_order: ['Sua ordem de alteração assinada', 'Abra a ordem de alteração para ver e baixar sua cópia assinada.'],
  },
  es: {
    estimate: ['Tu presupuesto firmado', 'Abre el presupuesto para ver y descargar tu copia firmada.'],
    change_order: ['Tu orden de cambio firmada', 'Abre la orden de cambio para ver y descargar tu copia firmada.'],
  },
} as const

export function signatureReceiptDeliveryEnabled(): boolean {
  // Hosted production uses PostgREST. Local production builds can still point
  // at the development Supabase database, where outbound mail is disabled.
  return process.env.NODE_ENV === 'production' && dataApiMode() === 'postgrest'
}

/**
 * Wake the worker after signing, including a lost-response retry. The database
 * trigger has already committed the outbox row. The periodic sweep recovers
 * work if this event cannot be published.
 */
export async function enqueueSignatureReceipt(input: SignatureReceiptRequest): Promise<void> {
  if (!signatureReceiptDeliveryEnabled()) return

  await inngest.send({
    id: `signature-receipt:${input.kind}:${input.documentId}`,
    name: EVENT_SIGNATURE_RECEIPT_QUEUED,
    data: { ...input },
  })
}

export async function listDueSignatureReceipts(scope?: SignatureReceiptRequest): Promise<string[]> {
  const supabase = requireServiceClient()
  const query = supabase
    .from(RECEIPT_TABLE)
    .select('id')
    .eq('state', 'pending')
    .lte('available_at', new Date().toISOString())
    .order('available_at')
    .order('id')
    .limit(BATCH_SIZE)
  if (scope) {
    query.eq('kind', scope.kind).eq('document_id', scope.documentId).eq('company_id', scope.companyId)
  }
  const { data, error } = await query
  if (error) throw new Error('Unable to list pending signature receipts')
  return (data ?? []).map((row) => row.id)
}

async function readReceiptShareLink(supabase: ReturnType<typeof requireServiceClient>, receipt: ReceiptRow) {
  const table = receipt.kind === 'estimate' ? 'estimates' : 'change_orders'
  const columns = receipt.kind === 'estimate'
    ? 'project_id, share_token, share_expires_at'
    : 'project_id, share_token'
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq('id', receipt.document_id)
    .eq('company_id', receipt.company_id)
    .eq('client_response', 'accepted')
    .maybeSingle()
  if (error) throw new Error('Unable to verify the signature receipt document')
  const document = data as { project_id: string; share_token: string | null; share_expires_at?: string | null } | null

  if (
    !document?.share_token ||
    createHash('sha256').update(document.share_token).digest('hex') !== receipt.share_token_sha256 ||
    isShareLinkExpired(document.share_expires_at)
  ) return null

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('id', document.project_id)
    .eq('company_id', receipt.company_id)
    .eq('client_id', receipt.client_id)
    .maybeSingle()
  if (projectError) throw new Error('Unable to verify the signature receipt project')
  if (!project) return null

  const segment = receipt.kind === 'estimate' ? 'estimate' : 'change-order'
  const url = new URL(`/${segment}/${encodeURIComponent(document.share_token)}`, getCanonicalBaseUrl())
  if (url.protocol !== 'https:') throw new Error('Signature receipt links require HTTPS')
  return url.href
}

type DeliveryOutcome = 'sent' | 'skipped' | 'failed' | 'deferred' | 'busy'

export async function deliverSignatureReceipt(id: string): Promise<DeliveryOutcome> {
  if (!signatureReceiptDeliveryEnabled()) return 'skipped'

  const supabase = requireServiceClient()
  const now = Date.now()
  const dueAt = new Date(now).toISOString()
  const { data, error } = await supabase
    .from(RECEIPT_TABLE)
    .select('id, kind, document_id, company_id, client_id, recipient_sha256, share_token_sha256, business_name, language, attempts, created_at')
    .eq('id', id)
    .eq('state', 'pending')
    .lte('available_at', dueAt)
    .maybeSingle()
  if (error) throw new Error('Unable to load a signature receipt')
  if (!data) return 'busy'
  const receipt = data as ReceiptRow

  const attempt = receipt.attempts + 1
  const { data: claim, error: claimError } = await supabase
    .from(RECEIPT_TABLE)
    .update({ attempts: attempt, available_at: new Date(now + CLAIM_DURATION).toISOString() })
    .eq('id', id)
    .eq('state', 'pending')
    .eq('attempts', receipt.attempts)
    .lte('available_at', dueAt)
    .select('id')
    .maybeSingle()
  if (claimError) throw new Error('Unable to claim a signature receipt')
  if (!claim) return 'busy'

  const settle = async (
    state: Exclude<DeliveryOutcome, 'busy'>,
    issue: string | null = null,
    providerMessageId: string | null = null,
  ): Promise<DeliveryOutcome> => {
    const updated = state === 'deferred'
      ? {
          available_at: new Date(Date.now() + Math.min(2 ** attempt, 60) * MINUTE).toISOString(),
          last_issue: issue,
        }
      : {
          state,
          finished_at: new Date().toISOString(),
          last_issue: issue,
          provider_message_id: providerMessageId,
          recipient_sha256: null,
          share_token_sha256: null,
        }
    const { error: settleError } = await supabase.from(RECEIPT_TABLE)
      .update(updated)
      .eq('id', id)
      .eq('state', 'pending')
      .eq('attempts', attempt)
    if (settleError) throw new Error('Unable to update signature receipt delivery state')
    return state
  }

  if (attempt > MAX_ATTEMPTS || Date.now() - Date.parse(receipt.created_at) >= MAX_AGE) {
    return settle('failed', 'retry_window_closed')
  }
  if (!receipt.client_id || !receipt.recipient_sha256 || await assertCompanyWritable(receipt.company_id)) {
    return settle('skipped', 'no_safe_recipient')
  }

  const url = await readReceiptShareLink(supabase, receipt)
  if (!url) return settle('skipped', 'share_link_or_client_changed')
  const gate = await assertSendAllowed(receipt.company_id, receipt.client_id, 'email')
  if (!gate.permit) {
    return gate.reason === 'suppressed'
      ? settle('skipped', 'recipient_suppressed')
      : settle('deferred', 'recipient_gate_unavailable')
  }

  const [subject, message] = receiptCopy[receipt.language][receipt.kind]
  const result = await sendCustomerMessage({
    permit: gate.permit,
    companyId: receipt.company_id,
    clientId: receipt.client_id,
    businessName: receipt.business_name.replace(/[<>\r\n]/g, ' ').trim().slice(0, 120),
    triggerSource: 'signature-receipt',
    freeform: { subject, body: `<p>${message}</p><p>${url}</p>` },
    emailDelivery: {
      recipientSha256: receipt.recipient_sha256,
      idempotencyKey: `signature-receipt/${receipt.id}`,
    },
  })
  if (result.ok) return settle('sent', null, result.providerMessageId ?? null)
  if (result.error === 'receipt_recipient_changed' || result.error === 'no_recipient_email') {
    return settle('skipped', 'no_safe_recipient')
  }
  return settle(attempt === MAX_ATTEMPTS ? 'failed' : 'deferred', 'email_delivery_failed')
}
