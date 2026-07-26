/**
 * Phase 67: Inngest function — wraps Whisper transcription with step.run checkpoints.
 * Replaces the inline Whisper fetch currently in lib/actions/recording.ts:transcribeRecording.
 *
 * Implements:
 *   - INNGEST-03 (Whisper moves out of synchronous server action)
 *   - INNGEST-06 (idempotent dispatch via a deterministic event id minted at
 *     every call site — `transcribe-${recordingId}`, or `-r${dispatchNonce}`
 *     suffixed on a genuine Retry. The function-level `idempotency` config
 *     that used to key on `event.data.recordingId` was REMOVED in 260707-lyq:
 *     it additionally absorbed genuine user Retries for 24h — see the comment
 *     on the createFunction config below.)
 *
 * Phase 167 (BILL-02/04/05/06) additions:
 *   - The Whisper step reads `recordings.transcript` FIRST, BEFORE the storage
 *     download, and SHORT-CIRCUITS (no download, no Whisper call, no cost row,
 *     no debit) when a transcript already exists — a Retry after a LATER
 *     pipeline-stage failure (e.g. generate) must never re-pay Whisper
 *     (v4.19 audit D3).
 *   - When NOT short-circuited, the duration used for cost/debit/entitlement is
 *     the SERVER-DERIVED `deriveAudioMinutes` value (byte-clamp, one-sided) —
 *     never the raw client-declared `duration_seconds` (audit D2's "declare 1s
 *     on a 10-min blob" exploit).
 *   - The plan's per-estimate `maxAudioMinutesPerEstimate` entitlement is
 *     enforced against that derived value BEFORE the Whisper call, throwing a
 *     NonRetriableError on rejection (deterministic — retrying burns 2 more
 *     attempts for nothing) so onFailure fires immediately with zero spend.
 *   - `transcribeAudioOR` now returns `{ text, servedBy }`; the job attributes
 *     BOTH the pipeline event and the cost row to the provider that actually
 *     served the call ('openai' on fallback, 'openrouter' otherwise) instead
 *     of hardcoding 'openrouter' (audit D5).
 */
import { NonRetriableError } from 'inngest'
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { requireServiceClient } from '@/lib/supabase/service'
import { transcribeAudioOR } from '@/lib/ai/openrouter-client'
import { getTranscriptionModel } from '@/lib/platform-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { notifyOps } from '@/lib/observability/ops-alert'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import { recordCreditDebit, checkCredits } from '@/lib/billing/credit-ledger'
import { computeWhisperCostUsd, deriveAudioMinutes } from '@/lib/billing/whisper-cost'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
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
  /** Phase 167 (BILL-05): loaded up-front so the short-circuit decision runs BEFORE the storage download. */
  transcript: string | null
  /** Phase 167 (BILL-06): needed to resolve the per-estimate audio-minute entitlement cap. */
  tier: string | null
}> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('recordings')
      .select('company_id, project_id, duration_seconds, transcript, companies(user_id, tier)')
      .eq('id', recordingId)
      .single()
    const row = data as {
      company_id?: string | null
      project_id?: string | null
      duration_seconds?: number | null
      transcript?: string | null
      companies?: { user_id?: string | null; tier?: string | null } | null
    } | null
    return {
      companyId: row?.company_id ?? null,
      userId: row?.companies?.user_id ?? null,
      projectId: row?.project_id ?? null,
      durationSeconds: row?.duration_seconds ?? null,
      transcript: row?.transcript ?? null,
      tier: row?.companies?.tier ?? null,
    }
  } catch {
    return {
      companyId: null,
      userId: null,
      projectId: null,
      durationSeconds: null,
      transcript: null,
      tier: null,
    }
  }
}

export const transcribeAudioJob = inngest.createFunction(
  {
    id: 'transcribe-audio',
    // 260707-lyq (P4): the function-level `idempotency` config (previously
    // keyed on the recordingId event field) has been REMOVED. Event-id dedup
    // (deterministic ids at every dispatch site) already guarantees
    // at-most-once per dispatch intent; function-level idempotency
    // additionally absorbed genuine Retries for 24h (260707-lyq audit) —
    // removed so a nonce'd retry can actually run.
    retries: 2,
    triggers: [{ event: EVENT_TRANSCRIBE_AUDIO }],
    // Phase 77 NOTIF-04: ai_job.failed on retry exhaustion. Phase 167 (BILL-06):
    // this ALSO fires immediately (no wasted retries) when the whisper-transcribe
    // step throws a NonRetriableError for an over-cap recording.
    onFailure: async ({ event, error }) => {
      const payload = (event as { data?: { event?: { data?: TranscribeAudioPayload } } })
        .data?.event?.data
      if (!payload) return
      const { companyId, userId, projectId } = await loadCompanyForRecording(payload.recordingId)
      const denied = await assertCompanyWritable(companyId)
      if (denied) return
      const eventDenied = await assertCompanyWritable(payload.companyId)
      if (eventDenied) return

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

      // quick-260705-c1y-03: additive ops alert BEFORE the !companyId early return
      // so a company-less transcription failure is still surfaced to ops. Never-throw
      // fire-and-forget; does not gate or alter the tenant notify() below.
      void notifyOps({
        kind: 'transcription_failed',
        title: 'Audio transcription failed after retries',
        message: `recording=${payload.recordingId} company=${companyId ?? 'unknown'} err=${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        dedupeKey: `transcribe_fail:${payload.recordingId}`,
        suppressWindowSec: 600,
      })

      if (!companyId) return
      const ctx = {
        jobType: 'Audio transcription',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
      const copy = buildNotificationCopy('ai_job.failed', ctx)
      void notify({
        companyId,
        userId,
        eventType: 'ai_job.failed',
        title: copy.title,
        body: copy.body,
        copyContext: ctx,
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
    // Phase 167 (BILL-05): also carries the transcript up-front so the
    // short-circuit decision below never needs a second DB round-trip.
    const ident = await loadCompanyForRecording(recordingId)
    const denied = await assertCompanyWritable(ident.companyId)
    if (denied) return { skipped: true, reason: 'demo_readonly' as const }
    const eventDenied = await assertCompanyWritable(data.companyId)
    if (eventDenied) return { skipped: true, reason: 'demo_readonly' as const }
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'transcribe',
      status: 'started',
      companyId: ident.companyId,
      projectId: ident.projectId,
      userId: ident.userId,
    })

    // Platform-wide speech-to-text model (super-admin selectable, DB-driven, no
    // redeploy). Falls back to whisper-1 when unset. Resolved once and threaded
    // into BOTH the transcription call and the cost attribution so the recorded
    // model always matches what actually ran.
    const sttModel = await getTranscriptionModel()

    // Step 1: short-circuit (BILL-05) + entitlement-gated (BILL-06) Whisper call.
    // A failure inside a LATER step never re-runs this one on the SAME run
    // (Inngest step memoization); a genuine cross-run Retry is what the
    // transcript-exists short-circuit below protects against.
    const transcription = await step.run('whisper-transcribe', async () => {
      // BILL-05: read recordings.transcript FIRST — BEFORE the storage
      // download — so a Retry dispatched after a LATER pipeline stage
      // (e.g. generate) failed never re-downloads the audio OR re-calls
      // Whisper when this recording was already transcribed.
      if (ident.transcript && ident.transcript.trim().length > 0) {
        return {
          transcript: ident.transcript,
          servedBy: null as 'primary' | 'fallback' | null,
          shortCircuited: true as const,
          derivedMinutes: null as number | null,
        }
      }

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

      // BILL-02: server-derived duration from the downloaded blob's real size
      // (byte-clamp, one-sided) — the "declare 1s on a 10-min blob" exploit no
      // longer produces a near-zero cost/debit, because the derivation only
      // ever corrects an UNDER-declaration, never an honest/over-declaration.
      const derived = deriveAudioMinutes({
        declaredSeconds: ident.durationSeconds,
        blobBytes: fileData.size,
      })
      if (
        derived.source === 'byte_clamp' &&
        ident.durationSeconds != null &&
        derived.minutes - ident.durationSeconds / 60 > 1
      ) {
        // Structured log: the exploit signature (declared far below the
        // byte-derived floor, >1 minute discrepancy). Never blocks — the
        // corrected value is already what cost/debit/entitlement use below.
        console.warn('[transcribe-audio] byte-clamp correction (possible under-declaration)', {
          recordingId,
          declaredSeconds: ident.durationSeconds,
          derivedMinutes: derived.minutes,
        })
      }

      // BILL-06: enforce the plan's per-estimate audio-minute entitlement
      // against the DERIVED (server-truth) duration, BEFORE the Whisper call.
      // Previously this entitlement (free 2 / pro 15 / business 30 min) was
      // enforced NOWHERE (audit D2/dead-entitlement finding). A rejection here
      // throws NonRetriableError — the violation is deterministic, so retrying
      // would just fail the same way 2 more times before onFailure ever fires.
      const tier = ident.tier ?? 'free'
      const entitlements = await getEntitlementsForTier(tier)
      if (derived.minutes > entitlements.maxAudioMinutesPerEstimate) {
        throw new NonRetriableError(
          `This recording (${derived.minutes.toFixed(1)} min) exceeds the ${tier} plan's ${entitlements.maxAudioMinutesPerEstimate}-minute per-estimate audio limit.`
        )
      }

      // BILL-05/D5: transcribeAudioOR now surfaces which provider actually
      // served the call — no more hardcoding 'openrouter' downstream.
      const { text, servedBy } = await transcribeAudioOR(fileData, ext, sttModel)
      return {
        transcript: text,
        servedBy,
        shortCircuited: false as const,
        derivedMinutes: derived.minutes,
      }
    })

    // Step 2: Save transcript (+ the corrected duration when byte-clamp
    // fired, so downstream UI/quota views show the truth) — separate step so
    // a DB error doesn't re-call Whisper. Skipped entirely on short-circuit:
    // the DB already holds this transcript, nothing changed.
    if (!transcription.shortCircuited) {
      await step.run('save-transcript', async () => {
        const supabase = requireServiceClient()
        const update: { transcript: string; duration_seconds?: number } = {
          transcript: transcription.transcript,
        }
        if (transcription.derivedMinutes != null) {
          update.duration_seconds = Math.round(transcription.derivedMinutes * 60)
        }
        const { error } = await supabase
          .from('recordings')
          .update(update)
          .eq('id', recordingId)
        if (error) throw new Error(`Failed to save transcript: ${error.message}`)
      })
    }

    // When the client requested fire-and-forget mode, chain directly into
    // estimate generation so the user can navigate away immediately after
    // uploading the recording. ident.projectId is already loaded above. This
    // dispatch is UNCONDITIONAL on shortCircuited — a short-circuited retry
    // still needs the generate stage to (re-)run, which is exactly the case
    // this short-circuit exists to serve cheaply.
    if (data.autoGenerateEstimate && ident.projectId) {
      await step.run('dispatch-generate-estimate', async () => {
        // 260707-lyq (P4): Billing v2 credit gate — insufficient credits BLOCK
        // this chained dispatch (transcription itself already succeeded and
        // stays; only the generate-estimate hop is skipped). Uses the service
        // client (this is a background job, no request-scoped client exists) —
        // checkCredits' plain `companies` select works unchanged against it.
        const svc = requireServiceClient()
        const credit = await checkCredits(svc, data.companyId, 1)
        if (!credit.allowed) {
          void recordPipelineEvent({
            attemptId,
            inputType,
            step: 'generate_estimate',
            status: 'failed',
            companyId: data.companyId,
            projectId: ident.projectId,
            errorCode: 'insufficient_credits',
            errorMessage: 'Insufficient credits',
            provider: null,
          })
          return
        }

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

    // Phase 167 (BILL-05/D5): the provider that actually served THIS run.
    // null (no fresh call happened) when short-circuited.
    const provider: 'openai' | 'openrouter' | null = transcription.shortCircuited
      ? null
      : transcription.servedBy === 'fallback'
        ? 'openai'
        : 'openrouter'

    // Phase 92 (EVENT-02/D-03): terminal succeeded event with duration_ms.
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'transcribe',
      status: 'succeeded',
      companyId: ident.companyId,
      projectId: ident.projectId,
      userId: ident.userId,
      provider,
      durationMs: Date.now() - t0,
    })

    // Phase 110 (COST-02) / Phase 167 (BILL-02/04/05): record the COMPUTED
    // Whisper/STT cost from the SERVER-DERIVED duration — GUARDED on
    // !shortCircuited. A short-circuited retry already paid for (and logged)
    // this transcription on its original run; re-running this step would
    // double-count real cost (audit D3's "platform pays N×" finding) even
    // though the customer's debit stays correct via the idempotent RPC.
    if (!transcription.shortCircuited) {
      const derivedMinutes = transcription.derivedMinutes
      const whisperCost = computeWhisperCostUsd(
        derivedMinutes != null ? derivedMinutes * 60 : null
      )
      // D7 (quick-260705-2gp): the cost insert is memoized as its own Inngest step
      // so a retry of a LATER step can never double-insert an ai_cost_events row.
      // Phase 167 (BILL-04): recordAICost also swallows a 23505 duplicate as
      // success now that (attempt_id, operation_type) is uniquely indexed.
      await step.run('record-ai-cost', async () => {
        await recordAICost({
          attemptId,
          operationType: 'audio_minutes',
          provider: provider ?? 'openrouter',
          model: sttModel,
          realCostUsd: whisperCost,
          companyId: ident.companyId,
          projectId: ident.projectId,
          units: derivedMinutes != null && derivedMinutes > 0 ? derivedMinutes : null,
        })
      })

      // Phase 112 (CREDIT-02): credit debit for the transcription, retry-isolated
      // and never-throw. Anchored AFTER save-transcript + recordAICost so it only
      // fires on a fresh (non-short-circuited) transcription success. Skipped
      // when companyId is unknown (no tenant → no debit).
      if (ident.companyId) {
        const debitCompanyId = ident.companyId
        await step.run('record-credit-debit', async () => {
          await recordCreditDebit({
            companyId: debitCompanyId,
            operationType: 'audio_minutes',
            realCostUsd: whisperCost,
            attemptId,
          })
        })
      }
    }

    // Phase 77 NOTIF-04: opt-in success notification.
    try {
      const { companyId, userId } = await loadCompanyForRecording(recordingId)
      if (companyId) {
        const ctx = {
          jobType: 'Audio transcription',
        }
        const copy = buildNotificationCopy('ai_job.completed', ctx)
        void notify({
          companyId,
          userId,
          eventType: 'ai_job.completed',
          title: copy.title,
          body: copy.body,
          copyContext: ctx,
          resourceType: 'recording',
          resourceId: recordingId,
          metadata: { dedupe_key: `ai-ok-transcribe-${recordingId}` },
        })
      }
    } catch {
      /* best-effort */
    }

    return { transcript: transcription.transcript }
  }
)
