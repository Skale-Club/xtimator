/**
 * Phase 67: Inngest function — wraps Whisper transcription with step.run checkpoints.
 * Replaces the inline Whisper fetch currently in lib/actions/recording.ts:transcribeRecording.
 *
 * Implements:
 *   - INNGEST-03 (Whisper moves out of synchronous server action)
 *   - INNGEST-06 (idempotent via event.data.recordingId — recording UUID is naturally unique)
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import {
  EVENT_TRANSCRIBE_AUDIO,
  type TranscribeAudioPayload,
} from '@/lib/inngest/events'

async function loadCompanyForRecording(recordingId: string): Promise<{
  companyId: string | null
  userId: string | null
}> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('recordings')
      .select('company_id, companies(user_id)')
      .eq('id', recordingId)
      .single()
    const row = data as { company_id?: string | null; companies?: { user_id?: string | null } | null } | null
    return {
      companyId: row?.company_id ?? null,
      userId: row?.companies?.user_id ?? null,
    }
  } catch {
    return { companyId: null, userId: null }
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
      const { companyId, userId } = await loadCompanyForRecording(payload.recordingId)
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
    const { recordingId, storagePath } = event.data as TranscribeAudioPayload

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

      const openaiKey = await getIntegrationKey('openai')
      if (!openaiKey) throw new Error('OpenAI key not configured')

      const ext = storagePath.split('.').pop() ?? 'webm'
      const form = new FormData()
      form.append('file', fileData, `recording.${ext}`)
      form.append('model', 'whisper-1')
      form.append('response_format', 'text')

      const res = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: form,
        }
      )
      if (!res.ok) {
        const err = await res.text().catch(() => 'unknown')
        throw new Error(`Whisper transcription failed: ${err}`)
      }
      return (await res.text()).trim()
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
