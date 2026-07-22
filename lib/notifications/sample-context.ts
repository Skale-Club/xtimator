/**
 * lib/notifications/sample-context.ts
 *
 * Phase 173 plan 01 (TMPL-03 support) — one representative `CopyContext`
 * fixture per `EventType`, consumed by the live preview (client, 173-02) and
 * `sendTestNotification` (server, this plan) so both render the SAME sample
 * data a tenant would actually see.
 *
 * `Record<EventType, CopyContext>` is exhaustive — same mechanism as
 * `template-seed.ts`'s own `Record<EventType, TemplateSeedEntry>` guarantee:
 * forgetting a key for a new `EventType` is a `tsc` compile error, not a
 * silent runtime gap.
 *
 * Client-bundle-safe: deliberately excludes Next.js's server-guard import
 * package — this module must be importable from the client-side editor
 * component in plan 173-02.
 *
 * LOCKED fixture values (do not substitute different sample data — plan
 * 173-02's live preview and RTL test assert against these literal rendered
 * strings):
 *   `renderTemplate(EVENT_TEMPLATE_SEED['estimate.viewed'].body,
 *     SAMPLE_COPY_CONTEXT['estimate.viewed'] as unknown as TemplateVars, 'text')`
 *   MUST produce exactly `"Jane Doe opened estimate EST-1042."`
 */

import type { EventType } from './event-types'
import type { CopyContext } from './copy'

export const SAMPLE_COPY_CONTEXT: Record<EventType, CopyContext> = {
  'estimate.viewed': { clientName: 'Jane Doe', estimateNumber: 'EST-1042' },
  'estimate.accepted': { clientName: 'Jane Doe', estimateNumber: 'EST-1042' },
  'estimate.declined': { clientName: 'Jane Doe', estimateNumber: 'EST-1042' },
  'estimate.expired': { estimateNumber: 'EST-1042' },
  'payment.received': { amountUSD: '$1,250.00', projectName: 'Kitchen remodel' },
  'payment.refunded': { amountUSD: '$1,250.00', projectName: 'Kitchen remodel' },
  'trial.expiring_3d': { daysRemaining: 3 },
  'trial.expired': {},
  'trial.converted': {},
  'quota.80pct': { quotaPercent: 80 },
  'quota.exhausted': {},
  'whatsapp.inbound': { whatsappFrom: '+15551234567' },
  'ai_job.failed': { jobType: 'Estimate generation', errorMessage: 'Timeout contacting AI provider' },
  'ai_job.completed': { jobType: 'Estimate generation' },
  'admin.tier_changed': { tierFrom: 'Starter', tierTo: 'Pro' },
  // CREDITUI-04 guard: this event's variable catalog is [] (template-seed.ts),
  // so no fixture fields are needed or offered.
  'admin.bonus_credits_granted': {},
  'system.maintenance': {
    maintenanceTitle: 'Scheduled maintenance',
    maintenanceBody: 'Xtimator will be briefly unavailable tonight at 11pm ET.',
  },
}
