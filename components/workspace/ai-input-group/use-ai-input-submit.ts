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

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { uploadViaTicket } from '@/lib/storage/browser-upload'
import { createRecording, createTextRecording, transcribeRecording } from '@/lib/actions/recording'
import { pollJob } from '@/hooks/use-job-status'
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
  // Phase 189 Plan 03 (UPLOAD-01): companyId is no longer read here — the
  // server derives the storage key from the authenticated caller's active
  // company. Kept in this interface (callers still pass it; removing the
  // prop is not this phase's business), but no longer destructured below.
  companyId: string
  currentEstimate: EstimateWithSections | null
  estimateLanguage?: EstimateLanguage
}

export function useAIInputSubmit({
  projectId,
  estimateLanguage = 'en',
}: UseAIInputSubmitArgs) {
  const router = useRouter()
  const { t } = useTranslation()
  const [stage, setStage] = useState<SubmitStage>('idle')
  // Phase 92 (EVENT-03 / D-08): mint a stable attemptId once per hook instance,
  // reused on Retry so the lineage survives a re-dispatch. The header AI input is
  // text/voice-driven; manual_text is the safe default per D-07 (the voice path
  // keeps capture-recorder's own attemptId on its server-action transcribe).
  const attemptIdRef = useRef<string | null>(null)
  const ensureAttempt = useCallback(() => {
    if (!attemptIdRef.current) attemptIdRef.current = crypto.randomUUID()
    return attemptIdRef.current
  }, [])

  const isSubmitting = stage !== 'idle' && stage !== 'done'

  const runGenerate = useCallback(async (): Promise<boolean> => {
    setStage('generating')
    const res = await fetch('/api/generate-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        language: estimateLanguage,
        attemptId: ensureAttempt(),
        inputType: 'manual_text',
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || t('Estimate generation failed'))
      setStage('idle')
      return false
    }
    return true
  }, [projectId, estimateLanguage, ensureAttempt, t])

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
        // Phase 189 Plan 03 (UPLOAD-01): server-issued ticket replaces the
        // client-constructed storagePath.
        let storagePath: string
        try {
          const uploaded = await uploadViaTicket({
            bucket: 'audio',
            projectId,
            blob,
            contentType: mimeType || 'audio/webm',
          })
          storagePath = uploaded.path
        } catch (err) {
          // Real error was previously discarded here — log it so a field
          // failure is diagnosable instead of anonymous. Thrown message is
          // unchanged (the surrounding pipeline renders it).
          console.error('[use-ai-input-submit] audio upload failed:', err)
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
    [projectId, runGenerate, landOnEstimateTab, t],
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
