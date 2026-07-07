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
import { recordJobOwnership } from '@/lib/inngest/job-ownership'
import { checkCredits } from '@/lib/billing/credit-ledger'

// 260707-lyq (P4): Billing v2 credit gate shared by every server-owned dispatch
// path in this module (startRecordingPipeline, createTextRecording's optional
// chain). Same copy everywhere so the UI can string-match it if ever needed.
const INSUFFICIENT_CREDITS_MESSAGE =
  'You are out of credits — top up in Settings → Billing to keep generating estimates.'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  // getActiveCompanyId() already validated membership (company_members FK →
  // companies), so the company row provably exists — skip a redundant SELECT.
  const company = { id: activeCompanyId }

  const denied = await assertWritable()
  if (denied) return denied

  return { supabase, company }
}

// Text-only recording — no audio file, transcript is the typed description
export async function createTextRecording(
  projectId: string,
  description: string,
  attemptId?: string,
  options?: {
    autoGenerateEstimate?: boolean
    requestId?: string
    estimateLanguage?: 'en' | 'pt' | 'es'
  }
) {
  // Phase 92 (EVENT-02/D-08): server fallback so an event is never dropped.
  const eventAttemptId = attemptId ?? randomUUID()
  const t0 = Date.now()
  const ctx = await getAuthContext()
  if ('error' in ctx) {
    // 260707-grq: auth early-return was previously invisible in /admin/events.
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'manual_text',
      step: 'save_recording',
      status: 'failed',
      companyId: null,
      projectId,
      errorMessage: ctx.error,
      errorCode: 'auth',
      durationMs: Date.now() - t0,
      provider: null,
    })
    return { error: ctx.error }
  }
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

  // 260707-hhp (P1): optional server-side chain into generate-estimate — closes
  // the client gap between saving a typed description and dispatching generation.
  // Lazy-imported + try/caught in the same style as transcribeRecording's dispatch.
  if (options?.autoGenerateEstimate) {
    // 260707-lyq (P4): Billing v2 credit gate — insufficient credits BLOCK the
    // generate-estimate dispatch (plain saves stay free: this whole branch only
    // runs when autoGenerateEstimate was requested). Wrapped so a checkCredits
    // read failure fails OPEN (never wrongly blocks generation on an
    // infrastructure hiccup) — mirrors the never-throw discipline the rest of
    // lib/billing/credit-ledger.ts already follows internally (isByokCompany).
    let creditsAllowed = true
    try {
      const credit = await checkCredits(supabase, company.id, 1)
      creditsAllowed = credit.allowed
    } catch (err) {
      console.warn('[createTextRecording] checkCredits failed — failing open:', err)
    }
    if (!creditsAllowed) {
      void recordPipelineEvent({
        attemptId: eventAttemptId,
        inputType: 'manual_text',
        step: 'save_recording',
        status: 'failed',
        companyId: company.id,
        projectId,
        errorCode: 'insufficient_credits',
        errorMessage: 'Insufficient credits',
        provider: null,
      })
      return { error: INSUFFICIENT_CREDITS_MESSAGE }
    }

    const { inngest } = await import('@/lib/inngest/client')
    const { EVENT_ESTIMATE_GENERATE } = await import('@/lib/inngest/events')
    const reqId = options.requestId ?? randomUUID()
    try {
      const { ids } = await inngest.send({
        name: EVENT_ESTIMATE_GENERATE,
        id: `estimate-${projectId}-${reqId}`,
        data: {
          companyId: company.id,
          projectId,
          requestId: reqId,
          language: options.estimateLanguage,
          attemptId: eventAttemptId,
          inputType: 'manual_text' as const,
          channel: 'web' as const,
        },
      })
      if (ids[0]) await recordJobOwnership(ids[0], company.id)
      return { data: recording, jobId: ids[0] }
    } catch (err) {
      void recordPipelineEvent({
        attemptId: eventAttemptId,
        inputType: 'manual_text',
        step: 'generate_estimate',
        status: 'failed',
        companyId: company.id,
        projectId,
        errorMessage: String(err instanceof Error ? err.message : err).slice(0, 300),
        errorCode: 'dispatch_failed',
        provider: null,
      })
      return { error: 'Your description was saved but generation could not start — please retry.' }
    }
  }

  return { data: recording }
}

// Pre-launch audit fix (A-2 / B10): storagePath and durationSeconds are
// client-declared. Two abuse vectors this closes:
//   1. A storagePath outside the caller's own company prefix would let the
//      transcribe worker (service role, no ownership check on the download
//      itself) read another tenant's audio file if that path were ever
//      guessed/leaked.
//   2. duration_seconds feeds computeWhisperCostUsd (lib/inngest/functions/
//      transcribe-audio.ts) — a declared 0 makes that return null, which is a
//      no-op for the credit debit ("free" transcription). Reject non-positive
//      and unreasonably large values outright rather than trusting the client.
// NOTE: this validates the CLAIMED duration against a sane range — it does
// not (yet) probe the actual audio file to derive a ground-truth duration,
// which would need an audio-parsing dependency this codebase doesn't carry
// today. Tracked as a follow-up if the range check proves insufficient.
const MAX_RECORDING_DURATION_SECONDS = 15 * 60 // 900s — client hard-caps at 10 min; generous slack for encoding variance

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
  if ('error' in ctx) {
    // 260707-grq: auth early-return was previously invisible in /admin/events.
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'save_recording',
      status: 'failed',
      companyId: null,
      projectId,
      errorMessage: ctx.error,
      errorCode: 'auth',
      durationMs: Date.now() - t0,
      provider: null,
    })
    return { error: ctx.error }
  }
  const { supabase, company } = ctx

  if (!storagePath.startsWith(`${company.id}/`)) {
    // 260707-grq: cross-tenant / malformed path — was previously invisible.
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'save_recording',
      status: 'failed',
      companyId: company.id,
      projectId,
      errorMessage: 'Invalid recording path.',
      errorCode: 'validation_path',
      durationMs: Date.now() - t0,
      provider: null,
    })
    return { error: 'Invalid recording path.' }
  }
  if (!(durationSeconds > 0) || durationSeconds > MAX_RECORDING_DURATION_SECONDS) {
    // 260707-grq (TODAY'S PRODUCTION KILLER): a stale client duration=0 hits this
    // branch — now visible in /admin/events instead of silently killing the pipeline.
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'save_recording',
      status: 'failed',
      companyId: company.id,
      projectId,
      errorMessage: `Invalid recording duration: ${durationSeconds}s (client sent a non-positive or oversized value)`,
      errorCode: 'validation_duration',
      durationMs: Date.now() - t0,
      provider: null,
    })
    return { error: 'Invalid recording duration.' }
  }

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
    /**
     * 260707-lyq (P4): retry ordinal. When set (Retry), folded into the
     * dispatched event id as `-r${dispatchNonce}` so the re-dispatch gets a
     * genuinely NEW Inngest event id instead of colliding with the original
     * dispatch's `transcribe-${recordingId}` id.
     */
    dispatchNonce?: number
  }
) {
  // 260707-grq: no attemptId fallback previously existed here — mint one so
  // every early-return below has a stable id to write a pipeline event against.
  const eventAttemptId = attemptId ?? randomUUID()

  const ctx = await getAuthContext()
  if ('error' in ctx) {
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'transcribe',
      status: 'failed',
      companyId: null,
      projectId: null,
      errorMessage: ctx.error,
      errorCode: 'auth',
      provider: null,
    })
    return { error: ctx.error }
  }
  const { supabase } = ctx

  // Get recording row (RLS-enforced via authenticated client)
  const { data: recording } = await supabase
    .from('recordings')
    .select('storage_path, company_id, project_id')
    .eq('id', recordingId)
    .single()

  if (!recording) {
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'transcribe',
      status: 'failed',
      companyId: null,
      projectId: null,
      errorMessage: 'Recording not found',
      errorCode: 'not_found',
      provider: null,
    })
    return { error: 'Recording not found' }
  }
  if (!recording.storage_path) {
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'transcribe',
      status: 'failed',
      companyId: recording.company_id as string,
      projectId: recording.project_id as string,
      errorMessage: 'This recording has no audio file to transcribe.',
      errorCode: 'no_audio',
      provider: null,
    })
    return { error: 'This recording has no audio file to transcribe.' }
  }

  // Dispatch via Inngest. Importing inngest client + events here is safe —
  // server actions already run server-side. Lazy-imported to keep this module
  // pure at the top level (matches the existing import-on-demand style used
  // elsewhere in the codebase for cross-layer deps).
  const { inngest } = await import('@/lib/inngest/client')
  const { EVENT_TRANSCRIBE_AUDIO } = await import('@/lib/inngest/events')

  // 260707-grq: previously an inngest.send throw propagated as an unhandled
  // server-action 500 that the client's runPipeline does NOT catch — the UI
  // hung on 'transcribing' forever. Now degrades to a friendly retryable error.
  try {
    // 260707-lyq (P4): nonce'd event id — 0/undefined keeps the legacy
    // `transcribe-${recordingId}` format (existing dedup behavior for the
    // FIRST dispatch); a real Retry passes a nonce so the id changes and
    // Inngest treats it as a genuinely new event instead of a duplicate.
    const eventId = `transcribe-${recordingId}${options?.dispatchNonce ? `-r${options.dispatchNonce}` : ''}`
    const { ids } = await inngest.send({
      name: EVENT_TRANSCRIBE_AUDIO,
      id: eventId,
      data: {
        companyId: recording.company_id as string,
        recordingId,
        storagePath: recording.storage_path as string,
        attemptId,
        ...(options?.dispatchNonce !== undefined && { dispatchNonce: options.dispatchNonce }),
        ...(options?.autoGenerateEstimate && {
          autoGenerateEstimate: true,
          requestId: options.requestId,
          estimateLanguage: options.estimateLanguage,
        }),
      },
    })
    // Awaited — see app/api/transcribe/route.ts for why this must not race the
    // client's first poll.
    if (ids[0]) await recordJobOwnership(ids[0], recording.company_id as string)

    return { data: { jobId: ids[0] } }
  } catch (err) {
    void recordPipelineEvent({
      attemptId: eventAttemptId,
      inputType: 'recording',
      step: 'transcribe',
      status: 'failed',
      companyId: recording.company_id as string,
      projectId: recording.project_id as string,
      errorMessage: String(err instanceof Error ? err.message : err).slice(0, 300),
      errorCode: 'dispatch_failed',
      provider: null,
    })
    return { error: 'Transcription service is temporarily unavailable — your recording is saved. Please retry.' }
  }
}

/**
 * 260707-hhp (P1): single client→server round trip after audio upload. Creates the
 * recording row AND dispatches the transcribe→generate chain in one call, so the
 * browser can die immediately afterwards without orphaning the generation.
 * Retry path: pass `recordingId` to skip creation and re-dispatch only. As of
 * 260707-lyq (P4), pass `dispatchNonce` too so the re-dispatch is a GENUINE new
 * run — the transcribe event id folds in `-r${dispatchNonce}` and the
 * function-level idempotency config was removed (see transcribe-audio.ts), so a
 * bare re-dispatch of the same `recordingId` no longer silently no-ops.
 */
export async function startRecordingPipeline(input: {
  projectId: string
  storagePath?: string       // required when recordingId is absent
  durationSeconds?: number   // required when recordingId is absent
  recordingId?: string       // Retry: reuse the existing row
  attemptId: string
  requestId: string
  estimateLanguage?: 'en' | 'pt' | 'es'
  dispatchNonce?: number     // Retry: bump so the re-dispatch gets a new event id
}): Promise<{ data: { recordingId: string; transcribeJobId: string } } | { error: string }> {
  // 260707-lyq (P4): Billing v2 credit gate — insufficient credits BLOCK this
  // entire server-owned dispatch path, before a recording is created OR a
  // transcription is (re-)dispatched. Mirrors app/api/analyze-photos/route.ts's
  // checkCredits(supabase, companyId, 1) call exactly (same client type, args,
  // and insufficient-result shape).
  const ctx = await getAuthContext()
  // Reconstructed (not forwarded as-is): same TS quirk noted below at
  // createRecording's error-widening call site — getAuthContext's inferred
  // return type widens `error` to `string | undefined` once narrowed here
  // against this function's explicit `{ error: string }` return annotation.
  // The nullish fallback is unreachable at runtime (every branch always
  // assigns a real message).
  if ('error' in ctx) return { error: ctx.error ?? 'Not authenticated' }
  const { supabase, company } = ctx

  let creditsAllowed = true
  try {
    const credit = await checkCredits(supabase, company.id, 1)
    creditsAllowed = credit.allowed
  } catch (err) {
    // Fail OPEN — a metering-read failure must never wrongly block generation.
    console.warn('[startRecordingPipeline] checkCredits failed — failing open:', err)
  }
  if (!creditsAllowed) {
    void recordPipelineEvent({
      attemptId: input.attemptId,
      inputType: 'recording',
      step: 'save_recording',
      status: 'failed',
      companyId: company.id,
      projectId: input.projectId,
      errorCode: 'insufficient_credits',
      errorMessage: 'Insufficient credits',
      provider: null,
    })
    return { error: INSUFFICIENT_CREDITS_MESSAGE }
  }

  let recordingId = input.recordingId

  if (!recordingId) {
    if (!input.storagePath || !input.durationSeconds) {
      return { error: 'Missing recording data.' }
    }
    const created = await createRecording(
      input.projectId,
      input.storagePath,
      input.durationSeconds,
      input.attemptId
    )
    // Reconstructed (not forwarded as-is): TS widens the multi-branch inferred
    // return type of createRecording's sibling error strings to include
    // `undefined`; the nullish fallback below is unreachable at runtime (every
    // branch always assigns a real message) and keeps this call site's return
    // type a clean `{ error: string }`.
    if ('error' in created) {
      return { error: created.error ?? 'Failed to create recording. Please try again.' }
    }
    recordingId = created.data.id as string
  }

  const dispatched = await transcribeRecording(recordingId, input.attemptId, {
    autoGenerateEstimate: true,
    requestId: input.requestId,
    estimateLanguage: input.estimateLanguage,
    dispatchNonce: input.dispatchNonce,
  })
  if ('error' in dispatched) {
    return { error: dispatched.error ?? 'Transcription service is temporarily unavailable — your recording is saved. Please retry.' }
  }

  return { data: { recordingId, transcribeJobId: dispatched.data.jobId } }
}

// 260707-grq: client-leg telemetry. The capture pipeline is orchestrated by the browser;
// when a step fails CLIENT-side (or a server action's error return is only visible in the
// browser), this authed, best-effort action lands a failed row in pipeline_events so the
// attempt is visible in /admin/events. Never throws; message truncated; enum-validated
// against the pipeline_events CHECK constraints.
const REPORTABLE_STEPS = ['save_recording', 'transcribe', 'analyze', 'generate_estimate'] as const
const REPORTABLE_INPUT_TYPES = ['recording', 'photo', 'manual_text'] as const

export async function reportClientPipelineFailure(input: {
  attemptId: string
  projectId: string
  step: (typeof REPORTABLE_STEPS)[number]
  inputType: (typeof REPORTABLE_INPUT_TYPES)[number]
  errorMessage: string
}) {
  try {
    const ctx = await getAuthContext()
    if ('error' in ctx) return { error: ctx.error }
    if (!REPORTABLE_STEPS.includes(input.step)) return { error: 'Invalid step' }
    if (!REPORTABLE_INPUT_TYPES.includes(input.inputType)) return { error: 'Invalid input type' }
    void recordPipelineEvent({
      attemptId: input.attemptId,
      inputType: input.inputType,
      step: input.step,
      status: 'failed',
      companyId: ctx.company.id,
      projectId: input.projectId,
      errorMessage: String(input.errorMessage ?? '').slice(0, 300),
      errorCode: 'client_reported',
      provider: null,
    })
    return { data: true }
  } catch {
    return { error: 'report failed' }
  }
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
