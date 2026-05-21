'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, Trash2, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { toast } from 'sonner'
import { TranscriptEditor } from './transcript-editor'
import { formatDuration } from '@/lib/utils/media-format'
import { deleteRecording } from '@/lib/actions/recording'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import type { Recording } from '@/lib/queries/recording'
import { useTranslation } from '@/lib/i18n/use-translation'

interface RecordingItemProps {
  recording: Recording
  onDelete: (id: string) => void
  onRetryTranscribe: (recordingId: string) => void | Promise<void>
  isTranscribing?: boolean
}

export function RecordingItem({
  recording,
  onDelete,
  onRetryTranscribe,
  isTranscribing,
}: RecordingItemProps) {
  const { t } = useTranslation()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Get signed URL on mount
  useEffect(() => {
    let cancelled = false

    async function fetchSignedUrl() {
      if (!recording.storage_path) return   // text-only recording — no audio file
      const supabase = createClient()
      try {
        const signedUrl = await createStorage(supabase).getSignedUrl(
          'audio',
          recording.storage_path,
          3600,
        )
        if (!cancelled) setAudioUrl(signedUrl)
      } catch {
        // signed URL fetch failed — leave audioUrl null (UI shows disabled play)
      }
    }

    fetchSignedUrl()

    return () => {
      cancelled = true
    }
  }, [recording.storage_path])

  const handlePlay = useCallback(() => {
    if (!audioUrl) return

    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setIsPlaying(false)
    }

    audioRef.current.play()
    setIsPlaying(true)
  }, [audioUrl, isPlaying])

  const handleDelete = useCallback(async () => {
    if (!window.confirm(t('Delete this recording? This cannot be undone.'))) return

    setIsDeleting(true)
    const result = await deleteRecording(recording.id)

    if ('error' in result) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }

    // Clean up audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    onDelete(recording.id)
  }, [recording.id, onDelete])

  const handleRetry = useCallback(() => {
    void onRetryTranscribe(recording.id)
  }, [onRetryTranscribe, recording.id])

  // Format relative time
  const createdDate = new Date(recording.created_at)
  const relativeTime = getRelativeTime(createdDate)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePlay}
              disabled={!audioUrl}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <div>
              <p className="text-sm font-medium">
                {formatDuration(recording.duration_seconds ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">{relativeTime}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {recording.storage_path && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={handleRetry}
                disabled={isTranscribing || isDeleting}
                aria-label={t('Retry transcription')}
                title={t('Retry transcription')}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <TranscriptEditor
          recordingId={recording.id}
          initialTranscript={recording.transcript}
          isTranscribing={isTranscribing}
        />
      </CardContent>
    </Card>
  )
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now' // TODO: i18n for relative time labels
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
