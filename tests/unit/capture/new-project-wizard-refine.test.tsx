import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))
vi.mock('@/lib/actions/project', () => ({
  resumeOrCreateDraftProjectAction: vi.fn(),
  getProjectMinimalAction: vi.fn(async () => ({ data: { id: 'proj-1', company_id: 'co-1', name: 'P' } })),
}))
vi.mock('@/lib/actions/estimate', () => ({ createBlankEstimate: vi.fn() }))
vi.mock('@/lib/billing/block-toast', () => ({ showBillingBlockToast: vi.fn() }))
const getCurrentEstimateId = vi.fn()
vi.mock('@/lib/estimate/poll-outcome', () => ({
  getCurrentEstimateIdOrThrow: (...a: unknown[]) => getCurrentEstimateId(...a),
}))
vi.mock('next/dynamic', () => ({
  default: () =>
    function Stub(props: { refineEstimateId?: string; initialText?: string }) {
      return (
        <div
          data-testid="recorder-stub"
          data-refine={props.refineEstimateId ?? ''}
          data-initial={props.initialText ?? ''}
        />
      )
    },
}))

import { NewProjectWizard } from '@/components/projects/new-project-wizard'
import { editEstimateHref } from '@/components/projects/new-project-dialog'
import { consumeSearchParam } from '@/lib/utils/modal-url'

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/projects/proj-1')
})

describe('editEstimateHref + consumeSearchParam', () => {
  it('round-trips the Answer with AI text and removes the param once read', () => {
    const href = editEstimateHref('tab=estimate', 'proj-1', 'Q: Size?\nA: ')
    window.history.replaceState(null, '', `/projects/proj-1${href}`)
    expect(consumeSearchParam('refinePrefill')).toBe('Q: Size?\nA: ')
    expect(window.location.search).not.toContain('refinePrefill')
    expect(window.location.search).toContain('editProjectId=proj-1')
    expect(consumeSearchParam('refinePrefill')).toBeNull()
  })
})

describe('NewProjectWizard edit mode', () => {
  it('opens in refine mode when the project has a current estimate, seeding the prefill once', async () => {
    getCurrentEstimateId.mockResolvedValue('est-1')
    window.history.replaceState(null, '', `/projects/proj-1${editEstimateHref('', 'proj-1', 'Q: a\nA: ')}`)
    render(<NewProjectWizard editProjectId="proj-1" />)
    const stub = await screen.findByTestId('recorder-stub')
    expect(stub).toHaveAttribute('data-refine', 'est-1')
    expect(stub).toHaveAttribute('data-initial', 'Q: a\nA: ')
    expect(window.location.search).not.toContain('refinePrefill')
  })

  it('keeps generate mode (no refine id) when the project has no current estimate', async () => {
    getCurrentEstimateId.mockResolvedValue(null)
    render(<NewProjectWizard editProjectId="proj-1" />)
    const stub = await screen.findByTestId('recorder-stub')
    expect(stub).toHaveAttribute('data-refine', '')
  })

  it('never falls back to generate when the current-estimate read fails', async () => {
    // A failed read is not "no estimate": the popup must stop with an error,
    // never mount the recorder in generate mode (it would regenerate from scratch).
    getCurrentEstimateId.mockRejectedValue(new Error('network down'))
    render(<NewProjectWizard editProjectId="proj-1" />)
    await vi.waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.queryByTestId('recorder-stub')).toBeNull()
  })
})
