'use client'

import { Mic } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { RecordingItem } from './recording-item'
import type { Recording } from '@/lib/queries/recording'

interface RecordingListProps {
  recordings: Recording[]
  onDelete: (id: string) => void
  transcribingId?: string | null
}

export function RecordingList({ recordings, onDelete, transcribingId }: RecordingListProps) {
  if (recordings.length === 0) {
    return (
      <EmptyState
        icon={Mic}
        title="No recordings yet"
        description="Record your first audio walkthrough of the job site"
      />
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        Recordings ({recordings.length})
      </h3>
      {recordings.map((recording) => (
        <RecordingItem
          key={recording.id}
          recording={recording}
          onDelete={onDelete}
          isTranscribing={transcribingId === recording.id}
        />
      ))}
    </div>
  )
}
