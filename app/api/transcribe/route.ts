import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inngest } from '@/lib/inngest/client'
import {
  EVENT_TRANSCRIBE_AUDIO,
  type TranscribeAudioPayload,
} from '@/lib/inngest/events'
import { XtimatorError, asResponse } from '@/lib/errors'
import { rateLimit } from '@/lib/ratelimit'
import { checkQuota } from '@/lib/quota'
import { demoGuardResponse } from '@/lib/demo/guard'

/**
 * Phase 67: NEW route. Dispatches Whisper transcription via Inngest.
 *
 * Replaces the inline Whisper fetch that used to live in
 * lib/actions/recording.ts:transcribeRecording. Returns { jobId } in <1s.
 * The actual Whisper call runs inside
 * lib/inngest/functions/transcribe-audio.ts:transcribeAudioJob.
 *
 * Implements: INNGEST-03.
 */
export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      throw new XtimatorError('unauthorized', 'auth', 'Not authenticated')
    }

    // Read-only demo: never dispatch a (paid) transcription job.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    // Security Review S05 — rate limit (Whisper is a paid external call).
    const rl = await rateLimit('transcribePerMinute', claims.sub)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many transcription requests', code: 'rate_limit:transcribe' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }

    // Body
    const body = await request.json().catch(() => null)
    const recordingId =
      typeof body?.recordingId === 'string' ? body.recordingId : null
    if (!recordingId) {
      throw new XtimatorError(
        'bad_request',
        'recordings',
        'recordingId is required'
      )
    }

    // Verify recording exists and has audio
    const { data: recording } = await supabase
      .from('recordings')
      .select('id, storage_path, company_id')
      .eq('id', recordingId)
      .single()
    if (!recording) {
      throw new XtimatorError('not_found', 'recordings', 'Recording not found')
    }
    const rec = recording as {
      id: string
      storage_path: string | null
      company_id: string
    }
    if (!rec.storage_path) {
      throw new XtimatorError(
        'bad_request',
        'recordings',
        'This recording has no audio file to transcribe'
      )
    }

    // Ownership check via RLS-aware company lookup
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', claims.sub)
      .single()
    if (!company || (company as { id: string }).id !== rec.company_id) {
      throw new XtimatorError(
        'forbidden',
        'recordings',
        'Not authorized for this recording'
      )
    }

    // Security Review S05 — gate dispatch on quota (audio_minutes).
    const { allowed } = await checkQuota(supabase, rec.company_id, 'audio_minutes')
    if (!allowed) {
      return NextResponse.json(
        { error: 'plan_limit_reached', upgradeUrl: '/settings/billing' },
        { status: 402 }
      )
    }

    // Dispatch — recordingId is a UUID, so event id 'transcribe-{recordingId}'
    // is naturally unique per recording.
    const payload: TranscribeAudioPayload = {
      companyId: rec.company_id,
      recordingId: rec.id,
      storagePath: rec.storage_path,
    }
    const { ids } = await inngest.send({
      name: EVENT_TRANSCRIBE_AUDIO,
      id: `transcribe-${recordingId}`,
      data: payload,
    })

    return NextResponse.json({ jobId: ids[0] }, { status: 202 })
  } catch (error) {
    return asResponse(error)
  }
}
