'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { AudioRecorder } from './audio-recorder'
import { RecordingList } from './recording-list'
import { transcribeRecording } from '@/lib/actions/recording'
import { pollJob } from '@/hooks/use-job-status'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { Recording } from '@/lib/queries/recording'

interface AudioTabProps {
  projectId: string
  companyId: string
  initialRecordings: Recording[]
}

export function AudioTab({ projectId, companyId, initialRecordings }: AudioTabProps) {
  const { t } = useTranslation()
  const [recordings, setRecordings] = useState<Recording[]>(initialRecordings)
  const [transcribingId, setTranscribingId] = useState<string | null>(null)

  const handleRecordingCreated = useCallback((recording: Recording) => {
    setRecordings((prev) => [recording, ...prev])
  }, [])

  const handleDelete = useCallback((id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const handleTranscribing = useCallback((recordingId: string | null) => {
    setTranscribingId(recordingId)
  }, [])

  const handleTranscriptUpdate = useCallback((recordingId: string, transcript: string) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === recordingId ? { ...r, transcript } : r))
    )
  }, [])

  const handleRetryTranscribe = useCallback(
    async (recordingId: string): Promise<void> => {
      // Flip the row to "Transcribing..." immediately so the user gets feedback
      // before the server action round-trip resolves.
      setTranscribingId(recordingId)

      const transcribeResult = await transcribeRecording(recordingId)

      if ('error' in transcribeResult) {
        setTranscribingId(null)
        toast.error(t('Transcription failed. You can retry from the recording.'))
        return
      }

      toast.info(t('Transcription queued...'))
      try {
        const controller = new AbortController()
        const output = (await pollJob(
          transcribeResult.data.jobId,
          controller.signal,
        )) as { transcript: string } | null
        if (output && typeof output.transcript === 'string') {
          handleTranscriptUpdate(recordingId, output.transcript)
        }
        toast.success(t('Recording transcribed successfully!'))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error(t('Transcription failed. You can retry from the recording.'))
        }
      } finally {
        setTranscribingId(null)
      }
    },
    [handleTranscriptUpdate, t],
  )

  return (
    <div className="space-y-6 py-4">
      <AudioRecorder
        projectId={projectId}
        companyId={companyId}
        onRecordingCreated={handleRecordingCreated}
        onTranscribing={handleTranscribing}
      />

      <RecordingList
        recordings={recordings}
        onDelete={handleDelete}
        onRetryTranscribe={handleRetryTranscribe}
        transcribingId={transcribingId}
      />
    </div>
  )
}
