/**
 * Phase 67: Inngest serve handler.
 *
 * Implements INNGEST-01 (single serve route registers all worker functions).
 *
 * Inngest's official Next.js adapter exposes GET, POST, and PUT — Inngest's
 * cloud uses GET for introspection, POST for run dispatch, and PUT for
 * function syncing.
 */
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { isQaDevelopmentRuntime } from '@/lib/qa/runtime'
import {
  generateEstimateJob,
  transcribeAudioJob,
  analyzePhotosJob,
  whatsAppProcessJob,
  whatsAppIntentRouterJob,
  whatsAppWebhookJob,
  whatsAppIngressBatchJob,
  whatsAppIngressRecoveryJob,
  notificationEmailDigest,
  notificationCleanup,
  notificationChannelSend,
  cleanupAudioJob,
  xphereSyncJob,
  marketingConversionJob,
  monthlyCreditGrantJob,
  expireCreditLotsJob,
  pipelineWatchdogJob,
  retentionCleanupJob,
  storageOrphanCleanupJob,
  billingReconciliationJob,
  paymentRecoveryJob,
  estimateViewedNotificationJob,
  autoBlogSweepJob,
  autoBlogRssFetchJob,
  cleanupOrphanDraftProjectsJob,
  purgeWhatsAppProcessedMessagesJob,
  purgeExpiredWhatsAppSessionsJob,
  debitMessagingCostsJob,
  signatureReceiptJob,
} from '@/lib/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  // The development QA campaign must not register global maintenance crons
  // against the shared development database. These three jobs operate only
  // on explicitly dispatched synthetic project events.
  functions: isQaDevelopmentRuntime() ? [generateEstimateJob, transcribeAudioJob, analyzePhotosJob] : [
    generateEstimateJob,
    transcribeAudioJob,
    analyzePhotosJob,
    whatsAppProcessJob,
    whatsAppIntentRouterJob,
    whatsAppWebhookJob,
    whatsAppIngressBatchJob,
    whatsAppIngressRecoveryJob,
    notificationEmailDigest,
    notificationCleanup,
    notificationChannelSend,
    cleanupAudioJob,
    xphereSyncJob,
    marketingConversionJob,
    monthlyCreditGrantJob,
    expireCreditLotsJob,
    pipelineWatchdogJob,
    retentionCleanupJob,
    storageOrphanCleanupJob,
    billingReconciliationJob,
    paymentRecoveryJob,
    estimateViewedNotificationJob,
    autoBlogSweepJob,
    autoBlogRssFetchJob,
    cleanupOrphanDraftProjectsJob,
    purgeWhatsAppProcessedMessagesJob,
    purgeExpiredWhatsAppSessionsJob,
    debitMessagingCostsJob,
    signatureReceiptJob,
  ],
})
