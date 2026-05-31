'use client'

/**
 * Quick task 260522-kf2 (QUICK-KF2-UI-03) — Voice instruction dialog.
 *
 * Replaces the old AudioTab's per-recording mic UI with a single
 * "press → speak → generate" flow. Mirrors audio-recorder.tsx for the
 * recording lifecycle (MediaRecorder + WaveformVisualizer + Web Speech
 * live preview), then delegates upload + transcribe + generate to
 * useAIInputSubmit.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'
import { getSupportedAudioMimeType } from '@/lib/utils/media-format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useAIInputSubmit, type SubmitStage } from './use-ai-input-submit'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { EstimateWithSections } from '@/lib/queries/estimate'

interface AIVoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  companyId: string
  currentEstimate: EstimateWithSections | null
  estimateLanguage?: EstimateLanguage
}

type SpeechRecognitionInstance = {
  start: () => void
  stop: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: unknown) => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

export function AIVoiceDialog({
  open,
  onOpenChange,
  projectId,
  companyId,
  currentEstimate,
  estimateLanguage,
}: AIVoiceDialogProps) {
  const { t } = useTranslation()
  const { submitVoice, isSubmitting, stage } = useAIInputSubmit({
    projectId,
    companyId,
    currentEstimate,
    estimateLanguage,
  })

  const [isRecording, setIsRecording] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const mimeTypeRef = useRef<string>('')

  const teardown = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop() } catch { /* ignore */ }
      speechRecognitionRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setAnalyser(null)
  }, [])

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (open) return
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch { /* ignore */ }
    }
    teardown()
    setIsRecording(false)
    setDuration(0)
    setAudioBlob(null)
    setLiveTranscript('')
    setError(null)
  }, [open, teardown])

  const startRecording = useCallback(async () => {
    setError(null)
    setLiveTranscript('')
    setDuration(0)
    setAudioBlob(null)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // AudioContext must be created inside the user-gesture handler (iOS Safari).
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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeTypeRef.current })
        setAudioBlob(blob)
      }
      recorder.start()
      setIsRecording(true)

      timerIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)

      // Web Speech API live preview (Chrome/Edge only).
      const w = window as typeof window & {
        SpeechRecognition?: SpeechRecognitionCtor
        webkitSpeechRecognition?: SpeechRecognitionCtor
      }
      const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition
      if (SpeechRecognition) {
        setSpeechSupported(true)
        try {
          const recognition = new SpeechRecognition()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang = 'en-US'
          recognition.onresult = (event) => {
            let transcript = ''
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript
            }
            setLiveTranscript(transcript)
          }
          recognition.onerror = () => { /* silently ignore */ }
          recognition.start()
          speechRecognitionRef.current = recognition
        } catch {
          // Speech recognition failed to start; ignore.
        }
      } else {
        setSpeechSupported(false)
      }
    } catch (err) {
      const e = err as { name?: string }
      if (e?.name === 'NotAllowedError') {
        setError(t('Microphone permission denied. Please allow microphone access and try again.'))
      } else if (e?.name === 'NotFoundError') {
        setError(t('No microphone found. Please connect a microphone and try again.'))
      } else {
        setError(t('Failed to start recording. Please try again.'))
      }
    }
  }, [t])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    teardown()
    setIsRecording(false)
  }, [teardown])

  const handleToggleRecording = useCallback(() => {
    if (isRecording) stopRecording()
    else startRecording()
  }, [isRecording, startRecording, stopRecording])

  const handleDelete = useCallback(() => {
    setAudioBlob(null)
    setDuration(0)
    setLiveTranscript('')
    setError(null)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!audioBlob) return
    const ok = await submitVoice(audioBlob, duration, mimeTypeRef.current || 'audio/webm')
    if (ok) {
      onOpenChange(false)
    }
  }, [audioBlob, duration, submitVoice, onOpenChange])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return // prevent close mid-submit
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('Record voice instruction')}
          </DialogTitle>
          <DialogDescription>
            {t('Describe the job site. The AI will generate or refine your estimate from your transcript.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <VoiceRecorder
            size="md"
            analyser={analyser}
            isRecording={isRecording}
            elapsedMs={duration * 1000}
            onToggle={handleToggleRecording}
            disabled={isSubmitting || (!!audioBlob && !isRecording)}
            helperText={isRecording ? t('Tap to stop') : t('Tap to start recording')}
          />

          {/* Live transcript preview */}
          {isRecording && speechSupported && liveTranscript && (
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-sm text-muted-foreground italic">{liveTranscript}</p>
            </div>
          )}
          {isRecording && speechSupported === false && (
            <p className="text-xs text-muted-foreground text-center">
              {t('Live preview not available on this browser')}
            </p>
          )}

          {/* After-stop controls: Delete + Generate */}
          {audioBlob && !isRecording && !isSubmitting && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={handleDelete} className="min-h-[44px]">
                <Trash2 className="h-4 w-4 mr-1" /> {t('Delete')}
              </Button>
              <Button onClick={handleGenerate} className="gap-1.5 min-h-[44px]">
                <Sparkles className="h-4 w-4" />
                {t('Generate Estimate')}
              </Button>
            </div>
          )}

          {/* Submission progress */}
          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {stageLabel(stage, t)}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3 text-center">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function stageLabel(stage: SubmitStage, t: (s: string) => string): string {
  switch (stage) {
    case 'uploading':    return t('Uploading...')
    case 'transcribing': return t('Transcribing with AI...')
    case 'generating':   return t('Generating estimate...')
    case 'done':         return t('Done')
    default:             return t('Working...')
  }
}
