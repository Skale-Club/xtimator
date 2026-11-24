import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TextDescribe } from '@/components/projects/text-describe'
import { getAttemptOutcome, type AttemptOutcome } from '@/lib/actions/attempt-outcome'
import type { ProjectDetail } from '@/lib/queries/project'

const { push, errorToast } = vi.hoisted(() => ({ push: vi.fn(), errorToast: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { error: errorToast } }))
vi.mock('@/lib/billing/block-toast', () => ({ showBillingBlockToast: vi.fn() }))
vi.mock('@/lib/actions/recording', () => ({ createTextRecording: vi.fn(async () => ({ data: { id: 'recording-1' } })) }))
vi.mock('@/lib/actions/attempt-outcome', () => ({ getAttemptOutcome: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn(() => { throw new Error('The journal is the completion source') }) }))

const project: ProjectDetail = {
  id: 'project-1', company_id: 'company-1', name: 'Fence repair', project_type: null,
  status: 'draft', target_budget: null, total: 1000, created_at: '2026-01-01', needs_details: null, client: null,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('a new manual submission reads its own journal instead of the old attempt’s terminal failure', async () => {
  const first = '00000000-0000-4000-8000-000000000001'
  const second = '00000000-0000-4000-8000-000000000002'
  vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(first).mockReturnValueOnce(second)
  const attempts: string[] = []
  const outcomes = new Map<string, AttemptOutcome>()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== '/api/generate-estimate' || typeof init?.body !== 'string') throw new Error('Unexpected request')
    const { attemptId } = JSON.parse(init.body) as { attemptId: string }
    attempts.push(attemptId)
    if (!outcomes.has(attemptId)) {
      outcomes.set(attemptId, attempts.length === 1
        ? { state: 'failed', step: 'generate_estimate', reason: 'Could not save the estimate' }
        : { state: 'completed', estimateId: 'estimate-2' })
    }
    return new Response(JSON.stringify({ jobId: 'accepted-test-job' }), { status: 202 })
  }))
  vi.mocked(getAttemptOutcome).mockImplementation(async attemptId => outcomes.get(attemptId)!)

  render(<TextDescribe project={project} projectId={project.id} companyId={project.company_id} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Job Description' }), { target: { value: 'Replace two fence posts' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save & Generate Estimate' }))
  await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Could not save the estimate'))
  expect(push).not.toHaveBeenCalled()

  fireEvent.click(await screen.findByRole('button', { name: 'Save & Generate Estimate' }))
  await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith('/projects/project-1?tab=estimate&estimate=estimate-2'))
  expect(attempts).toEqual([first, second])
  expect(vi.mocked(getAttemptOutcome).mock.calls).toEqual([[first], [second]])
})
