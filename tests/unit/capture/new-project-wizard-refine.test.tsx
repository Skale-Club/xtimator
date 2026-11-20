import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
  useAppTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
vi.mock('@/lib/actions/project', () => ({
  resumeOrCreateDraftProjectAction: vi.fn(),
  getProjectMinimalAction: vi.fn(async () => ({ data: { id: 'proj-1', company_id: 'co-1', name: 'P' } })),
}))
vi.mock('@/lib/actions/estimate', () => ({ createBlankEstimate: vi.fn() }))
vi.mock('@/lib/billing/block-toast', () => ({
  showBillingBlockToast: vi.fn(),
  billingBlockCopy: (code: string) =>
    code === 'out_of_credits'
      ? { title: "You're out of credits", description: 'Buy credits to keep creating estimates.', cta: 'Buy credits' }
      : { title: 'Your free credits are used up', description: 'Subscribe to Xtimator Pro to keep creating estimates.', cta: 'Subscribe' },
}))
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

// Credits plan 2026-11-20: out of credits shows the packs inside the block.
vi.mock('@/components/billing/buy-credits', () => ({
  BuyCreditsInline: () => <div data-testid="buy-credits-inline" />,
}))

describe('NewProjectWizard new mode when the company cannot start an estimate', () => {
  it('paywalled: shows the block with Subscribe instead of an endless loader', async () => {
    const { resumeOrCreateDraftProjectAction } = await import('@/lib/actions/project')
    vi.mocked(resumeOrCreateDraftProjectAction).mockResolvedValue({ error: 'blocked', code: 'paywalled' } as never)
    render(<NewProjectWizard />)
    const blocked = await screen.findByTestId('new-xtimate-blocked')
    expect(blocked).toHaveAttribute('data-state', 'paywalled')
    expect(screen.getByText('Your free credits are used up')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument()
    expect(screen.queryByTestId('buy-credits-inline')).toBeNull()
    expect(screen.queryByTestId('recorder-stub')).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('out_of_credits: shows the block with the packs right there', async () => {
    const { resumeOrCreateDraftProjectAction } = await import('@/lib/actions/project')
    vi.mocked(resumeOrCreateDraftProjectAction).mockResolvedValue({ error: 'blocked', code: 'out_of_credits' } as never)
    render(<NewProjectWizard />)
    const blocked = await screen.findByTestId('new-xtimate-blocked')
    expect(blocked).toHaveAttribute('data-state', 'out_of_credits')
    expect(screen.getByText("You're out of credits")).toBeInTheDocument()
    expect(screen.getByTestId('buy-credits-inline')).toBeInTheDocument()
    expect(screen.queryByTestId('recorder-stub')).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })
})
