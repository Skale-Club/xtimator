'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Play, Pause, Trash2, Upload, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { WaveformVisualizer } from './waveform-visualizer'
import { getSupportedAudioMimeType, getFileExtension, formatDuration } from '@/lib/utils/media-format'
import { createClient } from '@/lib/supabase/client'
import { createRecording, transcribeRecording } from '@/lib/actions/recording'
import type { Recording } from '@/lib/queries/recording'

interface AudioRecorderProps {
  projectId: string
  companyId: string
  onRecordingCreated: (recording: Recording) => void
  onTranscribing?: (recordingId: string | null) => void
}

export function AudioRecorder({ projectId, companyId, onRecordingCreated, onTranscribing }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechRecognitionRef = useRef<any>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const mimeTypeRef = useRef<string>('')

  const startRecording = useCallback(async () => {
    setError(null)
    setLiveTranscript('')
    setDuration(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Create AudioContext inside click handler (per Pitfall 2)
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

      // Detect MIME type
      const mimeType = getSupportedAudioMimeType()
      mimeTypeRef.current = mimeType
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setAudioBlob(blob)
      }

      recorder.start()
      setIsRecording(true)

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)

      // Start Web Speech API if supported (per D-03)
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        setSpeechSupported(true)
        try {
          const recognition = new SpeechRecognition()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang = 'en-US'
          recognition.onresult = (event: any) => {
            let transcript = ''
            for (let i = 0; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript
            }
            setLiveTranscript(transcript)
          }
          recognition.onerror = () => {
            // Silently ignore speech recognition errors
          }
          recognition.start()
          speechRecognitionRef.current = recognition
        } catch {
          // Speech recognition failed to start, ignore
        }
      } else {
        setSpeechSupported(false)
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please allow microphone access and try again.')
      } else if (err?.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.')
      } else {
        setError('Failed to start recording. Please try again.')
      }
    }
  }, [])

  const stopRecording = useCallback(() => {
    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Stop timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop()
      } catch {
        // Ignore
      }
      speechRecognitionRef.current = null
    }

    // Stop stream tracks (per Pitfall 5)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    // Close AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setAnalyser(null)
    setIsRecording(false)
  }, [])

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  const handlePlay = useCallback(() => {
    if (!audioBlob) return

    if (isPlaying && audioElementRef.current) {
      audioElementRef.current.pause()
      setIsPlaying(false)
      return
    }

    // Clean up previous URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
    }

    const url = URL.createObjectURL(audioBlob)
    blobUrlRef.current = url
    const audio = new Audio(url)
    audioElementRef.current = audio

    audio.onended = () => {
      setIsPlaying(false)
    }

    audio.play()
    setIsPlaying(true)
  }, [audioBlob, isPlaying])

  const handleDelete = useCallback(() => {
    // Clean up
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current = null
    }
    setAudioBlob(null)
    setDuration(0)
    setLiveTranscript('')
    setIsPlaying(false)
    setError(null)
  }, [])

  const handleSaveAndTranscribe = useCallback(async () => {
    if (!audioBlob) return

    setIsUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const recordingId = crypto.randomUUID()
      const ext = getFileExtension(mimeTypeRef.current)
      const storagePath = `${companyId}/${projectId}/${recordingId}.${ext}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(storagePath, audioBlob, {
          contentType: mimeTypeRef.current || 'audio/webm',
          upsert: false,
        })

      if (uploadError) {
        throw new Error('Failed to upload audio file')
      }

      // Create recording in DB
      const result = await createRecording(projectId, storagePath, duration)
      if ('error' in result) {
        throw new Error(result.error)
      }

      setIsUploading(false)
      setIsTranscribing(true)
      onTranscribing?.(result.data.id)

      // Clean up blob
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setAudioBlob(null)

      // Notify parent about new recording (with null transcript for now)
      onRecordingCreated(result.data as Recording)

      // Transcribe in background
      const transcribeResult = await transcribeRecording(result.data.id)
      setIsTranscribing(false)
      onTranscribing?.(null)

      if ('error' in transcribeResult) {
        toast.error('Transcription failed. You can retry from the recording.')
      } else {
        toast.success('Recording transcribed successfully!')
      }

      // Reset recorder state for next recording
      setDuration(0)
      setLiveTranscript('')
    } catch (err: any) {
      setIsUploading(false)
      setIsTranscribing(false)
      onTranscribing?.(null)
      setError(err.message || 'Failed to save recording')
      toast.error('Failed to save recording')
    }
  }, [audioBlob, companyId, projectId, duration, onRecordingCreated, onTranscribing])

  const isBusy = isUploading || isTranscribing

  return (
    <div className="space-y-4">
      {/* Timer */}
      <div className="text-center">
        <p className="text-3xl font-mono text-foreground">
          {formatDuration(duration)}
        </p>
      </div>

      {/* Waveform */}
      <WaveformVisualizer analyser={analyser} isRecording={isRecording} />

      {/* Mic button */}
      <div className="flex justify-center">
        {/* Intentional: red signals "recording" regardless of theme (UI convention). */}
        <button
          onClick={handleToggleRecording}
          disabled={isBusy || !!audioBlob}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${
            isRecording
              ? 'bg-red-500 animate-pulse hover:bg-red-600'
              : 'bg-primary hover:bg-primary/90'
          }`}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          {isRecording ? (
            <MicOff className="h-8 w-8 text-white" />
          ) : (
            <Mic className="h-8 w-8 text-primary-foreground" />
          )}
        </button>
      </div>

      {/* Live transcript preview */}
      {isRecording && speechSupported && liveTranscript && (
        <div className="bg-muted/50 rounded-md p-3">
          <p className="text-sm text-muted-foreground italic">{liveTranscript}</p>
        </div>
      )}

      {isRecording && speechSupported === false && (
        <p className="text-xs text-muted-foreground text-center">
          Live preview not available on this browser
        </p>
      )}

      {/* After-stop controls */}
      {audioBlob && !isBusy && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={handlePlay}>
            {isPlaying ? (
              <><Pause className="h-4 w-4 mr-1" /> Pause</>
            ) : (
              <><Play className="h-4 w-4 mr-1" /> Play</>
            )}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <Button size="sm" onClick={handleSaveAndTranscribe}>
            <Upload className="h-4 w-4 mr-1" /> Save &amp; Transcribe
          </Button>
        </div>
      )}

      {/* Upload/transcribe progress */}
      {isUploading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading...
        </div>
      )}

      {isTranscribing && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Transcribing with AI...
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm rounded-md p-3 text-center">
          {error}
        </div>
      )}

      {/* Speech API info banner */}
      {!isRecording && speechSupported === false && (
        <div className="flex items-start gap-2 bg-[hsl(var(--info-muted))] text-[hsl(var(--info))] text-xs rounded-md p-3">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Live transcript preview is only available on Chrome and Edge browsers.
            Your recording will still be transcribed by AI after saving.
          </span>
        </div>
      )}
    </div>
  )
}
