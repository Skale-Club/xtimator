'use client'

/**
 * Quick task 260522-kf2 (QUICK-KF2-UI-05) — Adaptive AI input submit hook.
 *
 * Single submit surface shared by the voice + text dialogs in the header
 * AI Input Group. Mirrors the upload/transcribe/generate chain that
 * `audio-recorder.tsx` + `estimate-tab.tsx::handleGenerate` previously
 * owned, so the new in-header input creates the same recording rows that
 * power AI estimate generation.
 *
 * Adaptive behaviour:
 *   - When `currentEstimate === null` → /api/generate-estimate creates
 *     the first version.
 *   - When `currentEstimate !== null` → /api/generate-estimate creates a
 *     NEW version (`lib/services/generate-estimate.ts` flips
 *     `is_current=false` on older rows and inserts the next version).
 *
 * Either way, after success we land on `?tab=estimate` and refresh so
 * the editor renders the latest version.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { createRecording, createTextRecording, transcribeRecording } from '@/lib/actions/recording'
import { pollJob } from '@/hooks/use-job-status'
import { getFileExtension } from '@/lib/utils/media-format'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { EstimateWithSections } from '@/lib/queries/estimate'

export type SubmitStage =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'generating'
  | 'done'

interface UseAIInputSubmitArgs {
  projectId: string
  // companyId is read from the authenticated server actions, but we keep it
  // here so the upload path can construct {companyId}/{projectId}/{uuid}.{ext}
  // mirroring audio-recorder.tsx exactly.
  companyId: string
  currentEstimate: EstimateWithSections | null
  estimateLanguage?: EstimateLanguage
}

export function useAIInputSubmit({
  projectId,
  companyId,
  estimateLanguage = 'en',
}: UseAIInputSubmitArgs) {
  const router = useRouter()
  const { t } = useTranslation()
  const [stage, setStage] = useState<SubmitStage>('idle')

  const isSubmitting = stage !== 'idle' && stage !== 'done'

  const runGenerate = useCallback(async (): Promise<boolean> => {
    setStage('generating')
    const res = await fetch('/api/generate-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, language: estimateLanguage }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || t('Estimate generation failed'))
      setStage('idle')
      return false
    }
    return true
  }, [projectId, estimateLanguage, t])

  const landOnEstimateTab = useCallback(() => {
    setStage('done')
    router.push(`/projects/${projectId}?tab=estimate`)
    router.refresh()
    // Reset stage shortly after navigation so a subsequent submit is allowed.
    setTimeout(() => setStage('idle'), 250)
  }, [router, projectId])

  const submitVoice = useCallback(
    async (
      blob: Blob,
      durationSeconds: number,
      mimeType: string,
    ): Promise<boolean> => {
      try {
        setStage('uploading')
        const supabase = createClient()
        const recordingId = crypto.randomUUID()
        const ext = getFileExtension(mimeType)
        const storagePath = `${companyId}/${projectId}/${recordingId}.${ext}`

        try {
          await createStorage(supabase).upload('audio', storagePath, blob, {
            contentType: mimeType || 'audio/webm',
            upsert: false,
          })
        } catch {
          throw new Error(t('Failed to upload audio file'))
        }

        const recordingResult = await createRecording(projectId, storagePath, durationSeconds)
        if ('error' in recordingResult) {
          throw new Error(recordingResult.error)
        }

        setStage('transcribing')
        toast.info(t('Transcription queued...'))

        const transcribeResult = await transcribeRecording(recordingResult.data.id as string)
        if ('error' in transcribeResult) {
          throw new Error(transcribeResult.error)
        }

        try {
          const controller = new AbortController()
          // Phase 91-02: pollJob no longer throws on failure (Plan 01) — it
          // resolves a JobResult discriminant. Branch on state explicitly so a
          // failed/config_unavailable transcription does NOT silently proceed to
          // runGenerate() on an empty transcript (Pitfall 4 / REC-05).
          const result = await pollJob(transcribeResult.data.jobId, controller.signal)
          if (result.state !== 'completed') {
            throw new Error(t('Transcription failed. You can retry from the recording.'))
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            setStage('idle')
            return false
          }
          throw err instanceof Error
            ? err
            : new Error(t('Transcription failed. You can retry from the recording.'))
        }
        toast.success(t('Recording transcribed successfully!'))

        const ok = await runGenerate()
        if (!ok) return false

        landOnEstimateTab()
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('Failed to save recording')
        toast.error(msg)
        setStage('idle')
        return false
      }
    },
    [companyId, projectId, runGenerate, landOnEstimateTab, t],
  )

  const submitText = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim()
      if (!trimmed) {
        toast.error(t('Please type an instruction first.'))
        return false
      }
      try {
        setStage('uploading')
        const result = await createTextRecording(projectId, trimmed)
        if ('error' in result) {
          throw new Error(result.error)
        }

        const ok = await runGenerate()
        if (!ok) return false

        landOnEstimateTab()
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('Failed to save instruction')
        toast.error(msg)
        setStage('idle')
        return false
      }
    },
    [projectId, runGenerate, landOnEstimateTab, t],
  )

  return {
    submitVoice,
    submitText,
    isSubmitting,
    stage,
  }
}
