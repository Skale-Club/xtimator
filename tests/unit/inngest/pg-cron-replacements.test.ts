import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * SEED-056 step 1 - Inngest replacements for the 3 live pg_cron jobs.
 * The service client and the ops alert are mocked; this locks the SQL
 * semantics (cutoffs/filters), failure alerting and the Inngest wiring.
 */
const { notifyOps } = vi.hoisted(() => ({ notifyOps: vi.fn(async () => undefined) }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))

import {
  runCleanupOrphanDraftProjects,
  cleanupOrphanDraftProjectsJob,
} from '@/lib/inngest/functions/cleanup-orphan-draft-projects'
import {
  runPurgeWhatsAppProcessedMessages,
  purgeWhatsAppProcessedMessagesJob,
} from '@/lib/inngest/functions/purge-whatsapp-processed-messages'
import {
  runPurgeExpiredWhatsAppSessions,
  purgeExpiredWhatsAppSessionsJob,
} from '@/lib/inngest/functions/purge-expired-whatsapp-sessions'

type Svc = Parameters<typeof runCleanupOrphanDraftProjects>[0]

function deleteChain(result: { error: { message: string } | null; count: number | null }) {
  const calls: Array<[string, ...unknown[]]> = []
  const chain: Record<string, unknown> = {}
  chain.eq = (...a: unknown[]) => (calls.push(['eq', ...a]), chain)
  chain.lt = (...a: unknown[]) => (calls.push(['lt', ...a]), Promise.resolve(result))
  const svc = {
    from: vi.fn(() => ({
      delete: (opts: unknown) => (calls.push(['delete', opts]), chain),
    })),
  }
  return { svc: svc as unknown as Svc, calls, from: svc.from }
}

beforeEach(() => vi.clearAllMocks())

describe('runCleanupOrphanDraftProjects', () => {
  it('calls the RPC and reports deleted_count', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ deleted_count: 3 }], error: null })
    await expect(runCleanupOrphanDraftProjects({ rpc } as unknown as Svc)).resolves.toEqual({ deleted: 3 })
    expect(rpc).toHaveBeenCalledWith('cleanup_orphan_draft_projects')
    expect(notifyOps).not.toHaveBeenCalled()
  })
  it('tolerates an empty payload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    await expect(runCleanupOrphanDraftProjects({ rpc } as unknown as Svc)).resolves.toEqual({ deleted: 0 })
  })
  it('alerts ops and never throws on RPC failure', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(runCleanupOrphanDraftProjects({ rpc } as unknown as Svc)).resolves.toEqual({ deleted: 0, error: 'boom' })
    expect(notifyOps).toHaveBeenCalledWith(expect.objectContaining({ kind: 'db_cron_failed', severity: 'error', message: 'boom' }))
  })
})

describe('runPurgeWhatsAppProcessedMessages', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0)
  it('deletes rows processed more than 48h ago and returns the count', async () => {
    const { svc, calls, from } = deleteChain({ error: null, count: 7 })
    await expect(runPurgeWhatsAppProcessedMessages(svc, now)).resolves.toEqual({ deleted: 7 })
    expect(from).toHaveBeenCalledWith('whatsapp_processed_messages')
    expect(calls).toContainEqual(['delete', { count: 'exact' }])
    expect(calls).toContainEqual(['lt', 'processed_at', new Date(now - 48 * 3600_000).toISOString()])
  })
  it('alerts and never throws on failure', async () => {
    const { svc } = deleteChain({ error: { message: 'nope' }, count: null })
    await expect(runPurgeWhatsAppProcessedMessages(svc, now)).resolves.toEqual({ deleted: 0, error: 'nope' })
    expect(notifyOps).toHaveBeenCalledTimes(1)
  })
})

describe('runPurgeExpiredWhatsAppSessions', () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0)
  it('deletes only awaiting_confirm sessions expired more than 5 minutes ago', async () => {
    const { svc, calls, from } = deleteChain({ error: null, count: 2 })
    await expect(runPurgeExpiredWhatsAppSessions(svc, now)).resolves.toEqual({ deleted: 2 })
    expect(from).toHaveBeenCalledWith('whatsapp_sessions')
    expect(calls).toContainEqual(['eq', 'state', 'awaiting_confirm'])
    expect(calls).toContainEqual(['lt', 'expires_at', new Date(now - 5 * 60_000).toISOString()])
  })
  it('a null count (nothing deleted) reports 0', async () => {
    const { svc } = deleteChain({ error: null, count: null })
    await expect(runPurgeExpiredWhatsAppSessions(svc, now)).resolves.toEqual({ deleted: 0 })
  })
  it('alerts and never throws on failure', async () => {
    const { svc } = deleteChain({ error: { message: 'x' }, count: null })
    await expect(runPurgeExpiredWhatsAppSessions(svc, now)).resolves.toEqual({ deleted: 0, error: 'x' })
    expect(notifyOps).toHaveBeenCalledTimes(1)
  })
})

describe('Inngest wiring', () => {
  type Fn = { opts: { id: string; triggers?: Array<{ cron?: string }> } }
  const cases: Array<[unknown, string, string, string]> = [
    [cleanupOrphanDraftProjectsJob, 'cleanup-orphan-draft-projects', '0 3 * * *', 'cleanupOrphanDraftProjectsJob'],
    [purgeWhatsAppProcessedMessagesJob, 'purge-whatsapp-processed-messages', '0 */6 * * *', 'purgeWhatsAppProcessedMessagesJob'],
    [purgeExpiredWhatsAppSessionsJob, 'purge-expired-whatsapp-sessions', '*/10 * * * *', 'purgeExpiredWhatsAppSessionsJob'],
  ]
  const barrel = readFileSync(resolve(process.cwd(), 'lib/inngest/functions/index.ts'), 'utf8')
  const route = readFileSync(resolve(process.cwd(), 'app/api/inngest/route.ts'), 'utf8')
  it.each(cases)('%# has the pg_cron cadence, is exported and served', (job, id, cron, name) => {
    const fn = job as Fn
    expect(fn.opts.id).toBe(id)
    expect(fn.opts.triggers).toContainEqual({ cron })
    expect(barrel).toContain(name)
    expect(route.match(new RegExp(name, 'g'))?.length).toBe(2)
  })
})
