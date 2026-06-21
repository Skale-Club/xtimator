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
import {
  generateEstimateJob,
  transcribeAudioJob,
  analyzePhotosJob,
  whatsAppProcessJob,
  whatsAppIntentRouterJob,
  notificationEmailDigest,
  notificationCleanup,
  cleanupAudioJob,
  xphereSyncJob,
  whatsAppWelcomeJob,
} from '@/lib/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateEstimateJob,
    transcribeAudioJob,
    analyzePhotosJob,
    whatsAppProcessJob,
    whatsAppIntentRouterJob,
    notificationEmailDigest,
    notificationCleanup,
    cleanupAudioJob,
    xphereSyncJob,
    whatsAppWelcomeJob,
  ],
})
