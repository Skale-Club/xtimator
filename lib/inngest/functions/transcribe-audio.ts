/**
 * Phase 67: Inngest function — wraps Whisper transcription with step.run checkpoints.
 * Replaces the inline Whisper fetch currently in lib/actions/recording.ts:transcribeRecording.
 *
 * Implements:
 *   - INNGEST-03 (Whisper moves out of synchronous server action)
 *   - INNGEST-06 (idempotent via event.data.recordingId — recording UUID is naturally unique)
 */
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { transcribeAudioOR } from '@/lib/ai/openrouter-client'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import { computeWhisperCostUsd } from '@/lib/billing/whisper-cost'
import {
  EVENT_TRANSCRIBE_AUDIO,
  EVENT_ESTIMATE_GENERATE,
  type TranscribeAudioPayload,
} from '@/lib/inngest/events'

async function loadCompanyForRecording(recordingId: string): Promise<{
  companyId: string | null
  userId: string | null
  projectId: string | null
  durationSeconds: number | null
}> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('recordings')
      .select('company_id, project_id, duration_seconds, companies(user_id)')
      .eq('id', recordingId)
      .single()
    const row = data as {
      company_id?: string | null
      project_id?: string | null
      duration_seconds?: number | null
      companies?: { user_id?: string | null } | null
    } | null
    return {
      companyId: row?.company_id ?? null,
      userId: row?.companies?.user_id ?? null,
      projectId: row?.project_id ?? null,
      durationSeconds: row?.duration_seconds ?? null,
    }
  } catch {
    return {
      companyId: null,
      userId: null,
      projectId: null,
      durationSeconds: null,
    }
  }
}

export const transcribeAudioJob = inngest.createFunction(
  {
    id: 'transcribe-audio',
    idempotency: 'event.data.recordingId',
    retries: 2,
    triggers: [{ event: EVENT_TRANSCRIBE_AUDIO }],
    // Phase 77 NOTIF-04: ai_job.failed on retry exhaustion.
    onFailure: async ({ event, error }) => {
      const payload = (event as { data?: { event?: { data?: TranscribeAudioPayload } } })
        .data?.event?.data
      if (!payload) return
      const { companyId, userId, projectId } = await loadCompanyForRecording(payload.recordingId)

      // Phase 92 (EVENT-02/D-05): terminal failed transcribe event via onFailure.
      void recordPipelineEvent({
        attemptId: payload.attemptId ?? randomUUID(),
        inputType: payload.inputType ?? 'recording',
        step: 'transcribe',
        status: 'failed',
        companyId,
        projectId,
        userId,
        provider: 'openrouter',
        errorMessage: String(error),
      })

      if (!companyId) return
      const copy = buildNotificationCopy('ai_job.failed', {
        jobType: 'Audio transcription',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      void notify({
        companyId,
        userId,
        eventType: 'ai_job.failed',
        title: copy.title,
        body: copy.body,
        resourceType: 'recording',
        resourceId: payload.recordingId,
        metadata: { dedupe_key: `ai-fail-transcribe-${payload.recordingId}` },
      })
    },
  },
  async ({ event, step }) => {
    const data = event.data as TranscribeAudioPayload
    const { recordingId, storagePath } = data
    // Phase 92 (EVENT-02/D-08): attempt lineage with server fallback.
    const attemptId = data.attemptId ?? randomUUID()
    const inputType = data.inputType ?? 'recording'
    const t0 = Date.now()

    // Phase 92 (EVENT-02/D-03): started event at handler entry (best-effort).
    const ident = await loadCompanyForRecording(recordingId)
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'transcribe',
      status: 'started',
      companyId: ident.companyId,
      projectId: ident.projectId,
      userId: ident.userId,
    })

    // Step 1: Download audio + Whisper API call — checkpointed.
    // A failure inside save-transcript (step 2) will not re-run Whisper.
    const transcript = await step.run('whisper-transcribe', async () => {
      const supabase = requireServiceClient()
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('audio')
        .download(storagePath)
      if (dlErr || !fileData) {
        throw new Error(
          `Failed to download audio: ${dlErr?.message ?? 'no data'}`
        )
      }

      const ext = storagePath.split('.').pop() ?? 'webm'
      return await transcribeAudioOR(fileData, ext)
    })

    // Step 2: Save transcript — separate step so a DB error doesn't re-call Whisper.
    await step.run('save-transcript', async () => {
      const supabase = requireServiceClient()
      const { error } = await supabase
        .from('recordings')
        .update({ transcript })
        .eq('id', recordingId)
      if (error) throw new Error(`Failed to save transcript: ${error.message}`)
    })

    // When the client requested fire-and-forget mode, chain directly into
    // estimate generation so the user can navigate away immediately after
    // uploading the recording. ident.projectId is already loaded above.
    if (data.autoGenerateEstimate && ident.projectId) {
      await step.run('dispatch-generate-estimate', async () => {
        const reqId = data.requestId ?? randomUUID()
        await inngest.send({
          name: EVENT_ESTIMATE_GENERATE,
          id: `estimate-${ident.projectId}-${reqId}`,
          data: {
            companyId: data.companyId,
            projectId: ident.projectId!,
            requestId: reqId,
            language: data.estimateLanguage,
            attemptId: data.attemptId,
            inputType: 'recording' as const,
            channel: 'web' as const,
          },
        })
      })
    }

    // Phase 92 (EVENT-02/D-03): terminal succeeded event with duration_ms.
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'transcribe',
      status: 'succeeded',
      companyId: ident.companyId,
      projectId: ident.projectId,
      userId: ident.userId,
      provider: 'openrouter',
      durationMs: Date.now() - t0,
    })

    // Phase 110 (COST-02): record the COMPUTED Whisper/STT cost. The provider
    // returns no cost, so cost = (recordings.duration_seconds / 60) × rate.
    // Correlated by attemptId alone (no usage_event coupling — Phase 112 owns
    // metering). Best-effort: void so a cost-write never breaks transcription.
    //
    // Provider attribution: transcribeAudioOR runs OpenAI whisper-1 primary and
    // falls back to Gemini ONCE on failure, but the fallback is hidden INSIDE
    // that fn — the job cannot see which ran. We record the common case as
    // provider:'openai' with the computed cost. The Gemini fallback returns no
    // cost; we never guess a Gemini rate and never record 0 (null = unknown).
    const minutes = (ident.durationSeconds ?? 0) / 60
    void recordAICost({
      attemptId,
      operationType: 'audio_minutes',
      provider: 'openai',
      model: 'whisper-1',
      realCostUsd: computeWhisperCostUsd(ident.durationSeconds),
      companyId: ident.companyId,
      projectId: ident.projectId,
      units: minutes > 0 ? minutes : null,
    })

    // Phase 77 NOTIF-04: opt-in success notification.
    try {
      const { companyId, userId } = await loadCompanyForRecording(recordingId)
      if (companyId) {
        const copy = buildNotificationCopy('ai_job.completed', {
          jobType: 'Audio transcription',
        })
        void notify({
          companyId,
          userId,
          eventType: 'ai_job.completed',
          title: copy.title,
          body: copy.body,
          resourceType: 'recording',
          resourceId: recordingId,
          metadata: { dedupe_key: `ai-ok-transcribe-${recordingId}` },
        })
      }
    } catch {
      /* best-effort */
    }

    return { transcript }
  }
)
