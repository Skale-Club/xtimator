---
phase: quick-260707-grq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - components/capture/capture-recorder.tsx
  - lib/actions/recording.ts
  - tests/unit/capture/capture-duration.test.ts
  - tests/unit/actions/recording-early-return-events.test.ts
autonomous: true
requirements: [QUICK-grq-01, QUICK-grq-02, QUICK-grq-03]
must_haves:
  truths:
    - "Audio capture (New Xtimate popup) sends the REAL recording duration (>=1s) to createRecording — never the stale-closure 0 that the B10 validation now rejects"
    - "recorder.onstop always invokes the LATEST runPipeline (fresh estimateLanguage/onComplete), not the closure captured at recording start"
    - "Recordings shorter than 1s (or zero-byte blobs) are blocked client-side with a friendly toast BEFORE any upload — hardening before the server"
    - "Every server early-return in createRecording / createTextRecording / transcribeRecording (auth, path validation, duration validation, not-found, dispatch throw) writes a failed pipeline_events row — no more invisible failures in /admin/events"
    - "Client-side pipeline failures (failAt) fire a best-effort failed pipeline event with error_code 'client_reported' so a dead client leg is visible in the Event Log"
  artifacts:
    - path: "components/capture/capture-recorder.tsx"
      provides: "Duration via ref, onstop via runPipelineRef, pre-flight validation, failAt telemetry"
    - path: "lib/actions/recording.ts"
      provides: "Pipeline events on all early-returns + reportClientPipelineFailure server action + dispatch try/catch"
  key_links:
    - from: "recorder.onstop"
      to: "runPipelineRef.current"
      via: "ref mirror (pattern: photoItemsRef at capture-recorder.tsx:224)"
      pattern: "runPipelineRef\\.current\\(blob\\)"
    - from: "runPipeline createRecording call"
      to: "elapsedMsRef / finalizeDurationSeconds"
      via: "ref read instead of state closure (pattern: inline-audio-recorder.tsx:157)"
      pattern: "finalizeDurationSeconds\\("
    - from: "failAt"
      to: "reportClientPipelineFailure"
      via: "best-effort void call"
      pattern: "void reportClientPipelineFailure\\("
    - from: "createRecording early returns"
      to: "recordPipelineEvent"
      via: "failed save_recording event with error_code"
      pattern: "error_code|errorCode: 'validation_duration'"
---

<objective>
P0 hotfix: 100% of audio captures via the New Xtimate popup are BROKEN in production since
commit c3385be7 (2026-07-06 20:38 UTC). Root cause: a latent stale-closure bug makes the popup
send `durationSeconds = 0` to `createRecording`, and the pre-launch-audit B10 validation added in
that commit now rejects 0 with 'Invalid recording duration.' — killing the pipeline at the save
step. The failure is INVISIBLE in /admin/events because validation/auth early-returns run before
any recordPipelineEvent call.

Three goals (in the user's words: "precisa ter um hardening antes do servidor"):
1. Fix the stale-closure duration bug (and the whole stale-closure class in recorder.onstop).
2. Client-leg hardening: pre-flight validation + client failure telemetry to pipeline_events.
3. Server observability: every early-return writes a failed pipeline event.

Evidence: DB shows ALL popup recordings have duration_seconds=0 (07/06, 07/04, 07/03, 06/23).
Today's attempt (project 932c795a, 15:43 UTC): audio uploaded to storage OK → zero recordings
rows, zero pipeline_events. The reference fix pattern ALREADY EXISTS in the codebase:
components/projects/inline-audio-recorder.tsx:157 uses `elapsedMsRef.current`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@components/capture/capture-recorder.tsx
@lib/actions/recording.ts
@lib/observability/pipeline-events.ts
@components/projects/inline-audio-recorder.tsx  (reference: the CORRECT ref pattern, lines 140-175)

<interfaces>
<!-- Exact current code being changed. -->

BUG 1 target — capture-recorder.tsx:625 (inside runPipeline; elapsedMs comes from the stale closure):
```typescript
      const created = await createRecording(projectId, storagePath, Math.floor(elapsedMs / 1000))
```

BUG 1 root — capture-recorder.tsx:895-900 (onstop captures runPipeline from the render at START time,
when elapsedMs state = 0; every 250ms tick recreates runPipeline but onstop keeps the stale one):
```typescript
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        setAudioBlob(blob)
        // Pipeline fires after blob is set — use the blob directly
        runPipeline(blob)
      }
```

Existing ref-mirror precedent — capture-recorder.tsx:224-225:
```typescript
  const photoItemsRef = useRef<PhotoItem[]>([])
  useEffect(() => { photoItemsRef.current = photoItems }, [photoItems])
```

failAt — capture-recorder.tsx:416-419 (client-only; no telemetry today):
```typescript
  function failAt(s: StageKey, msg: string) {
    setFailedAt(s)
    setErrorMessage(msg)
  }
```

Server early-returns with NO pipeline event today — lib/actions/recording.ts:
- createRecording:126 `if ('error' in ctx) return { error: ctx.error }` (auth)
- createRecording:129-131 `return { error: 'Invalid recording path.' }` (validation)
- createRecording:132-134 `return { error: 'Invalid recording duration.' }` (validation — TODAY'S KILLER)
- createTextRecording:43 `if ('error' in ctx) return { error: ctx.error }` (auth)
- transcribeRecording:226 (auth), :236 (not found), :237-239 (no audio), :248-262 (inngest.send NOT wrapped — a throw propagates as an unhandled 500)

pipeline_events CHECK constraints (migration 20260529000001) — new events MUST stay within:
- step IN ('save_recording','transcribe','analyze','generate_estimate','preview_redirect')
- status IN ('started','succeeded','failed')
- provider IS NULL OR IN ('openai','openrouter','anthropic')
- error_code: free TEXT (no constraint)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Client fixes in capture-recorder.tsx — duration ref, onstop ref, pre-flight, failAt telemetry</name>
  <files>components/capture/capture-recorder.tsx</files>
  <action>
    Four surgical changes, all in components/capture/capture-recorder.tsx. Match surrounding
    style/comment density. Do NOT touch the stacked-layout markup or the photos/text paths beyond
    what is specified.

    1a. Duration via ref (mirror inline-audio-recorder.tsx pattern):
      - Export a pure helper near clampToPhotoLimit (module scope, exported for tests):
        ```typescript
        // Minimum meaningful recording length — anything shorter is blocked client-side
        // (pre-flight) so the server's B10 duration validation can never reject a real take.
        export const MIN_RECORDING_MS = 1000
        // Wall-clock elapsed → whole seconds for createRecording. Clamped to >=1 as
        // belt-and-braces: the server rejects 0 (pre-launch audit B10).
        export function finalizeDurationSeconds(elapsedMs: number): number {
          return Math.max(1, Math.floor(elapsedMs / 1000))
        }
        ```
      - Add `const elapsedMsRef = useRef(0)` next to the other refs.
      - In `tick()`: after computing `elapsed`, also set `elapsedMsRef.current = elapsed`.
      - In `startRecording()`: reset `elapsedMsRef.current = 0` alongside `setElapsedMs(0)`.
      - In `stopRecording()`: inside the `if (mediaRecorderRef.current && ... !== 'inactive')`
        block, BEFORE calling `.stop()`, snapshot the final wall-clock:
        `elapsedMsRef.current = performance.now() - startTimeRef.current`.
      - In `runPipeline`: replace `Math.floor(elapsedMs / 1000)` with
        `finalizeDurationSeconds(elapsedMsRef.current)` and REMOVE `elapsedMs` from the
        runPipeline useCallback dependency array.

    1b. Kill the stale-closure class in onstop:
      - Add a ref mirror right after the photoItemsRef precedent:
        ```typescript
        // recorder.onstop is bound ONCE at recording start; calling runPipeline through a
        // ref guarantees the LATEST closure (fresh estimateLanguage, elapsed refs) runs at stop
        // — the direct call captured the start-time render where elapsedMs was still 0
        // (root cause of the duration=0 bug, 260707-grq).
        const runPipelineRef = useRef<(blob: Blob) => Promise<void>>(async () => {})
        ```
        NOTE: runPipeline is declared AFTER this point in the file — assign the mirror in a
        useEffect placed after runPipeline's declaration:
        `useEffect(() => { runPipelineRef.current = runPipeline }, [runPipeline])`
      - In `recorder.onstop`, replace `runPipeline(blob)` with `runPipelineRef.current(blob)`
        (keep the `void` semantics — prefix with `void` to satisfy no-floating-promises if flagged).

    1c. Pre-flight validation at the top of runPipeline (hardening BEFORE the server):
      Immediately after `setStage('saving')` + fail-state resets, add:
      ```typescript
      // Pre-flight (hardening before the server): a zero-byte blob or sub-second take can
      // never produce a transcript — surface it instantly instead of uploading and letting
      // the server's B10 validation reject it.
      if (blob.size === 0 || elapsedMsRef.current < MIN_RECORDING_MS) {
        toast.error(t('Recording too short — please record at least a few seconds describing the job.'))
        setAudioBlob(null)
        setStage('idle')
        return
      }
      ```
      (t() inline literal so the i18n extractor picks the key up.)

    1d. failAt telemetry (client failure → Event Log):
      - Import `reportClientPipelineFailure` from '@/lib/actions/recording' (created in Task 2).
      - Extend failAt to fire-and-forget a report. failAt is a plain function in the component
        body, so it can read component state/refs directly:
        ```typescript
        // Pipeline helper: set failure state + best-effort client-side telemetry so a failure
        // in the CLIENT leg of the pipeline is still visible in /admin/events (260707-grq).
        function failAt(s: StageKey, msg: string) {
          setFailedAt(s)
          setErrorMessage(msg)
          const stepMap = {
            saving: 'save_recording',
            transcribing: 'transcribe',
            analyzing: 'analyze',
            generating: 'generate_estimate',
          } as const
          void reportClientPipelineFailure({
            attemptId: attemptIdRef.current ?? crypto.randomUUID(),
            projectId,
            step: stepMap[s],
            inputType: audioBlob ? 'recording' : uploadedPhotos.length > 0 ? 'photo' : 'manual_text',
            errorMessage: msg,
          }).catch(() => {})
        }
        ```
        (`void promise.catch(() => {})` — the catch guarantees no unhandled rejection, the void
        marks it intentionally un-awaited. This call must NEVER block or throw into the UI path.)
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && grep -n "finalizeDurationSeconds(elapsedMsRef.current)" components/capture/capture-recorder.tsx && grep -n "runPipelineRef.current(blob)" components/capture/capture-recorder.tsx && grep -n "MIN_RECORDING_MS" components/capture/capture-recorder.tsx && grep -n "reportClientPipelineFailure" components/capture/capture-recorder.tsx && npx eslint components/capture/capture-recorder.tsx</automated>
  </verify>
  <done>
    - createRecording is called with finalizeDurationSeconds(elapsedMsRef.current); elapsedMs removed from runPipeline deps.
    - onstop calls runPipelineRef.current(blob); ref assigned via useEffect after runPipeline declaration.
    - Sub-second / zero-byte takes toast + reset to idle without uploading.
    - failAt reports client failures via reportClientPipelineFailure (never throws into UI).
    - eslint: no NEW problems vs baseline (pre-existing t()/react-compiler warnings acceptable).
  </done>
</task>

<task type="auto">
  <name>Task 2: Server observability in lib/actions/recording.ts — events on every early-return + reportClientPipelineFailure</name>
  <files>lib/actions/recording.ts</files>
  <action>
    All changes in lib/actions/recording.ts. recordPipelineEvent is already imported and is
    never-throw (D-06) — safe to `void` everywhere. Return shapes MUST NOT change.

    2a. createRecording early-returns (attemptId param is available; use eventAttemptId):
      - Auth failure (`'error' in ctx`): before returning, fire
        `void recordPipelineEvent({ attemptId: eventAttemptId, inputType: 'recording', step: 'save_recording', status: 'failed', companyId: null, projectId, errorMessage: ctx.error, errorCode: 'auth', durationMs: Date.now() - t0, provider: null })`.
      - Path validation failure: same shape, companyId: company.id, errorCode: 'validation_path', errorMessage: 'Invalid recording path.'.
      - Duration validation failure: same shape, errorCode: 'validation_duration',
        errorMessage: `Invalid recording duration: ${durationSeconds}s (client sent a non-positive or oversized value)`.

    2b. createTextRecording auth early-return: same pattern — step 'save_recording',
        inputType 'manual_text', errorCode 'auth', companyId null.

    2c. transcribeRecording hardening (no attemptId fallback exists here — mint one:
        `const eventAttemptId = attemptId ?? randomUUID()` at function top, and reuse it):
      - Auth failure: step 'transcribe', status 'failed', errorCode 'auth', companyId/projectId null.
      - Recording not found: errorCode 'not_found', errorMessage 'Recording not found'.
      - No storage_path: errorCode 'no_audio', companyId: recording.company_id, projectId: recording.project_id.
      - Wrap the `inngest.send` + `recordJobOwnership` block in try/catch. On catch:
        `void recordPipelineEvent({ attemptId: eventAttemptId, inputType: 'recording', step: 'transcribe', status: 'failed', companyId: recording.company_id as string, projectId: recording.project_id as string, errorMessage: err message (truncated 300), errorCode: 'dispatch_failed', provider: null })`
        then `return { error: 'Transcription service is temporarily unavailable — your recording is saved. Please retry.' }`.
        (Today a throw here propagates as an unhandled server-action 500 that the client's
        runPipeline does NOT catch — the UI hangs on 'transcribing' forever.)

    2d. New server action reportClientPipelineFailure (append near the bottom, before updateTranscript):
      ```typescript
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
      ```
      NOTE: a client-reported row may coexist with a server-written row for the same failure
      (e.g. validation) — that is intentional double coverage; error_code 'client_reported'
      disambiguates in the admin timeline. attemptId comes from the client — recordPipelineEvent
      inserts it as-is (UUID column; invalid UUIDs just fail the best-effort insert silently).
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && grep -c "recordPipelineEvent" lib/actions/recording.ts && grep -n "validation_duration" lib/actions/recording.ts && grep -n "dispatch_failed" lib/actions/recording.ts && grep -n "reportClientPipelineFailure" lib/actions/recording.ts && npx eslint lib/actions/recording.ts && npx tsc --noEmit</automated>
  </verify>
  <done>
    - Every early-return in createRecording/createTextRecording/transcribeRecording is preceded by a failed pipeline event with a distinguishing errorCode.
    - inngest.send is wrapped; a dispatch throw returns a friendly { error } instead of a 500.
    - reportClientPipelineFailure exists, is auth-gated, enum-validated, truncates messages, never throws.
    - tsc --noEmit clean; eslint no new problems.
  </done>
</task>

<task type="auto">
  <name>Task 3: Tests — duration helper + early-return event coverage</name>
  <files>tests/unit/capture/capture-duration.test.ts, tests/unit/actions/recording-early-return-events.test.ts</files>
  <action>
    Follow the existing test conventions (vitest; see tests/unit/capture/photo-thumbnail-cap.test.tsx
    for the capture pure-helper pattern and tests/unit/observability/record-pipeline-event.test.ts +
    tests/unit/api/transcribe-dispatch.test.ts for mocking patterns).

    3a. tests/unit/capture/capture-duration.test.ts — pure helper coverage:
      - finalizeDurationSeconds(0) === 1 (belt-and-braces clamp)
      - finalizeDurationSeconds(999) === 1
      - finalizeDurationSeconds(1000) === 1
      - finalizeDurationSeconds(65_900) === 65
      - finalizeDurationSeconds(600_000) === 600 (hard cap take fits server MAX 900s)
      - MIN_RECORDING_MS === 1000

    3b. tests/unit/actions/recording-early-return-events.test.ts — the killer path is covered:
      Mock '@/lib/observability/pipeline-events' (vi.mock, capture calls), mock
      '@/lib/supabase/server' createClient / '@/lib/queries/active-company' getActiveCompanyId /
      '@/lib/demo/guard' assertWritable following the existing action-test mocking style. Assert:
      - createRecording(projectId, 'COMPANY/other-path', 0) → duration validation: returns
        { error: 'Invalid recording duration.' } AND recordPipelineEvent was called with
        { step: 'save_recording', status: 'failed', errorCode: 'validation_duration' } (use a
        valid path prefix so the duration branch is reached).
      - createRecording with a path outside company prefix → errorCode 'validation_path'.
      - Auth failure (getClaims → null) → errorCode 'auth', companyId null.
      If the existing mocking infrastructure makes any of these disproportionately heavy, cover at
      MINIMUM the validation_duration case (today's production killer) and note the rest in SUMMARY.

    3c. Run the full targeted verification:
      - npx vitest run tests/unit/capture/capture-duration.test.ts tests/unit/actions/recording-early-return-events.test.ts
      - npx tsc --noEmit
      - npx eslint components/capture/capture-recorder.tsx lib/actions/recording.ts
  </action>
  <verify>
    <automated>cd "C:/Users/Vanildo/Dev/xtimator" && npx vitest run tests/unit/capture/capture-duration.test.ts tests/unit/actions/recording-early-return-events.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>
    - Both test files pass; the validation_duration path (today's production failure) has a regression test.
    - tsc clean, eslint no new problems.
  </done>
</task>

</tasks>

<verification>
- grep confirms: finalizeDurationSeconds(elapsedMsRef.current), runPipelineRef.current(blob), MIN_RECORDING_MS pre-flight, reportClientPipelineFailure wiring.
- New unit tests pass; tsc --noEmit clean; eslint no new problems on both touched files.
- Manual (post-deploy, not blocking): record a normal take in the New Xtimate popup → estimate generates; check /admin/events shows the attempt; record a <1s take → instant friendly toast, no upload.
</verification>

<success_criteria>
- The popup audio path sends real durations; the B10 server validation can no longer kill a legitimate recording.
- No pipeline failure — client-leg or server early-return — is invisible in /admin/events anymore.
- A dispatch (inngest.send) outage degrades to a friendly retryable error instead of a hung UI.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-grq-p0-hotfix-fix-stale-closure-duration-0-b/260707-grq-SUMMARY.md`
</output>
