import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Security-hardening S3 (audit finding A) — evidence-retention pre-check on
 * project deletion. deleteProjectAction/hardDeleteProjectAction (lib/actions/
 * project.ts) previously had no awareness of estimate_signatures at all: RLS
 * lets any company member DELETE a projects row, and estimates.project_id ON
 * DELETE CASCADE (through to estimate_signatures) would silently destroy a
 * client's signature + immutable signed snapshot. This test drives the new
 * pre-check (friendly error before the delete is attempted) and the
 * defensive mapping of the 20260729000001 migration trigger's ERRCODE
 * ('P0005') in case a signature is inserted in the race window between the
 * pre-check and the delete.
 *
 * Mocking style mirrors tests/unit/actions/estimate-lock-guard.test.ts /
 * create-photo-guards.test.ts.
 */

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn().mockResolvedValue('co_1'),
}))

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
}))

const fromImpl = vi.fn()

let estimateIdsForProject: string[] = []
let signatureRows: Array<{ id: string }> = []
let deleteError: { code?: string; message?: string } | null = null
let projectsDeleteAttempted = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
  }),
}))

function configureSupabase() {
  projectsDeleteAttempted = false

  fromImpl.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: estimateIdsForProject.map((id) => ({ id })),
            error: null,
          }),
        }),
      }
    }
    if (table === 'estimate_signatures') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: signatureRows, error: null }),
          }),
        }),
      }
    }
    if (table === 'projects') {
      return {
        delete: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockImplementation(() => {
            projectsDeleteAttempted = true
            return {
              // deleteProjectAction awaits `.eq(...)` directly (no `.not()`).
              then: (resolve: (v: { error: unknown }) => void) => resolve({ error: deleteError }),
              // hardDeleteProjectAction chains `.not(...)` before awaiting.
              not: vi.fn().mockImplementation(() => Promise.resolve({ error: deleteError })),
            }
          }),
        })),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  estimateIdsForProject = []
  signatureRows = []
  deleteError = null
  configureSupabase()
})

describe('deleteProjectAction — signature pre-check', () => {
  it('deletes normally when the project has no signed estimates', async () => {
    estimateIdsForProject = ['est_1']
    signatureRows = []
    const { deleteProjectAction } = await import('@/lib/actions/project')

    const result = await deleteProjectAction('proj_1')

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({ deleted: true })
    expect(projectsDeleteAttempted).toBe(true)
  })

  it('deletes normally when the project has no estimates at all', async () => {
    estimateIdsForProject = []
    const { deleteProjectAction } = await import('@/lib/actions/project')

    const result = await deleteProjectAction('proj_1')

    expect(result.error).toBeUndefined()
    expect(projectsDeleteAttempted).toBe(true)
  })

  it('rejects with a friendly error BEFORE attempting the delete when a signed estimate exists', async () => {
    estimateIdsForProject = ['est_1']
    signatureRows = [{ id: 'sig_1' }]
    const { deleteProjectAction } = await import('@/lib/actions/project')

    const result = await deleteProjectAction('proj_1')

    expect(result.error).toMatch(/signature/i)
    expect(projectsDeleteAttempted).toBe(false)
  })

  it('maps the trigger ERRCODE (P0005) defensively when a signature slips in after the pre-check', async () => {
    // Pre-check passes (no signature yet)...
    estimateIdsForProject = ['est_1']
    signatureRows = []
    // ...but the delete itself hits the DB trigger (simulated race).
    deleteError = { code: 'P0005', message: 'estimate_signed_undeletable' }
    const { deleteProjectAction } = await import('@/lib/actions/project')

    const result = await deleteProjectAction('proj_1')

    expect(result.error).toMatch(/signature/i)
    expect(projectsDeleteAttempted).toBe(true)
  })

  it('returns a generic error for a non-signature delete failure', async () => {
    estimateIdsForProject = []
    deleteError = { code: '23503', message: 'other constraint violation' }
    const { deleteProjectAction } = await import('@/lib/actions/project')

    const result = await deleteProjectAction('proj_1')

    expect(result.error).toBe('Failed to delete project. Please try again.')
  })
})

describe('hardDeleteProjectAction — signature pre-check', () => {
  it('deletes normally when the project has no signed estimates', async () => {
    estimateIdsForProject = ['est_1']
    signatureRows = []
    const { hardDeleteProjectAction } = await import('@/lib/actions/project')

    const result = await hardDeleteProjectAction('proj_1')

    expect(result.error).toBeUndefined()
    expect(result.data).toEqual({ hard_deleted: true })
    expect(projectsDeleteAttempted).toBe(true)
  })

  it('rejects with a friendly error BEFORE attempting the delete when a signed estimate exists', async () => {
    estimateIdsForProject = ['est_1']
    signatureRows = [{ id: 'sig_1' }]
    const { hardDeleteProjectAction } = await import('@/lib/actions/project')

    const result = await hardDeleteProjectAction('proj_1')

    expect(result.error).toMatch(/signature/i)
    expect(projectsDeleteAttempted).toBe(false)
  })

  it('maps the trigger ERRCODE (P0005) defensively when a signature slips in after the pre-check', async () => {
    estimateIdsForProject = ['est_1']
    signatureRows = []
    deleteError = { code: 'P0005', message: 'estimate_signed_undeletable' }
    const { hardDeleteProjectAction } = await import('@/lib/actions/project')

    const result = await hardDeleteProjectAction('proj_1')

    expect(result.error).toMatch(/signature/i)
    expect(projectsDeleteAttempted).toBe(true)
  })
})
