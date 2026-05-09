'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getSupportedAudioMimeType } from '@/lib/utils/media-format'
import { WaveformVisualizer } from '@/components/workspace/audio/waveform-visualizer'

const MAX_DURATION_MS = 30_000
const TICK_MS = 100

interface VoiceRefineRecorderProps {
  estimateId: string
  onRecorded: (instruction: string) => Promise<void>
  disabled?: boolean
}

export function VoiceRefineRecorder({
  estimateId,
  onRecorded,
  disabled,
}: VoiceRefineRecorderProps) {
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>(null!)
  const mimeTypeRef = useRef<string>('')
  const startTimeRef = useRef<number>(0)
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    chunksRef.current = []
    setElapsedMs(0)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

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
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        if (chunksRef.current.length === 0) return

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeTypeRef.current })

        // Stop the timer
        if (tickIntervalRef.current) {
          clearInterval(tickIntervalRef.current)
          tickIntervalRef.current = null
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {})
        }
        setAnalyser(null)
        setRecordingState('transcribing')

        try {
          // Send audio to voice refinement API
          const formData = new FormData()
          formData.append('audio', blob, 'voice-refine.webm')

          const res = await fetch(`/api/estimates/${estimateId}/refine/voice`, {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()

          if (!res.ok) {
            throw new Error(data.error ?? 'Voice refinement failed')
          }

          await onRecorded(data.transcript ?? '')
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Voice refinement failed')
          setRecordingState('idle')
        }
      }

      recorder.start()
      startTimeRef.current = performance.now()
      setRecordingState('recording')

      // Start timer tick
      tickIntervalRef.current = setInterval(() => {
        const elapsed = performance.now() - startTimeRef.current
        setElapsedMs(elapsed)
        if (elapsed >= MAX_DURATION_MS) {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop()
          }
        }
      }, TICK_MS)
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string }
      if (error?.name === 'NotAllowedError') {
        toast.error('Microphone permission denied. Please allow microphone access and try again.')
      } else if (error?.name === 'NotFoundError') {
        toast.error('No microphone found. Please connect a microphone and try again.')
      } else {
        toast.error(error?.message ?? 'Failed to start recording. Please try again.')
      }
    }
  }, [estimateId, onRecorded])

  const handleToggle = useCallback(() => {
    if (disabled) return
    if (recordingState === 'idle') {
      startRecording()
    } else if (recordingState === 'recording') {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
    }
  }, [disabled, recordingState, startRecording])

  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const secondsDisplay = elapsedSeconds.toString().padStart(2, '0')
  const maxSeconds = Math.floor(MAX_DURATION_MS / 1000)

  return (
    <div className="flex flex-col gap-2">
      {/* Waveform */}
      <div className="h-8">
        <WaveformVisualizer analyser={analyser} isRecording={recordingState === 'recording'} height={32} />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled || recordingState === 'transcribing'}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed ${
            recordingState === 'recording'
              ? 'bg-red-500 animate-pulse hover:bg-red-600 focus:ring-red-500'
              : 'bg-primary hover:bg-primary/90 focus:ring-primary'
          }`}
          aria-label={recordingState === 'recording' ? 'Stop recording' : 'Start recording'}
          title={recordingState === 'recording' ? 'Tap to stop' : 'Tap to speak'}
        >
          {recordingState === 'transcribing' ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
          ) : recordingState === 'recording' ? (
            <MicOff className="h-4 w-4 text-white" />
          ) : (
            <Mic className="h-4 w-4 text-primary-foreground" />
          )}
        </button>

        <div className="flex-1">
          {recordingState === 'idle' && (
            <span className="text-sm text-muted-foreground">Tap to speak</span>
          )}
          {recordingState === 'recording' && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-red-500 animate-pulse">Recording</span>
              <span className="text-xs text-muted-foreground font-mono">
                {secondsDisplay}s / {maxSeconds}s
              </span>
            </div>
          )}
          {recordingState === 'transcribing' && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Transcribing...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
