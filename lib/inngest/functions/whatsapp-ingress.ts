import { inngest } from '@/lib/inngest/client'
import { assertCompanyWritable } from '@/lib/demo/guard'
import {
  EVENT_WHATSAPP_WEBHOOK, EVENT_WHATSAPP_INGRESS_BATCH,
  processWhatsAppWebhook, processWhatsAppIngressBatch, recoverWhatsAppIngress,
} from '@/lib/whatsapp/durable-ingress'

export const whatsAppWebhookJob = inngest.createFunction({
  id: 'whatsapp-webhook-ingress', retries: 3,
  triggers: [{ event: EVENT_WHATSAPP_WEBHOOK }],
}, async ({ event, step }) => step.run('persist-inbound-messages', () => processWhatsAppWebhook(event.data.inboxId)))

export const whatsAppIngressBatchJob = inngest.createFunction({
  id: 'whatsapp-ingress-batch', retries: 3,
  concurrency: { limit: 1, key: 'event.data.ownerPhone' },
  triggers: [{ event: EVENT_WHATSAPP_INGRESS_BATCH }],
}, async ({ event, step }) => {
  const { companyId, ownerPhone } = event.data
  if (typeof companyId !== 'string' || typeof ownerPhone !== 'string') throw new Error('Invalid WhatsApp batch event')
  if (await assertCompanyWritable(companyId)) return
  await step.sleep('collect-job-messages', '5s')
  return step.run('dispatch-durable-batch', () => processWhatsAppIngressBatch({ companyId, ownerPhone }))
})

export const whatsAppIngressRecoveryJob = inngest.createFunction({
  id: 'whatsapp-ingress-recovery', retries: 2,
  concurrency: { limit: 1 },
  triggers: [{ cron: '* * * * *' }],
}, async ({ step }) => step.run('recover-pending-ingress', recoverWhatsAppIngress))
