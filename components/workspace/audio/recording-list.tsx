'use client'

import { Mic } from 'lucide-react'
import { EmptyState } from '@/components/dashboard/empty-state'
import { RecordingItem } from './recording-item'
import type { Recording } from '@/lib/queries/recording'
import { useTranslation } from '@/lib/i18n/use-translation'

interface RecordingListProps {
  recordings: Recording[]
  onDelete: (id: string) => void
  onRetryTranscribe: (recordingId: string) => void | Promise<void>
  transcribingId?: string | null
}

export function RecordingList({
  recordings,
  onDelete,
  onRetryTranscribe,
  transcribingId,
}: RecordingListProps) {
  const { t } = useTranslation()
  if (recordings.length === 0) {
    return (
      <EmptyState
        icon={Mic}
        title={t('No recordings yet')}
        description={t('Record your first audio walkthrough of the job site')}
      />
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t('Recordings')} ({recordings.length})
      </h3>
      {recordings.map((recording) => (
        <RecordingItem
          key={recording.id}
          recording={recording}
          onDelete={onDelete}
          onRetryTranscribe={onRetryTranscribe}
          isTranscribing={transcribingId === recording.id}
        />
      ))}
    </div>
  )
}
