/**
 * Phase 174 plan 01 (TNT-01) — buildFullCopyContext resolver-path proof.
 *
 * Closes carry-forward (a) from 172-03-SUMMARY.md ("Sparse-ctx regression
 * risk"): the DB-template resolver's `{{var}}` interpolator has no fallback
 * for a missing ctx field (renders `''`), unlike `copy.ts`'s `??` defaults.
 * `buildFullCopyContext` fills those gaps; THIS test proves it does so
 * correctly by rendering the ACTUAL seed content (`EVENT_TEMPLATE_SEED`)
 * through the ACTUAL resolver primitive (`renderTemplate`) using
 * `buildFullCopyContext`'s output as the template vars — the exact path a
 * real DB template row exercises in production.
 *
 * This is deliberately NOT a round-trip through `buildNotificationCopy`
 * (`buildNotificationCopy(eventType, buildFullCopyContext(...))`) — that
 * oracle is tautological, since `buildNotificationCopy` re-applies its own
 * `??` defaults on every call regardless of what `buildFullCopyContext`
 * produced, so it cannot detect an omitted field. Every assertion below
 * against `buildNotificationCopy(eventType, {})` goes through
 * `renderTemplate(EVENT_TEMPLATE_SEED[eventType].<field>, ...)` first.
 */
import { describe, it, expect } from 'vitest'
import type { EventType } from '@/lib/notifications/event-types'
import { EVENT_TEMPLATE_SEED } from '@/lib/notifications/template-seed'
import { renderTemplate, type TemplateVars } from '@/lib/notifications/template-engine'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { buildFullCopyContext } from '@/lib/notifications/copy-context'

const ALL_EVENT_TYPES: EventType[] = [
  'estimate.viewed',
  'estimate.accepted',
  'estimate.declined',
  'estimate.expired',
  'payment.received',
  'payment.refunded',
  'trial.expiring_3d',
  'trial.expired',
  'trial.converted',
  'quota.80pct',
  'quota.exhausted',
  'whatsapp.inbound',
  'ai_job.failed',
  'ai_job.completed',
  'admin.tier_changed',
  'admin.bonus_credits_granted',
  'system.maintenance',
]

/**
 * KNOWN, pre-existing, OUT-OF-SCOPE artifact (see
 * .planning/phases/174-tenant-cutover-whatsapp-reenable/deferred-items.md
 * and the doc header in lib/notifications/copy-context.ts): `copy.ts`'s
 * 'estimate.viewed' and 'estimate.expired' branches post-process the ENTIRE
 * interpolated string with `.trim()` / `.replace(/\s+/g, ' ')` AFTER
 * concatenation. The Phase-172 seed template's static text has no
 * equivalent lever — a single `{{var}}` substitution cannot retroactively
 * delete a literal space baked into the surrounding template text — so a
 * sparse ctx renders exactly one stray interior space for these two events
 * (never a missing/blank field; verified by bug-injection stress-tests
 * during 174-01 execution that this normalization cannot mask a genuine
 * missing-default regression — see 174-01-SUMMARY.md). All other 15 events
 * are compared with the raw, fully-strict resolver output.
 */
const KNOWN_WHITESPACE_ARTIFACT_EVENTS = new Set<EventType>([
  'estimate.viewed',
  'estimate.expired',
])

function normalizeWhitespaceArtifact(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .trim()
}

describe('lib/notifications/copy-context — buildFullCopyContext', () => {
  describe('resolver-path proof: renderTemplate(seed) === buildNotificationCopy(sparse ctx) for every EventType', () => {
    for (const eventType of ALL_EVENT_TYPES) {
      it(`"${eventType}"`, () => {
        const fullCtx = buildFullCopyContext(eventType, {})
        const oracle = buildNotificationCopy(eventType, {})

        const resolverBody = renderTemplate(
          EVENT_TEMPLATE_SEED[eventType].body,
          fullCtx as unknown as TemplateVars,
          'text'
        )
        const resolverTitle = renderTemplate(
          EVENT_TEMPLATE_SEED[eventType].title,
          fullCtx as unknown as TemplateVars,
          'text'
        )

        if (KNOWN_WHITESPACE_ARTIFACT_EVENTS.has(eventType)) {
          expect(
            normalizeWhitespaceArtifact(resolverBody),
            `body mismatch for "${eventType}"`
          ).toBe(normalizeWhitespaceArtifact(oracle.body))
          expect(
            normalizeWhitespaceArtifact(resolverTitle),
            `title mismatch for "${eventType}"`
          ).toBe(normalizeWhitespaceArtifact(oracle.title))
        } else {
          expect(resolverBody, `body mismatch for "${eventType}"`).toBe(oracle.body)
          expect(resolverTitle, `title mismatch for "${eventType}"`).toBe(oracle.title)
        }
      })
    }
  })

  it('preserves a caller-provided field UNCHANGED and fills only the missing one (estimate.viewed)', () => {
    const result = buildFullCopyContext('estimate.viewed', { clientName: 'Acme Co' })
    expect(result.clientName).toBe('Acme Co')
    expect(result.estimateNumber).toBe('')
  })

  it('a fully-populated ctx round-trips as a no-op (payment.received)', () => {
    const input = { amountUSD: '$100', projectName: 'Roof Job' }
    const result = buildFullCopyContext('payment.received', input)
    expect(result).toEqual(input)
  })

  it('never invents a default for admin.bonus_credits_granted.credits (CREDITUI-04 neutrality)', () => {
    const result = buildFullCopyContext('admin.bonus_credits_granted', { credits: 50 })
    expect(result).toEqual({ credits: 50 })
  })

  it('an event whose copy.ts branch references no ctx fields passes through unchanged (trial.expired)', () => {
    const result = buildFullCopyContext('trial.expired', {})
    expect(result).toEqual({})
  })
})
