# 167-01 SUMMARY — Billing & Cost Integrity (BILL-01/02/04/05/06)

**Status:** COMPLETE (code + tests landed; SUMMARY finalized by orchestrator after the executor hit a Sonnet credit limit during post-verification flake-clearing — the 3 task commits and all tests were already in place).

**Commits:**
- `98be4a47` — feat(167-01): credit gate on refine route (BILL-01)
- `8e718f43` — feat(167-01): server-derived audio duration + entitlement enforcement (BILL-02/06)
- `43bb2e6b` — feat(167-01): retry short-circuit, provider attribution, cost-event dedup (BILL-04/05/06)

## What shipped, per requirement

- **BILL-01** — `app/api/estimates/[id]/refine/route.ts` gains `checkCredits` + `buildOverageAffordance` → 402 `{error:'plan_limit_reached', reason:'credits', upgradeUrl, topUpUrl?}`, placed after auth/ownership and BEFORE `ingestMultimodal` (no paid call precedes the gate). Uses the authed client; block kept small + delimited so 164-02's lock guard composes cleanly beside it.
- **BILL-02** — `lib/billing/whisper-cost.ts` exports `deriveAudioMinutes({declaredSeconds, blobBytes, bitrateBps=128_000})`. One-sided clamp: `byteEstimate = bytes·8/128000/60` is a conservative LOWER bound; `byte_clamp` fires ONLY when `declared < byteEstimate` (the under-declaration exploit), never up-clamps an honest declaration nor down-clamps an over-declaration. `transcribe-audio.ts` computes cost/debit/entitlement from `derived.minutes`, and writes the derived value back to `recordings.duration_seconds` on `byte_clamp`. The 1s-on-10-min exploit is caught under any bitrate assumption; an honest 5-min take at 96 kbps stays `declared`.
- **BILL-04** — `transcribe-audio.ts` reads `recordings.transcript` BEFORE the storage download; a non-empty transcript short-circuits (skip download + Whisper), the step returns `{transcript, servedBy, shortCircuited, derivedMinutes}`, and the `record-ai-cost`/`record-credit-debit` steps are guarded on `!shortCircuited` — no phantom cost row or debit on a generate-stage retry.
- **BILL-05** — `transcribeAudioOR` now returns `{text, servedBy}` (both consumers updated: `transcribe-audio.ts` + `lib/estimate/ingest/multimodal.ts:54`). Provider recorded as `openai` when `servedBy==='fallback'`, else `openrouter`, at both the pipeline event and cost row. Migration `20260717000002_phase167_ai_cost_events_dedup.sql` dedupes existing rows (keep earliest per `(attempt_id, operation_type)`) then adds a **PARTIAL** unique index `WHERE operation_type IN ('audio_minutes','estimate')` — vision/photo_batch rows stay unconstrained for 167-02's summed cost. `record-ai-cost.ts` now reads the insert's returned error and treats 23505 as success, warns on other codes.
- **BILL-06** — before the Whisper call, the job loads `maxAudioMinutesPerEstimate` and rejects `derived.minutes > cap` via Inngest **NonRetriableError** (no retry burn) → `onFailure` surfaces the ai_job.failed notification. Plus a pre-dispatch declared-duration belt in `createRecording`/`startRecordingPipeline` for synchronous honest-path UX. `lib/quota.ts` documents that real `audio_minutes` enforcement now lives in the transcribe job.

## Derivation-band rationale
Browsers create `MediaRecorder` with no `audioBitsPerSecond` → real bitrate is the browser default (commonly 64–128 kbps). Assuming the HIGH end (128 kbps) makes `byteEstimate` a lower bound on true minutes, so honest recordings at any real bitrate ≤128 kbps satisfy `declared ≥ byteEstimate` and are never up-clamped (no overcharge, no false entitlement rejection). Only under-declaration trips the clamp.

## ⚠️ Behavior change to flag for the owner
`maxAudioMinutesPerEstimate` was a DEAD entitlement; it is now a HARD BLOCK. Free tier caps at 2 min while the client recorder allows 10 min → an honest free user recording >2 min now gets an async failure. **The owner should recalibrate the per-tier entitlement values (or reconsider the hard-block vs soft-meter posture) before this reaches free-tier users.** Tracked as a deferred calibration item.

## Deferred
- **BILL-03** (vision costContext threading) → **167-02**, sequenced after 168-01 (both touch the vision section of `openrouter-client.ts` / `analyze-photos.ts`).

## Verification
- `npx tsc --noEmit -p tsconfig.ci.json`: exit 0.
- Targeted suites (derived-duration, transcribe-short-circuit, refine-credit-gate, transcribe-fallback, multimodal-ingest): **39/39 GREEN**.
- Scope fence honored: only the transcription section of `openrouter-client.ts` touched; `analyzePhotoOR`/vision and `generate-estimate.ts` untouched.
