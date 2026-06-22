'use server'

import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { revalidatePath } from 'next/cache'
import { getIntegrationKey } from '@/lib/platform-config'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { assertWritable } from '@/lib/demo/guard'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { error: 'No company found' as const }

  const denied = await assertWritable()
  if (denied) return denied

  return { supabase, company }
}

// Text-only recording — no audio file, transcript is the typed description
export async function createTextRecording(
  projectId: string,
  description: string,
  attemptId?: string
) {
  // Phase 92 (EVENT-02/D-08): server fallback so an event is never dropped.
  const eventAttemptId = attemptId ?? randomUUID()
  const t0 = Date.now()
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: recording, error: insertError } = await supabase
    .from('recordings')
    .insert({
      project_id: projectId,
      company_id: company.id,
      storage_path: null, // text-only: no audio file
      transcript: description,
      duration_seconds: 0,
    })
    .select()
    .single()

  if (insertError || !recording) {
    // Phase 92 (EVENT-02): terminal failed save_recording event (best-effort).
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'manual_text',
      step: 'save_recording',
      status: 'failed',
      companyId: company.id,
      projectId,
      errorMessage: 'Failed to save description',
      durationMs: Date.now() - t0,
      provider: null,
    })
    return { error: 'Failed to save description. Please try again.' }
  }

  // Log activity (skip status update — text-only has no audio to track)
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: company.id,
    event_type: 'description_added',
    metadata: { source: 'text_input' },
  })

  // Phase 92 (EVENT-02): single terminal succeeded save_recording event (D-03
  // collapse — synchronous step, no started row). Additive; never blocks return.
  void recordPipelineEvent({
    attemptId: eventAttemptId,
    inputType: 'manual_text',
    step: 'save_recording',
    status: 'succeeded',
    companyId: company.id,
    projectId,
    estimateId: null,
    durationMs: Date.now() - t0,
    provider: null,
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: recording }
}

export async function createRecording(
  projectId: string,
  storagePath: string,
  durationSeconds: number,
  attemptId?: string
) {
  // Phase 92 (EVENT-02/D-08): server fallback so an event is never dropped.
  const eventAttemptId = attemptId ?? randomUUID()
  const t0 = Date.now()
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { data: recording, error: insertError } = await supabase
    .from('recordings')
    .insert({
      project_id: projectId,
      company_id: company.id,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
    })
    .select()
    .single()

  if (insertError || !recording) {
    // Phase 92 (EVENT-02): terminal failed save_recording event (best-effort).
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'save_recording',
      status: 'failed',
      companyId: company.id,
      projectId,
      errorMessage: 'Failed to create recording',
      durationMs: Date.now() - t0,
      provider: null,
    })
    return { error: 'Failed to create recording. Please try again.' }
  }

  // Check if first recording for project — update status to 'recording' per D-20
  const { count } = await supabase
    .from('recordings')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (count === 1) {
    await supabase
      .from('projects')
      .update({ status: 'recording' })
      .eq('id', projectId)
  }

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: projectId,
    company_id: company.id,
    event_type: 'recording_added',
    metadata: { duration_seconds: durationSeconds },
  })

  // Phase 92 (EVENT-02): single terminal succeeded save_recording event (D-03
  // collapse — synchronous step, no started row). This is an ADDITIONAL insert
  // into pipeline_events — the recording_added write above stays untouched (D-10).
  void recordPipelineEvent({
    attemptId: eventAttemptId,
    inputType: 'recording',
    step: 'save_recording',
    status: 'succeeded',
    companyId: company.id,
    projectId,
    estimateId: null,
    durationMs: Date.now() - t0,
    provider: null,
  })

  revalidatePath(`/projects/${projectId}`)
  return { data: recording }
}

/**
 * Phase 67 refactor: dispatches Whisper work to Inngest instead of awaiting inline.
 *
 * Auth/ownership semantics are preserved (RLS via authenticated supabase client).
 * Return shape CHANGED: was `{ data: { transcript } }`, now `{ data: { jobId } }`.
 * Callers should poll `GET /api/jobs/{jobId}` to discover completion. The
 * canonical dispatch surface is the NEW `POST /api/transcribe` route; this
 * server action is kept as a thin wrapper for backwards compatibility with
 * the existing `components/capture/capture-recorder.tsx` + `components/workspace/ai-input-group/ai-voice-dialog.tsx`
 * call sites (Plan 67-05 will rewire those to the route + polling hook).
 *
 * Implements: INNGEST-03.
 */
export async function transcribeRecording(
  recordingId: string,
  attemptId?: string,
  options?: {
    autoGenerateEstimate?: boolean
    requestId?: string
    estimateLanguage?: 'en' | 'pt' | 'es'
  }
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get recording row (RLS-enforced via authenticated client)
  const { data: recording } = await supabase
    .from('recordings')
    .select('storage_path, company_id, project_id')
    .eq('id', recordingId)
    .single()

  if (!recording) return { error: 'Recording not found' }
  if (!recording.storage_path) {
    return { error: 'This recording has no audio file to transcribe.' }
  }

  // Dispatch via Inngest. Importing inngest client + events here is safe —
  // server actions already run server-side. Lazy-imported to keep this module
  // pure at the top level (matches the existing import-on-demand style used
  // elsewhere in the codebase for cross-layer deps).
  const { inngest } = await import('@/lib/inngest/client')
  const { EVENT_TRANSCRIBE_AUDIO } = await import('@/lib/inngest/events')

  const { ids } = await inngest.send({
    name: EVENT_TRANSCRIBE_AUDIO,
    id: `transcribe-${recordingId}`,
    data: {
      companyId: recording.company_id as string,
      recordingId,
      storagePath: recording.storage_path as string,
      attemptId,
      ...(options?.autoGenerateEstimate && {
        autoGenerateEstimate: true,
        requestId: options.requestId,
        estimateLanguage: options.estimateLanguage,
      }),
    },
  })

  return { data: { jobId: ids[0] } }
}

export async function updateTranscript(recordingId: string, transcript: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('recordings')
    .update({ transcript })
    .eq('id', recordingId)

  if (error) return { error: 'Failed to update transcript' }

  return { data: true }
}

export async function deleteRecording(recordingId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Get recording to find storage_path and project_id
  const { data: recording } = await supabase
    .from('recordings')
    .select('storage_path, project_id')
    .eq('id', recordingId)
    .single()

  if (!recording) return { error: 'Recording not found' }

  // Delete from Storage audio bucket (skip for text-only recordings with no audio file)
  if (recording.storage_path) {
    try {
      await createStorage(supabase).delete('audio', recording.storage_path)
    } catch {
      return { error: 'Failed to delete audio file' }
    }
  }

  // Delete DB row
  const { error: dbError } = await supabase
    .from('recordings')
    .delete()
    .eq('id', recordingId)

  if (dbError) return { error: 'Failed to delete recording' }

  revalidatePath(`/projects/${recording.project_id}`)
  return { data: true }
}
