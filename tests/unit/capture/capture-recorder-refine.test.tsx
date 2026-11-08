import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'

/**
 * Edit with AI (refine mode) in the capture popup. With refineEstimateId set,
 * the recorder must go through POST /api/estimates/[id]/refine and never touch
 * recordings or generate-estimate (except the confirmed "Regenerate from
 * scratch"). Without it, the generate behavior is unchanged.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ language: 'en' }),
  useAppLanguage: () => 'en',
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn(), info: vi.fn() },
}))

const createTextRecording = vi.fn(async () => ({ error: 'stop here' }))
const startRecordingPipeline = vi.fn(async () => ({ error: 'stop here' }))
vi.mock('@/lib/actions/recording', () => ({
  createTextRecording: (...a: unknown[]) => (createTextRecording as (...x: unknown[]) => unknown)(...a),
  startRecordingPipeline: (...a: unknown[]) => (startRecordingPipeline as (...x: unknown[]) => unknown)(...a),
  reportClientPipelineFailure: vi.fn(async () => undefined),
}))
vi.mock('@/lib/actions/estimate', () => ({
  createBlankEstimate: vi.fn(),
  getEstimateByIdAction: vi.fn(),
}))
vi.mock('@/lib/actions/photo', () => ({ uploadProjectPhoto: vi.fn(), deletePhoto: vi.fn() }))
vi.mock('@/lib/actions/attempt-outcome', () => ({ getStepMedians: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/storage', () => ({ createStorage: () => ({}) }))
vi.mock('@/lib/storage/browser-upload', () => ({ uploadViaTicket: vi.fn() }))
vi.mock('@/lib/capture/blob-store', () => ({
  savePendingCapture: vi.fn(),
  getPendingCapture: vi.fn(async () => null),
  deletePendingCapture: vi.fn(),
  isAvailable: () => false,
}))
vi.mock('@/lib/estimate/poll-outcome', () => ({
  pollEstimateOutcome: vi.fn(() => new Promise(() => {})),
  getCurrentEstimateId: vi.fn(async () => 'est-1'),
}))
vi.mock('@/hooks/use-wake-lock', () => ({ useWakeLock: () => {} }))
vi.mock('@/lib/notifications/push-client', () => ({
  canOfferPushNow: () => false,
  enableBrowserPush: vi.fn(),
}))
vi.mock('@/components/workspace/audio/voice-recorder', () => ({ VoiceRecorder: () => null }))
vi.mock('@/components/workspace/audio/waveform-visualizer', () => ({ WaveformVisualizer: () => null }))
vi.mock('@/components/capture/capture-processing-overlay', () => ({ CaptureProcessingOverlay: () => <div data-testid="overlay" /> }))
vi.mock('@/components/estimate/estimate-language-selector', () => ({ EstimateLanguageSelector: () => null }))
vi.mock('@/lib/estimate/background-generations', () => ({
  addBackgroundGeneration: vi.fn(),
  removeBackgroundGeneration: vi.fn(),
}))

const refineFlowSubmit = vi.fn()
vi.mock('@/components/capture/use-refine-flow', () => ({
  useRefineFlow: () => ({
    phase: 'idle',
    review: null,
    submit: (...a: unknown[]) => refineFlowSubmit(...a),
    apply: vi.fn(),
    discard: vi.fn(),
  }),
}))

import { CaptureRecorder } from '@/components/capture/capture-recorder'

const project = { id: 'proj-1', company_id: 'co-1', name: 'Smith Kitchen' } as never

function renderRecorder(props: Record<string, unknown> = {}) {
  return render(
    <CaptureRecorder
      project={project}
      companyId="co-1"
      projectId="proj-1"
      variant="popup"
      draftKey="edit:proj-1"
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(() => localStorage.clear())

describe('CaptureRecorder refine mode', () => {
  it('shows the update-the-current-estimate copy and a Preview changes button', () => {
    renderRecorder({ refineEstimateId: 'est-1' })
    expect(screen.getByTestId('refine-mode-hint')).toHaveTextContent('update the current estimate')
    expect(screen.getByTestId('refine-preview-btn')).toHaveTextContent('Preview changes')
    expect(screen.queryByTestId('generate-estimate-btn')).toBeNull()
  })

  it('submits the typed text through the refine flow and never calls generate paths', async () => {
    renderRecorder({ refineEstimateId: 'est-1' })
    fireEvent.change(screen.getByTestId('capture-description'), { target: { value: 'raise the paint price' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('refine-preview-btn'))
    })
    expect(refineFlowSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: 'raise the paint price', photos: [] }),
    )
    expect(createTextRecording).not.toHaveBeenCalled()
    expect(startRecordingPipeline).not.toHaveBeenCalled()
  })

  it('Preview changes is disabled with no input', () => {
    renderRecorder({ refineEstimateId: 'est-1' })
    expect(screen.getByTestId('refine-preview-btn')).toBeDisabled()
  })

  it('without a current estimate keeps today\'s generate behavior', async () => {
    renderRecorder()
    expect(screen.queryByTestId('refine-mode-hint')).toBeNull()
    fireEvent.change(screen.getByTestId('capture-description'), { target: { value: 'build a deck' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-estimate-btn'))
    })
    await waitFor(() => expect(createTextRecording).toHaveBeenCalledTimes(1))
    expect(refineFlowSubmit).not.toHaveBeenCalled()
  })

  it('Regenerate from scratch asks for confirmation first, then runs the generate path', async () => {
    renderRecorder({ refineEstimateId: 'est-1' })
    fireEvent.change(screen.getByTestId('capture-description'), { target: { value: 'start over: new deck' } })

    fireEvent.click(screen.getByTestId('regenerate-from-scratch-btn'))
    const dialog = await screen.findByTestId('regenerate-confirm')
    expect(createTextRecording).not.toHaveBeenCalled()

    // Cancel does nothing.
    fireEvent.click(within(dialog).getByTestId('regenerate-cancel'))
    await waitFor(() => expect(screen.queryByTestId('regenerate-confirm')).toBeNull())
    expect(createTextRecording).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('regenerate-from-scratch-btn'))
    const dialog2 = await screen.findByTestId('regenerate-confirm')
    await act(async () => {
      fireEvent.click(within(dialog2).getByTestId('regenerate-confirm-btn'))
    })
    await waitFor(() => expect(createTextRecording).toHaveBeenCalledTimes(1))
    expect(refineFlowSubmit).not.toHaveBeenCalled()
  })

  it('pre-fills the text box with initialText once (Answer with AI)', () => {
    renderRecorder({ refineEstimateId: 'est-1', initialText: 'Q: Is the closet included?\nA: ' })
    expect(screen.getByTestId('capture-description')).toHaveValue('Q: Is the closet included?\nA: ')
  })

  it('appends initialText below an existing draft instead of overwriting it', () => {
    localStorage.setItem('xtimator:capture-draft:edit:proj-1', 'earlier note')
    renderRecorder({ refineEstimateId: 'est-1', initialText: 'Q: x\nA: ' })
    expect(screen.getByTestId('capture-description')).toHaveValue('earlier note\n\nQ: x\nA: ')
  })
})
