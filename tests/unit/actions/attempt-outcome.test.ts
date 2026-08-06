import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 260707-lyq (P4 Wave 1): getAttemptOutcome rule coverage.
 *
 * Mocking follows tests/unit/actions/recording-early-return-events.test.ts's
 * conventions (table-switch supabase/service-client mocks; module-level
 * vi.mock for every cross-layer import). getAttemptOutcome additionally reads
 * via requireServiceClient (company-scoped pipeline_events + estimates), so
 * that module is mocked here too.
 */

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

// transcribeRecording's dependencies (dispatchNonce event-id format section below).
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/observability/pipeline-events', () => ({
  recordPipelineEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/inngest/job-ownership', () => ({
  recordJobOwnership: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn() },
}))

import { getAttemptOutcome } from '@/lib/actions/attempt-outcome'
import { transcribeRecording } from '@/lib/actions/recording'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'

const mockCreateClient = vi.mocked(createClient)
const mockGetActiveCompanyId = vi.mocked(getActiveCompanyId)
const mockRequireServiceClient = vi.mocked(requireServiceClient)
const mockInngestSend = vi.mocked(inngest.send)

interface JournalRowFixture {
  step: string
  status: string
  error_code: string | null
  error_message: string | null
  estimate_id: string | null
  company_id: string | null
  // QUICK-psh-02: needed by the needs_details enrichment (fetches
  // projects.needs_details by project_id). Optional — omitted fixtures
  // exercise the "no projectId available" early-return path.
  project_id?: string | null
  // 260806: the generate-phase reconstruction reads both; created_at anchors
  // the per-phase clock, metadata.phase names the phase.
  created_at?: string
  metadata?: Record<string, unknown> | null
}

function makeAuthedSupabase() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
  }
}

/** service-role client stub for the pipeline_events + estimates + projects table-switch. */
function makeServiceClientMock(opts: {
  rows: JournalRowFixture[]
  estimateExists?: boolean
  // QUICK-psh-02: projects.needs_details row content for the enrichment read.
  // `undefined` (default) means "not asserted" (the projects branch still
  // resolves { data: null } so an unrelated test path never throws).
  projectNeedsDetails?: { reason: string; questions: string[]; attempt_id: string; created_at: string } | null
}) {
  const { rows, estimateExists = false, projectNeedsDetails = null } = opts
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'pipeline_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: rows }),
            }),
          }),
        }
      }
      if (table === 'estimates') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: estimateExists ? { id: 'existing-estimate' } : null,
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { needs_details: projectNeedsDetails },
              }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('getAttemptOutcome — journal rule precedence (260707-lyq)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue(makeAuthedSupabase() as never)
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  it('completed: a generate_estimate/succeeded event whose estimate row still exists → completed', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'transcribe',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
          },
          {
            step: 'generate_estimate',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: 'est-1',
            company_id: 'company-1',
          },
        ],
        estimateExists: true,
      }) as never
    )

    const result = await getAttemptOutcome('attempt-completed')

    expect(result).toEqual({ state: 'completed', estimateId: 'est-1' })
  })

  it('needs_details: succeeded event whose estimate row no longer exists → needs_details (8a0c13e8 production case — the deleted-ghost-estimate race)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'generate_estimate',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: 'est-deleted-by-autorefine',
            company_id: 'company-1',
          },
        ],
        estimateExists: false,
      }) as never
    )

    const result = await getAttemptOutcome('attempt-8a0c13e8')

    expect(result).toEqual({ state: 'needs_details' })
  })

  it('needs_details enrichment (QUICK-psh-02): matching attempt_id → reason + questions included', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'generate_estimate',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
            project_id: 'project-1',
          },
        ],
        projectNeedsDetails: {
          reason: 'missing_specifics',
          questions: ['How many square feet?', 'What material?'],
          attempt_id: 'attempt-match',
          created_at: '2026-07-07T00:00:00Z',
        },
      }) as never
    )

    const result = await getAttemptOutcome('attempt-match')

    expect(result).toEqual({
      state: 'needs_details',
      reason: 'missing_specifics',
      questions: ['How many square feet?', 'What material?'],
    })
  })

  it('needs_details enrichment (QUICK-psh-02): stale attempt_id (belongs to a prior attempt) → bare needs_details', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'generate_estimate',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
            project_id: 'project-1',
          },
        ],
        projectNeedsDetails: {
          reason: 'too_short',
          questions: ['stale question'],
          attempt_id: 'attempt-OLD',
          created_at: '2026-07-01T00:00:00Z',
        },
      }) as never
    )

    const result = await getAttemptOutcome('attempt-new')

    expect(result).toEqual({ state: 'needs_details' })
  })

  it('needs_details enrichment (QUICK-psh-02): absent needs_details column data → bare needs_details (tolerated)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'generate_estimate',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
            project_id: 'project-1',
          },
        ],
        projectNeedsDetails: null,
      }) as never
    )

    const result = await getAttemptOutcome('attempt-noenrich')

    expect(result).toEqual({ state: 'needs_details' })
  })

  it('failed: a real failed event (errorCode dispatch_failed) surfaces its step + reason', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'transcribe',
            status: 'started',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
          },
          {
            step: 'transcribe',
            status: 'failed',
            error_code: 'dispatch_failed',
            error_message: 'Inngest unavailable',
            estimate_id: null,
            company_id: 'company-1',
          },
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-failed')

    expect(result).toEqual({
      state: 'failed',
      step: 'transcribe',
      reason: 'Inngest unavailable',
    })
  })

  it('client_reported failed rows are IGNORED — a later real success wins (4a26ffb7 case: false client report + later success)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'generate_estimate',
            status: 'failed',
            error_code: 'client_reported',
            error_message: 'user tapped "it failed"',
            estimate_id: null,
            company_id: 'company-1',
          },
          {
            step: 'generate_estimate',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: 'est-2',
            company_id: 'company-1',
          },
        ],
        estimateExists: true,
      }) as never
    )

    const result = await getAttemptOutcome('attempt-4a26ffb7')

    expect(result).toEqual({ state: 'completed', estimateId: 'est-2' })
  })

  it('pending: only started/succeeded intermediate rows → pending with lastStep/lastStatus', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'save_recording',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
          },
          {
            step: 'transcribe',
            status: 'started',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-1',
          },
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-pending')

    expect(result).toEqual({
      state: 'pending',
      lastStep: 'transcribe',
      lastStatus: 'started',
      // 260707-o7a: pending now carries progress-bar payload — save_recording
      // succeeded → completed; transcribe started with no created_at in the
      // mock rows → activeStepStartedAt null (260806: the lookup now coalesces
      // a missing timestamp to null, matching the declared `string | null`
      // return type; it used to leak the row's raw undefined).
      completedSteps: ['save_recording'],
      activeStepStartedAt: null,
    })
  })

  it('unauthorized: attempt belongs to a different company → unauthorized (never leaks)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          {
            step: 'transcribe',
            status: 'succeeded',
            error_code: null,
            error_message: null,
            estimate_id: null,
            company_id: 'company-OTHER',
          },
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-cross-tenant')

    expect(result).toEqual({ state: 'unauthorized' })
  })

  it('unauthorized: unauthenticated caller → unauthorized', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }) },
    } as never)

    const result = await getAttemptOutcome('attempt-unauth')

    expect(result).toEqual({ state: 'unauthorized' })
  })

  it('never throws: a read failure degrades to pending instead of propagating', async () => {
    mockRequireServiceClient.mockImplementation(() => {
      throw new Error('service client unavailable')
    })

    const result = await getAttemptOutcome('attempt-boom')

    expect(result).toEqual({
      state: 'pending',
      lastStep: null,
      lastStatus: null,
      // 260707-o7a: degraded pending carries the empty progress payload.
      completedSteps: [],
      activeStepStartedAt: null,
    })
  })
})

/**
 * 260806: generate_estimate sub-phase reconstruction.
 *
 * The generate step owns ~90% of a capture's wall clock and used to surface as
 * one static label. Phase rows (generate_estimate/started carrying
 * metadata.phase) let the overlay narrate the real work; these tests pin the
 * three properties the narration depends on being honest.
 */
describe('getAttemptOutcome: generate sub-phase narration (260806)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue(makeAuthedSupabase() as never)
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  const base = {
    error_code: null,
    error_message: null,
    estimate_id: null,
    company_id: 'company-1',
  }

  function phaseRow(phase: string, at: string, extra: Record<string, unknown> = {}) {
    return {
      ...base,
      step: 'generate_estimate',
      status: 'started',
      created_at: at,
      metadata: { phase, ...extra },
    }
  }

  it('reports the LATEST phase as the live phase and carries its detail counts', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          { ...base, step: 'transcribe', status: 'succeeded', created_at: '2026-08-06T21:48:25Z' },
          { ...base, step: 'generate_estimate', status: 'started', created_at: '2026-08-06T21:48:26Z' },
          phaseRow('context', '2026-08-06T21:48:27Z'),
          phaseRow('drafting', '2026-08-06T21:48:29Z', { inputCount: 3 }),
          phaseRow('pricing', '2026-08-06T21:49:10Z', { candidates: 38, researched: 12 }),
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-phases')

    expect(result).toMatchObject({
      state: 'pending',
      generatePhase: {
        phase: 'pricing',
        furthestPhase: 'pricing',
        startedAt: '2026-08-06T21:49:10Z',
        detail: { candidates: 38, researched: 12 },
      },
    })
  })

  it('never rewinds furthestPhase when the auto-refine loop re-enters drafting', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          { ...base, step: 'generate_estimate', status: 'started', created_at: '2026-08-06T21:48:26Z' },
          phaseRow('drafting', '2026-08-06T21:48:29Z'),
          phaseRow('reviewing', '2026-08-06T21:49:40Z'),
          phaseRow('refining', '2026-08-06T21:49:45Z', { round: 1 }),
          // Second pass: the same early phases run again.
          phaseRow('drafting', '2026-08-06T21:49:47Z'),
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-refine')

    // Label follows the live phase; the bar follows the furthest phase, so a
    // legitimate second pass can never make the progress bar walk backwards.
    expect(result).toMatchObject({
      generatePhase: { phase: 'drafting', furthestPhase: 'refining' },
    })
  })

  it('anchors activeStepStartedAt to the FIRST started row of the step, not the latest', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          { ...base, step: 'generate_estimate', status: 'started', created_at: '2026-08-06T21:48:26Z' },
          // Inngest replays + phase rows both append more `started` rows; the
          // step's elapsed clock must keep measuring from the first one.
          { ...base, step: 'generate_estimate', status: 'started', created_at: '2026-08-06T21:50:00Z' },
          phaseRow('pricing', '2026-08-06T21:51:00Z'),
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-elapsed')

    expect(result).toMatchObject({ activeStepStartedAt: '2026-08-06T21:48:26Z' })
  })

  it('omits generatePhase entirely for an attempt with no phase rows (older server build)', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          { ...base, step: 'generate_estimate', status: 'started', created_at: '2026-08-06T21:48:26Z' },
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-legacy')

    expect(result).not.toHaveProperty('generatePhase')
  })

  it('ignores an unrecognized metadata.phase rather than narrating garbage', async () => {
    mockRequireServiceClient.mockReturnValue(
      makeServiceClientMock({
        rows: [
          { ...base, step: 'generate_estimate', status: 'started', created_at: '2026-08-06T21:48:26Z' },
          phaseRow('drafting', '2026-08-06T21:48:29Z'),
          phaseRow('teleporting', '2026-08-06T21:48:35Z'),
        ],
      }) as never
    )

    const result = await getAttemptOutcome('attempt-garbage')

    expect(result).toMatchObject({ generatePhase: { phase: 'drafting', furthestPhase: 'drafting' } })
  })
})

// 260707-lyq (P4): transcribeRecording's dispatchNonce → event-id format contract.
// Cheap with the existing recording-early-return-events.test.ts-style mocks
// (no new modules beyond what's already mocked above for getAttemptOutcome).
function makeTranscribeSupabaseMock() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'recordings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  storage_path: 'company-1/project-1/rec.webm',
                  company_id: 'company-1',
                  project_id: 'project-1',
                },
              }),
            }),
          }),
        }
      }
      return {}
    }),
  }
}

describe('transcribeRecording — dispatchNonce event-id format (260707-lyq)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveCompanyId.mockResolvedValue('company-1')
  })

  it('keeps the legacy `transcribe-{recordingId}` event id when no dispatchNonce is given', async () => {
    mockCreateClient.mockResolvedValue(makeTranscribeSupabaseMock() as never)
    mockInngestSend.mockResolvedValue({ ids: ['job-1'] } as never)

    await transcribeRecording('rec-1', 'attempt-1')

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'transcribe-rec-1' })
    )
  })

  it('folds dispatchNonce into the event id as `-r${nonce}` on a real Retry', async () => {
    mockCreateClient.mockResolvedValue(makeTranscribeSupabaseMock() as never)
    mockInngestSend.mockResolvedValue({ ids: ['job-2'] } as never)

    await transcribeRecording('rec-1', 'attempt-1', { dispatchNonce: 2 })

    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'transcribe-rec-1-r2',
        data: expect.objectContaining({ dispatchNonce: 2 }),
      })
    )
  })
})
