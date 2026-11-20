import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

/**
 * Credits plan 2026-11-20 (owner-approved redesign) - a paused capture lives
 * in ONE place: the paused sheet (same sheet as New Xtimate), opened by
 * ?paused=<attempt>. The project header chip, the list badge and the email
 * link there; no page panel, no extra banner.
 */

const replace = vi.fn()
const push = vi.fn()
const refresh = vi.fn()
let search = new URLSearchParams()
let pathname = '/projects/p-1'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => search,
  usePathname: () => pathname,
}))
const T = (s: string) => s
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: T }), useAppTranslation: () => ({ t: T }) }))
let purchase: (() => void) | undefined
vi.mock('@/components/billing/buy-credits', () => ({
  BuyCreditsInline: (props: { onPurchased?: () => void; ctaVerb?: string }) => {
    purchase = props.onPurchased
    return <div data-testid="buy-inline" data-verb={props.ctaVerb ?? 'buy'} />
  },
}))
const getAttemptOutcome = vi.fn()
vi.mock('@/lib/actions/attempt-outcome', () => ({ getAttemptOutcome: (...a: unknown[]) => getAttemptOutcome(...a) }))
const pollEstimateOutcome = vi.fn()
vi.mock('@/lib/estimate/poll-outcome', () => ({
  pollEstimateOutcome: (...a: unknown[]) => pollEstimateOutcome(...a),
  getCurrentEstimateId: vi.fn(async () => null),
}))
vi.mock('@/components/capture/capture-processing-overlay', () => ({
  CaptureProcessingOverlay: () => <div data-testid="progress-overlay" />,
}))

const { CapturePaused } = await import('@/components/capture/capture-paused')
const { PausedEstimateSheet, pausedHref } = await import('@/components/billing/paused-estimate-sheet')
const { ProjectStatusBadge } = await import('@/components/projects/project-status-badge')

const PAUSED = { state: 'paused', next: 'analyze', expiresAt: '2026-11-27T12:00:00Z', completedSteps: ['transcribe'] }

beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams()
  pathname = '/projects/p-1'
})

describe('CapturePaused', () => {
  it('shows what is done, where it stopped, and the packs with "buy and continue"', () => {
    render(<CapturePaused next="analyze" completedSteps={['transcribe']} expiresAt="2026-11-27T12:00:00Z" hasAudio hasPhotos onPurchased={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.getAttribute('data-state'))).toEqual(['done', 'paused', 'todo'])
    expect(items[1].textContent).toContain('Analyze the photos')
    expect(items[1].textContent).toContain('stopped here')
    expect(screen.getByTestId('buy-inline').getAttribute('data-verb')).toBe('continue')
  })

  it('a text-only capture paused before generating lists just that step', () => {
    render(<CapturePaused next="generate_estimate" completedSteps={[]} expiresAt={null} hasAudio={false} hasPhotos={false} onPurchased={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0].getAttribute('data-state')).toBe('paused')
  })
})

describe('PausedEstimateSheet', () => {
  it('stays closed without ?paused=', () => {
    render(<PausedEstimateSheet />)
    expect(screen.queryByTestId('paused-estimate-sheet')).toBeNull()
    expect(getAttemptOutcome).not.toHaveBeenCalled()
  })

  it('?paused=<attempt> on a project opens the paused screen for that attempt', async () => {
    search = new URLSearchParams('paused=att-1')
    getAttemptOutcome.mockResolvedValue(PAUSED)
    render(<PausedEstimateSheet />)
    expect(await screen.findByTestId('capture-paused')).toBeTruthy()
    expect(getAttemptOutcome).toHaveBeenCalledWith('att-1')
  })

  it('after a buy it shows the progress and opens the estimate when ready', async () => {
    search = new URLSearchParams('paused=att-1')
    getAttemptOutcome.mockResolvedValue(PAUSED)
    let finish: (v: unknown) => void = () => {}
    pollEstimateOutcome.mockImplementation(() => new Promise((r) => (finish = r)))
    render(<PausedEstimateSheet />)
    await screen.findByTestId('capture-paused')
    act(() => purchase?.())
    expect(await screen.findByTestId('progress-overlay')).toBeTruthy()
    await waitFor(() => expect(pollEstimateOutcome).toHaveBeenCalled())
    expect(pollEstimateOutcome.mock.calls[0][0]).toMatchObject({ projectId: 'p-1', attemptId: 'att-1' })
    await act(async () => finish({ state: 'completed', estimateId: 'est-9' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p-1?tab=estimate&estimate=est-9'))
  })

  it('a poll that still reads paused right after the buy keeps watching (grant in flight)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    search = new URLSearchParams('paused=att-1')
    getAttemptOutcome.mockResolvedValue(PAUSED)
    pollEstimateOutcome.mockResolvedValueOnce(PAUSED).mockResolvedValueOnce({ state: 'completed', estimateId: 'est-2' })
    render(<PausedEstimateSheet />)
    await screen.findByTestId('capture-paused')
    act(() => purchase?.())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p-1?tab=estimate&estimate=est-2'))
    vi.useRealTimers()
  })

  it('an attempt that already finished goes straight to its estimate', async () => {
    search = new URLSearchParams('paused=att-1')
    getAttemptOutcome.mockResolvedValue({ state: 'completed', estimateId: 'est-5' })
    render(<PausedEstimateSheet />)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p-1?tab=estimate&estimate=est-5'))
  })

  it('an expired or unknown attempt explains it is no longer paused', async () => {
    search = new URLSearchParams('paused=att-1')
    getAttemptOutcome.mockResolvedValue({ state: 'failed', step: 'generate_estimate', reason: 'x' })
    render(<PausedEstimateSheet />)
    expect(await screen.findByText('This estimate is no longer paused.')).toBeTruthy()
  })

  it('pausedHref builds the link the chip, badge and email use', () => {
    expect(pausedHref('p-1', 'att 1')).toBe('/projects/p-1?paused=att%201')
  })
})

describe('ProjectStatusBadge', () => {
  it('renders the virtual paused status', () => {
    render(<ProjectStatusBadge status="awaiting_credits" />)
    expect(screen.getByText('Paused: out of credits')).toBeTruthy()
  })
})
