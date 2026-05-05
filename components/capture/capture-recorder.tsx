'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mic, MicOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CircularProgressRing } from '@/components/capture/circular-progress-ring'
import { CaptureTimer } from '@/components/capture/capture-timer'
import { CaptureStepper } from '@/components/capture/capture-stepper'
import { CaptureFailure } from '@/components/capture/capture-failure'
import { WaveformVisualizer } from '@/components/workspace/audio/waveform-visualizer'
import { createRecording, transcribeRecording } from '@/lib/actions/recording'
import { createClient } from '@/lib/supabase/client'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import type { ProjectDetail } from '@/lib/queries/project'

// Duration constants — D-06, D-07
export const HARD_CAP_MS  = 10 * 60 * 1000   // 600000  D-06 — auto-stop
export const WARN_AT_MS   =  9 * 60 * 1000   // 540000  D-07 — 60s remaining
export const AMBER_AT_MS  =  8 * 60 * 1000   // 480000  D-07 — neutral→amber
export const RED_AT_MS    =  9.5 * 60 * 1000 // 570000  D-07 — amber→red
const TICK_MS = 250                            // RESEARCH Pattern 4

type Stage = 'idle' | 'saving' | 'transcribing' | 'analyzing' | 'generating' | 'done'
type StageKey = 'saving' | 'transcribing' | 'analyzing' | 'generating'

interface CaptureRecorderProps {
  project: ProjectDetail
  companyId: string
  projectId: string
}

export function CaptureRecorder({ project, companyId, projectId }: CaptureRecorderProps) {
  const router = useRouter()

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  // Pipeline state
  const [stage, setStage] = useState<Stage>('idle')
  const [failedAt, setFailedAt] = useState<StageKey | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [transcript, setTranscript] = useState<string | undefined>(undefined)
  const [retriesUsed, setRetriesUsed] = useState(0)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const warnedRef = useRef<boolean>(false)
  const abortControllerRef = useRef<AbortController>(new AbortController())

  // Stop recording (memoized for use in callbacks)
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setAnalyser(null)
    setIsRecording(false)
  }, [])

  // Tick — wall-clock elapsed (RESEARCH Pattern 4)
  const tick = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current
    setElapsedMs(elapsed)
    if (elapsed >= WARN_AT_MS && !warnedRef.current) {
      warnedRef.current = true
      toast.warning('60 seconds remaining', {
        description: 'Recording will auto-stop at 10 minutes.',
      })
    }
    if (elapsed >= HARD_CAP_MS) {
      toast.info('Time limit reached', { description: 'Recording stopped at 10 minutes.' })
      stopRecording()
    }
  }, [stopRecording])

  // Visibility change safety — fire tick immediately when tab becomes visible (RESEARCH Pattern 4)
  useEffect(() => {
    const onVis = () => { if (!document.hidden && isRecording) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [tick, isRecording])

  // Prevent accidental navigation while recording (Pitfall 3)
  useEffect(() => {
    if (!isRecording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isRecording])

  // Track mute/inactive events — permission revoked mid-recording (Pitfall 2)
  useEffect(() => {
    const stream = streamRef.current
    if (!isRecording || !stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    const onMute = () => {
      toast.error('Microphone permission was revoked')
      stopRecording()
    }
    track.addEventListener('mute', onMute)
    track.addEventListener('inactive' as unknown as keyof MediaStreamTrackEventMap, onMute as EventListener)
    return () => {
      track.removeEventListener('mute', onMute)
      track.removeEventListener('inactive' as unknown as keyof MediaStreamTrackEventMap, onMute as EventListener)
    }
  }, [isRecording, stopRecording])

  // Cleanup on unmount (Pitfall 3, Pitfall 4)
  useEffect(() => () => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    abortControllerRef.current?.abort()
  }, [])

  // Pipeline helper: set failure state
  function failAt(s: StageKey, msg: string) {
    setFailedAt(s)
    setErrorMessage(msg)
  }

  // Full AI pipeline (RESEARCH Pattern 5)
  const runPipeline = useCallback(async (blob: Blob) => {
    abortControllerRef.current = new AbortController()
    setStage('saving')
    setFailedAt(undefined)
    setErrorMessage(undefined)

    const supabase = createClient()
    const recordingId = crypto.randomUUID()
    const ext = getFileExtension(mimeTypeRef.current)
    const storagePath = `${companyId}/${projectId}/${recordingId}.${ext}`

    // Upload to Supabase Storage
    const { error: upErr } = await supabase.storage.from('audio')
      .upload(storagePath, blob, { contentType: mimeTypeRef.current || 'audio/webm', upsert: false })
    if (upErr) { failAt('saving', 'Failed to upload audio file'); return }

    // Create recording row
    const created = await createRecording(projectId, storagePath, Math.floor(elapsedMs / 1000))
    if ('error' in created) { failAt('saving', created.error ?? 'Failed to save recording'); return }

    // Transcribe
    setStage('transcribing')
    const transcribed = await transcribeRecording(created.data.id as string)
    if ('error' in transcribed) { failAt('transcribing', transcribed.error ?? 'Transcription failed'); return }
    if (!transcribed.data.transcript?.trim()) {
      failAt('transcribing', "We couldn't catch your description — please try again or edit manually.")
      return
    }
    setTranscript(transcribed.data.transcript)

    // Generate estimate
    setStage('analyzing')
    try {
      const res = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId }),
        signal: abortControllerRef.current.signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        failAt('analyzing', (body as { error?: string }).error ?? 'Estimate generation failed')
        return
      }
      setStage('generating')
      const data = await res.json() as { estimateId: string; version: number }
      setStage('done')
      router.push(`/projects/${projectId}?tab=estimate&estimate=${data.estimateId}`)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return  // unmount; not a user-facing failure
      failAt('analyzing', 'Estimate generation failed')
    }
  }, [companyId, projectId, elapsedMs, router])

  // Start recording
  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    warnedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Create AudioContext inside click handler (iOS Safari requires user gesture — Pitfall 1)
      const audioContext = new AudioContext()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyserNode = audioContext.createAnalyser()
      analyserNode.fftSize = 256
      source.connect(analyserNode)
      setAnalyser(analyserNode)

      const mimeType = getSupportedAudioMimeType()
      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setAudioBlob(blob)
        // Pipeline fires after blob is set — use the blob directly
        runPipeline(blob)
      }

      recorder.start()
      startTimeRef.current = performance.now()
      setIsRecording(true)

      tickIntervalRef.current = setInterval(tick, TICK_MS)
    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error?.name === 'NotAllowedError') {
        toast.error('Microphone permission denied. Please allow microphone access and try again.')
      } else if (error?.name === 'NotFoundError') {
        toast.error('No microphone found. Please connect a microphone and try again.')
      } else {
        toast.error('Failed to start recording. Please try again.')
      }
    }
  }, [tick, runPipeline])

  const handleToggleRecording = useCallback(() => {
    // design-decision: no in-recording cancel — see plan 18-02 acceptance
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // Color class for ring and timer (D-07)
  const ringColorClass =
    elapsedMs >= RED_AT_MS    ? 'stroke-red-500'   :
    elapsedMs >= AMBER_AT_MS  ? 'stroke-amber-500' :
                                'stroke-primary'
  const progress = Math.min(elapsedMs / HARD_CAP_MS, 1)  // ring fill 0..1

  const isIdle = stage === 'idle'
  const showRecorderUI = isIdle || stage === 'done'

  return (
    <div className="flex flex-1 flex-col" data-testid="capture-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm text-muted-foreground truncate">{project.name}</span>
        {/* Skip button only visible when idle and NOT recording and NO blob (Pitfall 4) */}
        {stage === 'idle' && !isRecording && !audioBlob && (
          <Button asChild variant="ghost" size="sm" data-testid="skip-recording">
            <Link href={`/projects/${projectId}`}>
              Skip recording
              <X className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      </header>

      {/* Body */}
      {showRecorderUI ? (
        <RecorderBody
          analyser={analyser}
          isRecording={isRecording}
          elapsedMs={elapsedMs}
          ringColorClass={ringColorClass}
          progress={progress}
          onToggle={handleToggleRecording}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6">
            <CaptureStepper currentStage={stage} failedAt={failedAt} transcript={transcript} />
            {failedAt && (
              <CaptureFailure
                errorMessage={errorMessage ?? 'Something went wrong'}
                retriesUsed={retriesUsed}
                onRetry={audioBlob ? () => {
                  setRetriesUsed(r => r + 1)
                  runPipeline(audioBlob)
                } : undefined}
                onEditManually={() => {
                  toast.info('Continue manually in the workspace tabs.')
                  router.push(`/projects/${projectId}`)
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// RecorderBody — the full-screen visual recorder (waveform + timer + ring + mic button)
interface RecorderBodyProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  elapsedMs: number
  ringColorClass: string
  progress: number
  onToggle: () => void
}

function RecorderBody({ analyser, isRecording, elapsedMs, ringColorClass, progress, onToggle }: RecorderBodyProps) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Full-width waveform at top (D-08) */}
      <div className="px-4 pt-4">
        <WaveformVisualizer analyser={analyser} isRecording={isRecording} height={120} />
      </div>

      {/* Timer centered */}
      <div className="flex-1 flex flex-col items-center justify-end pb-[20vh] sm:pb-[15vh] gap-8">
        <CaptureTimer elapsedMs={elapsedMs} />

        {/* Mic button wrapped in progress ring (D-08) */}
        <CircularProgressRing
          progress={progress}
          size={220}
          strokeWidth={8}
          colorClass={ringColorClass}
        >
          <button
            onClick={onToggle}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
              isRecording
                ? 'bg-red-500 animate-pulse hover:bg-red-600'
                : 'bg-primary hover:bg-primary/90'
            }`}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            data-testid="capture-mic"
          >
            {isRecording ? (
              <MicOff className="h-8 w-8 text-white" />
            ) : (
              <Mic className="h-8 w-8 text-primary-foreground" />
            )}
          </button>
        </CircularProgressRing>
      </div>
    </div>
  )
}
