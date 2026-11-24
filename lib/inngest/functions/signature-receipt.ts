import { inngest } from '@/lib/inngest/client'
import {
  deliverSignatureReceipt,
  EVENT_SIGNATURE_RECEIPT_QUEUED,
  listDueSignatureReceipts,
  signatureReceiptDeliveryEnabled,
  type SignatureReceiptRequest,
} from '@/lib/estimate/signature-receipt'

export const signatureReceiptJob = inngest.createFunction(
  {
    id: 'signature-receipt-outbox',
    concurrency: { limit: 1 },
    triggers: [{ event: EVENT_SIGNATURE_RECEIPT_QUEUED }, { cron: '*/2 * * * *' }],
  },
  async ({ event, step }) => {
    if (!signatureReceiptDeliveryEnabled()) return { processed: 0 }

    const scope = event.name === EVENT_SIGNATURE_RECEIPT_QUEUED
      ? event.data as SignatureReceiptRequest
      : undefined
    const ids = await step.run('load-due-receipts', () => listDueSignatureReceipts(scope))
    for (const id of ids) {
      await step.run(`deliver-receipt-${id}`, () => deliverSignatureReceipt(id))
    }
    return { processed: ids.length }
  },
)
