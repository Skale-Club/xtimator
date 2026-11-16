import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

/**
 * New Xtimate popup composer: discard, camera-while-recording and the inline
 * needs-details card. MediaRecorder / getUserMedia / AudioContext are faked
 * (installed before the recorder module loads, because SUPPORTS_PAUSE is read
 * at import time).
 */

const fake = vi.hoisted(() => {
  class FakeRecorder {
    static instances: FakeRecorder[] = []
    static isTypeSupported = () => true
    state: 'inactive' | 'recording' | 'paused' = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    constructor() { FakeRecorder.instances.push(this) }
    start() { this.state = 'recording' }
    pause() { this.state = 'paused' }
    resume() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      // A real recorder flushes one last chunk, then fires onstop asynchronously.
      this.ondataavailable?.({ data: new Blob(['audio-bytes']) })
      queueMicrotask(() => this.onstop?.())
    }
  }
  const track = { addEventListener: () => {}, removeEventListener: () => {}, stop: () => {} }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  class FakeAudioContext {
    state = 'running'
    resume = async () => {}
    close = async () => {}
    createMediaStreamSource = () => ({ connect: () => {} })
    createAnalyser = () => ({ fftSize: 0 })
  }
  ;(globalThis as unknown as Record<string, unknown>).MediaRecorder = FakeRecorder
  ;(globalThis as unknown as Record<string, unknown>).AudioContext = FakeAudioContext
  return { FakeRecorder, stream }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('@/lib/i18n/use-translation', () => ({ useTranslation: () => ({ t: (s: string) => s, language: 'en' }) }))
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ language: 'en' }),
  useAppLanguage: () => 'en',
}))
const toastFn = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign((...a: unknown[]) => toastFn(...a), {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}))

const createTextRecording = vi.fn(async () => ({}))
const startRecordingPipeline = vi.fn(async () => ({ error: 'stop here' }))
vi.mock('@/lib/actions/recording', () => ({
  createTextRecording: (...a: unknown[]) => (createTextRecording as (...x: unknown[]) => unknown)(...a),
  startRecordingPipeline: (...a: unknown[]) => (startRecordingPipeline as (...x: unknown[]) => unknown)(...a),
  reportClientPipelineFailure: vi.fn(async () => undefined),
}))
vi.mock('@/lib/actions/estimate', () => ({ createBlankEstimate: vi.fn(), getEstimateByIdAction: vi.fn() }))
vi.mock('@/lib/actions/photo', () => ({ uploadProjectPhoto: vi.fn(), deletePhoto: vi.fn() }))
vi.mock('@/lib/actions/attempt-outcome', () => ({ getStepMedians: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/storage', () => ({ createStorage: () => ({}) }))
vi.mock('@/lib/storage/browser-upload', () => ({ uploadViaTicket: vi.fn() }))
const savePendingCapture = vi.fn()
vi.mock('@/lib/capture/blob-store', () => ({
  savePendingCapture: (...a: unknown[]) => savePendingCapture(...a),
  getPendingCapture: vi.fn(async () => null),
  deletePendingCapture: vi.fn(),
  isAvailable: () => true,
}))
const pollEstimateOutcome = vi.fn(() => new Promise(() => {}))
vi.mock('@/lib/estimate/poll-outcome', () => ({
  pollEstimateOutcome: (...a: unknown[]) => (pollEstimateOutcome as (...x: unknown[]) => unknown)(...a),
  getCurrentEstimateId: vi.fn(async () => 'est-1'),
}))
vi.mock('@/hooks/use-wake-lock', () => ({ useWakeLock: () => {} }))
vi.mock('@/lib/notifications/push-client', () => ({ canOfferPushNow: () => false, enableBrowserPush: vi.fn() }))
vi.mock('@/components/workspace/audio/voice-recorder', () => ({ VoiceRecorder: () => null }))
vi.mock('@/components/workspace/audio/waveform-visualizer', () => ({ WaveformVisualizer: () => null }))
vi.mock('@/components/capture/capture-processing-overlay', () => ({ CaptureProcessingOverlay: () => <div data-testid="overlay" /> }))
vi.mock('@/components/estimate/estimate-language-selector', () => ({ EstimateLanguageSelector: () => null }))
vi.mock('@/lib/estimate/background-generations', () => ({
  addBackgroundGeneration: vi.fn(),
  removeBackgroundGeneration: vi.fn(),
}))

import { CaptureRecorder, resolveRecorderStop } from '@/components/capture/capture-recorder'

const project = { id: 'proj-1', company_id: 'co-1', name: 'Smith Kitchen' } as never

function renderPopup(props: Record<string, unknown> = {}) {
  return render(
    <CaptureRecorder
      project={project}
      companyId="co-1"
      projectId="proj-1"
      variant="popup"
      draftKey="new"
      onStartBlank={async () => {}}
      {...props}
    />,
  )
}

async function startRecording() {
  fireEvent.click(screen.getByTestId('capture-mic'))
  await screen.findByTestId('capture-recording-status')
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.FakeRecorder.instances.length = 0
  localStorage.clear()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => fake.stream) },
  })
})
afterEach(() => localStorage.clear())

describe('resolveRecorderStop', () => {
  it('drops a discarded take before anything else, even a refine or too-short one', () => {
    expect(resolveRecorderStop({ discarded: true, refineMode: false, blobSize: 10, elapsedMs: 5000 })).toBe('discard')
    expect(resolveRecorderStop({ discarded: true, refineMode: true, blobSize: 0, elapsedMs: 0 })).toBe('discard')
  })
  it('keeps the normal decisions when not discarded', () => {
    expect(resolveRecorderStop({ discarded: false, refineMode: false, blobSize: 10, elapsedMs: 5000 })).toBe('run-pipeline')
    expect(resolveRecorderStop({ discarded: false, refineMode: true, blobSize: 10, elapsedMs: 5000 })).toBe('keep-for-refine')
    expect(resolveRecorderStop({ discarded: false, refineMode: true, blobSize: 10, elapsedMs: 100 })).toBe('too-short')
  })
})

describe('Discard while recording', () => {
  it('stops without dispatching, persisting, a too-short toast or a kept blob', async () => {
    renderPopup()
    await startRecording()
    fireEvent.click(screen.getByTestId('capture-discard'))
    await waitFor(() => expect(screen.queryByTestId('capture-recording-status')).toBeNull())
    await act(async () => { await Promise.resolve() })

    expect(fake.FakeRecorder.instances[0].state).toBe('inactive')
    expect(toastFn).toHaveBeenCalledWith('Recording discarded')
    expect(toastError).not.toHaveBeenCalled()
    expect(startRecordingPipeline).not.toHaveBeenCalled()
    expect(savePendingCapture).not.toHaveBeenCalled()
    // Back to an empty composer: no audio blob kept, so the dock offers to talk again.
    expect(screen.getByTestId('capture-mic')).toHaveAttribute('aria-label', 'Start recording')
    expect(screen.queryByTestId('generate-estimate-btn')).toBeNull()
  })

  it('works while paused and in refine mode (no voice note is kept)', async () => {
    renderPopup({ refineEstimateId: 'est-1' })
    await startRecording()
    fireEvent.click(screen.getByTestId('capture-pause'))
    expect(screen.getByTestId('capture-recording-status')).toHaveTextContent('Paused')
    fireEvent.click(screen.getByTestId('capture-discard'))
    await waitFor(() => expect(screen.queryByTestId('capture-recording-status')).toBeNull())
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByTestId('refine-voice-chip')).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('Camera while recording', () => {
  it('pauses the recording, tells the person, and leaves resuming to them', async () => {
    renderPopup()
    await startRecording()
    fireEvent.click(screen.getByTestId('capture-add-photos'))
    expect(fake.FakeRecorder.instances[0].state).toBe('paused')
    expect(toastFn).toHaveBeenCalledWith('Recording paused while you pick photos')
    expect(screen.getByTestId('capture-recording-status')).toHaveTextContent('Paused')
  })
})

describe('Needs-details in the popup', () => {
  it('returns to the composer with the questions inline, and clears them on the next attempt', async () => {
    pollEstimateOutcome.mockResolvedValueOnce({
      state: 'awaiting_details',
      reason: 'missing_specifics',
      questions: ['What is the wall area?'],
    } as never)
    renderPopup()
    fireEvent.change(screen.getByTestId('capture-description'), { target: { value: 'paint a room' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-estimate-btn'))
    })
    const card = await screen.findByTestId('capture-needs-details')
    expect(card).toHaveTextContent('What is the wall area?')
    expect(screen.getByTestId('capture-description')).toHaveAttribute('placeholder', 'Answer here or tap to talk...')

    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-estimate-btn'))
    })
    await waitFor(() => expect(screen.queryByTestId('capture-needs-details')).toBeNull())
  })
})

describe('Composer', () => {
  it('shows the idle talk button with no input and generate only once there is input', () => {
    renderPopup()
    expect(screen.getByTestId('capture-mic')).toHaveAttribute('aria-label', 'Start recording')
    expect(screen.queryByTestId('generate-estimate-btn')).toBeNull()
    expect(screen.getByTestId('start-from-scratch-btn')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('capture-description'), { target: { value: 'paint' } })
    expect(screen.getByTestId('generate-estimate-btn')).toBeInTheDocument()
    expect(screen.getByTestId('capture-mic')).toHaveAttribute('aria-label', 'Record audio')
    expect(screen.queryByTestId('start-from-scratch-btn')).toBeNull()
  })

  it('Ctrl+Enter in the textarea triggers generate when there is input', async () => {
    renderPopup()
    const ta = screen.getByTestId('capture-description')
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })
    expect(createTextRecording).not.toHaveBeenCalled()
    fireEvent.change(ta, { target: { value: 'build a deck' } })
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true })
    })
    await waitFor(() => expect(createTextRecording).toHaveBeenCalledTimes(1))
  })
})
