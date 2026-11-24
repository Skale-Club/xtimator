import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planDurableInboundRoute } from '@/lib/whatsapp/handler'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

const COMPANY = 'company-a'
const PHONE = '+15555550100'
const NOW = '2026-11-23T12:00:10.000Z'
const FIRST_REPLY = '2026-11-23T12:00:01.000Z'
const BEFORE_REPLY = '2026-11-23T12:00:00.000Z'
const AFTER_REPLY = '2026-11-23T12:00:05.000Z'
const AFTER_NOW = '2026-11-23T12:00:11.000Z'
const EXPIRY = '2026-11-23T12:30:00.000Z'

function ownerReply(timestamp: string): WhatsAppMessage {
  return {
    id: `wamid.${timestamp}`, from: PHONE.slice(1), timestamp,
    type: 'text', text: { body: 'YES' },
  }
}

function signedReply(sentAt: string): WhatsAppMessage {
  return ownerReply(String(Date.parse(sentAt) / 1000))
}

function estimateSession(id: string, createdAt: string) {
  return {
    id, company_id: COMPANY, phone_number: PHONE, state: 'awaiting_confirm', draft_project_id: `project-${id}`,
    draft_estimate_id: `estimate-${id}`, created_at: createdAt, expires_at: EXPIRY,
  }
}

function estimateVersion(session: ReturnType<typeof estimateSession>, createdAt = session.created_at, updatedAt = createdAt) {
  return {
    id: session.draft_estimate_id, company_id: session.company_id, project_id: session.draft_project_id,
    created_at: createdAt, updated_at: updatedAt,
  }
}

function pendingSend(id: string, createdAt: string) {
  return {
    id, company_id: COMPANY, owner_phone: PHONE, trigger_source: 'agentic-whatsapp', status: 'pending',
    channel: 'sms', client_id: 'client-a', body: 'Draft', body_hash: 'draft-hash', subject: null,
    token: null, created_at: createdAt, expires_at: EXPIRY,
  }
}

type Row = Record<string, unknown>

function database(tables: Record<string, Row[]>, failedTable?: string): SupabaseClient {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const error = table === failedTable ? { message: 'read unavailable' } : null
      const query = {
        select: () => query,
        eq(column: string, value: string) {
          rows = rows.filter((row) => row[column] === value)
          return query
        },
        gt(column: string, value: string) {
          rows = rows.filter((row) => String(row[column]) > value)
          return query
        },
        lte(column: string, value: string) {
          rows = rows.filter((row) => String(row[column]) <= value)
          return query
        },
        order(column: string, { ascending }: { ascending: boolean }) {
          rows.sort((left, right) => String(left[column]).localeCompare(String(right[column])) * (ascending ? 1 : -1))
          return query
        },
        limit(count: number) {
          rows = rows.slice(0, count)
          return query
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve),
      }
      return query
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => { vi.useRealTimers() })

describe('planDurableInboundRoute confirmation cutoff', () => {
  it('does not capture an estimate or customer-message draft created after a delayed YES', async () => {
    const svc = database({
      whatsapp_sessions: [estimateSession('late-estimate', AFTER_REPLY)],
      agentic_send_confirmations: [pendingSend('late-send', AFTER_REPLY)],
    })

    await expect(planDurableInboundRoute([signedReply(FIRST_REPLY)], COMPANY, PHONE, svc))
      .resolves.toEqual({ kind: 'intent', session: null, pendingSendId: null })
  })

  it('uses the earliest valid message in a batch and captures an earlier estimate session', async () => {
    const earlier = estimateSession('earlier-estimate', BEFORE_REPLY)
    const later = estimateSession('later-estimate', AFTER_REPLY)
    const svc = database({
      whatsapp_sessions: [earlier, later],
      estimates: [estimateVersion(earlier), estimateVersion(later)],
    })

    const route = await planDurableInboundRoute([
      signedReply(NOW), ownerReply('invalid'), signedReply(FIRST_REPLY),
    ], COMPANY, PHONE, svc)

    expect(route).toMatchObject({ kind: 'intent', session: { id: 'earlier-estimate' }, pendingSendId: null })
  })

  it('captures the latest eligible customer-message draft ahead of the estimate session', async () => {
    const svc = database({
      whatsapp_sessions: [estimateSession('earlier-estimate', BEFORE_REPLY)],
      agentic_send_confirmations: [pendingSend('earlier-send', BEFORE_REPLY), pendingSend('later-send', AFTER_REPLY)],
    })

    await expect(planDurableInboundRoute([signedReply(FIRST_REPLY)], COMPANY, PHONE, svc))
      .resolves.toEqual({ kind: 'intent', session: null, pendingSendId: 'earlier-send' })
  })

  it.each([ownerReply('invalid'), signedReply(AFTER_NOW)])('uses the current time for an invalid or future-only timestamp', async (message) => {
    const current = estimateSession('current-estimate', AFTER_REPLY)
    const future = estimateSession('future-estimate', AFTER_NOW)
    const svc = database({
      whatsapp_sessions: [current, future],
      estimates: [estimateVersion(current), estimateVersion(future)],
    })

    await expect(planDurableInboundRoute([message], COMPANY, PHONE, svc))
      .resolves.toMatchObject({ kind: 'intent', session: { id: 'current-estimate' } })
  })

  it.each([
    { change: 'regenerated', createdAt: AFTER_REPLY, updatedAt: AFTER_REPLY },
    { change: 'edited', createdAt: BEFORE_REPLY, updatedAt: AFTER_REPLY },
  ])('does not bind a delayed YES to a $change estimate under an older session', async ({ createdAt, updatedAt }) => {
    const earlier = estimateSession('older-session', BEFORE_REPLY)
    const svc = database({
      whatsapp_sessions: [earlier],
      estimates: [estimateVersion(earlier, createdAt, updatedAt)],
    })

    await expect(planDurableInboundRoute([signedReply(FIRST_REPLY)], COMPANY, PHONE, svc))
      .resolves.toEqual({ kind: 'intent', session: null, pendingSendId: null })
  })

  it('propagates an estimate read failure so the route can be retried', async () => {
    const svc = database({ whatsapp_sessions: [estimateSession('older-session', BEFORE_REPLY)] }, 'estimates')

    await expect(planDurableInboundRoute([signedReply(FIRST_REPLY)], COMPANY, PHONE, svc))
      .rejects.toThrow('WhatsApp confirmation estimate lookup failed')
  })

  it('propagates a pending draft read failure so the route can be retried', async () => {
    const svc = database({}, 'agentic_send_confirmations')

    await expect(planDurableInboundRoute([signedReply(FIRST_REPLY)], COMPANY, PHONE, svc))
      .rejects.toThrow('Could not read the pending customer message confirmation')
  })
})
