import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Capture server actions (lib/actions/recording.ts):
 *   1. carry the same per-user rate limits as the API routes that dispatch the
 *      same paid AI work (transcribePerMinute, userEstimatePerHour/Day), counted
 *      ONCE per capture (startRecordingPipeline limits up front and its inner
 *      transcribe dispatch skips them);
 *   2. fail CLOSED when the credit gate cannot be read: nothing is dispatched
 *      and the caller gets a plain, retryable message.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/inngest/job-ownership', () => ({ recordJobOwnership: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/billing/credit-ledger', () => ({ checkCredits: vi.fn() }))
vi.mock('@/lib/billing/estimated-credits', () => ({ getEstimatedCredits: vi.fn().mockResolvedValue(100) }))
vi.mock('@/lib/billing/access-guard', () => ({
  billingCreateDenied: vi.fn().mockResolvedValue(null),
  creditBlockState: vi.fn().mockResolvedValue('out_of_credits'),
  BILLING_BLOCK_MESSAGES: { paywalled: 'Subscribe to continue', out_of_credits: 'Out of credits' },
}))
vi.mock('@/lib/entitlements-server', () => ({
  getEntitlementsForTier: vi.fn().mockResolvedValue({ maxAudioMinutesPerEstimate: 30 }),
}))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }))

import { createTextRecording, transcribeRecording, startRecordingPipeline } from '@/lib/actions/recording'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { inngest } from '@/lib/inngest/client'
import { checkCredits } from '@/lib/billing/credit-ledger'
import { rateLimit } from '@/lib/ratelimit'

const mockRateLimit = vi.mocked(rateLimit)
const mockCheckCredits = vi.mocked(checkCredits)
const mockSend = vi.mocked(inngest.send)

const CREDIT_MESSAGE = "We couldn't start this right now. Please try again."
const MINUTE_MESSAGE = 'Too many attempts. Try again in a minute.'
const LATER_MESSAGE = 'Too many attempts. Please try again later.'

let recordingInserts = 0

function makeSupabase() {
  recordingInserts = 0
  return {
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }) },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'recordings') {
        return {
          insert: vi.fn().mockImplementation((row: object) => {
            recordingInserts++
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'rec-1', ...row }, error: null }),
              }),
            }
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation(() => {
              const result = {
                // createRecording's head count
                then: (resolve: (v: unknown) => unknown) => resolve({ count: 1, error: null }),
                // transcribe's row lookup
                single: vi.fn().mockResolvedValue({
                  data: { storage_path: 'company-1/a.webm', company_id: 'company-1', project_id: 'project-1' },
                  error: null,
                }),
              }
              return result
            }),
          }),
        }
      }
      if (table === 'companies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { tier: 'pro' } }) }),
          }),
        }
      }
      if (table === 'projects') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }
}

function limitCalls(): string[] {
  return mockRateLimit.mock.calls.map(([name]) => name as string)
}

/** Deny the named limit; allow everything else. */
function denyLimit(name: string) {
  mockRateLimit.mockImplementation(async (n: string) =>
    n === name ? { allowed: false, count: 11, max: 10, retryAfter: 30 } : { allowed: true, count: 1, max: 10 },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  vi.mocked(createClient).mockResolvedValue(makeSupabase() as never)
  mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 10 })
  mockCheckCredits.mockResolvedValue({ allowed: true, balance: 1000, shortfall: 0 })
  mockSend.mockResolvedValue({ ids: ['job-1'] } as never)
})

describe('createTextRecording auto-generate', () => {
  const opts = { autoGenerateEstimate: true, requestId: 'req-1' }

  it('applies the estimate limits keyed by the user id, then dispatches', async () => {
    const result = await createTextRecording('project-1', 'a description', 'attempt-1', opts)
    expect('error' in result).toBe(false)
    expect(mockRateLimit).toHaveBeenCalledWith('userEstimatePerHour', 'user-1')
    expect(mockRateLimit).toHaveBeenCalledWith('userEstimatePerDay', 'user-1')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('does not limit a plain save (no AI work)', async () => {
    await createTextRecording('project-1', 'a description', 'attempt-1')
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it.each(['userEstimatePerHour', 'userEstimatePerDay'])('blocked by %s: plain message, nothing dispatched', async (name) => {
    denyLimit(name)
    const result = await createTextRecording('project-1', 'a description', 'attempt-1', opts)
    expect(result).toEqual({ error: LATER_MESSAGE })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the credit check throws: retryable message, nothing dispatched', async () => {
    mockCheckCredits.mockRejectedValue(new Error('db down'))
    const result = await createTextRecording('project-1', 'a description', 'attempt-1', opts)
    expect(result).toEqual({ error: CREDIT_MESSAGE })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the credit check reports the balance unavailable', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100, unavailable: true })
    const result = await createTextRecording('project-1', 'a description', 'attempt-1', opts)
    expect(result).toEqual({ error: CREDIT_MESSAGE })
    expect(mockCheckCredits).toHaveBeenCalledWith(expect.anything(), 'company-1', 100, { failClosed: true })
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('transcribeRecording', () => {
  it('blocked by transcribePerMinute: plain message, no lookup, nothing dispatched', async () => {
    denyLimit('transcribePerMinute')
    const result = await transcribeRecording('rec-1', 'attempt-1')
    expect(result).toEqual({ error: MINUTE_MESSAGE })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('a plain transcription is limited by transcribePerMinute only', async () => {
    const result = await transcribeRecording('rec-1', 'attempt-1')
    expect('error' in result).toBe(false)
    expect(limitCalls()).toEqual(['transcribePerMinute'])
    expect(mockRateLimit).toHaveBeenCalledWith('transcribePerMinute', 'user-1')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('a capture that ends in an estimate also counts against the estimate limits, once', async () => {
    await transcribeRecording('rec-1', 'attempt-1', { autoGenerateEstimate: true, requestId: 'r' })
    expect(limitCalls()).toEqual(['transcribePerMinute', 'userEstimatePerHour', 'userEstimatePerDay'])
  })

  it('a Retry (dispatchNonce) is not counted against the estimate limits again', async () => {
    await transcribeRecording('rec-1', 'attempt-1', { autoGenerateEstimate: true, requestId: 'r', dispatchNonce: 1 })
    expect(limitCalls()).toEqual(['transcribePerMinute'])
  })

  it('blocked by the estimate limit: nothing dispatched', async () => {
    denyLimit('userEstimatePerHour')
    const result = await transcribeRecording('rec-1', 'attempt-1', { autoGenerateEstimate: true, requestId: 'r' })
    expect(result).toEqual({ error: LATER_MESSAGE })
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('startRecordingPipeline', () => {
  const fresh = {
    projectId: 'project-1',
    storagePath: 'company-1/a.webm',
    durationSeconds: 30,
    attemptId: 'attempt-1',
    requestId: 'req-1',
  }

  it('counts one fresh capture ONCE across the save and the transcribe dispatch', async () => {
    const result = await startRecordingPipeline(fresh)
    expect('error' in result).toBe(false)
    expect(limitCalls()).toEqual(['transcribePerMinute', 'userEstimatePerHour', 'userEstimatePerDay'])
    expect(recordingInserts).toBe(1)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('a Retry of an existing recording is limited by transcribePerMinute once, no estimate limits', async () => {
    const result = await startRecordingPipeline({ ...fresh, recordingId: 'rec-1', dispatchNonce: 1 })
    expect('error' in result).toBe(false)
    expect(limitCalls()).toEqual(['transcribePerMinute'])
  })

  it('blocked: plain message, no recording row created, nothing dispatched', async () => {
    denyLimit('transcribePerMinute')
    const result = await startRecordingPipeline(fresh)
    expect(result).toEqual({ error: MINUTE_MESSAGE })
    expect(recordingInserts).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the credit check throws: no recording row, nothing dispatched', async () => {
    mockCheckCredits.mockRejectedValue(new Error('db down'))
    const result = await startRecordingPipeline(fresh)
    expect(result).toEqual({ error: CREDIT_MESSAGE })
    expect(recordingInserts).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the balance is reported unavailable', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100, unavailable: true })
    const result = await startRecordingPipeline(fresh)
    expect(result).toEqual({ error: CREDIT_MESSAGE })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('a genuinely insufficient balance still returns the billing block message and code', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 100 })
    const result = await startRecordingPipeline(fresh)
    expect(result).toEqual({ error: 'Out of credits', code: 'out_of_credits' })
    expect(mockSend).not.toHaveBeenCalled()
  })
})
