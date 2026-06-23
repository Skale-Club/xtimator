'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'
import { CaptureProcessingOverlay } from '@/components/capture/capture-processing-overlay'
import { CaptureFailure } from '@/components/capture/capture-failure'
import { createRecording, transcribeRecording } from '@/lib/actions/recording'
import { createBlankEstimate } from '@/lib/actions/estimate'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { getSupportedAudioMimeType, getFileExtension } from '@/lib/utils/media-format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useLanguage } from '@/lib/i18n/language-context'
import { type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { HARD_CAP_MS, WARN_AT_MS, AMBER_AT_MS, RED_AT_MS } from '@/components/capture/capture-recorder'

const TICK_MS = 250

type SpeechRecognitionInstance = {
  start: () => void
  stop: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((event: unknown) => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

interface InlineAudioRecorderProps {
  projectId: string
  companyId: string
  onBack: () => void
  onComplete?: () => void
}

export function InlineAudioRecorder({ projectId, companyId, onBack, onComplete }: InlineAudioRecorderProps) {
  const { t } = useTranslation()
  const { language: appLanguage } = useLanguage()
  const router = useRouter()

  const [isRecording, setIsRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)

  const estimateLanguage: EstimateLanguage =
    appLanguage === 'pt' || appLanguage === 'es' ? appLanguage : 'en'

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeTypeRef = useRef<string>('')
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const elapsedMsRef = useRef<number>(0)
  const warnedRef = useRef<boolean>(false)
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const attemptIdRef = useRef<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const savedBlobRef = useRef<Blob | null>(null)

  const ringColorClass =
    elapsedMs >= RED_AT_MS    ? 'stroke-red-500'   :
    elapsedMs >= AMBER_AT_MS  ? 'stroke-amber-500' :
                                'stroke-primary'
  const progress = Math.min(elapsedMs / HARD_CAP_MS, 1)

  useEffect(() => () => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }
    speechRecognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    if (!isRecording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isRecording])

  const ensureAttempt = useCallback(() => {
    if (!attemptIdRef.current) attemptIdRef.current = crypto.randomUUID()
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID()
  }, [])

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
    speechRecognitionRef.current?.stop()
    setAnalyser(null)
    setIsRecording(false)
  }, [])

  const tick = useCallback(() => {
    const elapsed = performance.now() - startTimeRef.current
    setElapsedMs(elapsed)
    elapsedMsRef.current = elapsed
    if (elapsed >= WARN_AT_MS && !warnedRef.current) {
      warnedRef.current = true
      toast.warning(t('60 seconds remaining'), { description: t('Recording will auto-stop at 10 minutes.') })
    }
    if (elapsed >= HARD_CAP_MS) {
      toast.info(t('Time limit reached'), { description: t('Recording stopped at 10 minutes.') })
      stopRecording()
    }
  }, [stopRecording, t])

  // Upload audio, create recording row, dispatch transcription, then navigate.
  // The Inngest transcription job auto-chains to generate-estimate server-side.
  const runPipeline = useCallback(async (blob: Blob) => {
    setIsSaving(true)
    setSaveError(undefined)
    ensureAttempt()

    const supabase = createClient()
    const storage = createStorage(supabase)

    const recordingId = crypto.randomUUID()
    const ext = getFileExtension(mimeTypeRef.current)
    const storagePath = `${companyId}/${projectId}/${recordingId}.${ext}`

    try {
      await storage.upload('audio', storagePath, blob, {
        contentType: mimeTypeRef.current || 'audio/webm',
        upsert: false,
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('Failed to upload audio file'))
      setIsSaving(false)
      return
    }

    const created = await createRecording(projectId, storagePath, Math.floor(elapsedMsRef.current / 1000))
    if ('error' in created) {
      setSaveError(created.error ?? t('Failed to save recording'))
      setIsSaving(false)
      return
    }

    const dispatched = await transcribeRecording(
      created.data.id as string,
      attemptIdRef.current ?? undefined,
      {
        autoGenerateEstimate: true,
        requestId: requestIdRef.current ?? undefined,
        estimateLanguage,
      }
    )
    if ('error' in dispatched) {
      setSaveError(dispatched.error ?? t('Failed to start transcription'))
      setIsSaving(false)
      return
    }

    // Navigate immediately — pipeline continues server-side via Inngest
    if (onComplete) {
      onComplete()
    } else {
      router.push(`/projects/${projectId}?autoGenerating=true`)
    }
  }, [companyId, projectId, estimateLanguage, ensureAttempt, onComplete, router, t])

  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)
    elapsedMsRef.current = 0
    warnedRef.current = false
    setLiveTranscript('')
    setInterimTranscript('')
    setSaveError(undefined)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new AudioContext()
      if (audioContext.state === 'suspended') await audioContext.resume()
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
        savedBlobRef.current = blob
        runPipeline(blob)
      }

      recorder.start()
      startTimeRef.current = performance.now()
      setIsRecording(true)
      tickIntervalRef.current = setInterval(tick, TICK_MS)

      // Web Speech API for live transcript preview (Chrome/Edge only)
      const w = window as typeof window & {
        SpeechRecognition?: SpeechRecognitionCtor
        webkitSpeechRecognition?: SpeechRecognitionCtor
      }
      const SpeechRecognitionAPI = w.SpeechRecognition ?? w.webkitSpeechRecognition
      if (SpeechRecognitionAPI) {
        const recognition = new SpeechRecognitionAPI()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = estimateLanguage === 'pt' ? 'pt-BR' : estimateLanguage === 'es' ? 'es-ES' : 'en-US'
        recognition.onresult = (event) => {
          let interim = ''
          let final = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const phrase = event.results[i][0].transcript
            if (event.results[i].isFinal) final += phrase + ' '
            else interim += phrase
          }
          if (final) setLiveTranscript(prev => prev + final)
          setInterimTranscript(interim)
        }
        recognition.onerror = () => {}
        recognition.start()
        speechRecognitionRef.current = recognition
      }
    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error?.name === 'NotAllowedError') {
        toast.error(t('Microphone permission denied. Please allow microphone access and try again.'))
      } else if (error?.name === 'NotFoundError') {
        toast.error(t('No microphone found. Please connect a microphone and try again.'))
      } else {
        toast.error(t('Failed to start recording. Please try again.'))
      }
    }
  }, [tick, runPipeline, t, estimateLanguage])

  const handleToggle = useCallback(() => {
    if (isRecording) stopRecording()
    else startRecording()
  }, [isRecording, startRecording, stopRecording])

  const handleEditManually = useCallback(async () => {
    await createBlankEstimate(projectId)
    router.push(`/projects/${projectId}`)
  }, [projectId, router])

  if (isSaving) {
    return (
      <div className="relative min-h-[200px]">
        <CaptureProcessingOverlay stage="saving" />
      </div>
    )
  }

  if (saveError) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSaveError(undefined)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground -ml-1 p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('Back')}
        </button>
        <CaptureFailure
          errorMessage={saveError}
          retriesUsed={0}
          onRetry={savedBlobRef.current ? () => {
            setSaveError(undefined)
            runPipeline(savedBlobRef.current!)
          } : undefined}
          onEditManually={handleEditManually}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={isRecording}
          aria-label={t('Back')}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm text-muted-foreground">
          {isRecording ? t('Tap to stop when done') : t('Tap the mic to start recording')}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <VoiceRecorder
          size="sm"
          analyser={analyser}
          isRecording={isRecording}
          elapsedMs={elapsedMs}
          onToggle={handleToggle}
          showTimer={true}
        />

        <div className="flex flex-col gap-1">
          <div className="rounded-lg border border-input bg-muted/20 p-3 text-sm overflow-y-auto min-h-[120px] max-h-[180px]">
            {!liveTranscript && !interimTranscript ? (
              <p className="text-muted-foreground/60 italic text-xs leading-relaxed">
                {isRecording
                  ? t('Listening...')
                  : t('Transcription will appear here as you speak...')}
              </p>
            ) : (
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {liveTranscript}
                {interimTranscript && (
                  <span className="text-muted-foreground">{interimTranscript}</span>
                )}
              </p>
            )}
          </div>
          {!isRecording && !liveTranscript && (
            <p className="text-[11px] text-muted-foreground/50">
              {t('Live preview available in Chrome and Edge')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
