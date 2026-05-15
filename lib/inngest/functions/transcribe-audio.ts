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
import {
  EVENT_TRANSCRIBE_AUDIO,
  type TranscribeAudioPayload,
} from '@/lib/inngest/events'

export const transcribeAudioJob = inngest.createFunction(
  {
    id: 'transcribe-audio',
    idempotency: 'event.data.recordingId',
    retries: 2,
    triggers: [{ event: EVENT_TRANSCRIBE_AUDIO }],
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

    return { transcript }
  }
)
