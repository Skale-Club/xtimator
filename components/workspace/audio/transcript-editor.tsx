'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { updateTranscript } from '@/lib/actions/recording'

interface TranscriptEditorProps {
  recordingId: string
  initialTranscript: string | null
  isTranscribing?: boolean
}

export function TranscriptEditor({ recordingId, initialTranscript, isTranscribing }: TranscriptEditorProps) {
  const [transcript, setTranscript] = useState(initialTranscript ?? '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Update local state when initialTranscript changes (e.g., after transcription completes)
  useEffect(() => {
    if (initialTranscript !== null) {
      setTranscript(initialTranscript)
    }
  }, [initialTranscript])

  const handleChange = (value: string) => {
    setTranscript(value)
    setSaveStatus('idle')

    // Debounced save (1000ms)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      const result = await updateTranscript(recordingId, value)
      if ('error' in result) {
        setSaveStatus('idle')
      } else {
        setSaveStatus('saved')
        // Clear "Saved" indicator after 2 seconds
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      }
    }, 1000)
  }

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  if (isTranscribing) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Transcribing...
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Transcript</label>
        {saveStatus === 'saving' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-[hsl(var(--success))] flex items-center gap-1">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
      </div>
      <Textarea
        value={transcript}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Transcript will appear here after processing..."
        className="min-h-[80px] text-sm"
        rows={3}
      />
    </div>
  )
}
