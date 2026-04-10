'use client'

import { useState, useCallback } from 'react'
import { AudioRecorder } from './audio-recorder'
import { RecordingList } from './recording-list'
import type { Recording } from '@/lib/queries/recording'

interface AudioTabProps {
  projectId: string
  companyId: string
  initialRecordings: Recording[]
}

export function AudioTab({ projectId, companyId, initialRecordings }: AudioTabProps) {
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
        transcribingId={transcribingId}
      />
    </div>
  )
}
