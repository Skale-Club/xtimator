import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/**
 * Capture reliability: in-progress chunk persistence (webm only), recovery of
 * an interrupted take through the resume card, recorder errors and the screen
 * wake lock. The blob store is REAL (fake-indexeddb); MediaRecorder is faked.
 */

const fake = vi.hoisted(() => {
  class FakeRecorder {
    static instances: FakeRecorder[] = []
    static supported: (t: string) => boolean = () => true
    static isTypeSupported = (t: string) => FakeRecorder.supported(t)
    state: 'inactive' | 'recording' | 'paused' = 'inactive'
    mimeType: string
    startArgs: unknown[] | null = null
    requestDataCalls = 0
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: ((e?: unknown) => void) | null = null
    onerror: ((e?: unknown) => void) | null = null
    constructor(_stream: unknown, opts?: { mimeType?: string }) {
      this.mimeType = opts?.mimeType ?? ''
      FakeRecorder.instances.push(this)
    }
    start(...args: unknown[]) { this.startArgs = args; this.state = 'recording' }
    pause() { this.state = 'paused' }
    resume() { this.state = 'recording' }
    requestData() {
      this.requestDataCalls += 1
      this.ondataavailable?.({ data: new Blob(['flush']) })
    }
    emit(text: string) { this.ondataavailable?.({ data: new Blob([text]) }) }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['final']) })
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

vi.mock('@/lib/actions/recording', () => ({
  createTextRecording: vi.fn(async () => ({})),
  startRecordingPipeline: vi.fn(async () => ({ error: 'stop here' })),
  reportClientPipelineFailure: vi.fn(async () => undefined),
}))
vi.mock('@/lib/actions/estimate', () => ({ createBlankEstimate: vi.fn(), getEstimateByIdAction: vi.fn() }))
vi.mock('@/lib/actions/photo', () => ({ uploadProjectPhoto: vi.fn(), deletePhoto: vi.fn() }))
vi.mock('@/lib/actions/attempt-outcome', () => ({ getStepMedians: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/storage', () => ({ createStorage: () => ({}) }))
const uploadViaTicket = vi.fn(async (..._a: unknown[]) => ({ path: 'audio/p.webm' }))
vi.mock('@/lib/storage/browser-upload', () => ({
  uploadViaTicket: (...a: unknown[]) => uploadViaTicket(...a),
}))
vi.mock('@/lib/estimate/poll-outcome', () => ({
  pollEstimateOutcome: vi.fn(() => new Promise(() => {})),
  getCurrentEstimateId: vi.fn(async () => 'est-1'),
}))
vi.mock('@/lib/notifications/push-client', () => ({ canOfferPushNow: () => false, enableBrowserPush: vi.fn() }))
vi.mock('@/components/workspace/audio/voice-recorder', () => ({ VoiceRecorder: () => null }))
vi.mock('@/components/workspace/audio/waveform-visualizer', () => ({ WaveformVisualizer: () => null }))
vi.mock('@/components/capture/capture-processing-overlay', () => ({ CaptureProcessingOverlay: () => <div data-testid="overlay" /> }))
vi.mock('@/components/estimate/estimate-language-selector', () => ({ EstimateLanguageSelector: () => null }))
vi.mock('@/lib/estimate/background-generations', () => ({
  addBackgroundGeneration: vi.fn(),
  removeBackgroundGeneration: vi.fn(),
}))

import { CaptureRecorder, supportsInflightPersistence } from '@/components/capture/capture-recorder'
import { appendInflightChunk, getInflightCapture, getPendingCapture } from '@/lib/capture/blob-store'

const project = { id: 'proj-1', company_id: 'co-1', name: 'Smith Kitchen' } as never
const KEY = 'new'

function renderPopup() {
  return render(
    <CaptureRecorder
      project={project}
      companyId="co-1"
      projectId="proj-1"
      variant="popup"
      draftKey={KEY}
      onStartBlank={async () => {}}
    />,
  )
}

async function startRecording() {
  fireEvent.click(screen.getByTestId('capture-mic'))
  await screen.findByTestId('capture-recording-status')
}

const lastRecorder = () => fake.FakeRecorder.instances[fake.FakeRecorder.instances.length - 1]
const bytesOf = (s: string) => new TextEncoder().encode(s).buffer

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('xtimator-capture')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  fake.FakeRecorder.instances.length = 0
  fake.FakeRecorder.supported = (t) => t.startsWith('audio/webm')
  localStorage.clear()
  await deleteDb()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => fake.stream) },
  })
})
afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  delete (navigator as unknown as Record<string, unknown>).wakeLock
})

describe('supportsInflightPersistence', () => {
  it('is true for webm only', () => {
    expect(supportsInflightPersistence('audio/webm;codecs=opus')).toBe(true)
    expect(supportsInflightPersistence('audio/webm')).toBe(true)
    expect(supportsInflightPersistence('audio/mp4')).toBe(false)
    expect(supportsInflightPersistence('')).toBe(false)
  })
})

describe('in-progress persistence while recording', () => {
  it('webm: starts with a 10 s timeslice and appends each chunk to the in-flight store', async () => {
    renderPopup()
    await startRecording()
    const rec = lastRecorder()
    expect(rec.startArgs).toEqual([10_000])

    act(() => { rec.emit('aaa') })
    act(() => { rec.emit('bb') })
    await waitFor(async () => {
      const stored = await getInflightCapture(KEY)
      expect(stored?.chunks).toHaveLength(2)
    })
    const stored = await getInflightCapture(KEY)
    expect(stored!.mimeType).toBe('audio/webm;codecs=opus')
    expect(stored!.chunks.map((c) => new TextDecoder().decode(c))).toEqual(['aaa', 'bb'])
  })

  it('mp4 (older iOS): no timeslice and nothing written to the in-flight store', async () => {
    fake.FakeRecorder.supported = (t) => t === 'audio/mp4'
    renderPopup()
    await startRecording()
    const rec = lastRecorder()
    expect(rec.mimeType).toBe('audio/mp4')
    expect(rec.startArgs).toEqual([])

    act(() => { rec.emit('aaa') })
    await new Promise((r) => setTimeout(r, 50))
    expect(await getInflightCapture(KEY)).toBeNull()
  })

  it('pause flushes the pending audio so it survives while paused', async () => {
    renderPopup()
    await startRecording()
    const rec = lastRecorder()
    fireEvent.click(await screen.findByTestId('capture-pause'))
    expect(rec.requestDataCalls).toBe(1)
    await waitFor(async () => {
      expect((await getInflightCapture(KEY))?.chunks).toHaveLength(1)
    })
  })

  it('a normal stop clears the in-flight record and still persists the finished take', async () => {
    renderPopup()
    await startRecording()
    act(() => { lastRecorder().emit('aaa') })
    await waitFor(async () => expect(await getInflightCapture(KEY)).not.toBeNull())

    fireEvent.click(screen.getByTestId('capture-mic'))
    await waitFor(async () => expect(await getInflightCapture(KEY)).toBeNull())
    await waitFor(async () => expect(await getPendingCapture(KEY)).not.toBeNull())
  })

  it('discard clears the in-flight record and persists nothing', async () => {
    renderPopup()
    await startRecording()
    act(() => { lastRecorder().emit('aaa') })
    await waitFor(async () => expect(await getInflightCapture(KEY)).not.toBeNull())

    fireEvent.click(screen.getByTestId('capture-discard'))
    await waitFor(async () => expect(await getInflightCapture(KEY)).toBeNull())
    expect(await getPendingCapture(KEY)).toBeNull()
  })
})

describe('recovering an interrupted take', () => {
  it('shows the interrupted card with its length; Use it uploads the assembled audio', async () => {
    await appendInflightChunk(KEY, { mimeType: 'audio/webm;codecs=opus', startedAt: 1, durationMs: 492_000 }, bytesOf('abc'), true)
    await appendInflightChunk(KEY, { mimeType: 'audio/webm;codecs=opus', startedAt: 1, durationMs: 492_000 }, bytesOf('de'))

    renderPopup()
    const card = await screen.findByTestId('capture-resume-card')
    expect(card).toHaveTextContent('A recording was interrupted at 8:12.')
    expect(screen.getByTestId('capture-resume-upload')).toHaveTextContent('Use it')
    expect(screen.getByTestId('capture-resume-discard')).toHaveTextContent('Discard')

    await act(async () => { fireEvent.click(screen.getByTestId('capture-resume-upload')) })
    await waitFor(() => expect(uploadViaTicket).toHaveBeenCalledTimes(1))
    const args = uploadViaTicket.mock.calls[0][0] as { blob: Blob; contentType: string }
    expect(args.blob.size).toBe(5)
    expect(args.contentType).toBe('audio/webm;codecs=opus')
    // The take is now a finished pending capture; the in-progress copy is gone.
    await waitFor(async () => expect(await getInflightCapture(KEY)).toBeNull())
    expect((await getPendingCapture(KEY))?.durationSeconds).toBe(492)
  })

  it('Discard drops the interrupted take', async () => {
    await appendInflightChunk(KEY, { mimeType: 'audio/webm', startedAt: 1, durationMs: 30_000 }, bytesOf('abc'), true)
    renderPopup()
    await screen.findByTestId('capture-resume-card')
    fireEvent.click(screen.getByTestId('capture-resume-discard'))
    await waitFor(() => expect(screen.queryByTestId('capture-resume-card')).toBeNull())
    await waitFor(async () => expect(await getInflightCapture(KEY)).toBeNull())
  })

  it('drops a stale record (older than 24 h) silently', async () => {
    const realNow = Date.now()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow - 25 * 60 * 60 * 1000)
    await appendInflightChunk(KEY, { mimeType: 'audio/webm', startedAt: 1, durationMs: 30_000 }, bytesOf('abc'), true)
    nowSpy.mockRestore()

    renderPopup()
    await waitFor(async () => expect(await getInflightCapture(KEY)).toBeNull())
    expect(screen.queryByTestId('capture-resume-card')).toBeNull()
  })

  it('a finished pending capture wins and the in-progress leftover is removed', async () => {
    const { savePendingCapture } = await import('@/lib/capture/blob-store')
    await savePendingCapture({ key: KEY, buffer: bytesOf('done'), mimeType: 'audio/webm', durationSeconds: 90, createdAt: Date.now() })
    await appendInflightChunk(KEY, { mimeType: 'audio/webm', startedAt: 1, durationMs: 30_000 }, bytesOf('abc'), true)

    renderPopup()
    const card = await screen.findByTestId('capture-resume-card')
    expect(card).toHaveTextContent('You have an unsent recording')
    expect(screen.getByTestId('capture-resume-upload')).toHaveTextContent('Resume upload')
    await waitFor(async () => expect(await getInflightCapture(KEY)).toBeNull())
  })
})

describe('recorder errors', () => {
  it('keeps the captured audio, shows a short toast and leaves the recording state', async () => {
    renderPopup()
    await startRecording()
    const rec = lastRecorder()
    act(() => { rec.emit('aaa') })

    act(() => { rec.onerror?.(new Event('error')) })
    expect(toastError).toHaveBeenCalledWith('The recording stopped unexpectedly. What was captured is kept.')
    await waitFor(() => expect(screen.queryByTestId('capture-recording-status')).toBeNull())
    // Same path as a normal stop: the take reaches the finished-take store.
    await waitFor(async () => expect(await getPendingCapture(KEY)).not.toBeNull())
  })

  it('does not stay stuck when the recorder dies without firing stop', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderPopup()
      await startRecording()
      const rec = lastRecorder()
      act(() => { rec.emit('aaa') })
      // Dead recorder: stop() does nothing and never fires onstop.
      rec.stop = () => { rec.state = 'inactive' }
      act(() => { rec.onerror?.(new Event('error')) })
      await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
      await waitFor(async () => expect(await getPendingCapture(KEY)).not.toBeNull())
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('screen wake lock while recording', () => {
  it('requests the lock when recording starts and releases it on stop', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ released: false, release }))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    renderPopup()
    await startRecording()
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))

    fireEvent.click(screen.getByTestId('capture-mic'))
    await waitFor(() => expect(release).toHaveBeenCalled())
  })

  it('records normally where the API is missing', async () => {
    renderPopup()
    await startRecording()
    expect(screen.getByTestId('capture-recording-status')).toBeInTheDocument()
  })
})
