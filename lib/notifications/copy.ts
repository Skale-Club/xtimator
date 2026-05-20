/**
 * Phase 77 (NOTIF-04) — Central notification copy module.
 *
 * Single source of truth for title + body strings per `EventType`. Consumed
 * by every event source that calls `notify()`. Keeping the strings in one
 * place makes future i18n / wording tweaks a one-file change.
 *
 * Conventions:
 *  - Title is short (≤ ~30 chars), no trailing punctuation
 *  - Body is one sentence, action-oriented, ends with a period
 *  - When `ctx` fields are missing the function still returns a coherent
 *    sentence (defensive defaults — never throws)
 *
 * NOTE on `system.maintenance`: there is no automatic event source for this
 * type. It is intended for future ad-hoc admin broadcast (see
 * `/admin/notifications/broadcast` — out of scope for v1). Copy lives here
 * so the broadcast UI can build payloads with the same helper.
 */

import type { EventType } from './event-types'

export interface CopyContext {
  estimateNumber?: string
  projectName?: string
  amountUSD?: string
  clientName?: string
  daysRemaining?: number
  quotaPercent?: number
  whatsappFrom?: string
  tierFrom?: string
  tierTo?: string
  credits?: number
  jobType?: string
  errorMessage?: string
  maintenanceTitle?: string
  maintenanceBody?: string
}

export interface NotificationCopy {
  title: string
  body: string
}

export function buildNotificationCopy(
  eventType: EventType,
  ctx: CopyContext = {}
): NotificationCopy {
  switch (eventType) {
    case 'estimate.viewed':
      return {
        title: 'Estimate viewed',
        body: `${ctx.clientName ?? 'A client'} opened estimate ${ctx.estimateNumber ?? ''}`.trim() + '.',
      }
    case 'estimate.accepted':
      return {
        title: 'Estimate accepted',
        body: `${ctx.clientName ?? 'A client'} accepted ${ctx.estimateNumber ?? 'your estimate'}.`,
      }
    case 'estimate.declined':
      return {
        title: 'Estimate declined',
        body: `${ctx.clientName ?? 'A client'} declined ${ctx.estimateNumber ?? 'your estimate'}.`,
      }
    case 'estimate.expired':
      return {
        title: 'Estimate expired',
        body: `Estimate ${ctx.estimateNumber ?? ''} reached its expiry without a response.`.replace(
          /\s+/g,
          ' '
        ),
      }
    case 'payment.received':
      return {
        title: 'Payment received',
        body: `${ctx.amountUSD ?? 'A payment'} received for ${ctx.projectName ?? 'a project'}.`,
      }
    case 'payment.refunded':
      return {
        title: 'Payment refunded',
        body: `${ctx.amountUSD ?? 'A payment'} refunded for ${ctx.projectName ?? 'a project'}.`,
      }
    case 'trial.expiring_3d':
      return {
        title: 'Trial ends soon',
        body: `Your trial ends in ${ctx.daysRemaining ?? 3} days. Upgrade to keep Pro features.`,
      }
    case 'trial.expired':
      return {
        title: 'Trial expired',
        body: 'Your trial has ended. You have been moved to the free plan.',
      }
    case 'trial.converted':
      return {
        title: 'Welcome to Pro',
        body: 'Your subscription is active. Thanks for upgrading!',
      }
    case 'quota.80pct':
      return {
        title: 'Approaching monthly limit',
        body: `You have used ${ctx.quotaPercent ?? 80}% of your monthly AI quota.`,
      }
    case 'quota.exhausted':
      return {
        title: 'Monthly quota exhausted',
        body: 'You have used all included AI credits this month. Upgrade or wait until reset.',
      }
    case 'whatsapp.inbound':
      return {
        title: 'New WhatsApp message',
        body: `Message from ${ctx.whatsappFrom ?? 'a contact'}.`,
      }
    case 'ai_job.failed':
      return {
        title: 'AI job failed',
        body: `${ctx.jobType ?? 'Job'} did not complete: ${ctx.errorMessage ?? 'unknown error'}.`,
      }
    case 'ai_job.completed':
      return {
        title: 'AI job complete',
        body: `${ctx.jobType ?? 'Job'} finished successfully.`,
      }
    case 'admin.tier_changed':
      return {
        title: 'Plan updated by admin',
        body: `Your plan was changed from ${ctx.tierFrom ?? 'previous'} to ${ctx.tierTo ?? 'new'}.`,
      }
    case 'admin.bonus_credits_granted':
      return {
        title: 'Bonus credits granted',
        body: `An admin granted you ${ctx.credits ?? 0} bonus credits.`,
      }
    case 'system.maintenance':
      return {
        title: ctx.maintenanceTitle ?? 'Scheduled maintenance',
        body: ctx.maintenanceBody ?? 'Brief downtime expected.',
      }
  }
}
